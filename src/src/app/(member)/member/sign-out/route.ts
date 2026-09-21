import { NextResponse } from "next/server";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { getMemberSession } from "@/lib/members/session";

export async function POST(request: Request): Promise<Response> {
  if (!isMemberPortalEnabled()) return new Response(null, { status: 404 });
  const session = await getMemberSession();
  session.destroy();
  return NextResponse.redirect(new URL("/member/sign-in", request.url), 303);
}
