import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { PartnersClient } from "./partners-client";

export default function PartnersPage() {
  return <PartnersClient responsiveEnabled={isMobileResponsiveEnabled()} />;
}
