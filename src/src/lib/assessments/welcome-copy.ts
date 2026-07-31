/**
 * Welcome-screen ("Screen 1") lede copy, per assessment template.
 *
 * Jeff's July-10 tracker items #62 (LVA), #66 (QSP v2), #70 (Rockefeller) and
 * #77 (Scaling Up Full) each replace the single shared paragraph that used to be
 * hardcoded in the participant client. The copy is his, byte-for-byte except for
 * the deviations recorded in the PR body and, once merged, the CHANGELOG entry
 * anchored `jeff-jul10-welcome-lede-copy` (the SoT update ships as its own PR,
 * per this repo's convention — see #219 -> #221). ADR-0026 is the durable record.
 *
 * WHY THIS IS CODE AND NOT DATA (ADR-0026): Jeff dictates fixed per-template
 * copy, not per-campaign copy, and this screen re-renders on every page load —
 * so a deploy is a perfectly good publication mechanism. Putting it on the
 * template row (the model invitation copy uses, ADR-0025) would buy a migration,
 * an editor field, an atomic-CAS patch script, seed drift-guards, and the
 * campaign-override precedence bypass tracked in GH #220 — for no gain nobody
 * asked for. Same shape as the per-alias maps at `report-config.ts:34-65` and
 * `invitation-email.ts:39-56`. `resolveWelcomeLede` is the seam — it is where the
 * lookup POLICY lives, so promoting this to data is bounded rather than a
 * rewrite: the map becomes a data read, `shouldShowResumeNote` takes the same
 * input, and the render site threads one extra value in from `/me`. Be precise
 * about the limit: the resolver runs synchronously inside a client render body,
 * so a DB read cannot hide behind today's signature (ADR-0026).
 *
 * Keyed by `AssessmentTemplate.alias`, which is stable across template versions,
 * so a copy change is intentionally RETROACTIVE — it reaches campaigns already
 * in flight, and a respondent who resumes mid-assessment can see different copy
 * than they started with. Acceptable here: this screen carries no answers and no
 * score. See ADR-0026.
 *
 * INVITED SURFACE ONLY. `accessMode` is per-campaign, so a PUBLIC campaign on a
 * keyed template renders `public-quiz-client.tsx` instead and would NOT show
 * this copy. As of 2026-07-28 every keyed template is invited-only in production;
 * that is an observation, not a constraint.
 */

/**
 * The copy every template showed before per-template copy existed, and the copy
 * every un-keyed template still shows. GH #224 removes the unsupported
 * "confidential" adjective while preserving the truthful resume promise.
 */
export const DEFAULT_WELCOME_LEDE: readonly string[] = Object.freeze([
  "A quick check on how your team works together. You can answer in one sitting or come back later — your link stays active.",
]);

/**
 * The resume promise, relocated. It used to live in the sentence above, which
 * was the ONLY place the invited card told a respondent they could stop and come
 * back. The promise holds: partial answers persist in `localStorage` via
 * `useAnswerDraft` — same browser only, so a laptop-to-phone switch starts over,
 * but the copy promises only that the link stays active, which is unconditional.
 * Jeff's replacement copy drops it, and he asked to ADD intro copy rather than
 * to remove that, so templates with bespoke copy carry it in the fine print.
 * Templates on the default already state it in the lede — see
 * `shouldShowResumeNote`, which keeps it from appearing twice on one card.
 */
export const RESUME_NOTE =
  "Answer in one sitting or come back later — your link stays active.";

/**
 * Per-template lede copy. Each entry is the paragraphs of one card, in order.
 *
 * Deviations from Jeff's dictated bytes are deliberate, itemised in the PR body,
 * and each is either grammar, a pre-start anchor fix, or (once) an omission of a
 * claim the product cannot honour. Do not "tidy" this copy: it is client-approved
 * text and the `// #N` markers tie each entry to the tracker item that dictated it.
 */
export const WELCOME_LEDE_BY_ALIAS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    // #62 — "members' views" and "its priorities" are grammar fixes.
    "leadership-vision-alignment": Object.freeze([
      "The Leadership Vision Alignment Assessment lists all the leadership team members' views on the company's current status, its priorities and its future. Great for preparing your strategy sessions and priority making.",
    ]),

    // #66 — "members' views" is a grammar fix; otherwise verbatim.
    "qsp-v2": Object.freeze([
      "This is your Quarterly Session Preparation Assessment. It lists all the leadership team members' views on the company's performance in the previous quarter and their ideas and wishes for the coming quarter. Great for preparing your new Quarterly Session and priority making.",
    ]),

    // #70 — "is rated" (was past tense, written for a report reader). The clause
    // "The table on page 4 therefore shows values ranging from 0 up to 12" is
    // OMITTED: Rockefeller renders no score table (his own #24 removed it —
    // `report-config.ts:40`) and we print no page numbers anywhere
    // (`su-report.css:851-865`), so no wording of it is shippable. The two true
    // facts it carried — the 0-3 scale and four items per habit — are kept.
    // Restoring the clause is a one-line change once he decides; see the GH issue.
    RockHabits: Object.freeze([
      "The checklist has been predominantly devised utilizing the Scaling Up / Rockefeller Habits 2.0 methodology, alongside academic growth models and organizational development theories. We have received input from many seasoned growth entrepreneurs, coaches, mentors and academics.",
      "We would highly recommend repeating this checklist annually, in order to keep track of your progress. In the questionnaire, each item is rated on a scale from 0 to 3, with four items in each habit.",
    ]),

    // DRAFTED BY US, not dictated by Jeff — the one entry here with no
    // client-supplied bytes. He asked for the other four the same day he sent
    // Five Dysfunctions wording for the invitation email (#80), so the omission
    // reads as an oversight rather than a decision; leaving this instrument on
    // generic copy while its siblings describe themselves was the worse option.
    // Every clause is traceable to prisma/seed-five-dysfunctions.ts: the five
    // sections (:290-331), "five fundamentals" (:79), and "constructive
    // conflict" (:304) — bare "conflict" reads to a cold respondent as something
    // a team should avoid. Deliberately claims NOTHING the instrument cannot
    // back: no duration (the stat chip derives its own), no "no right answers"
    // (the seed states higher always = healthier, :348-350), no assertion about
    // whole-team response, and no third-party attribution where the rest of the
    // family names none. Swap wholesale if Jeff sends his own paragraph.
    "five-dysfunctions": Object.freeze([
      "This is your Five Dysfunctions assessment. It lists all the team members' views on the five fundamentals of teamwork: trust, constructive conflict, commitment, accountability and results. Great for preparing your next team session.",
    ]),

    // #77 — "your report" (was "this report", which reads wrong on a screen shown
    // before question 1). Split into two paragraphs: 495 characters is a wall.
    "scaling-up-full": Object.freeze([
      "The assessment has been predominantly devised utilizing the Scaling Up / Rockefeller Habits 2.0 methodology, alongside academic growth models and organizational development theories. We have received input from many seasoned growth entrepreneurs, coaches, mentors and academics.",
      "We hope and believe you will be positively surprised by the number of Scaling Up insights throughout your report. We would highly recommend repeating this assessment annually, in order to keep track of your progress.",
    ]),
  });

/**
 * The lede paragraphs for a template. Unknown, unkeyed, empty, or missing alias
 * → the default (fail-open to the copy that shipped before this existed), and
 * the default object itself, so a caller can compare by identity.
 */
export function resolveWelcomeLede(
  templateAlias: string | null | undefined,
): readonly string[] {
  if (!templateAlias) return DEFAULT_WELCOME_LEDE;
  // `Object.hasOwn`, not `map[alias] ?? DEFAULT`: an object literal inherits from
  // Object.prototype, so `map["constructor"]` would return a *function* — `??`
  // only fires on null/undefined — and the render site would call `.map()` on it
  // and white-screen the Welcome screen. Not hypothetical: the admin
  // create-template validator (`/^[a-z0-9][a-z0-9-]*$/`) admits "constructor",
  // and seeds bypass that regex entirely (`RockHabits` has capitals).
  // `Object.freeze` does not help — it blocks writes, not prototype reads.
  return Object.hasOwn(WELCOME_LEDE_BY_ALIAS, templateAlias)
    ? WELCOME_LEDE_BY_ALIAS[templateAlias]
    : DEFAULT_WELCOME_LEDE;
}

/**
 * Whether the card must state the resume promise separately, i.e. whether this
 * template's bespoke lede replaced the default sentence that used to carry it.
 * False for templates still on the default — they already say it in the lede,
 * and saying it twice on one small card reads as a bug.
 */
export function shouldShowResumeNote(
  templateAlias: string | null | undefined,
): boolean {
  return resolveWelcomeLede(templateAlias) !== DEFAULT_WELCOME_LEDE;
}
