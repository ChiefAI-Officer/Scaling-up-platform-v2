"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  allZones,
  COMMON_ZONES,
  loadCountryNamesByZone,
  DEFAULT_TIMEZONE,
  zoneLabel,
} from "@/lib/time";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface TimezoneSelectProps {
  value: string;
  onChange: (timeZone: string) => void;
  at?: Date;
  helperText?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function TimezoneSelect({
  value,
  onChange,
  at,
  helperText,
  disabled = false,
  id,
  className,
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [countryAliases, setCountryAliases] = useState<Map<string, string[]>>(() => new Map());
  const [activeOptionId, setActiveOptionId] = useState<string | undefined>();
  const [mountedAt] = useState(() => new Date());
  const listboxId = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const labelDate = at ?? mountedAt;
  const selected = value || DEFAULT_TIMEZONE;

  const catalogue = useMemo(() => allZones(), []);
  const common = useMemo(
    () => COMMON_ZONES.map((zone) => catalogue.find((item) => item.value === zone) ?? {
      value: zone,
      city: zone.split("/").at(-1)?.replaceAll("_", " ") ?? zone,
      region: zone.split("/")[0],
      searchText: zone.toLowerCase(),
    }),
    [catalogue],
  );

  const normalizedQuery = query.trim().toLowerCase();
  useEffect(() => {
    if (!open) return;
    return loadCountryNamesByZone(setCountryAliases);
  }, [open]);

  const matches = (zone: (typeof catalogue)[number]) => {
    if (!normalizedQuery) return true;
    const label = zoneLabel(zone.value, labelDate).toLowerCase();
    const countryText = (countryAliases.get(zone.value) ?? []).join(" ").toLowerCase();
    return zone.searchText.includes(normalizedQuery) || label.includes(normalizedQuery) || countryText.includes(normalizedQuery);
  };
  const filteredCommon = common.filter(matches);
  const filteredAll = catalogue.filter(matches);
  const regions = Array.from(new Set(filteredAll.map((zone) => zone.region))).sort();

  const choose = (timeZone: string) => {
    onChange(timeZone);
    setOpen(false);
    setQuery("");
    setActiveOptionId(undefined);
  };

  const optionId = (timeZone: string, keyPrefix: string) =>
    `${listboxId}-${keyPrefix}-${timeZone.replaceAll("/", "-")}`;

  const moveActiveOption = (direction: 1 | -1) => {
    const options = Array.from(
      listboxRef.current?.querySelectorAll<HTMLButtonElement>("[data-timezone-option]") ?? [],
    );
    if (options.length === 0) return;
    const currentIndex = options.findIndex(({ id: option }) => option === activeOptionId);
    const nextIndex = currentIndex < 0
      ? direction === 1 ? 0 : options.length - 1
      : (currentIndex + direction + options.length) % options.length;
    const next = options[nextIndex];
    setActiveOptionId(next.id);
    next.scrollIntoView?.({ block: "nearest" });
  };

  const renderOption = (timeZone: string, keyPrefix: string) => (
    <button
      key={`${keyPrefix}-${timeZone}`}
      id={optionId(timeZone, keyPrefix)}
      type="button"
      role="option"
      data-timezone-option={timeZone}
      tabIndex={-1}
      aria-selected={selected === timeZone}
      aria-label={zoneLabel(timeZone, labelDate)}
      onClick={() => choose(timeZone)}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected === timeZone && "bg-accent",
      )}
    >
      <span className="min-w-0 truncate">{zoneLabel(timeZone, labelDate)}</span>
      {selected === timeZone && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-label={`Time zone: ${zoneLabel(selected, labelDate)}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={disabled}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="min-w-0 truncate">{zoneLabel(selected, labelDate)}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(26rem,var(--radix-popover-trigger-width))] p-0">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              aria-label="Search time zones"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveOptionId(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
                } else if (event.key === "Enter" && activeOptionId) {
                  event.preventDefault();
                  const active = document.getElementById(activeOptionId) as HTMLButtonElement | null;
                  const nextZone = active?.dataset.timezoneOption;
                  if (nextZone) choose(nextZone);
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search city, region, or offset"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div
            id={listboxId}
            ref={listboxRef}
            role="listbox"
            aria-label="Time zones"
            className="max-h-80 overflow-y-auto p-1"
          >
            {filteredCommon.length > 0 && (
              <>
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Common
                </p>
                {filteredCommon.map((zone) => renderOption(zone.value, "common"))}
              </>
            )}
            {regions.map((region) => (
              <div key={region}>
                <p className="sticky top-0 bg-popover px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {region}
                </p>
                {filteredAll
                  .filter((zone) => zone.region === region)
                  .map((zone) => renderOption(zone.value, "all"))}
              </div>
            ))}
            {filteredCommon.length === 0 && filteredAll.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No time zones found.
              </p>
            )}
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Search by city, region, IANA name, or offset such as +11.
          </p>
        </PopoverContent>
      </Popover>
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
