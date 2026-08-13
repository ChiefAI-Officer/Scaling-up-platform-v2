import type { Page } from "@playwright/test";

export const MINIMUM_TOUCH_TARGET_PX = 44;
export const TOUCH_TARGET_SELECTOR = 'button, [role="button"], summary, a[href]';

export interface TouchTargetMeasurement {
  selector: string;
  width: number;
  height: number;
  visible: boolean;
}

export function findUndersizedTouchTargets(
  measurements: TouchTargetMeasurement[],
): TouchTargetMeasurement[] {
  return measurements.filter(
    ({ visible, width, height }) =>
      visible &&
      (width < MINIMUM_TOUCH_TARGET_PX || height < MINIMUM_TOUCH_TARGET_PX),
  );
}

export function formatTouchTargetFailures(
  failures: TouchTargetMeasurement[],
): string {
  return failures
    .map(({ selector, width, height }) => `${selector} (${width}×${height})`)
    .join("; ");
}

export async function measureVisibleTouchTargets(
  page: Page,
): Promise<TouchTargetMeasurement[]> {
  return page.locator(TOUCH_TARGET_SELECTOR).evaluateAll((nodes) => {
    const describe = (element: Element, index: number): string => {
      const tag = element.tagName.toLowerCase();
      const id = element.getAttribute("id");
      if (id) return `${tag}#${CSS.escape(id)}`;
      const testId = element.getAttribute("data-testid");
      if (testId) return `${tag}[data-testid="${testId}"]`;
      const label = element.getAttribute("aria-label");
      if (label) return `${tag}[aria-label="${label}"]`;
      const marker = element.hasAttribute("data-touch-target")
        ? "[data-touch-target]"
        : "";
      return `${tag}${marker}:nth-of-type(${index + 1})`;
    };

    return nodes
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0";
        return {
          selector: describe(element, index),
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          visible,
        };
      });
  });
}

export async function assertMinimumTouchTargets(
  page: Page,
  label: string,
): Promise<void> {
  const failures = findUndersizedTouchTargets(
    await measureVisibleTouchTargets(page),
  );
  if (failures.length > 0) {
    throw new Error(
      `${label}: touch targets below ${MINIMUM_TOUCH_TARGET_PX}×${MINIMUM_TOUCH_TARGET_PX}: ${formatTouchTargetFailures(failures)}`,
    );
  }
}
