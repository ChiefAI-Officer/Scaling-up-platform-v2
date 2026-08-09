"use client";

import { useEffect, useRef } from "react";

export function PublicCampaignCreationHeading() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <h1 ref={headingRef} className="wf-page-title" tabIndex={-1}>
      Create a public campaign
    </h1>
  );
}
