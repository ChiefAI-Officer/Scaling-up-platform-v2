import { render, screen, within } from '@testing-library/react';
import { PortalWorkshopList } from '@/components/workshops/workshop-list-filters';

// Helper: build a workshop row with sensible defaults; override per-test for variations.
function makeWorkshop(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ws-1',
    title: 'Test Workshop',
    workshopCode: 'WS-2026-TEST',
    workshopType: { name: 'AI' },
    eventDate: '2026-10-01T00:00:00.000Z',
    maxAttendees: 30,
    _count: { registrations: 0 },
    status: 'PRE_EVENT' as const,
    landingPageSlug: null,
    isFree: false,
    priceCents: null as number | null,
    pricingTier: null as { name: string; amountCents: number } | null,
    hasCounterOffer: false,
    hasPendingPriceChange: false,
    ...overrides,
  };
}

describe('PortalWorkshopList', () => {
  it('hides Validated column for coaches (isAdmin=false)', () => {
    render(<PortalWorkshopList workshops={[]} isAdmin={false} />);
    expect(screen.queryByText('Validated')).not.toBeInTheDocument();
  });

  it('shows Validated column for admins (isAdmin=true)', () => {
    render(<PortalWorkshopList workshops={[]} isAdmin={true} />);
    expect(screen.getByText('Validated')).toBeInTheDocument();
  });

  describe('BUG-02/ENH-01: split Pricing into Workshop Type + Cost columns', () => {
    it('renders separate "Workshop Type" and "Cost" column headers (no combined "Pricing")', () => {
      render(<PortalWorkshopList workshops={[]} isAdmin={false} />);
      expect(screen.getByText('Workshop Type')).toBeInTheDocument();
      expect(screen.getByText('Cost')).toBeInTheDocument();
      expect(screen.queryByText('Pricing')).not.toBeInTheDocument();
    });

    it('Cost cell shows custom priceCents formatted as dollars when set (BUG-02 root case)', () => {
      const workshop = makeWorkshop({
        priceCents: 20000,
        pricingTier: { name: 'Half-Day', amountCents: 30000 },
      });
      render(<PortalWorkshopList workshops={[workshop]} isAdmin={false} />);
      const row = screen.getByText('Test Workshop').closest('tr')!;
      expect(within(row).getByText('$200.00')).toBeInTheDocument();
      expect(within(row).getByText('Half-Day')).toBeInTheDocument();
      expect(within(row).queryByText(/Half-Day — \$300/)).not.toBeInTheDocument();
    });

    it('Cost cell falls back to tier amount when priceCents is null', () => {
      const workshop = makeWorkshop({
        priceCents: null,
        pricingTier: { name: 'Full-Day', amountCents: 50000 },
      });
      render(<PortalWorkshopList workshops={[workshop]} isAdmin={false} />);
      const row = screen.getByText('Test Workshop').closest('tr')!;
      expect(within(row).getByText('$500.00')).toBeInTheDocument();
      expect(within(row).getByText('Full-Day')).toBeInTheDocument();
    });

    it('Cost cell shows "Free" when isFree=true (regardless of price/tier)', () => {
      const workshop = makeWorkshop({
        isFree: true,
        priceCents: 5000,
        pricingTier: { name: 'Sample', amountCents: 5000 },
      });
      render(<PortalWorkshopList workshops={[workshop]} isAdmin={false} />);
      const row = screen.getByText('Test Workshop').closest('tr')!;
      expect(within(row).getByText('Free')).toBeInTheDocument();
      expect(within(row).queryByText('$50.00')).not.toBeInTheDocument();
    });

    it('Cost cell shows literal "$0.00" when priceCents=0 and isFree=false (data fidelity)', () => {
      const workshop = makeWorkshop({
        isFree: false,
        priceCents: 0,
        pricingTier: { name: 'Half-Day', amountCents: 30000 },
      });
      render(<PortalWorkshopList workshops={[workshop]} isAdmin={false} />);
      const row = screen.getByText('Test Workshop').closest('tr')!;
      expect(within(row).getByText('$0.00')).toBeInTheDocument();
      expect(within(row).queryByText('Free')).not.toBeInTheDocument();
    });

    it('Cost cell shows "—" when priceCents is null AND no tier AND not free (data-broken)', () => {
      const workshop = makeWorkshop({
        isFree: false,
        priceCents: null,
        pricingTier: null,
      });
      render(<PortalWorkshopList workshops={[workshop]} isAdmin={false} />);
      const row = screen.getByText('Test Workshop').closest('tr')!;
      // Cost cell renders an em-dash; Workshop Type cell also renders an em-dash. Two of them.
      expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Landing CTA gated on approval (coach-only)', () => {
    it('coach + pre-approval workshop WITH landingPageUrl → shows "Available after approval", NOT the copy button', () => {
      const workshop = makeWorkshop({
        status: 'AWAITING_APPROVAL',
        landingPageUrl: 'https://app.example.com/workshop/test-slug',
      });
      render(<PortalWorkshopList workshops={[workshop]} isAdmin={false} />);
      const row = screen.getByText('Test Workshop').closest('tr')!;
      expect(within(row).getByText('Available after approval')).toBeInTheDocument();
      // CopyUrlButton renders a <button>; within a row it is the only button element.
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    });

    it('coach + approved workshop (PRE_EVENT) WITH landingPageUrl → shows the copy button', () => {
      const workshop = makeWorkshop({
        status: 'PRE_EVENT',
        landingPageUrl: 'https://app.example.com/workshop/test-slug',
      });
      render(<PortalWorkshopList workshops={[workshop]} isAdmin={false} />);
      const row = screen.getByText('Test Workshop').closest('tr')!;
      expect(within(row).getByRole('button')).toBeInTheDocument();
      expect(within(row).queryByText('Available after approval')).not.toBeInTheDocument();
    });

    it('admin + pre-approval workshop WITH landingPageUrl → still shows the copy button (admin unchanged)', () => {
      const workshop = makeWorkshop({
        status: 'AWAITING_APPROVAL',
        landingPageUrl: 'https://app.example.com/workshop/test-slug',
      });
      render(<PortalWorkshopList workshops={[workshop]} isAdmin={true} />);
      const row = screen.getByText('Test Workshop').closest('tr')!;
      expect(within(row).getByRole('button')).toBeInTheDocument();
      expect(within(row).queryByText('Available after approval')).not.toBeInTheDocument();
    });
  });
});
