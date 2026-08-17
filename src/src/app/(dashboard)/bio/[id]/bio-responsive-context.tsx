"use client";

import { createContext, useContext, type ReactNode } from "react";

const BioResponsiveContext = createContext(false);

export function BioResponsiveProvider({
  enabled = false,
  children,
}: {
  enabled?: boolean;
  children: ReactNode;
}) {
  return (
    <BioResponsiveContext.Provider value={enabled}>
      {children}
    </BioResponsiveContext.Provider>
  );
}

export function useBioResponsiveEnabled(): boolean {
  return useContext(BioResponsiveContext);
}
