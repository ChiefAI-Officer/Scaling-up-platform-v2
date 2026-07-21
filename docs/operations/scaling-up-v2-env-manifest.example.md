# Scaling Up Platform v2 — redacted environment manifest

**Names only. Do not add values, tokens, connection strings, secret fingerprints, or customer data to this file.**

This manifest is source-derived at `2c15f6125007b1fedc3e5581e2c333bb23b2cd11`. It is a comparison checklist, not proof of what is currently set in Vercel. The executing Owner compares names and target scopes privately against Vercel's transfer screen. Values should remain encrypted in the provider or be rotated through an approved secret channel.

Scope notation: `D` = Development, `P` = Preview, `R` = Production. “Verify” means the current targets must be recorded privately; it does not authorize reading or exporting the value.

## Required application and data boundary

| Name | Intended targets | Handling / owner |
|---|---|---|
| `DATABASE_URL` | D/P/R, isolated per environment | Pooled PostgreSQL URL. Database owner. Never use for `pg_dump` when pooled. |
| `DIRECT_URL` | D/P/R, isolated per environment | Unpooled PostgreSQL URL required by Prisma migrations. Database owner. Missing from `.env.example` but required by `schema.prisma`. |
| `NEXTAUTH_URL` | D/P/R, environment-specific | Public authentication origin. Application owner. |
| `NEXTAUTH_SECRET` | D/P/R, distinct outside local dev | Authentication signing secret. Security owner; rotate if boundary ownership changes. |
| `AUTH_SECRET` | Verify alias/fallback use | Compatibility fallback used by file-access code. Prefer one documented canonical secret. |
| `APP_URL` | D/P/R, environment-specific | Canonical public application origin. |
| `LANDING_PAGE_BASE_URL` | D/P/R, environment-specific | Public workshop landing origin. Present in `.env.example`; verify whether still consumed. |
| `ADMIN_EMAIL`, `ESCALATION_EMAIL`, `QUICK_ASSESSMENT_TEAM_EMAIL` | P/R | Operational routing; client operations owner. |

## Security and file handling

| Name(s) | Intended targets | Handling / owner |
|---|---|---|
| `APPROVAL_LINK_SECRET`, `APPROVAL_LINK_TTL_SECONDS` | P/R | Approval-link signing and lifetime; security owner. |
| `FILE_ACCESS_SECRET`, `WORKFLOW_ATTACHMENT_MIN_STATUS` | P/R | File-access signing and delivery threshold; security/application owner. |
| `ASSESSMENT_SESSION_SECRET` | P/R | Assessment invitation/session signing; security owner. |
| `WAVE_O_ESPERTO_IMPORT_HASH_SALT` | P/R if import enabled | Restricted-import hashing salt; security owner. |
| `BLOB_READ_WRITE_TOKEN` | P/R | Vercel-managed Blob credential. Do not copy manually; use the separately approved Blob transfer/reconnect path. |
| `ACCESS_POLICY_VERSION` | P/R | Authorization-policy control; application/security owner. |

## External integrations

| System | Names | Intended targets / disposition |
|---|---|---|
| HubSpot | `HUBSPOT_ACCESS_TOKEN`, `HUBSPOT_PORTAL_ID`, `HUBSPOT_SIDE_CARD_ENABLED`, `HUBSPOT_AUTO_APPROVE_ENABLED`, `HUBSPOT_AUTO_APPROVE_ALLOWLIST`, `HUBSPOT_AUTO_APPROVE_SHADOW` | P/R with sandbox isolation where available; CRM owner. Default auto-approval disabled until explicitly reviewed. |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | Test keys in D/P; live keys only R. Payment owner must re-verify webhook endpoint ownership after any domain/env change. |
| Circle | `CIRCLE_API_KEY`, `CIRCLE_COMMUNITY_ID` | P/R; community owner. |
| Inngest | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | P/R, isolated environments; workflow owner. |
| Redis/KV | `REDIS_URL`, `KV_URL` | P/R; use the canonical configured backend and record the resource owner. |
| SMTP / Teams | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `TEAMS_WEBHOOK_URL` | P/R; notification owner. Keep real sending disabled in non-production unless explicitly approved. |
| Typeform | `TYPEFORM_BASE_URL`, `TYPEFORM_FEEDBACK_FORM_ID`, `TYPEFORM_READINESS_SURVEY_ID`, `TYPEFORM_EXIT_READINESS_SURVEY_ID`, `TYPEFORM_POST_WORKSHOP_SURVEY_ID`, `TYPEFORM_AI_POST_WORKSHOP_SURVEY_ID`, `TYPEFORM_COACH_FEEDBACK_SURVEY_ID`, `TYPEFORM_WEBHOOK_SECRET` | P/R; survey owner. Re-verify webhook endpoint/signature after cutover. |
| Affiliate tracking | `AFFILIATE_PIXEL_HOSTS`, `AFFILIATE_TRACKER_IDEV_MODE`, `AFFILIATE_TRACKER_IDEV_COOKIE_URL`, `AFFILIATE_TRACKER_PAP_MODE`, `AFFILIATE_TRACKER_PAP_COOKIE_URL` | P/R; marketing owner. Keep modes `off` until destination host/consent behavior is approved. |
| Transactional email | `TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED`, `REGISTRATION_HANDLER_CUTOFF_AT`, `ASSESSMENT_INVITE_BRANDED` | P/R; application/operations owner. Preserve cutoff semantics. |
| Optional LLM gateways | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | Verify actual use; remove stale variables rather than copying them. AI service owner. |

## Runtime feature and kill switches

These are configuration, not secrets, but their exact targets and values affect production behavior. Record values privately before transfer and compare after transfer. All `_KILL` switches must remain available to the designated operations owner.

| Family | Names | Intended targets |
|---|---|---|
| Workflow/email legacy gates | `ENABLE_HITL_APPROVALS`, `ENABLE_EMAIL_AUTOMATION`, `DEMO_MODE` | Verify use. `DEMO_MODE` must be absent/false in R. |
| Assessment send controls | `ASSESSMENT_SENDS_PAUSED`, `WAVE_D_AUTO_SEND_ENABLED`, `WAVE_D_RESULTS_EMAIL_ENABLED`, `WAVE_D_COACH_NOTIFY_ENABLED`, `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED`, `WAVE_U3_EMAIL_FINDINGS_ENABLED` | P/R; default safe/off unless current production state is explicitly recorded. |
| Editor/authoring controls | `WAVE_ED1_TEST_MODE_ENABLED`, `WAVE_ED2_SAFE_TO_PUBLISH_ENABLED`, `WAVE_ED4_THREE_PANE_ENABLED`, `WAVE_ED6_SINGLE_COLUMN_ENABLED`, `WAVE_ED8_VERSION_LIFECYCLE_ENABLED`, `WAVE_ED8_VERSION_LIFECYCLE_KILL`, `WAVE_ED9_FORMS_BUILD_ENABLED`, `WAVE_ED9_FORMS_BUILD_KILL`, `WAVE_ED10_PREVIEW_SETTINGS_ENABLED`, `WAVE_ED10_PREVIEW_SETTINGS_KILL`, `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` | P/R; application owner. |
| Assessment feature controls | `WAVE_F_GROUP_REPORT_ENABLED`, `WAVE_F_GROUP_REPORT_CANARY`, `WAVE_J_SUFULL_GROUP_ENABLED`, `WAVE_J_SUFULL_GROUP_CANARY`, `WAVE_J_SUFULL_GROUP_KILL`, `WAVE_M_CUSTOM_SLIDES_ENABLED`, `WAVE_M_CUSTOM_SLIDES_CANARY`, `WAVE_M_CUSTOM_SLIDES_KILL`, `WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED`, `WAVE_N_RESPONDENT_LONGITUDINAL_CANARY`, `WAVE_N_RESPONDENT_LONGITUDINAL_KILL`, `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED`, `WAVE_O_ESPERTO_SUFULL_IMPORT_CANARY`, `WAVE_O_ESPERTO_SUFULL_IMPORT_KILL`, `WAVE_P_INVITE_EMAIL_ENABLED`, `WAVE_P_INVITE_EMAIL_CANARY`, `WAVE_P_INVITE_EMAIL_KILL`, `WAVE_Q_ADMIN_CONTROLS_ENABLED`, `WAVE_Q_ADMIN_CONTROLS_KILL`, `WAVE_S_PEER_BENCHMARKS_ENABLED`, `WAVE_S_PEER_BENCHMARKS_KILL`, `WAVE_T_QUESTION_EDITOR_ENABLED`, `WAVE_T_QUESTION_EDITOR_KILL`, `WAVE_U_FINDINGS_ENABLED`, `WAVE_U_FINDINGS_KILL`, `WAVE_V_IMPORT_ALERTING_ENABLED`, `WAVE_V_IMPORT_ALERTING_KILL`, `WAVE_W_CONDITIONAL_AUTHORING_ENABLED`, `WAVE_W_CONDITIONAL_AUTHORING_KILL`, `WAVE_X_ESPERTO_LVA_ROCK_IMPORT_ENABLED`, `WAVE_X_ESPERTO_LVA_ROCK_IMPORT_CANARY`, `WAVE_X_ESPERTO_LVA_ROCK_IMPORT_KILL` | P/R; preserve exact state from private inventory. |

## Provider-injected variables — do not migrate manually

`NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL`, and `VERCEL_GIT_COMMIT_SHA` are runtime/provider metadata. `VERCEL_TOKEN`, `APPDATA`, `LOCALAPPDATA`, `CI`, and `PLAYWRIGHT_WORKERS` are CLI/CI/local controls, not project secrets to copy as part of the transfer.

## Operator-only and maintenance variables — do not copy by default

The source also references maintenance/test controls such as `ASSESSMENT_PROD_EXPECTED_HOST`, `AUDIT_READONLY_URL`, `BACKFILL_ACTOR_EMAIL`, `OPERATOR_EMAIL`, `ROLLBACK_ACTOR`, `SAFE_PRISMA_DRY_RUN`, `SAFE_SEED_DRY_RUN`, `SEED_RUN_LOG_DIR`, `SECURITY_TARGET`, `LOAD_TEST_TARGET`, `LOAD_TEST_DURATION`, `LOAD_TEST_CONCURRENCY`, and `QSP_V2_SEED_FORCE`. These belong in an approved operator session or CI secret store only when needed; they are not standing production configuration unless separately documented.

## Reconciliation record

| Check | Preflight | Post-transfer |
|---|---|---|
| Names match expected source manifest | ☐ | ☐ |
| Target scopes match (D/P/R and branch-specific) | ☐ | ☐ |
| Sensitive values remained encrypted / were rotated through approved channel | ☐ | ☐ |
| Provider-managed Blob/Marketplace credentials were transferred or reconnected separately | ☐ | ☐ |
| Stale/unused variables were identified rather than copied blindly | ☐ | ☐ |
| Feature flags and kill switches match the approved production state | ☐ | ☐ |
| `DATABASE_URL` and `DIRECT_URL` point to the same approved database boundary | ☐ | ☐ |
