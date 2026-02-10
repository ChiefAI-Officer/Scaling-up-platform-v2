export type ApiUserRole = "ADMIN" | "STAFF" | "COACH";

export interface ApiActor {
  userId: string;
  email: string;
  role: ApiUserRole;
  coachId: string | null;
}

export function normalizeRole(role: string): ApiUserRole {
  if (role === "ADMIN" || role === "STAFF" || role === "COACH") {
    return role;
  }

  // Default unknown roles to lowest privilege.
  return "COACH";
}

export function isPrivilegedRole(role: ApiUserRole): boolean {
  return role === "ADMIN" || role === "STAFF";
}

export function canManageCoachData(actor: ApiActor, coachId: string): boolean {
  if (isPrivilegedRole(actor.role)) {
    return true;
  }

  return actor.role === "COACH" && actor.coachId === coachId;
}
