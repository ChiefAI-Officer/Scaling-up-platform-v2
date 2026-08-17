export type WorkshopRouteRole = "admin" | "coach";
export type WorkshopChildOwner = "surveys" | "landing-pages";

const CUID_SEGMENT = "c[a-z0-9]{20,31}";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function workshopDetailHrefPattern(role: WorkshopRouteRole): RegExp {
  const prefix = role === "admin" ? "/workshops" : "/portal/workshops";
  return new RegExp(`^${prefix}/${CUID_SEGMENT}$`);
}

export function workshopChildHrefPattern(
  workshopDetailHref: string,
  child: WorkshopChildOwner,
): RegExp {
  const childHref = workshopChildHref(workshopDetailHref, child);

  return new RegExp(
    `^(?:https?://[^/]+)?${escapeRegex(childHref)}(?:[?#].*)?$`,
  );
}

export function workshopChildHref(
  workshopDetailHref: string,
  child: WorkshopChildOwner,
): string {
  const isValidatedDetail = workshopDetailHrefPattern("admin").test(workshopDetailHref)
    || workshopDetailHrefPattern("coach").test(workshopDetailHref);
  if (!isValidatedDetail) {
    throw new Error(`Cannot derive ${child} from an invalid workshop detail href.`);
  }

  return `${workshopDetailHref}/${child}`;
}
