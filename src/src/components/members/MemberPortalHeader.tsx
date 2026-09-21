import Link from "next/link";

export function MemberPortalHeader({ memberName }: { memberName?: string }) {
  return (
    <header className="border-b border-slate-200 bg-[#522583] text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/member/home" className="text-xl font-bold tracking-wide">Scaling Up</Link>
        {memberName ? (
          <div className="flex items-center gap-4 text-sm">
            <span>{memberName}</span>
            <form action="/member/sign-out" method="post">
              <button className="underline underline-offset-4" type="submit">Sign out</button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
