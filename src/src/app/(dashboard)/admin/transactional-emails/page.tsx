/**
 * ENH-MAY6-11: Transactional Emails admin page.
 *
 * Lists the editable system emails. Admin+staff only — same posture as the
 * coupon editor, NOT requireAdmin (which would lock out STAFF). Coaches
 * never see this page.
 *
 * v1 ships only REGISTRATION_CONFIRMATION; the THANKS_FOR_ATTENDING entry
 * arrives in v2 when the scheduler does.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/utils";

const EMAIL_TYPES = [
  {
    type: "REGISTRATION_CONFIRMATION",
    label: "Registration Confirmation",
    description:
      "Sent to attendees right after they register for a workshop (both free and paid flows). Tokens: {{registrantName}}, {{workshopTitle}}, {{coachName}}.",
  },
] as const;

export default async function TransactionalEmailsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = session.user?.role;
  if (!role || (role !== "ADMIN" && role !== "STAFF")) redirect("/unauthorized");

  const rows = await db.transactionalEmailTemplate.findMany();
  const byType = new Map(rows.map((r) => [r.emailType, r]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Transactional Emails</h1>
        <p className="text-muted-foreground mt-1">
          Edit the system-driven emails the platform sends. Changes apply globally
          to every workshop on the next send.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {EMAIL_TYPES.map((t) => {
              const row = byType.get(t.type);
              return (
                <div
                  key={t.type}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex-1">
                    <div className="font-semibold">{t.label}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t.description}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {row
                        ? `v${row.version}, last edited ${formatTimestamp(row.updatedAt)}`
                        : "Using hardcoded defaults — no custom edit yet."}
                    </div>
                  </div>
                  <Link
                    href={`/admin/transactional-emails/${t.type}`}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    Edit
                  </Link>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
