import {
  assertResponsiveNavigationContract,
  type ResponsiveNavigationContract,
} from "./responsive-route-contract";

const CUID_SEGMENT = "c[a-z0-9]{20,31}";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cuidDetailHrefPattern(basePath: string): RegExp {
  return new RegExp(`^${escapeRegex(basePath)}/${CUID_SEGMENT}$`);
}

export function nonReservedDetailHrefPattern(basePath: string): RegExp {
  return new RegExp(`^${escapeRegex(basePath)}/(?!new(?:[/?#]|$))[^/?#]+(?:\\?[^#]*)?$`);
}

interface SettledHrefDiscoveryOptions {
  navigate: () => Promise<ResponsiveNavigationContract>;
  settle: () => Promise<number>;
  readHrefs: () => Promise<readonly string[]>;
  pattern: RegExp;
  label: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export async function discoverSettledHref({
  navigate,
  settle,
  readHrefs,
  pattern,
  label,
  pollIntervalMs = 100,
  timeoutMs = 10_000,
}: SettledHrefDiscoveryOptions): Promise<string | null> {
  assertResponsiveNavigationContract(await navigate());

  const itemCount = await settle();
  if (!Number.isInteger(itemCount) || itemCount < 0) {
    throw new Error(`${label} readiness returned an invalid item count.`);
  }
  if (itemCount === 0) return null;

  const startedAt = Date.now();
  do {
    const hrefs = await readHrefs();
    const match = hrefs.find((href) => {
      pattern.lastIndex = 0;
      return pattern.test(href);
    });
    if (match) return match;

    if (Date.now() - startedAt >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  } while (true);

  throw new Error(
    `Settled populated collection did not expose a ${label} link matching ${pattern}.`,
  );
}
