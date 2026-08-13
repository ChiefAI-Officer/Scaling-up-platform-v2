import type { ReactNode } from "react";

const visibility = {
  sm: { compact: "sm:hidden", wide: "hidden sm:block" },
  md: { compact: "md:hidden", wide: "hidden md:block" },
  lg: { compact: "lg:hidden", wide: "hidden lg:block" },
} as const;

export interface ResponsiveDataViewProps {
  enabled: boolean;
  label: string;
  compact: ReactNode;
  wide: ReactNode;
  wideFrom?: keyof typeof visibility;
}

export function ResponsiveDataView({
  enabled,
  label,
  compact,
  wide,
  wideFrom = "md",
}: ResponsiveDataViewProps) {
  if (!enabled) return <>{wide}</>;

  const classes = visibility[wideFrom];

  return (
    <>
      <div role="list" aria-label={label} className={classes.compact}>
        {compact}
      </div>
      <div data-testid="responsive-wide-view" className={classes.wide}>
        {wide}
      </div>
    </>
  );
}
