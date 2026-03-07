export interface WorkshopRevenueSplit {
  grossRevenueCents: number;
  scalingUpShareCents: number;
  coachShareCents: number;
}

export function calculateWorkshopRevenueSplit(totalPaidCents: number): WorkshopRevenueSplit {
  const grossRevenueCents = Math.max(0, Math.trunc(totalPaidCents));
  const scalingUpShareCents = Math.round(grossRevenueCents / 4);
  const coachShareCents = grossRevenueCents - scalingUpShareCents;

  return {
    grossRevenueCents,
    scalingUpShareCents,
    coachShareCents,
  };
}

export function formatUsdFromCents(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}
