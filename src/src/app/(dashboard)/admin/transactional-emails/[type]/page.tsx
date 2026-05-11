/**
 * ENH-MAY6-11: Per-template editor for the system transactional email.
 *
 * Admin+staff only. Raw HTML textarea (no rich editor in v1). Threads the
 * row's current version through the hidden form field for optimistic
 * concurrency on PUT (Round 3 H1).
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { TransactionalEmailEditor } from "./editor";

const META: Record<string, { label: string; tokens: string[] }> = {
  REGISTRATION_CONFIRMATION: {
    label: "Registration Confirmation",
    tokens: ["{{registrantName}}", "{{registrantEmail}}", "{{workshopTitle}}", "{{coachName}}"],
  },
};

const HARDCODED_DEFAULTS: Record<string, { subject: string; body: string }> = {
  REGISTRATION_CONFIRMATION: {
    subject: "You're Registered: {{workshopTitle}}",
    body: `
            <h2>You're Registered!</h2>
            <p>Hi {{registrantName}},</p>
            <p>You're confirmed for <strong>{{workshopTitle}}</strong> with {{coachName}}.</p>
            <p>We've attached a calendar file (.ics) so you can add this event to your calendar.</p>
            <p>See you there!</p>
            <p>— The Scaling Up Team</p>
            `,
  },
};

interface PageProps {
  params: Promise<{ type: string }>;
}

export default async function EditTransactionalEmailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = session.user?.role;
  if (!role || (role !== "ADMIN" && role !== "STAFF")) redirect("/unauthorized");

  const { type } = await params;
  const meta = META[type];
  if (!meta) notFound();

  const row = await db.transactionalEmailTemplate.findUnique({
    where: { emailType: type },
  });
  const defaults = HARDCODED_DEFAULTS[type];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-muted-foreground mb-1">
          <Link href="/admin/transactional-emails" className="underline">
            Transactional Emails
          </Link>{" "}
          / {meta.label}
        </div>
        <h1 className="text-3xl font-bold">{meta.label}</h1>
        <p className="text-muted-foreground mt-1">
          Changes apply globally on the next email send. Available tokens:{" "}
          {meta.tokens.map((t) => (
            <code key={t} className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">
              {t}
            </code>
          ))}
        </p>
      </div>

      <TransactionalEmailEditor
        emailType={type}
        initialSubject={row?.subject ?? defaults.subject}
        initialBody={row?.body ?? defaults.body}
        version={row?.version ?? null}
      />
    </div>
  );
}
