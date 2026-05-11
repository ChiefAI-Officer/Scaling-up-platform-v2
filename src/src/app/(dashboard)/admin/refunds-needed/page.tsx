/**
 * Q-MAY6-1: Refund-needed digest page.
 *
 * Lists every Registration where:
 *  - paymentStatus = "COMPLETED" (paid, not yet refunded)
 *  - parent Workshop.status = "CANCELED"
 *  - refundedAt IS NULL
 *
 * Operator (Suzanne, STAFF) processes the refund manually in Stripe dashboard,
 * pastes the resulting `re_...` ID into the Mark Refunded dialog, and the
 * row drops off the queue (POST /api/registrations/[id]/refunded flips
 * paymentStatus to REFUNDED + persists stripeRefundId as evidence).
 */

export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { formatCurrency, formatTimestamp } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarkRefundedButton } from "./mark-refunded-button";

export default async function RefundsNeededPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = session.user?.role;
  if (!role || (role !== "ADMIN" && role !== "STAFF")) redirect("/unauthorized");

  const rows = await db.registration.findMany({
    where: {
      paymentStatus: "COMPLETED",
      refundedAt: null,
      workshop: { status: "CANCELED" },
    },
    include: {
      workshop: {
        select: {
          id: true,
          title: true,
          workshopCode: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { workshop: { updatedAt: "desc" } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Refunds Needed</h1>
        <p className="text-muted-foreground mt-1">
          Paid registrations on canceled workshops awaiting manual refund. Process the refund in the{" "}
          <a
            href="https://dashboard.stripe.com/payments"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Stripe dashboard
          </a>{" "}
          first, then paste the <code>re_...</code> ID here to clear the row.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No refunds pending. Nice.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registrant</TableHead>
                  <TableHead>Workshop</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Cancelled</TableHead>
                  <TableHead>Stripe Payment</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.firstName} {r.lastName}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </TableCell>
                    <TableCell>
                      <div>{r.workshop.title}</div>
                      <div className="text-xs text-muted-foreground">{r.workshop.workshopCode}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.amountPaidCents != null ? formatCurrency(r.amountPaidCents) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTimestamp(r.workshop.updatedAt)}
                    </TableCell>
                    <TableCell>
                      {r.stripePaymentId ? (
                        <a
                          href={`https://dashboard.stripe.com/payments/${r.stripePaymentId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          View in Stripe ↗
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <MarkRefundedButton registrationId={r.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
