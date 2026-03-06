---
name: scaling-up-schema
description: Prisma schema overview, model relationships, and migration rules for Scaling Up v2
---

# Scaling Up v2 — Database Schema

**Location:** `prisma/schema.prisma`
**Provider:** PostgreSQL (via Supabase)
**ORM:** Prisma Client

## Models (16 total)

### Auth & Users
| Model | Key Fields | Notes |
|-------|-----------|-------|
| `User` | id, email, role (`ADMIN`/`STAFF`/`COACH`), passwordHash | Has optional `coachProfile` relation |
| `Account` | userId, provider, providerAccountId | NextAuth adapter (unused with JWT strategy) |
| `Session` | sessionToken, userId, expires | NextAuth sessions |

### Core Business
| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Coach` | userId (FK→User), email, firstName, lastName, certificationStatus | Has workshops[], certifications[], approvals[] |
| `Workshop` | coachId, workshopTypeId, title, eventDate, status, format, priceCents | Has registrations[], landingPages[], isLocked/lockedAt |
| `WorkshopType` | name, slug, durationOptions (JSON), pricingTiers (JSON) | Template definitions |
| `Registration` | workshopId, email, firstName, lastName, paymentStatus, amountPaidCents | @@index on workshopId, email |
| `Contact` | kajabiId, name, email, lifetimeValue, tags, products | CRM contacts from CSV import |

### Workflow & Automation
| Model | Key Fields | Notes |
|-------|-----------|-------|
| `ApprovalQueue` | type (enum), workshopId, coachId, status, requestedBy, respondedBy | Human-in-the-loop approvals |
| `AutomationTask` | workshopId, taskType, status, inputData/outputData (JSON), attempts | Retry up to maxAttempts=3 |
| `WorkshopDraft` | userId, workshopId, currentStep (1-3), stepsData (JSON) | Auto-save for wizard |

### Content & Communication
| Model | Key Fields | Notes |
|-------|-----------|-------|
| `LandingPage` | workshopId, template (enum), slug, content (JSON), status | BIO_PAGE, SOLO_LANDING, etc. |
| `MarketingCampaign` | workshopId, campaignType, content (JSON), scheduledSends (JSON) | Bulk email campaigns |
| `EmailTemplate` | name, subject, body (HTML), variables (JSON), type (enum), timingDays | 10 email types |
| `Survey` | registrationId, workshopId, surveyType, responses (JSON), npsScore | Pre/post/NPS |
| `FollowUpReport` | workshopId, coachId, dueDate (event+90d), reportData (JSON), status | 90-day follow-up |

### Audit
| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AuditLog` | entityType, entityId, action, performedBy, changes (JSON) | @@index on entityType+entityId |

## Key Relationships
```
User 1──1? Coach (via userId FK)
Coach 1──* Workshop
Workshop 1──* Registration
Workshop 1──* LandingPage (unique per template)
Workshop 1──* ApprovalQueue
Coach 1──* CoachCertification ──* WorkshopType
Workshop *──1 WorkshopType
```

## Enums (7)
- `ApprovalType`: WORKSHOP_REQUEST, CUSTOM_PRICING, CANCELLATION, DATE_CHANGE, REFUND, CERTIFICATION_EDGE_CASE
- `ApprovalStatus`: PENDING, APPROVED, DENIED, EXPIRED
- `EmailType`: 10 timing-based types (REGISTRATION_CONFIRMATION through FOLLOWUP_REMINDER)
- `PageStatus`: DRAFT, PUBLISHED, CANCELLED
- `ReportStatus`: PENDING, SUBMITTED, OVERDUE
- `WorkshopCategory`: AI, EXIT_AND_VALUATION
- `LandingPageTemplate`: BIO_PAGE, SOLO_LANDING, DUO_LANDING, REGISTRATION, THANK_YOU

## Migration Rules
1. Always run `npx prisma db push` after schema changes (dev) or `npx prisma migrate dev` (staging)
2. Always run `npx prisma generate` after any schema change
3. JSON fields are stored as `String` — parse/stringify in application code
4. Use `@@map()` for snake_case table names (all models use this)
5. Never delete a model without checking cascade relations first
6. The `Workshop.status` field uses string values: REQUESTED → VALIDATING → APPROVED → SCHEDULED → LIVE → COMPLETED → CANCELLED
