# ADR-0020 — Question stableKeys: slug-derived at first save; key/type/option-keys locked once published

**Status:** Accepted (Wave T, 2026-07-05). Spec: [docs/specs/v7.6/19t-wave-t-question-editor-design.md](../specs/v7.6/19t-wave-t-question-editor-design.md).

## Context

Wave T unlocks TEXT / NUMBER / MULTI_CHOICE authoring in the admin template editor (Jeff July-1 #10). A question's `stableKey` is the permanent cross-version join identifier (ADR-0001): trends, respondent longitudinal, locked Esperto import crosswalks, Wave S peer benchmarks, report filters and conditional followups (`S5_why_<optionKey>`) all key off it — and MULTI_CHOICE **option keys** are identifiers of the same class (stored in answers; bound to followups). Once admins can author questions, key assignment and mutation policy stop being a seed-script concern and need a durable rule.

Alternatives considered: (a) keep the editor's original `Q_NEW_<random>` keys — zero derivation logic, but opaque keys leak into every downstream human surface (benchmarks panel, crosswalk authoring, report filters); (b) admin-typed keys — maximal control, enables convention keys (`S5_why_*`), but pushes key-grammar correctness onto Jeff/Suzanne; (c) confirm-key-before-save dialog (raised in co-validate) — friction without safety once the server validates.

## Decision

1. **Derivation (D8):** a new question's key is derived from its label at FIRST save — `<section prefix>_<lower_snake(label)>` (section prefix = section stableKey up to its first `_`), truncated to 40 chars, matching the established key grammar (`P1_rate_core_values`, `S1_gross_margin`). New MULTI_CHOICE option keys derive from the option label. After first save the key is immutable and displayed read-only.
2. **Uniqueness is union-scoped:** collisions are checked against the union of current-draft keys AND every published version's keys (collision → `_2` suffix). Draft-only uniqueness would let a re-created key silently inherit a retired key's cross-version history — the exact ADR-0001 hazard.
3. **Inherited-lock (D3/D9):** a question whose key appears in any published version of the template ("inherited") has its key AND type locked; a type change is delete + add-new. Inherited option keys are likewise locked (labels stay editable). Reword-class fields (label, help, required, sortOrder, maxChoices, option labels) stay freely editable; structure changes that alter what stored answers mean (deleting an inherited question, removing an inherited option, changing an inherited slider's scale) warn with named consequences but are not blocked — version pinning isolates every past campaign and ADR-0016 keeps computed deltas same-version-only, so the exposure is interpretive, not data corruption.
4. **Server-authoritative (co-validate C1):** the version PATCH enforces key format, payload uniqueness, `KEY_COLLIDES_WITH_PUBLISHED` (a key new to the stored draft may not equal any published key) and `TYPE_LOCKED` (no retyping keys that exist published). Client-side derivation is UX; the server is the integrity boundary. Option-key locks remain client-side because a rename is indistinguishable from a permitted remove+add.

## Consequences

- Keys stay human-readable and grammar-consistent across seed-authored and editor-authored questions; admins never manage key grammar.
- A deleted-then-recreated question is a NEW series (suffix key) — trend history never silently resurrects.
- Conditional-followup authoring (convention keys) is impossible in the editor by design — a follow-on (Jeff #11 territory), documented in spec 19t §3.
- Seed scripts and the editor coexist: re-seeds remain the wholesale content path (specs 09/09b) and append new draft versions from artifact content; the editor is the incremental path. Both produce keys under the same grammar; the reseed hash-guard fails closed on divergence, unchanged.
