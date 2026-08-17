import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import PricingClient from "./pricing-client";

export default function PricingPage() {
  return <PricingClient responsiveEnabled={isMobileResponsiveEnabled()} />;
}
