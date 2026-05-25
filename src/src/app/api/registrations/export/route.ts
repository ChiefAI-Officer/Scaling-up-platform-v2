import { NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { rowsToCsv } from "@/lib/utils/csv";

export async function GET(request: Request) {
  const actor = await getApiActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPrivilegedRole(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const workshopId = searchParams.get("workshopId") ?? undefined;

  const registrations = await db.registration.findMany({
    where: {
      paymentStatus: { not: "PENDING" },
      ...(workshopId ? { workshopId } : {}),
    },
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
  const filename = workshopId ? `registrations-${date}.csv` : `contacts-${date}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Total-Count": String(registrations.length),
    },
  });
}
