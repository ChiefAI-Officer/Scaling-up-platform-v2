import { cloneElement, isValidElement, type ReactNode } from "react";
import { ResponsiveActionsMenu } from "./responsive-actions-menu";

export function ResponsiveRecord({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <article className={["min-w-0 rounded-xl border border-border bg-card p-4", className].filter(Boolean).join(" ")}>
      {children}
    </article>
  );
}

export function ResponsiveRecordHeader({
  title,
  status,
}: {
  title: ReactNode;
  status?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0 break-words font-semibold">{title}</div>
      {status}
    </header>
  );
}

export function ResponsiveRecordMeta({
  items,
}: {
  items: Array<{ label: ReactNode; value: ReactNode }>;
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
      {items.map((item, index) => (
        <div key={index}>
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="break-words text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ResponsiveRecordActions({
  primary,
  secondary,
  menuLabel = "More actions",
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  menuLabel?: string;
}) {
  const sizedPrimary = isValidElement<{ className?: string }>(primary)
    ? cloneElement(primary, {
        className: [primary.props.className, "min-h-11 w-full"]
          .filter(Boolean)
          .join(" "),
      })
    : primary;

  return (
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      {sizedPrimary}
      {secondary ? (
        <ResponsiveActionsMenu label={menuLabel}>
          {secondary}
        </ResponsiveActionsMenu>
      ) : null}
    </div>
  );
}
