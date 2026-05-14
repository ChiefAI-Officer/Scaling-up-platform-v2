/**
 * Round 16 — Affiliate tracking types.
 *
 * Wave 1 ships the interfaces only. Adapters live in sibling files:
 * `idev-tracker.ts` for iDev, `pap-tracker.ts` (added in Wave 3) for PAP.
 *
 * `ScriptDescriptor` is a discriminated union with three forms to cover
 * every shape an affiliate provider's tracking artifact takes:
 *
 *   - `image`              <img src="..."> — iDev's CHG-03 production form
 *   - `externalScript`     <script src="..."> — iDev cookie + PAP library
 *   - `inlineScriptGroup`  ordered list of external+inline steps, used by
 *                          PAP's "load library, then call setter chain" shape
 *
 * Wave 1 only uses `externalScript` (cookies). Wave 2 wires up `image` for
 * iDev commission. Wave 3 wires up `inlineScriptGroup` for PAP commission.
 */

export type TrackerMode = "primary" | "shadow" | "off";

export type ScriptDescriptor =
    | { type: "image"; src: string }
    | { type: "externalScript"; src: string }
    | {
          type: "inlineScriptGroup";
          steps: Array<
              | { kind: "external"; src: string }
              | { kind: "inline"; body: string }
          >;
      };

export interface AffiliateTracker {
    readonly id: "idev" | "pap";
    readonly mode: TrackerMode;
    /** Wave 1: cookie-setter script descriptor, or null if not configured. */
    getCookieScriptDescriptor(): ScriptDescriptor | null;
    /**
     * Wave 1: returns null (stub). Wave 2 wires this up for iDev (image
     * descriptor) and Wave 3 wires it for PAP (inlineScriptGroup).
     */
    getCommissionScriptDescriptor(): ScriptDescriptor | null;
}
