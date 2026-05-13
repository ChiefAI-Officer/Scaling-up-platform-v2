import { NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { rowsToCsv } from "@/lib/utils/csv";

export async function GET() {
  const actor = await getApiActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPrivilegedRole(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const registrations = await db.registration.findMany({
    where: { paymentStatus: { not: "PENDING" } },
    include: { workshop: { select: { title: true, eventDate: true } } },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "First Name",
    "Last Name",
    "Email",
    "Company",
    "Job Title",
    "Phone",
    "Workshop",
    "Event Date",
    "Registration Date",
    "Payment Status",
    "Amount Paid",
    "Marketing Opt-In",
  ];

  const rows = registrations.map((r) => [
    r.firstName,
    r.lastName,
    r.email,
    r.company ?? "",
    r.jobTitle ?? "",
    r.phone ?? "",
    r.workshop.title,
    r.workshop.eventDate ? r.workshop.eventDate.toISOString().split("T")[0] : "",
    r.createdAt.toISOString().split("T")[0],
    r.paymentStatus,
    ((r.amountPaidCents ?? 0) / 100).toFixed(2),
    r.marketingOptIn ? "Yes" : "No",
  ]);

  const csv = rowsToCsv(headers, rows);
  const date = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contacts-${date}.csv"`,
      "X-Total-Count": String(registrations.length),
    },
  });
}
