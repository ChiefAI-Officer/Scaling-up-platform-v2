# Progress Update — July 9 2026 · 3-minute talk track

_Spoken voice, ~3 min. Timing cues in brackets. Pairs with `Scaling-Up-Progress-Update-2026-07-09.html`._

---

**[0:00 — Open]**
Hey Jeff — quick update. Last time I gave you three committed targets. All three are now live in production. And with that list closed, I did the groundwork on the next big thing — overhauling the assessment builder itself. I'll be upfront about what's shipped versus what's still a plan.

**[0:25 — Recommendations in the results email]**
First: recommendations now travel inside the results email. The capability I previewed for you is switched on — so when someone finishes an assessment, the tailored recommendations land in their email, not just on the report screen. And it's safe by design: it only ever includes recommendations you've actually authored on a template. Anything without them sends the exact same email as before — no invented content reaches a client.

**[0:55 — The three "coming soon" pages]**
Second, the big one you'll see: those three admin pages that used to say "coming soon" are now real. There's a **Campaigns** page where you can see every campaign across every company in one view — grouped by company, filterable, including imported historical rounds. There's an **Organizations** directory to browse any company and manage its members and teams. And **Public Quizzes** is wired up too. The important part: I built these by *reusing* screens that already existed, not rebuilding — so they came with 60 automated tests and a clean review, fast.

**[1:40 — The duplicate link]**
Third, a small one you flagged: the templates list had both a "View" and an "Edit" link going to the same place. Since there's no separate view, I removed the redundant one. Name opens the editor, "Edit" is the action. Rough edge gone.

**[2:00 — Transition]**
So — every target from the last update is shipped and live. The tool is feature-complete for what we set out to build.

**[2:10 — The builder overhaul plan]**
Which brings me to what's next. The builder works, but authoring is clunky — editing one question means four separate tabs, there's no way to test an assessment before publishing, and you only learn something's wrong after you hit publish. I researched how the best tools on the market solve this, and I've got a phased plan. Step one is the highest-value piece: **test before you publish** — fill in sample answers, instantly see the scores and recommendations a respondent would get. Then a "safe to publish" checklist. The full visual rebuild comes last, and only if it earns it — an independent engineering review backed that value-first, risk-late order.

**[2:50 — Close]**
That's designed, not built yet — so it's ready on your go. Two quick decisions from you when you can: the SU-Full industry-benchmarking direction, and a couple of wording items. Everything's in the doc. Thanks, Jeff.
