
---

## Changelog — Round 1 (Codex senior-engineer review)

Source: `findings-round-1.md`. All findings accepted except one Low (narrowed). These amendments are **authoritative** and supersede the corresponding text in the design §C and the Tasks above.

### Accepted — HIGH

**H1 — Pre-merge data audit of existing LVA submissions (retroactive hide-rate).**
The filter is retroactive and unflagged, so existing reports can silently lose obstacle explanations. Add a **mandatory pre-merge gate** (read-only, no migration):
- New `scripts/audit-lva-report-filter-impact.mjs` (read-only; standalone CLI, excluded from tsconfig like other scripts). Against the prod DB (read-only, via `DIRECT_URL`), for every `SUBMITTED` LVA submission count:
  - (a) submissions losing the S3 matrix (expected = all — sanity only);
  - (b) submissions with ≥1 present `S5_why_<f>` whose `<f>` is NOT in that submission's `S4_biggest_obstacles` selection (the explanations that WILL be hidden) — the **hide rate**;
  - (c) submissions whose pinned version has NO `S4_biggest_obstacles` question (the fail-open population).
- Output: per-campaign + total counts + an id-only sample of (b) (no PII).
- **Gate:** run before merge; the (b) hide-rate must be reviewed and explicitly approved by the user (or a legacy fallback defined) before deploy. This is a Task-0 / pre-merge step, NOT part of the TDD code loop.

### Accepted — MEDIUM

**M3 — Mechanism change (supersedes design §C and Task 3 "derive-from-options").**
Once the gate question EXISTS in the pinned version, treat **every** key matching `followupPrefix` as conditional (prefix match), rendering iff `suffix ∈ checkedFactorKeys` — NOT only keys derived from the current S4 option list. This closes the per-factor fail-open gap: an `S5_why_<f>` whose `<f>` has drifted out of the S4 options no longer leaks (it can't be checked → it's hidden). **Fail-open remains ONLY when the gate question is entirely absent** (no S4 in the version → answered-only, today's behavior). Task 3 §3b becomes:

```
const gateExists = metaByKey.has(gateKey);
const checkedFactorKeys = gateExists
  ? new Set((Array.isArray(answerByKey.get(gateKey)) ? answerByKey.get(gateKey) : []).map(String))
  : undefined;
// a key is a conditional follow-up iff: gateExists && key.startsWith(followupPrefix)
// render iff: checkedFactorKeys.has(key.slice(followupPrefix.length))
```

Plus a **seed-invariant guard test** (Codex's alternative, kept belt-and-suspenders): every `S5_why_*` follow-up key produced by `buildLvaContent()` has a matching `S4_biggest_obstacles` option key.

**M1 — Orphan-bucket bypass.**
Factor the gating decision into a shared predicate (e.g. `isHiddenFollowup(key)`), and apply it in BOTH the section item loop AND the orphan "Additional responses" loop (`qualitative-report-model.ts` ~L433–438). Regression test: an orphaned `S5_why_*` answer (no `sectionStableKey`, not in any section's question-key list) for an UNCHECKED factor must NOT render in "Additional responses".

**M2 — Real-seed integration test.**
Add a test that builds the model from the ACTUAL seed: `buildLvaContent()` (`seed-lva-assessment.ts`) + `buildQuestionMetaByKey(content.questions)` (`question-meta.ts`), with full S3/S4/S5 answers — proving the filter's `S3_strengths` section key, the S4 option keys, and the `S5_why_` keys all match real content (not just hand-built `QMeta`). Asserts S3 suppressed and S5 gated end-to-end.

**M4 — Consumer (screen + email) gated-followup tests.**
Model tests alone don't prove the consumers honor gating. Add:
- `QualitativeReport.tsx` test: a checked-factor `S5_why_` text appears; an unchecked-but-typed `S5_why_` text is absent.
- `report-email.ts` test (the inline-HTML email twin): same assertion (checked present, unchecked-typed absent).

### Accepted (narrowed) — LOW

**L1 — `conditionalFollowups` singular vs generic.**
Keeping it singular by design (YAGNI — no current template needs multiple conditional groups). Narrow the interface comment to: "one conditional follow-up group per template; widen to an array if a future template needs multiple." Not converting to an array now.

### Net task-list delta
- **NEW pre-merge step (H1):** read-only impact audit `scripts/audit-lva-report-filter-impact.mjs` → user-approved hide rate gates the merge.
- **Task 3 (M3):** mechanism → prefix-match-once-gate-exists; fail-open only when S4 absent; + seed-invariant guard test.
- **Task 3 / model loop (M1):** shared gating predicate applied in the section loop AND the orphan bucket; + orphan regression test.
- **Task 5 (M2, M4):** real-seed integration test; `QualitativeReport` + `report-email` gated-followup tests.
- **L1:** doc/comment narrowing only.
