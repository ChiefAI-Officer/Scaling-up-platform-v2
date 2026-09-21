import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberPortalHeader } from "@/components/members/MemberPortalHeader";
import { isMemberPortalEnabled } from "@/lib/members/flags";

export const metadata: Metadata = { referrer: "no-referrer" };

export default async function MemberSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; state?: string }>;
}) {
  if (!isMemberPortalEnabled()) notFound();
  const { t, state } = await searchParams;
  return (
    <>
      <MemberPortalHeader />
      <div className="mx-auto flex min-h-[75vh] max-w-lg items-center px-5 py-12">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          {t ? (
            <>
              <h1 className="text-2xl font-bold">You&apos;re one click from your reports</h1>
              <p className="mt-3 text-slate-600">For your security, this link only works when you open it yourself.</p>
              <form action="/member/sign-in/exchange" method="post" className="mt-6">
                <input type="hidden" name="token" value={t} />
                <button type="submit" className="w-full rounded-lg bg-[#522583] px-5 py-3 font-semibold text-white">View my reports</button>
              </form>
            </>
          ) : state === "sent" ? (
            <>
              <h1 className="text-2xl font-bold">Check your email</h1>
              <p className="mt-3 text-slate-600">If your email is on file, we&apos;ve just sent a sign-in link. It works once and expires in 1 hour.</p>
              <Link className="mt-6 inline-block font-semibold text-[#522583]" href="/member/sign-in">Send another link</Link>
              <p className="mt-6 text-sm"><Link className="underline" href="/login">Coaches and staff sign in with a password instead →</Link></p>
            </>
          ) : state === "invalid" ? (
            <>
              <h1 className="text-2xl font-bold">This link is no longer valid</h1>
              <p className="mt-3 text-slate-600">Sign-in links work once and expire after 1 hour. Request a new one and we&apos;ll email it to you.</p>
              <Link className="mt-6 inline-block rounded-lg bg-[#522583] px-5 py-3 font-semibold text-white" href="/member/sign-in">Email me a new link</Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Sign in to your reports</h1>
              <p className="mt-2 font-medium">For people who&apos;ve been set up by a Scaling Up coach.</p>
              <p className="mt-3 text-slate-600">Enter your email and we&apos;ll send you a secure link. There&apos;s no password to remember.</p>
              <form action="/member/sign-in/request" method="post" className="mt-6 space-y-4">
                <label className="block"><span className="mb-1 block text-sm font-medium">Email address</span><input required type="email" name="email" autoComplete="email" className="w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
                <button type="submit" className="w-full rounded-lg bg-[#522583] px-5 py-3 font-semibold text-white">Email me a link</button>
              </form>
              <p className="mt-3 text-xs text-slate-500">Links work once and expire after 1 hour.</p>
              <p className="mt-6 text-sm"><Link className="underline" href="/login">Coach or staff? Sign in with your password →</Link></p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
