# Esperto peer benchmark snapshot

Date captured: 2026-08-14
Assessment: Scaling Up Assessment (`ScaleUp2`, `enUS`)

## Experimental result

Eleven otherwise-identical CEO reports set `Effective recruitment process`
once to every integer from 0 through 10. Every report contained the exact same
ordered vector of 61 Peer values.

- Recruitment Peer value in all 11 reports: `6.3`
- Peer-vector count in every report: `61`
- Peer-vector SHA-256 in every report:
  `3a18bef3018c20910a192491775217263caea0f89ec0df5c86f4eff78e745d4a`

A second contrast held every answer at 5 while changing company age,
employees, freelancers, and revenue history from very small through very
large. The large profile reached a different organizational phase screen. All
61 Peer values still matched by question across the three reports.

These values are a reproducible source snapshot, not a claim that Esperto will
never refresh its stored benchmark.

## Q01–Q61 value table

| Key | Peers | Question |
| --- | ---: | --- |
| Q01 | 6.3 | Effective recruitment process |
| Q02 | 7.2 | High staff retention |
| Q03 | 5.6 | Onboarding program |
| Q04 | 5.9 | Measuring employee satisfaction |
| Q05 | 6.2 | Positive about re-hiring employees |
| Q06 | 4.6 | Every employee has a training plan |
| Q07 | 4.4 | Outsourcing / Offshoring operations |
| Q08 | 5.5 | Flat-management or self-steering/organizing teams |
| Q09 | 7.2 | Core values |
| Q10 | 6.4 | Focus on customers' needs |
| Q11 | 5.7 | Employees know core values |
| Q12 | 5.2 | Transparency |
| Q13 | 7.3 | Positive and healthy culture |
| Q14 | 6.7 | Long-term non-financial goal |
| Q15 | 6.0 | Yearly goals |
| Q16 | 5.4 | Quarterly/monthly non-financial goals |
| Q17 | 5.3 | Strategic plan |
| Q18 | 4.9 | Personalized employee goals |
| Q19 | 4.2 | Growth methodology |
| Q20 | 2.4 | Active acquisitions strategy |
| Q21 | 6.2 | Tasks properly allocated |
| Q22 | 6.0 | Weekly management meetings |
| Q23 | 5.9 | Periodic strategic sessions |
| Q24 | 4.7 | Leadership team training |
| Q25 | 5.8 | Goals translated into clear KPIs |
| Q26 | 5.9 | Real-time performance data |
| Q27 | 5.0 | Growth with limited mistakes/errors/problems |
| Q28 | 5.6 | Customer satisfaction measurement |
| Q29 | 5.7 | Systematic continuous improvement |
| Q30 | 5.6 | Effective lead generation |
| Q31 | 6.1 | Sales achievement |
| Q32 | 6.4 | Weekly sales meeting |
| Q33 | 5.9 | Head of sales is not the entrepreneur |
| Q34 | 5.0 | Effective PR/communication strategy |
| Q35 | 6.2 | Automated processes |
| Q36 | 6.2 | Systems prepared for growth |
| Q37 | 6.3 | Better systems than competitors |
| Q38 | 6.9 | Knowledge of latest technology |
| Q39 | 6.7 | More innovative than competitors |
| Q40 | 6.2 | Disruptive business model |
| Q41 | 8.0 | Real-time financial insights |
| Q42 | 7.0 | Up-to-date cashflow planning |
| Q43 | 5.8 | Access to growth capital |
| Q44 | 6.9 | Financial alert function |
| Q45 | 7.8 | Leadership understands balance sheet |
| Q46 | 5.8 | CEO works on the company and can leave daily operations |
| Q47 | 5.0 | Mentor |
| Q48 | 5.8 | Entrepreneurial network |
| Q49 | 4.0 | Enjoy management of company |
| Q50 | 3.0 | Energized by team and company |
| Q51 | 6.5 | CEO absence is possible |
| Q52 | 6.0 | Read business books |
| Q53 | 5.1 | Regular education |
| Q54 | 6.2 | Healthy work-life balance |
| Q55 | 5.9 | Happy |
| Q56 | 4.8 | Employees know long-term goal |
| Q57 | 5.6 | Employees know yearly goal |
| Q58 | 5.0 | Employees know quarterly/monthly goals |
| Q59 | 5.9 | Employees know vision and mission |
| Q60 | 6.4 | Employees know elevator pitch |
| Q61 | 5.6 | Frequent company-wide meetings |

The executable canonical copy is
`src/src/lib/assessments/su-full-question-benchmarks.ts`; tests bind it to the
actual question order in `prisma/seed-scaling-up-full-assessment.ts`.

## Evidence ledger

| Recruitment answer | Campaign ID | Report ID |
| ---: | --- | --- |
| 0 | `1yBhmdyf3c` | `iIDN2DR4kQ` |
| 1 | `Dyf5z4mhTm` | `dQJPYPTV9F` |
| 2 | `UXsPFHAt5k` | `JDEXT5JRu7` |
| 3 | `uZdAzvZXPr` | `0Ye5vZl79o` |
| 4 | `6yV7WPEnx8` | `5VegIEZW0i` |
| 5 | `Mz6SKKMSq2` | `1m4XlOkAIN` |
| 6 | `WILWilUDcJ` | `6cwcISo7iD` |
| 7 | `qtTZfKRPrz` | `pZPBEhxeCE` |
| 8 | `krK2sfYZrV` | `0yYK1dtODZ` |
| 9 | `o6wyqd6jSU` | `ZhjPvH1zmP` |
| 10 | `WEC2puLDzU` | `4HZHWiMhKf` |

| Company profile | Campaign ID | Report ID |
| --- | --- | --- |
| Very small | `oGH8JyOp74` | `uim0WOdbfw` |
| Baseline | `Mz6SKKMSq2` | `1m4XlOkAIN` |
| Very large / different phase screen | `fguIuivXkv` | `uAa7nHpOA0` |
