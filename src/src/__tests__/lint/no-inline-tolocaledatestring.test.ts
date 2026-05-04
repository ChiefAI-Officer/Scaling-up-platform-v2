/**
 * BUG-05-followup (May 4 2026): regression guard for the slash-form date
 * rendering that survived the Apr 30 BUG-05 sweep. The original sweep
 * standardized the named utilities (formatDate→formatTimestamp, etc.) but
 * missed inline `.toLocaleDateString()` calls scattered across user-visible
 * files. Those default to en-US `M/D/YYYY` slash form — exactly what Jeff's
 * Excel screenshot called out as the original complaint.
 *
 * This guard flags TWO known-broken patterns:
 *   1. `.toLocaleDateString()` with no arguments at all → defaults to slash form
 *   2. `.toLocaleDateString("en-US", { timeZone: "UTC" })` with no format opts
 *      → still defaults to slash form despite the timezone hint
 *
 * Use formatTimestamp / formatEventDateUTC / formatTimestampDateTime from
 * `@/lib/utils` instead.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = path.resolve(__dirname, "../../..");

const NO_ARGS = /\.toLocaleDateString\(\s*\)/;
const TIMEZONE_ONLY = /\.toLocaleDateString\(\s*"en-US"\s*,\s*\{\s*timeZone:\s*"UTC"\s*\}\s*\)/;
const NUMERIC_MONTH = /\.toLocaleDateString\([^)]*month:\s*"numeric"[^)]*\)/;

describe("BUG-05-followup: no slash-form toLocaleDateString in source", () => {
    it("contains no zero-arg / timezone-only / numeric-month .toLocaleDateString() calls", () => {
        const filesOut = execSync(
            `grep -rln "toLocaleDateString" src/ --include="*.tsx" --include="*.ts" || true`,
            { cwd: REPO_ROOT, encoding: "utf8" }
        );
        const files = filesOut.split("\n").filter((l) => l && !l.includes("__tests__") && !l.includes(".test."));

        const offenders: { file: string; line: number; pattern: string; snippet: string }[] = [];
        for (const file of files) {
            const fullPath = path.join(REPO_ROOT, file);
            const content = fs.readFileSync(fullPath, "utf8");
            content.split("\n").forEach((line, idx) => {
                if (NO_ARGS.test(line)) {
                    offenders.push({ file, line: idx + 1, pattern: "no-args", snippet: line.trim().slice(0, 120) });
                } else if (TIMEZONE_ONLY.test(line)) {
                    offenders.push({ file, line: idx + 1, pattern: "timezone-only", snippet: line.trim().slice(0, 120) });
                } else if (NUMERIC_MONTH.test(line)) {
                    offenders.push({ file, line: idx + 1, pattern: "numeric-month", snippet: line.trim().slice(0, 120) });
                }
            });
        }

        if (offenders.length > 0) {
            const msg = [
                `BUG-05 violation: ${offenders.length} slash-form toLocaleDateString call(s) found:`,
                ...offenders.map((o) => `  ${o.file}:${o.line}  [${o.pattern}]  ${o.snippet}`),
                "",
                "Use formatTimestamp / formatEventDateUTC / formatTimestampDateTime from @/lib/utils.",
            ].join("\n");
            throw new Error(msg);
        }
        expect(offenders).toEqual([]);
    });
});
