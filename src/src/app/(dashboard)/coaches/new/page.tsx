import { NewCoachForm } from "./new-coach-form";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export default function NewCoachPage() {
  return <NewCoachForm responsiveEnabled={isMobileResponsiveEnabled()} />;
}
