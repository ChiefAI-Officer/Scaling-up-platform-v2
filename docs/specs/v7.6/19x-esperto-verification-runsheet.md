# 19x Run-Sheet — Controlled Esperto Verification Submissions (Wave X D4)

**Who:** you, on the Esperto account (scalinguptoolkit.com, the doc@ coach account).
**Pattern:** Wave O D1 — create a TEST campaign per instrument, participant = your own alias email,
open the session link directly (`…/c/<token>`), NO invite mail to anyone. Real slider interactions
(drag/click each slider — programmatic set doesn't register).
**When done:** export each test campaign as a **restricted individual** export (same flow Jeff used
for the samples) and drop both files in `From Jeff/` (anywhere under it — gitignored). Tell me;
I take it from there.

The answer design below makes every export self-verifying: every open-text answer NAMES its own
question, every slider row is distinguishable from its neighbors, and the pick-3 exercises the
index decode.

---

## Run 1 — Rockefeller Habits Checklist (variant "RockHabits")

1. Add Campaign → variant **RockHabits** → campaign name `WAVEX ROCK VERIFY (test)` → participant:
   `doc+wavex-rock@chiefaiofficer.com` → open the session link directly.
2. 10 pages × 4 sliders, 4-point scale (0–3). For **section s, row j** (top row = 1) set
   **value = (s + j) mod 4**:

   | Section | r1 | r2 | r3 | r4 |
   |---|---|---|---|---|
   | 1 | 2 | 3 | 0 | 1 |
   | 2 | 3 | 0 | 1 | 2 |
   | 3 | 0 | 1 | 2 | 3 |
   | 4 | 1 | 2 | 3 | 0 |
   | 5 | 2 | 3 | 0 | 1 |
   | 6 | 3 | 0 | 1 | 2 |
   | 7 | 0 | 1 | 2 | 3 |
   | 8 | 1 | 2 | 3 | 0 |
   | 9 | 2 | 3 | 0 | 1 |
   | 10 | 3 | 0 | 1 | 2 |

   Every row differs from its section neighbors (proves within-section row order), and at least one
   0 appears in most sections (proves 0 survives the export — the 4-pt-scale finding).
3. Submit. Export restricted-individual.

## Run 2 — Leadership Vision Alignment (variant "LeadVision")

1. Add Campaign → variant **LeadVision** → campaign name `WAVEX LVA VERIFY (test)` → participant:
   `doc+wavex-lva@chiefaiofficer.com` → open the session link directly.
2. **Financial intake (9 number fields):** in screen order enter
   `11, 22, 33, 44, 55, 66, 77, 88, 99`. If a currency selector appears, pick **USD**.
3. **Vision open-texts (~8 fields):** answer each with `XV: ` + the first 3–4 words of ITS question
   (e.g. `XV: What are your main products`). **If any EXTRA question appears in this stretch**
   (candidates for Q15A/Q15B — possibly conditional follow-ups), answer it the same way — the
   marker text is what identifies it in the export.
4. **16-factor matrix (1–3 sliders):** top-to-bottom cycle `1, 2, 3, 1, 2, 3, …` (row 16 ends on 1).
5. **Pick-3 obstacles (checkboxes):** tick visual positions **1, 10, 16** (first, tenth, last —
   expected: Recruitment, Sales, Growth financing). Note on paper if the on-screen factor ORDER
   differs from the matrix order.
6. **Why-boxes (3, one per pick):** `XV-WHY: ` + the factor name shown (e.g. `XV-WHY: Sales`).
7. **Everything after (S5 tail + S6 focus block, ~17 texts + one % field):** the % field = `42`;
   every text = `XV: ` + first 3–4 words of its question. **Any question you don't recognize from
   our platform's LVA** (candidates for Q33/Q35/Q36) — answer it anyway, same marker scheme.
8. Submit. Export restricted-individual.

---

**Safety rails (standing):** test campaigns only, your own alias emails, no mail to any real person,
no changes to any real campaign. Both test campaigns can stay on Esperto (it's the vendor being
replaced) — no cleanup needed there.
