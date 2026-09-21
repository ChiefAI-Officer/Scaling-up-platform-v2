import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { RateLimits, checkRateLimitAsync } from "@/lib/rate-limit";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { normalizeMemberEmail } from "@/lib/members/identity";
import { sendMemberSignInLink } from "@/lib/members/send-sign-in-link";

const requestSchema = z.object({ email: z.string().email().max(320) });
const SENT_PATH = "/member/sign-in?state=sent";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function sent(request: Request): NextResponse {
  return NextResponse.redirect(new URL(SENT_PATH, request.url), 303);
}

export async function POST(request: Request): Promise<Response> {
  if (!isMemberPortalEnabled()) return new Response(null, { status: 404 });

  let parsed: z.ZodSafeParseResult<{ email: string }>;
  try {
    const form = new URLSearchParams(await request.text());
    parsed = requestSchema.safeParse({ email: form.get("email") });
  } catch {
    return sent(request);
  }

  const ipLimit = await checkRateLimitAsync(
    `member-signin:ip:${hash(clientIp(request))}`,
    RateLimits.auth,
  ).catch(() => ({ success: false }));
  if (!parsed.success) return sent(request);

  const normalizedEmail = normalizeMemberEmail(parsed.data.email);
  const addressLimit = await checkRateLimitAsync(
    `member-signin:address:${hash(normalizedEmail)}`,
    RateLimits.auth,
  ).catch(() => ({ success: false }));

  if (ipLimit.success && addressLimit.success) {
    await sendMemberSignInLink(
      db as unknown as Parameters<typeof sendMemberSignInLink>[0],
      { email: normalizedEmail, via: "SELF" },
    ).catch(() => undefined);
  }
  return sent(request);
}
