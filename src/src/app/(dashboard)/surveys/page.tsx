import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { SurveysClient } from "./surveys-client";

export default function SurveysPage() {
  return <SurveysClient responsiveEnabled={isMobileResponsiveEnabled()} />;
}
