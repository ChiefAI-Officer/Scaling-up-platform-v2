/**
 * Slim-down rollout 2026-05-13: regression guard for the CLAUDE.md /
 * plans/CHANGELOG.md freshness contract. The slim-down extracted ~57
 * historical sprint entries from CLAUDE.md "Current Status" into
 * plans/CHANGELOG.md, and inserted an HTML-comment anchor in CLAUDE.md's
 * Project Context table pointing at the top CHANGELOG entry. Future sprint
 * pushes must update both the LAST_UPDATED anchor in CLAUDE.md AND prepend
 * a new entry to plans/CHANGELOG.md.
 *
 * Three assertions:
 *   1. CLAUDE.md has exactly one LAST_UPDATED_ISO and one LAST_UPDATED_SLUG.
 *   2. plans/CHANGELOG.md's first ENTRY_ISO and ENTRY_SLUG match CLAUDE.md's anchor.
 *   3. CLAUDE.md word count < 8000 (size-budget guard against re-bloat).
 *
 * If this test breaks, the fix is one of:
 *   - You pushed a new sprint but didn't append to plans/CHANGELOG.md → add the entry.
 *   - You updated CLAUDE.md prose but didn't bump the LAST_UPDATED anchor → bump it.
 *   - You re-bloated CLAUDE.md's reference sections → move the bloat to CHANGELOG.md.
 */

import fs from "node:fs";
import path from "node:path";

const CLAUDE_MD_PATH = path.resolve(__dirname, "../../../..", "CLAUDE.md");
const CHANGELOG_PATH = path.resolve(__dirname, "../../../..", "plans/CHANGELOG.md");

// Match only inside the actual HTML-comment anchor (e.g. <!-- LAST_UPDATED_ISO:... LAST_UPDATED_SLUG:... -->).
// This avoids matching backtick-quoted prose examples like `ENTRY_SLUG:kebab-slug`.
const LAST_UPDATED_ANCHOR_RE =
    /<!--\s*LAST_UPDATED_ISO:(\d{4}-\d{2}-\d{2})\s+LAST_UPDATED_SLUG:([a-z0-9-]+)\s*-->/g;
// First entry anchor in CHANGELOG.md — same format on the topmost ### heading line.
const ENTRY_ANCHOR_RE =
    /<!--\s*ENTRY_ISO:(\d{4}-\d{2}-\d{2})\s+ENTRY_SLUG:([a-z0-9-]+)\s*-->/;

const SIZE_BUDGET_WORDS = 8000;

describe("CLAUDE.md / plans/CHANGELOG.md freshness + size budget", () => {
    const claudeMdContent = fs.readFileSync(CLAUDE_MD_PATH, "utf8");
    const changelogContent = fs.readFileSync(CHANGELOG_PATH, "utf8");

    it("CLAUDE.md has exactly one LAST_UPDATED anchor (ISO + SLUG together)", () => {
        const matches = [...claudeMdContent.matchAll(LAST_UPDATED_ANCHOR_RE)];
        expect(matches.length).toBe(1);
    });

    it("CLAUDE.md LAST_UPDATED_ISO matches the topmost ENTRY_ISO in plans/CHANGELOG.md", () => {
        const claudeMatch = [...claudeMdContent.matchAll(LAST_UPDATED_ANCHOR_RE)][0];
        const changelogMatch = changelogContent.match(ENTRY_ANCHOR_RE);
        expect(claudeMatch).toBeDefined();
        expect(changelogMatch).toBeDefined();
        expect(claudeMatch[1]).toBe(changelogMatch![1]);
    });

    it("CLAUDE.md LAST_UPDATED_SLUG matches the topmost ENTRY_SLUG in plans/CHANGELOG.md", () => {
        const claudeMatch = [...claudeMdContent.matchAll(LAST_UPDATED_ANCHOR_RE)][0];
        const changelogMatch = changelogContent.match(ENTRY_ANCHOR_RE);
        expect(claudeMatch).toBeDefined();
        expect(changelogMatch).toBeDefined();
        expect(claudeMatch[2]).toBe(changelogMatch![2]);
    });

    it(`CLAUDE.md word count stays below ${SIZE_BUDGET_WORDS} (re-bloat guard)`, () => {
        const wordCount = claudeMdContent.split(/\s+/).filter(Boolean).length;
        expect(wordCount).toBeLessThan(SIZE_BUDGET_WORDS);
    });
});
