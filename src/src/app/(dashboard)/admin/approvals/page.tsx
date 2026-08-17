import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import ApprovalsClient from "./approvals-client";

export default function ApprovalsPage() {
  return <ApprovalsClient responsiveEnabled={isMobileResponsiveEnabled()} />;
}
