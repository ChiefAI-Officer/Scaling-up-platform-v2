"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

function getSnapshot(): boolean {
  return document.body.dataset.mobileResponsive === "on";
}

export function useMobileResponsiveEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
