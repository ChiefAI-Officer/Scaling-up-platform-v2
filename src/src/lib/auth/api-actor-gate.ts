import { getApiActor } from "./authorization";
import { isPrivilegedRole } from "./access-control";
import type { ApiActor } from "./access-control";

/**
 * Discriminated result for API-route authorization gates. On failure the route
 * builds the NextResponse (this module stays free of next/server), e.g.:
 *
 *   const gate = await requireAdminApiActor();
 *   if (!gate.ok) {
 *     return NextResponse.json(
 *       { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
 *       { status: gate.status }
 *     );
 *   }
 *   // gate.actor is the authenticated, DB-backed actor
 */
export type ApiActorGate =
  | { ok: true; actor: ApiActor }
  | { ok: false; status: 401 | 403 };

/**
 * ADMIN-only gate. Uses DB-backed getApiActor() (fresh role) rather than the
 * JWT `session.user.role` (stale until token refresh). STAFF is intentionally
 * rejected — this mirrors the workflows/[id] and survey-templates/[id] parent
 * routes, which gate on `role === "ADMIN"`; the security pass enforces existing
 * intent and must not silently widen access to STAFF.
 */
export async function requireAdminApiActor(): Promise<ApiActorGate> {
  const actor = await getApiActor();
  if (!actor) {
    return { ok: false, status: 401 };
  }
  if (actor.role !== "ADMIN") {
    return { ok: false, status: 403 };
  }
  return { ok: true, actor };
}

/**
 * Privileged gate (ADMIN or STAFF). For resources whose existing model treats
 * STAFF as privileged (e.g. the files list, consumed only by admin tooling).
 */
export async function requirePrivilegedApiActor(): Promise<ApiActorGate> {
  const actor = await getApiActor();
  if (!actor) {
    return { ok: false, status: 401 };
  }
  if (!isPrivilegedRole(actor.role)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, actor };
}
