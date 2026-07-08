/**
 * Wave Y — admin import-health panel data (spec 19y Y-1).
 *
 * Read-only, admin/STAFF-gated (mirrors `/api/admin/observability`). Returns the
 * PII-free `ImportHealthSummary` the `<ImportHealthPanel/>` renders: the alert
 * cron's actual checkpoint decisions + cron health, 24h/7d volume rollups, and
 * the recent signal rows. Flagless — always available to operators (empty until
 * imports occur); the underlying signal WRITES are the flagged/durable part.
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import {
  buildImportHealthSummary,
  type ImportHealthDb,
} from "@/lib/assessments/esperto-import/import-health";

export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const data = await buildImportHealthSummary({
      db: db as unknown as ImportHealthDb,
      now: new Date(),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error building import-health summary:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build import health" },
      { status: 500 },
    );
  }
}
