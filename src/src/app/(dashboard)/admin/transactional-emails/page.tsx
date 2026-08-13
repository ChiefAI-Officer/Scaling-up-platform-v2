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
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
  ResponsiveRecord,
  ResponsiveRecordActions,
  ResponsiveRecordHeader,
  ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
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
  const responsiveEnabled = isMobileResponsiveEnabled();

  const legacyTemplates = (
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
  );

  return (
    <div className={responsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"}>
      {responsiveEnabled ? (
        <PageHeader
          responsiveEnabled
          title="Transactional Emails"
          description="Edit the system-driven emails the platform sends. Changes apply globally to every workshop on the next send."
        />
      ) : (
        <div>
        <h1 className="text-3xl font-bold">Transactional Emails</h1>
        <p className="text-muted-foreground mt-1">
          Edit the system-driven emails the platform sends. Changes apply globally
          to every workshop on the next send.
        </p>
      </div>
      )}

      <ResponsiveDataView
        enabled={responsiveEnabled}
        label="Transactional email templates"
        wideFrom="lg"
        wide={legacyTemplates}
        compact={
          <div className="space-y-3">
            {EMAIL_TYPES.map((template) => {
              const row = byType.get(template.type);
              return (
                <ResponsiveRecord key={template.type}>
                  <ResponsiveRecordHeader title={template.label} />
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {template.description}
                  </p>
                  <ResponsiveRecordMeta
                    items={[
                      { label: "Version", value: row ? `v${row.version}` : "Default" },
                      {
                        label: "Last edited",
                        value: row ? formatTimestamp(row.updatedAt) : "No custom edit yet",
                      },
                    ]}
                  />
                  <ResponsiveRecordActions
                    primary={
                      <Link
                        href={`/admin/transactional-emails/${template.type}`}
                        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      >
                        Edit email template
                      </Link>
                    }
                  />
                </ResponsiveRecord>
              );
            })}
          </div>
        }
      />
    </div>
  );
}
