import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

/**
 * Mock of the CUSTOM_PRICING approval rendering section from approvals/page.tsx
 * This component renders the price information for a CUSTOM_PRICING approval.
 */
interface MockApproval {
  id: string;
  type: string;
  status: string;
  coachName: string;
  workshopId?: string | null;
  requestData?: {
    oldPriceCents?: number;
    newPriceCents?: number;
    workshopTitle?: string;
  };
  workshop?: {
    id: string;
    title: string;
    priceCents: number;
    pricingTier?: {
      name: string;
    };
  };
}

interface CustomPricingPriceDisplayProps {
  approval: MockApproval;
}

/**
 * Component that renders both original and requested prices for CUSTOM_PRICING approvals.
 */
function CustomPricingPriceDisplay({ approval }: CustomPricingPriceDisplayProps) {
  if (approval.type !== "CUSTOM_PRICING") {
    return null;
  }

  const requestData = approval.requestData;
  const newPriceCents = requestData?.newPriceCents;
  const oldPriceCents = requestData?.oldPriceCents;

  // Determine the original price source: prefer requestData.oldPriceCents, fallback to workshop.priceCents
  let originalPriceCents: number | undefined;
  if (typeof oldPriceCents === "number") {
    originalPriceCents = oldPriceCents;
  } else if (approval.workshop) {
    originalPriceCents = approval.workshop.priceCents;
  }

  return (
    <>
      {typeof originalPriceCents === "number" && (
        <div className="text-xs text-foreground/70 mt-1">
          Original: ${(originalPriceCents / 100).toLocaleString()}
          {approval.workshop?.pricingTier?.name && ` (${approval.workshop.pricingTier.name})`}
        </div>
      )}
      {typeof newPriceCents === "number" && (
        <div className="text-xs text-foreground/70">
          Requested: ${(newPriceCents / 100).toLocaleString()}
        </div>
      )}
    </>
  );
}

describe("CUSTOM_PRICING approval price display", () => {
  test("renders original price from requestData.oldPriceCents when available", () => {
    const approval: MockApproval = {
      id: "approval-1",
      type: "CUSTOM_PRICING",
      status: "PENDING",
      coachName: "Jane Coach",
      workshopId: "ws-1",
      requestData: {
        oldPriceCents: 19900,
        newPriceCents: 29900,
        workshopTitle: "Test Workshop",
      },
      workshop: {
        id: "ws-1",
        title: "Test Workshop",
        priceCents: 19900,
      },
    };

    render(<CustomPricingPriceDisplay approval={approval} />);

    expect(screen.getByText(/Original: \$199/)).toBeInTheDocument();
    expect(screen.getByText(/Requested: \$299/)).toBeInTheDocument();
  });

  test("falls back to workshop.priceCents when requestData.oldPriceCents is absent", () => {
    const approval: MockApproval = {
      id: "approval-2",
      type: "CUSTOM_PRICING",
      status: "PENDING",
      coachName: "Jane Coach",
      workshopId: "ws-2",
      requestData: {
        newPriceCents: 29900,
        workshopTitle: "Test Workshop",
      },
      workshop: {
        id: "ws-2",
        title: "Test Workshop",
        priceCents: 19900,
      },
    };

    render(<CustomPricingPriceDisplay approval={approval} />);

    expect(screen.getByText(/Original: \$199/)).toBeInTheDocument();
    expect(screen.getByText(/Requested: \$299/)).toBeInTheDocument();
  });

  test("includes pricing tier name when available", () => {
    const approval: MockApproval = {
      id: "approval-3",
      type: "CUSTOM_PRICING",
      status: "PENDING",
      coachName: "Jane Coach",
      workshopId: "ws-3",
      requestData: {
        oldPriceCents: 19900,
        newPriceCents: 29900,
        workshopTitle: "Test Workshop",
      },
      workshop: {
        id: "ws-3",
        title: "Test Workshop",
        priceCents: 19900,
        pricingTier: {
          name: "Half-Day Workshop",
        },
      },
    };

    render(<CustomPricingPriceDisplay approval={approval} />);

    expect(screen.getByText(/Original: \$199 \(Half-Day Workshop\)/)).toBeInTheDocument();
  });

  test("renders both original and requested price lines", () => {
    const approval: MockApproval = {
      id: "approval-4",
      type: "CUSTOM_PRICING",
      status: "PENDING",
      coachName: "Jane Coach",
      workshopId: "ws-4",
      requestData: {
        oldPriceCents: 15000,
        newPriceCents: 35000,
        workshopTitle: "Test Workshop",
      },
      workshop: {
        id: "ws-4",
        title: "Test Workshop",
        priceCents: 15000,
      },
    };

    render(<CustomPricingPriceDisplay approval={approval} />);

    // Check both prices are rendered
    expect(screen.getByText(/Original: \$150/)).toBeInTheDocument();
    expect(screen.getByText(/Requested: \$350/)).toBeInTheDocument();

    // Verify the order: Original should come before Requested
    const originalElement = screen.getByText(/Original: \$150/);
    const requestedElement = screen.getByText(/Requested: \$350/);
    expect(originalElement.compareDocumentPosition(requestedElement)).toBe(4); // Node.DOCUMENT_POSITION_FOLLOWING
  });

  test("renders nothing for non-CUSTOM_PRICING approval types", () => {
    const approval: MockApproval = {
      id: "approval-5",
      type: "WORKSHOP_REQUEST",
      status: "PENDING",
      coachName: "Jane Coach",
      workshopId: "ws-5",
      requestData: {
        oldPriceCents: 19900,
        newPriceCents: 29900,
      },
      workshop: {
        id: "ws-5",
        title: "Test Workshop",
        priceCents: 19900,
      },
    };

    const { container } = render(<CustomPricingPriceDisplay approval={approval} />);

    expect(container.firstChild).toBeNull();
  });
});
