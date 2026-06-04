# Scaling Up brand is applied to the assessment participant UI only; the rest of the app stays on its generic theme (for now)

The Scaling Up brand (primary purple `#522583`, the Four Decisions palette, Helvetica Neue headings / Roboto body) is applied **only** to the new assessment participant experience — the section-intro slides, the section pager, and the public/invited answering clients. The rest of the platform keeps its current generic-blue shadcn theme (`--primary: 224 76% 48%`, Plus Jakarta Sans).

## Context

The platform shipped on a default shadcn/Tailwind theme: a generic blue primary and Plus Jakarta Sans — neither matches the Scaling Up Brand Guidelines (purple `#522583`, Helvetica Neue / Roboto, the Four Decisions secondary palette). Jeff asked for the **assessment** work to follow brand. A full app re-theme is a much larger, cross-cutting change (every admin and portal screen, every component) that a separate work-stream owns, and re-theming the whole app under this assessment branch would balloon scope and risk regressions far outside assessments.

## Considered options

- **Re-theme the whole app now** — rejected for this branch: out of scope, high regression surface across admin + portal, owned by a different work-stream.
- **Leave assessments on the generic theme** — rejected: Jeff explicitly asked the assessment work to follow brand, and the participant UI is the most externally-visible surface (real company leadership teams answer it).
- **Brand the assessment participant UI only (chosen)** — scope the SU brand tokens/fonts to the assessment answering surface via a scoped wrapper (route-group class / scoped CSS), leave global tokens untouched.

## Consequences

- For a period, the app is intentionally two-toned: branded purple assessment-answering screens inside an otherwise generic-blue app. **This is deliberate** — a future engineer should not "fix" the purple assessment UI to match the blue app, nor assume the blue app is the intended brand.
- The global off-brand drift (generic blue + Plus Jakarta Sans app-wide) is a **known, separate finding**, surfaced for Jeff / the non-assessment work-stream — not silently fixed here.
- Brand tokens must be scoped (not poured into global `:root`) so they don't leak into admin/portal screens; when the global re-theme happens, the scoped assessment tokens should be reconciled with (or folded into) the global ones.
- Brand application follows the guidelines' incorrect-usage rules: no drop-shadow/glow on the logo, no unauthorized colors, no busy backgrounds, coaches use the "Scaling Up Certified Coach" secondary mark — never the primary corporate logo.
