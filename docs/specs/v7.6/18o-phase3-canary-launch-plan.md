# Wave O — Phase 3: canary launch plan (SU-Full historical import)

**Status:** grilled (2 rounds) + APPROVED — the user confirmed on 2026-07-02 that local `src/.env` `DATABASE_URL` is the production Neon DB, and gave **explicit scoped authorization** for: (a) read-only prod-DB gate-verification queries, (b) the pilot writes (create "Wave O Pilot" org, roster import, known-answer round import), (c) the Vercel Production flag writes + redeploys per the stages below, (d) the Stage-4 pilot-round quarantine. Nothing beyond this spec.
**Execution notes (grill round 2):** local admin login uses the env-based canonical admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` resolve from the local `.env`, so local demo admin credentials work against the prod DB); the Stage-1 longitudinal gate expects the round to appear in the respondent's history as a **single point** (a comparison needs ≥2 rounds — not required for the gate).
**Prior state:** Phase 1 (plumbing + anti-corruption layer, PR #113) and Phase 2 (verified crosswalk `locked:true`, PR #115 `7a199d9`) are merged dark. The only remaining gate is the `WAVE_O_ESPERTO_SUFULL_IMPORT` flag family.
**Runbook:** `18o-ops-runbook.md` — this plan follows it with three grilled, recorded deviations (§Decisions D3–D5).

---

## Decisions (from brainstorm + grill, 2026-07-02)

- **D1 — Dual-purpose verification submission.** One controlled Esperto submission with **distinct per-row values** (row *j* → value *j* within every section) simultaneously (a) verifies the lock-checklist's last assumption — within-block ascending row order — and (b) mints the pilot smoke file with exactly-known expected scores. If `Q<n>_j ≠ j` for any code, the returned value *is* the true row position → fix the crosswalk map order via PR before any flag touch (full stop on the ramp).
- **D2 — Hash salt provisioned in both places. ✅ EXECUTED during the grill.** `WAVE_O_ESPERTO_IMPORT_HASH_SALT` generated (`openssl rand -hex 32`, never echoed) and set on Vercel **Production** (sensitive/encrypted) **and** in the local `src/.env`, so pilot-written provenance hashes are permanently consistent with the prod runtime. Without this, (i) the first prod commit would throw (resolver hard-fails in prod when unset — an undocumented launch prerequisite), and (ii) a local pilot would fall back to the dev-only salt, making the canary re-commit misclassify as `divergent-reimport`. Live on prod at the next redeploy (canary stage).
- **D3 — Pilot mechanics: local UI against prod DB (deviation: pilot exercised off the prod runtime).** During an org-canary the import **pages** call `isEspertoSuFullImportEnabled()` with no args → UI hidden for everyone, pilot included (only the **routes** pass `{organizationId}`). Rather than a transient code change, the pilot drives the **real UI** from a local dev server (flag on locally) writing to the **prod DB**; the prod **runtime** is then exercised separately at the canary stage via API. Every layer is proven on the runtime that matters for it, with zero code change.
- **D4 — Observability posture: manual for launch (deviation from runbook §3-step-3/§7).** The §7 alert queries assume a log-drain alerting stack that was never wired. For launch: the synthetic **divergent-reimport** exercise runs on prod during canary (proves the `commit_conflict` marker is emitted end-to-end), and observability = human-read `vercel logs` + the kill switch. Defensible: early traffic ≈ 0; every 409 also surfaces to the operating coach in the UI (not silent); the truly silent hazard (wrong mapping) is ruled out by the known-answer pilot before any flip. **Follow-on logged:** wire a log drain + §7 alert queries (added to the CLAUDE.md "Open follow-ons" ledger at SoT time).
- **D5 — Two-stage ramp: pilot-org canary → global (deviation: runbook's middle "expand allowlist" stage struck).** The allowlist expansion only had value with willing external coach pilots; none are lined up, so it would be traffic-free theater. R3-H3's substance (no day-one flip of a write capability; prove it on a contained org) is honored by the pilot stage. If a real coach volunteers before the global step, add their org id to `_CANARY` and pause there — permitted, not required.
- **D6 — Pilot residue: keep-then-quarantine-last.** The pilot round survives **through** the global flip (known-good specimen for the final smoke), then is quarantined as the last launch step — doubling as the first real-prod rehearsal of `scripts/wave-o-quarantine-import.ts` (dry-run → `--confirm` → post-rollback smoke §5b). The pilot **org + roster stay** (inert, invisible to other coaches, reusable for future smokes).
- **Cadence (user-chosen):** same-session to global; every stage gates on its verification evidence, not wall-clock.
- **D8 — Stage-1 commit relocated to the prod runtime (execution deviation, 2026-07-02).** The local pilot proved UI + parse + plan + respondent resolution (preview: 1 create / 0 blocks / pinned v3), but the commit transaction cannot complete locally: Prisma's default 5s interactive-transaction budget vs cross-continent latency to Neon us-east-1 (retries plateaued ~5.3s, each dying at a later statement; all rolled back atomically — no partial state). Same commit on Vercel shares Neon's region. Resolution: the FIRST commit of the pilot round runs on the prod runtime during Stage 2 (`created`), the re-commit proves `reused-noop`, and the Stage-1 gates (known-answer/FTE/report/longitudinal) verify immediately after. Zero mid-launch code change. **Follow-on logged:** bump the restricted-commit `$transaction` timeout (align with the route's 60s `maxDuration`) to harden the documented 300-file batch cap; also fixed-shape note — the pilot input had to be re-enveloped to the restricted-export shape (the Stage-0 pull used an internal report API; real coach exports come from Esperto's restricted-export capability, which Phase-1 fixtures already mirror; classification refused the wrong shape cleanly).
- **D7 — Phase-3a FTE remap (preflight finding, user-approved 2026-07-02).** Stage 0.5 expected published = v1 (61 sliders, no FTE). Reality: **v3 published 2026-06-30** with `Q_FTE_CONTRACT` (**required**) + `Q_FREELANCE`. The completeness gate derives its required set from the published version's `isRequired` flags → with FTE dropped, every respondent would be skipped as incomplete (**Wave O bricked as shipped**); and `answerHash` covers *mapped* answers, so remapping after real imports exist would reclassify same-file re-imports as divergent. Fix (before any real import): dark PR mapping `Q1o2_2 → Q_FTE_CONTRACT`, `Q1o2_3 → Q_FREELANCE` (NUMBER; bindings verified by the Phase-2 controlled decode). Pilot gate extended: FTE answers (20/2) stored; growth-phase path observable (20 FTE → Phase 2 band).

---

## Launch procedure

Every stage's gate must pass before the next stage; any failure stops the ramp with the flags at their last-safe values (worst case: `_KILL=1` + redeploy, then §5 quarantine if data was written).

### Stage 0 — Prep (no prod flag touched)

1. ✅ Salt provisioned (D2).
2. **Esperto verification submission (D1):** on our own Esperto account (scalinguptoolkit.com, doc@ account), create a fresh SU-Full test campaign + CEO participant using our email (`doc+pilot@chiefaiofficer.com`), open the session link directly (no invite mail — `…/c/<token>` redirect, as in Phase 2), fill every section with row *j* → value *j* (real slider interactions; `noUiSlider.set()` doesn't register), intake fields: permanent FTE = 20, freelance = 2, free-text = an obvious test marker. Submit.
3. **Export** the individual-data JSON + the Members JSON from the Esperto admin; delete the Esperto test campaign (leave the account as found).
4. **Row-order verdict:** read the export's 61 slider values. All `Q<n>_j == j` → ascending CONFIRMED (tick the lock-checklist line via a docs-only follow-up commit). Any mismatch → **STOP**; the values dictate the corrected map order; fix `scaling-up-full.ts` via PR (tests updated), then resume.
5. **Preflight:** `npx vercel env ls production | grep WAVE_O` → expect exactly the salt, no flags. Confirm prod's published SU-Full version is v1 (61 sliders, no FTE keys) — the pilot's preview would also catch a drift via `validateCrosswalkAgainstVersion`.

### Stage 1 — Pilot (prod DB via local UI; prod stays fully dark)

6. Start the local dev server with `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED=1` in the local env (local-only; prod untouched), logged in as admin against the prod DB.
7. Stage the pilot org: **create a fresh org named "Wave O Pilot"** (deterministic — no dependency on what test orgs happen to exist, and no risk of colliding with an org that carries prior QSP/roster history or an already-pinned `espertoSuFullCid`). Import the **Members roster** (always-on path) from the Stage-0 export.
8. Import the SU-Full round through the local **UI**: round label `pilot-2026-07`, target org = pilot org, the Stage-0 individual file.
9. **Gate (known-answer check, all must hold):**
   - campaign created CLOSED, `externalId = esperto:sufull:<cid>:pilot-2026-07`, `importManifest` populated, org `espertoSuFullCid` pinned;
   - all 61 per-question values land on the exact expected stableKeys (row *j* value *j* per section);
   - domain scores equal the arithmetic means of the values we set;
   - the report renders on the **live prod site** with the "Imported from Esperto (historical)" label;
   - per-respondent longitudinal picks the round up.

### Stage 2 — Prod-runtime canary

10. Set `WAVE_O_ESPERTO_SUFULL_IMPORT_CANARY=<pilot-org-id>` on Vercel Production; redeploy (also activates the salt on prod).
11. **Idempotency on the prod runtime:** re-commit the same round via the authenticated API → expect `reused-noop` (proves salt parity D2 + advisory-lock path on serverless).
12. **Synthetic divergent-reimport (D4):** re-commit with one changed answer → expect 409 `divergent-reimport`; confirm the `assessment.esperto_import.commit_conflict` marker in `vercel logs`.
13. **Dark-posture checks:** SU-Full UI still hidden on prod (both import pages); an import attempt against a non-canary org → clean flag refusal; roster/QSP import paths unaffected.

### Stage 3 — Global flip

14. Set `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED=1`, **remove** `_CANARY`, redeploy.
15. **Live smoke:** SU-Full option visible in both import UIs (admin + coach) with the honest-framing copy; the pilot round's report still renders correctly; roster/QSP paths still green.
16. Kill switch standing by: `_KILL=1` + redeploy (stops new imports); bad batch → quarantine script (§5).

### Stage 4 — Cleanup + SoT

17. **Quarantine rehearsal (D6):** quarantine the pilot round — dry-run, then `--confirm`, then post-rollback smoke §5b (round gone from campaign list + longitudinal; org cid pin untouched; re-import under the same label would be treated as fresh).
18. Local hygiene: remove the flag from the local env (salt stays); tick the lock-checklist row-order line (docs commit, with SoT below).
19. **SoT on push:** CLAUDE.md anchor + prose → "Wave O LAUNCHED"; CHANGELOG entry; add the D4 alert-wiring follow-on to the Open follow-ons ledger; memory update; Notion task (Deployment) → Done.
20. **Jeff note (Slack-terse, drafted for the user to send):** historical Scaling Up Full import is live — link + 3 bullets (what it does, roster-first order, Rockefeller/LVA still pending his exports).

---

## Rollback map

| Failure | Response |
|---|---|
| Stage 0 row-order mismatch | No flag touched; crosswalk-order fix PR; resume at Stage 0.4 |
| Stage 1 known-answer failure | Prod still dark; quarantine the pilot round; diagnose (crosswalk vs plumbing); fix PR; restart Stage 1 |
| Stage 2 idempotency/conflict failure | Remove `_CANARY` + redeploy (back to dark); quarantine; diagnose |
| Stage 3 smoke failure | `_KILL=1` + redeploy; quarantine anything written; promote-previous only if the defect is code-level |
| Post-launch bad import (any org) | `_KILL=1` if systemic; by-batch quarantine if data-local |
