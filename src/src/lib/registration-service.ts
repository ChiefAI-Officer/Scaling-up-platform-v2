import {
  Prisma,
  Registration,
  Workshop,
  WorkshopType,
  Coach,
} from "@prisma/client";
import { db } from "@/lib/db";

// JV-02: A workshop is "approved" — and therefore eligible to accept public
// registrations — only once it reaches one of these post-approval stages.
// Anything else (REQUESTED / AWAITING_APPROVAL / INFO_REQUESTED / DENIED /
// CANCELED) is NOT open. Shared with the public register route + landing page
// render guards so the rule lives in exactly one place.
export const APPROVED_WORKSHOP_STATUSES = ["PRE_EVENT", "POST_EVENT", "COMPLETED"] as const;

export function isApprovedWorkshopStatus(status: string): boolean {
  return (APPROVED_WORKSHOP_STATUSES as readonly string[]).includes(status);
}

// JV-02: PRE_EVENT is when registration is open in Jeff's 6-stage model
const OPEN_REGISTRATION_STATUSES = new Set(["PRE_EVENT"]);

export type RegistrationServiceErrorCode =
  | "WORKSHOP_NOT_FOUND"
  | "WORKSHOP_CLOSED"
  | "WORKSHOP_FULL"
  | "DUPLICATE_REGISTRATION"
  | "CONFLICT_RETRY";

export class RegistrationServiceError extends Error {
  public readonly code: RegistrationServiceErrorCode;
  public readonly status: number;

  constructor(code: RegistrationServiceErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface RegistrationInput {
  workshopId: string;
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  marketingOptIn?: boolean;
}

export type RegistrationWithWorkshopDetails = Registration & {
  workshop: Workshop & {
    workshopType: WorkshopType;
    coach: Coach;
  };
};

export interface CreateRegistrationOptions {
  includeWorkshopDetails?: boolean;
  retries?: number;
}

interface CreateRegistrationResult {
  registration: Registration | RegistrationWithWorkshopDetails;
  workshop: Workshop;
}

function toRegistrationError(error: unknown): RegistrationServiceError | null {
  if (error instanceof RegistrationServiceError) {
    return error;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new RegistrationServiceError(
        "DUPLICATE_REGISTRATION",
        "You are already registered for this workshop",
        409
      );
    }
  }

  return null;
}

async function createRegistrationTransaction(
  tx: Prisma.TransactionClient,
  input: RegistrationInput,
  includeWorkshopDetails: boolean
): Promise<CreateRegistrationResult> {
  const workshop = await tx.workshop.findUnique({
    where: { id: input.workshopId },
  });

  if (!workshop) {
    throw new RegistrationServiceError("WORKSHOP_NOT_FOUND", "Workshop not found", 404);
  }

  if (!OPEN_REGISTRATION_STATUSES.has(workshop.status)) {
    throw new RegistrationServiceError(
      "WORKSHOP_CLOSED",
      "Workshop is not open for registration",
      400
    );
  }

  const activeRegistrationCount = await tx.registration.count({
    where: {
      workshopId: workshop.id,
      status: { not: "CANCELLED" },
      paymentStatus: { not: "PENDING" },
    },
  });

  if (activeRegistrationCount >= workshop.maxAttendees) {
    throw new RegistrationServiceError("WORKSHOP_FULL", "Workshop is at full capacity", 400);
  }

  const existing = await tx.registration.findFirst({
    where: {
      workshopId: workshop.id,
      email: input.email,
      status: { not: "CANCELLED" },
    },
    select: { id: true, paymentStatus: true },
  });

  if (existing) {
    if (existing.paymentStatus === "PENDING") {
      // Allow retry — full fetch for caller compatibility
      const full = await tx.registration.findUnique({
        where: { id: existing.id },
        ...(includeWorkshopDetails
          ? { include: { workshop: { include: { workshopType: true, coach: true } } } }
          : {}),
      });
      return { registration: full!, workshop };
    }
    throw new RegistrationServiceError(
      "DUPLICATE_REGISTRATION",
      "You are already registered for this workshop",
      409
    );
  }

  const created = await tx.registration.create({
    data: {
      workshopId: workshop.id,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      company: input.company,
      jobTitle: input.jobTitle,
      phone: input.phone,
      marketingOptIn: input.marketingOptIn ?? false,
      paymentStatus: workshop.isFree ? "FREE" : "PENDING",
      status: workshop.isFree ? "REGISTERED" : "PENDING_PAYMENT",
    },
  });

  if (!includeWorkshopDetails) {
    return { registration: created, workshop };
  }

  const detailed = await tx.registration.findUnique({
    where: { id: created.id },
    include: {
      workshop: {
        include: {
          workshopType: true,
          coach: true,
        },
      },
    },
  });

  if (!detailed) {
    throw new Error("Created registration could not be reloaded");
  }

  return {
    registration: detailed,
    workshop,
  };
}

export async function createWorkshopRegistration(
  input: RegistrationInput,
  options: CreateRegistrationOptions = {}
): Promise<CreateRegistrationResult> {
  const includeWorkshopDetails = options.includeWorkshopDetails ?? false;
  const retries = options.retries ?? 2;
  const normalizedInput = {
    ...input,
    email: input.email.toLowerCase(),
  };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) =>
          createRegistrationTransaction(tx, normalizedInput, includeWorkshopDetails),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    } catch (error) {
      const known = toRegistrationError(error);
      if (known) {
        throw known;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < retries
      ) {
        continue;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new RegistrationServiceError(
          "CONFLICT_RETRY",
          "Registration is currently busy. Please try again.",
          409
        );
      }

      throw error;
    }
  }

  throw new RegistrationServiceError(
    "CONFLICT_RETRY",
    "Registration is currently busy. Please try again.",
    409
  );
}
