"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

export function WorkshopRulesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-lg"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary flex-shrink-0" />
          Workshop Request Form Rules
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground space-y-3 border-t border-border pt-3">
          <p className="font-medium text-foreground">Please review the following rules before submitting your workshop request:</p>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground text-xs uppercase tracking-wide">Lead Time Requirements</h4>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>In-Person workshops</strong> must be scheduled at least <strong>90 days</strong> from today.</li>
              <li><strong>Virtual workshops</strong> must be scheduled at least <strong>60 days</strong> from today.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground text-xs uppercase tracking-wide">Certification</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>You must hold an active certification for the workshop type you are requesting.</li>
              <li>Contact your program manager if you believe your certification is inactive.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground text-xs uppercase tracking-wide">Pricing</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Standard pricing: <strong>$395</strong> (half-day) or <strong>$595</strong> (full-day).</li>
              <li>If you need a different price, use the Custom Pricing Request field to explain your needs.</li>
              <li>A <strong>10% fee</strong> applies to all paid workshops. Use Excluded Contracted Clients to list any clients exempt from this fee.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground text-xs uppercase tracking-wide">Cancellations</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Cancellations may result in fees. Refer to the workshop{" "}
                <a
                  href="/api/files/terms-and-conditions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary hover:text-primary/80"
                >
                  terms and conditions
                </a>{" "}
                for details.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground text-xs uppercase tracking-wide">Review Process</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>All workshop requests are reviewed by the Scaling Up team before approval.</li>
              <li>You will receive an email notification once your request has been reviewed.</li>
              <li>Approved workshops will advance to the <strong>Awaiting Approval</strong> stage for final sign-off.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
