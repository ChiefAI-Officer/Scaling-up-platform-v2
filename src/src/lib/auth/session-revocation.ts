import type { Session } from "next-auth";

export function isSessionRevoked(session: Session | null): boolean {
  return Boolean(session?.sessionRevoked);
}
