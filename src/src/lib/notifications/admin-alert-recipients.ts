import { db } from "@/lib/db";

const DEFAULT_ADMIN_EMAIL = "admin@scalingup.com";

function fallbackRecipient(): string[] {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;
  return [email];
}

/**
 * Resolve every live ADMIN/STAFF account that represents an activated person.
 * Pending invitees have no User row; system accounts have no password hash.
 */
export async function resolveAdminAlertRecipients(): Promise<string[]> {
  try {
    const users = await db.user.findMany({
      where: {
        role: { in: ["ADMIN", "STAFF"] },
        deletedAt: null,
        passwordHash: { not: null },
      },
      select: { email: true },
    });

    const recipients = Array.from(
      new Set(users.map(({ email }) => email.trim().toLowerCase()).filter(Boolean)),
    );

    return recipients.length > 0 ? recipients : fallbackRecipient();
  } catch (error) {
    console.error("Failed to resolve admin alert recipients; using fallback:", error);
    return fallbackRecipient();
  }
}
