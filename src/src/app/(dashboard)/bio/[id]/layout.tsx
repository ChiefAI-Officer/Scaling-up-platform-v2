import type { ReactNode } from "react";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { BioResponsiveProvider } from "./bio-responsive-context";

export default function BioDetailLayout({ children }: { children: ReactNode }) {
  return (
    <BioResponsiveProvider enabled={isMobileResponsiveEnabled()}>
      {children}
    </BioResponsiveProvider>
  );
}
