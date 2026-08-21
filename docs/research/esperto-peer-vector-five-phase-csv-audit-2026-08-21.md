# Esperto Peers five-phase truth and boundary closeout

Date: 2026-08-21

Assessment: Scaling Up Assessment (`ScaleUp2`, `enUS`)

Scope: fixed CEO/personal profile; only permanent employee count and the controlled score suite vary

## Current conclusion

`Peers` is an external comparison vector. It is separate from both the respondent's `You` score and the feedback paragraph.

The current controlled evidence supports a phase-keyed Peers snapshot for this assessment/profile:

| Phase | Tested headcounts | Scores tested | Peer-vector result |
| --- | --- | --- | --- |
| P1 — Pioneering | `3`, `8` | `0–10` at 3; `5` at 8 | baseline vector |
| P2 — Organization | `9`, `15`, `25` | `5` at 9/25; `0–10` at 15 | baseline vector |
| P3 — Management | `26`, `50` | `5` at 26; `0–10` at 50 | baseline vector |
| P4 — Delegation | `51`, `100`, `150` | `5` at 51/150; `0–10` at 100 | Delegation vector |
| P5 — Standardization | `151`, `200` | `5` at 151; `0–10` at 200 | baseline vector |

Only two distinct 61-value payloads were observed, but the truthful selector is an explicit five-phase mapping: P1/P2/P3/P5 map to the baseline payload and P4 maps to the Delegation payload. Content equality is a storage-deduplication opportunity, not permission to collapse the phase mapping.

This supersedes the global-static interpretation of the 2026-08-14 experiment. That experiment remains valid for its observed P1/P2/P5-like profiles; it did not include the P4 Delegation cohort that exposes the second vector.

## Deterministic committed-CSV audit

Source: [`esperto-feedback-five-phase-full-matrix-2026-08-20.csv`](esperto-feedback-five-phase-full-matrix-2026-08-20.csv)

The audit groups rows by `phase × score`, orders each group by canonical `Q01–Q61`, and hashes this exact UTF-8 payload:

```text
Q01=<peer_value>\n
...
Q61=<peer_value>\n
```

The committed CSV contains 3,355 rows: 55 reports × 61 questions. Each phase produced exactly one vector across scores `0–10`.

| Phase | Distinct vectors across 11 scores | Vector SHA-256 | Q01 |
| --- | ---: | --- | ---: |
| P1 | 1 | `fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd` | 6.3 |
| P2 | 1 | `fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd` | 6.3 |
| P3 | 1 | `fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd` | 6.3 |
| P4 | 1 | `ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff` | 6.6 |
| P5 | 1 | `fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd` | 6.3 |

P1→P2 and P2→P3 change 0/61 values. P3→P4 changes 56/61. P4→P5 changes the same 56 values back to baseline. The five values that do not change at either edge are Q27, Q30, Q38, Q41, and Q57.

## Adjacent-boundary report closeout

Six previously started, mail-disabled boundary campaigns were completed with every scored statement fixed at `5` and every non-headcount profile answer held constant. The existing accepted 50/51 artifacts were reused.

| Boundary | Below | At/above | Observed vector result |
| --- | --- | --- | --- |
| P1→P2 | `8 = P1` | `9 = P2` | baseline → baseline |
| P2→P3 | `25 = P2` | `26 = P3` | baseline → baseline |
| P3→P4 | `50 = P3` | `51 = P4` | baseline → Delegation |
| P4→P5 | `150 = P4` | `151 = P5` | Delegation → baseline |

Every new artifact passed these gates:

- 26-page personal report;
- displayed phase and permanent employee count match the boundary manifest;
- 65 scored statements fixed at `5`, with identical non-headcount controls;
- invitation, reminder, and participant-confirmation switches remained false;
- pages 8–25, after normalizing only whitespace and the intentionally different challenge sentence, are byte-identical to the established score-5 reference report for the same phase;
- visual checks of page 4 confirmed P1/P2/P2/P3/P4/P5 at 8/9/25/26/150/151;
- visual checks of page 8 confirmed Q01 Peers `6.3` for 8/9/25/26/151 and `6.6` for 150.

The durable run ledger, PDF hashes, and normalized-detail hashes are in [`esperto-peer-vector-boundary-report-manifest-2026-08-21.csv`](esperto-peer-vector-boundary-report-manifest-2026-08-21.csv).

## What this proves—and what it does not

Proven for the current fixed CEO/personal `ScaleUp2` / `enUS` profile:

- scored answers do not select Peers within a fixed phase;
- exact current phase is sufficient to select the observed Peer vector at all four adjacent headcount transitions and at the phase anchors;
- P5 returning to the baseline vector is real and must be represented explicitly;
- a single global static vector cannot reproduce current P4 Esperto reports.

Not proven:

- that industry, geography, revenue, respondent role, language, or assessment variant never selects another cohort;
- Esperto's private cohort formula, sample sizes, exclusions, weighting, or refresh cadence;
- that historical Esperto versions used the same mapping.

The implementation claim must therefore be narrow: a governed, versioned snapshot reproduces the current fixed-profile five-phase mapping. It must not be described as Esperto's universal cohort algorithm.

## Smallest truthful implementation boundary

The evidence supports a versioned phase-to-vector mapping with two deduplicated payloads:

```text
P1 -> baseline
P2 -> baseline
P3 -> baseline
P4 -> delegation
P5 -> baseline
```

Selection must use the phase already frozen with the scored result, then freeze the selected per-question Peer values and snapshot provenance into the report result. Rendering must not query mutable current benchmark rows. Legacy/pinned reports must retain their legacy 2026-08-14 snapshot behavior; no historical result or campaign may be repinned or rewritten.

This is an evidence recommendation, not implementation approval. No Platform Production, publication, deployment, activation, Slack, or email action is authorized by this note.

## Evidence index

- [Five-phase full report manifest](esperto-feedback-five-phase-full-manifest-2026-08-20.csv)
- [Five-phase 3,355-cell matrix](esperto-feedback-five-phase-full-matrix-2026-08-20.csv)
- [Live phase-boundary manifest](esperto-feedback-live-phase-boundary-manifest-2026-08-20.csv)
- [2026-08-14 historical snapshot](esperto-peer-benchmark-snapshot-2026-08-14.md)
- [2026-08-14 controlled-source findings](esperto-peer-benchmark-sources.md)
- [Phase-aware feedback implementation receipt](su-full-phase-feedback-implementation-receipt-2026-08-20.md)
