export const SORT_ALLOWLIST = ["createdAt", "firstName", "lastName", "amountPaidCents"] as const;
export type SortField = (typeof SORT_ALLOWLIST)[number];

export interface CoachRegistrationView {
  id: string;
  workshopId: string;
  workshopTitle: string;
  workshopDate: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  paymentStatus: string;
  amountPaidCents: number;
  status: string;
  attended: boolean;
  registeredAt: string;
}
