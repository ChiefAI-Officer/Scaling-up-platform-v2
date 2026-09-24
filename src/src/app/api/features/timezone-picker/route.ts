import { NextResponse } from "next/server";
import { timezonePickerEnabled } from "@/lib/time/wave-timezone-flags";

export async function GET() {
  return NextResponse.json({ enabled: timezonePickerEnabled() });
}
