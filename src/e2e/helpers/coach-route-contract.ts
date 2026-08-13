const CUID_SEGMENT = "c[a-z0-9]{20,31}";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function coachDetailHrefPattern(): RegExp {
  return new RegExp(`^/coaches/${CUID_SEGMENT}$`);
}

export function coachEditHrefPattern(coachDetailHref: string): RegExp {
  if (!coachDetailHrefPattern().test(coachDetailHref)) {
    throw new Error("Cannot discover an edit route from an invalid coach detail href.");
  }

  return new RegExp(
    `^(?:https?://[^/]+)?${escapeRegex(coachDetailHref)}/edit(?:[?#].*)?$`,
  );
}
