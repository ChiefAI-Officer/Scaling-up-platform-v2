import { db } from "@/lib/db";
import type { BadgeCounts } from "@/lib/nav/admin-nav-model";

/**
 * Server-side pending counts for the two operator-queue badges.
 *  - approvals: open approval-queue rows (status PENDING)
 *  - refunds:   paid registrations on CANCELED workshops not yet refunded
 *               (mirrors the /admin/refunds-needed page filter exactly)
 *
 * Fail-soft: these badges are decorative, but this runs in the admin layout
 * that wraps EVERY admin page. A thrown count must never 500 the shell, so on
 * any error we log and return zeros (a zero renders no badge).
 *
 * Cost note: the refunds filter joins Registration -> Workshop and is NOT
 * index-backed (no migration in scope). Acceptable at this data scale; revisit
 * with an index or short cache only if it shows up as a slow query.
 */
export async function getAdminNavBadgeCounts(): Promise<BadgeCounts> {
  try {
    const [approvals, refunds] = await Promise.all([
      db.approvalQueue.count({ where: { status: "PENDING" } }),
      db.registration.count({
        where: {
          paymentStatus: "COMPLETED",
          refundedAt: null,
          workshop: { status: "CANCELED" },
        },
      }),
    ]);
    return { approvals, refunds };
  } catch (err) {
    console.error("getAdminNavBadgeCounts failed; rendering no badges", err);
    return { approvals: 0, refunds: 0 };
  }
}
