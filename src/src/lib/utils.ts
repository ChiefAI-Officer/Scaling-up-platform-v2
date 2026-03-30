import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(date: Date | string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return "Invalid Date";
    }
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
    }).format(d);
  } catch {
    return "Invalid Date";
  }
}

/** Format a calendar date (eventDate) using UTC to prevent timezone off-by-one */
export function formatEventDate(date: Date | string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "Invalid Date";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return "Invalid Date";
  }
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function generateSlug(title: string, id?: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return id ? `${baseSlug}-${id.slice(0, 8)}` : baseSlug;
}

// JV-02: Jeff Verdun's 6 workshop stages
export function getWorkshopStatusColor(status: string): string {
  const colors: Record<string, string> = {
    INFO_REQUESTED: "bg-status-requested/10 text-status-requested",
    AWAITING_APPROVAL: "bg-status-awaiting/10 text-status-awaiting",
    PRE_EVENT: "bg-status-active/10 text-status-active",
    POST_EVENT: "bg-status-post/10 text-status-post",
    COMPLETED: "bg-muted text-status-completed",
    CANCELED: "bg-status-canceled/10 text-status-canceled",
  };
  return colors[status] || "bg-muted text-muted-foreground";
}

export function getWorkshopStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    INFO_REQUESTED: "Info Requested",
    AWAITING_APPROVAL: "Awaiting Approval",
    PRE_EVENT: "Pre-Event",
    POST_EVENT: "Post-Event",
    COMPLETED: "Completed",
    CANCELED: "Canceled",
  };
  return labels[status] || status;
}

export function getWorkshopStatusExplanation(status: string): string {
  const explanations: Record<string, string> = {
    REQUESTED: "Submitted — awaiting admin review",
    AWAITING_APPROVAL: "Under review by admin team",
    INFO_REQUESTED: "Admin requested changes — respond below",
    PRE_EVENT: "Approved — workshop pages are live",
    POST_EVENT: "Event concluded — collecting feedback",
    COMPLETED: "All follow-up complete",
    CANCELED: "Workshop canceled",
  };
  return explanations[status] || "";
}

// Helper to parse JSON fields stored as strings (for SQLite compatibility)
export function parseJsonField<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export interface VenueAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export function formatVenueAddress(addressJson: string | null | undefined): string {
  const address = parseJsonField<VenueAddress>(addressJson);
  if (!address) return "";

  const parts: string[] = [];
  if (address.street) parts.push(address.street);
  if (address.city) parts.push(address.city);
  if (address.state && address.zip) {
    parts.push(`${address.state} ${address.zip}`);
  } else if (address.state) {
    parts.push(address.state);
  } else if (address.zip) {
    parts.push(address.zip);
  }

  return parts.join(", ");
}
