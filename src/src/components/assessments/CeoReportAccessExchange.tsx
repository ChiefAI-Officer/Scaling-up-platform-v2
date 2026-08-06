"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

async function exchange(token: string): Promise<string | null> {
  try {
    const response = await fetch("/assessments/self-report/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return null;
    const body = await response.json() as { href?: unknown };
    return typeof body.href === "string" && body.href.startsWith("/assessments/")
      ? body.href
      : null;
  } catch {
    return null;
  }
}

export function CeoReportAccessExchange() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "unavailable">("working");

  useEffect(() => {
    const token = window.location.hash.match(/^#t=(.+)$/)?.[1];
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    if (!token) {
      void Promise.resolve().then(() => setStatus("unavailable"));
      return;
    }
    void exchange(token).then((href) => {
      if (href) router.replace(href);
      else setStatus("unavailable");
    });
  }, [router]);

  return status === "working"
    ? <p>Opening your report…</p>
    : <p>This report link is no longer available.</p>;
}
