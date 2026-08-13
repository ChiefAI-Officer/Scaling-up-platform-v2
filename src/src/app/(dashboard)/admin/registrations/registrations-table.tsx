"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatTimestamp } from "@/lib/utils";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
  ResponsiveRecord,
  ResponsiveRecordActions,
  ResponsiveRecordHeader,
  ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";

interface Registration {
  id: string;
  workshopId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  phone: string | null;
  paymentStatus: string;
  attended: boolean;
  createdAt: Date | string;
  workshop: {
    title: string;
    eventDate: Date | string;
    coach: {
      firstName: string;
      lastName: string;
      email: string;
    } | null;
  } | null;
}

interface RegistrationsTableProps {
  registrations: Registration[];
  responsiveEnabled?: boolean;
}

function paymentStatusBadge(status: string) {
  const map: Record<string, string> = {
    PAID: "bg-success/10 text-success border border-success/20",
    FREE: "bg-info/10 text-info border border-info/20",
    REFUNDED: "bg-warning/10 text-warning border border-warning/20",
    CANCELLED: "bg-destructive/10 text-destructive border border-destructive/20",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground border border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export function RegistrationsTable({ registrations, responsiveEnabled = false }: RegistrationsTableProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return registrations;
    return registrations.filter((r) => {
      const fullName = `${r.firstName} ${r.lastName}`.toLowerCase();
      return fullName.includes(q) || r.email.toLowerCase().includes(q);
    });
  }, [registrations, search]);

  return (
    <div className="space-y-4">
      <div className={responsiveEnabled ? "flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4" : "flex items-center gap-4"}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={responsiveEnabled ? "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:max-w-sm" : "w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"}
        />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {filtered.length} of {registrations.length} registrations
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No registrations found.</p>
        </div>
      ) : (
        <ResponsiveDataView
          enabled={responsiveEnabled}
          label="Registrations"
          wideRegionLabel="Registrations table"
          compact={
            <div className="space-y-3">
              {filtered.map((reg) => (
                <ResponsiveRecord key={reg.id}>
                  <ResponsiveRecordHeader
                    title={`${reg.firstName} ${reg.lastName}`}
                    status={paymentStatusBadge(reg.paymentStatus)}
                  />
                  <ResponsiveRecordMeta
                    items={[
                      { label: "Email", value: <span className="break-all">{reg.email}</span> },
                      { label: "Company", value: reg.company ?? "—" },
                      { label: "Phone", value: reg.phone ?? "—" },
                      { label: "Workshop", value: reg.workshop?.title ?? "—" },
                      {
                        label: "Coach",
                        value: reg.workshop?.coach
                          ? `${reg.workshop.coach.firstName} ${reg.workshop.coach.lastName}`
                          : "—",
                      },
                      {
                        label: "Registered",
                        value: reg.createdAt ? formatTimestamp(new Date(reg.createdAt)) : "—",
                      },
                      { label: "Attendance", value: reg.attended ? "Attended" : "Not attended" },
                    ]}
                  />
                  {reg.workshop ? (
                    <ResponsiveRecordActions
                      primary={
                        <Link
                          href={`/workshops/${reg.workshopId}`}
                          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Open workshop
                        </Link>
                      }
                    />
                  ) : null}
                </ResponsiveRecord>
              ))}
            </div>
          }
          wide={
            <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs hidden md:table-cell">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs hidden lg:table-cell">Phone</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">Workshop</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs hidden xl:table-cell">Coach</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs hidden lg:table-cell">Registration Date</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((reg) => (
                  <tr key={reg.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium whitespace-nowrap">
                      {reg.firstName} {reg.lastName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {reg.email}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {reg.company ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {reg.phone ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {reg.workshop?.title ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell whitespace-nowrap">
                      {reg.workshop?.coach
                        ? `${reg.workshop.coach.firstName} ${reg.workshop.coach.lastName}`
                        : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                      {reg.createdAt ? formatTimestamp(new Date(reg.createdAt)) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {paymentStatusBadge(reg.paymentStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </div>
          }
        />
      )}
      {registrations.length >= 200 && (
        <p className="text-sm text-muted-foreground mt-3 text-center">
          Showing the 200 most recent registrations. Use filters to narrow results.
        </p>
      )}
    </div>
  );
}
