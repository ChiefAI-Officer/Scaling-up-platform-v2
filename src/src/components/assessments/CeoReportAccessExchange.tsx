"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { exchangeCeoReportAccessToken } from "@/lib/assessments/ceo-report-access-client";

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
    void exchangeCeoReportAccessToken(token).then((href) => {
      if (href) router.replace(href);
      else setStatus("unavailable");
    });
  }, [router]);

  return status === "working"
    ? <p>Opening your report…</p>
    : <p>This report link is no longer available.</p>;
}
