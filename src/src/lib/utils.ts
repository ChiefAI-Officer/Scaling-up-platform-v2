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
    REQUESTED: "bg-yellow-100 text-yellow-800",
    AWAITING_APPROVAL: "bg-blue-100 text-blue-800",
    PRE_EVENT: "bg-green-100 text-green-800",
    POST_EVENT: "bg-purple-100 text-purple-800",
    COMPLETED: "bg-slate-100 text-slate-800",
    CANCELED: "bg-red-100 text-red-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

export function getWorkshopStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    REQUESTED: "Requested",
    AWAITING_APPROVAL: "Awaiting Approval",
    PRE_EVENT: "Pre-Event",
    POST_EVENT: "Post-Event",
    COMPLETED: "Completed",
    CANCELED: "Canceled",
  };
  return labels[status] || status;
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
