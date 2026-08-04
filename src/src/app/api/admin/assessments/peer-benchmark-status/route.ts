export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";
import {
  buildPeerBenchmarkAuditSnapshot,
  type EffectivePeerBenchmarkGate,
  type PeerBenchmarkAuditDb,
  type PeerBenchmarkEvidence,
} from "@/lib/assessments/peer-benchmark-audit";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function errorDiagnostic(error: unknown): {
  name: string;
  message: string;
} {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Non-Error thrown",
  };
}

export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    let effectiveGate: PeerBenchmarkEvidence<EffectivePeerBenchmarkGate>;
    try {
      effectiveGate = {
        state: "known",
        value: isPeerBenchmarksEnabled() ? "enabled" : "dark",
      };
    } catch (error) {
      console.error(
        "Peer benchmark gate derivation failed",
        errorDiagnostic(error),
      );
      effectiveGate = { state: "unknown", reason: "query_failed" };
    }

    const data = await buildPeerBenchmarkAuditSnapshot({
      db: db as unknown as PeerBenchmarkAuditDb,
      now: new Date(),
      effectiveGate,
    });
    return NextResponse.json(
      { success: true, data },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error(
      "Error building peer benchmark status",
      errorDiagnostic(error),
    );
    return NextResponse.json(
      { success: false, error: "Failed to build peer benchmark status" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
