# Universal Individual-Report Placeholders Design

**Date:** 2026-08-26

## Goal

Make the three report placeholders already supported by the report HTML renderer discoverable, validated, and consistently personalized in the Welcome and Closing sections of every individual assessment report.

## Scope

The supported report placeholders remain deliberately limited to:

| Token | Source | Fallback |
| --- | --- | --- |
| `{{respondentFirstName}}` | First usable word of the report respondent display name | `there` when the display name is blank or an email address |
| `{{respondentName}}` | Report respondent display name | Existing display-name fallback, which can be the respondent email |
| `{{companyName}}` | Organization name carried by the report model | Empty text |

This release applies to individual browser reports and browser-print/PDF output for all assessment aliases and report styles that already render authored report HTML. It does not add fields, change the metadata sources, introduce a database migration, add authored HTML to report emails, or define respondent placeholders for group reports.

## Architecture

Create a client-safe report-placeholder registry that is the single source of truth for token spelling, author-facing labels, descriptions, and supported-token validation. The Reports editor and the server-side storage validator consume this registry. Existing safe substitution remains in `personalizeSafeReportHtml`, including escaping values and re-sanitizing the substituted fragment.

All production individual-report dispatch paths pass the existing `RespondentReport` as personalization data. Alias checks for only `qsp-v2` and `scaling-up-full` are removed. The report data loader remains authoritative for respondent and organization metadata.

## Editor behavior

Each Welcome and Closing HTML card displays a compact Available fields panel directly beneath its textarea. Each field shows its token and plain-language source/fallback. Selecting a field inserts its exact token at the textarea caret, replaces selected text, restores focus, and positions the caret after the inserted token. Controls are disabled for published/read-only versions.

The editor reports unknown `{{...}}` tokens inline. Save Draft performs the same preflight check, and the API rejects unknown tokens with the existing `INVALID_REPORT_HTML` response contract. Valid HTML without tokens and all three supported tokens continue to save normally.

The full-report preview copy states that it uses saved content and representative respondent/company details. Preview remains saved-only.

## Missing data and safety

Fallback behavior is unchanged from the current renderer. Placeholder values are HTML-escaped, substitution is followed by report HTML sanitization, and no arbitrary property access or assessment-answer interpolation is introduced.

Unknown token detection recognizes double-curly token-shaped text. Token spelling is exact and case-sensitive. Multiple occurrences of the same unsupported token are reported once.

## Testing

Tests cover:

- Registry content and unsupported-token detection.
- Server storage rejection for unknown tokens and acceptance of the three supported tokens.
- Caret-aware insertion, field descriptions, read-only controls, and inline validation in the Reports tab.
- Universal substitution in non-Scaling-Up-Full scored reports and non-QSP-v2 qualitative reports.
- Existing QSP v2, Scaling Up Full, alternate-style, and landscape substitution behavior.
- Save-Draft preflight and API error mapping where affected.

## Out of scope

- Invitation-email and results-email placeholder registries.
- New report tokens such as assessment, campaign, email, job title, date, or coach.
- Group-report or multi-respondent placeholder semantics.
- Conditional expressions, loops, answer-field interpolation, or a general template engine.
- Submission-time metadata snapshots.
