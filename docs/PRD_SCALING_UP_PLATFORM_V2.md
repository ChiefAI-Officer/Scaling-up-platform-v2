# Product Requirements Document
# Scaling Up Platform v2

**Version:** 2.1
**Date:** January 28, 2026
**Status:** Ready for Development
**Author:** Chief AI Officer Team
**Stakeholders:** Jeff Verdun (CIO), Suzanne Krygier (Program Manager)

---

## Document Purpose

This PRD defines the requirements for **Scaling Up Platform v2**, an improved version of the workshop management application. V2 builds upon the existing V1 foundation while adding critical automation features to eliminate the manual Kajabi workflow bottleneck.

---

## Executive Summary

### The Problem

Scaling Up's current workshop creation process requires Suzanne to manually perform **4-5 steps in Kajabi** for every workshop:

1. Create bio landing page (duplicate & edit)
2. Create payment offer (Stripe integration)
3. Embed offer into landing page
4. Create Kajabi event with automated emails
5. Tag contacts in HubSpot

With **~200 coaches** potentially requesting workshops in Q1 2026, this manual process is **unsustainable**.

### The Solution

Scaling Up Platform v2 will:

1. **Replace Kajabi entirely** with a custom workshop management system
2. **Automate the 4-5 step workflow** into a single form submission
3. **Integrate directly** with Circle.so, HubSpot, and Stripe
4. **Provide human-in-the-loop approval** for pricing and cancellations
5. **Enable a coach portal** for self-service management

### Success Metrics

| Metric | Current (Manual) | Target (V2) |
|--------|------------------|-------------|
| Workshop setup time | 30-60 minutes | < 5 minutes |
| Manual steps per workshop | 4-5 | 1 (submit form) |
| Suzanne's involvement | Every workshop | Approvals only |
| Q1 capacity | ~50 workshops | 200+ workshops |

---

## Stakeholder Context

### Jeff Verdun (CIO) - Key Requirements

From January 27, 2026 call:

> "I don't want her to do any if I can. She's more, she's too important to be doing this work."

> "Suzanne should be able to adjust the pricing on any workshop." (Human approval required)

> "We don't use Slack. We either use Teams, if we want to do any kind of chat, or we can use email for any kind of approval messages."

> "Are you thinking that we're just going to replace Kajabi with our web app and that we have more control over things? My assumption was the latter."

### Suzanne Krygier (Program Manager) - Feedback

From January 27, 2026 email:

> "I like how everything is on one landing page, verses clicking to an offer page (the way we have it now)."

> "I'd like to see either a headshot of the coach, or the graphics that we create for the coach's workshop."

> "I really like the dashboard feature as well."

> "When we get further into it, I can send over the email copy for the workshops."

**Current automations Suzanne confirmed:**
- Email on registration
- 5 days prior reminder
- 1 day before reminder
- 1 hour before reminder
- Adding emails for 60-90 day workshops (in progress)

**Survey integrations (Typeform):**
- Readiness-survey (pre-workshop) linked in emails
- Post-workshop survey to registrants
- Coach feedback survey for headcount, etc.

---

## Business Rules & Economics

### Revenue Split (From Terms & Conditions)

| Revenue Type | Coach Share | Scaling Up Share |
|--------------|-------------|------------------|
| Workshop Revenue | 75% | 25% |
| Partner Commissions | 50% | 50% |
| New Coaching Clients (from attendees) | 90% | 10% |

**Note:** Existing coach clients attending workshops are excluded from the 10% share.

### Lead Time Requirements

| Workshop Type | Minimum Lead Time |
|---------------|-------------------|
| In-Person | **90 days** from request |
| Virtual | **60 days** from request |

### Fee Structure

| Action | Fee | Additional Costs |
|--------|-----|------------------|
| Cancellation | $500 | + refund costs over $250 |
| Date Change/Reschedule | $500 | Must reschedule 60d (virtual) / 90d (on-site) out |

### Intellectual Property Rules

- All workshop content owned by Scaling Up
- Only certified, active coaches may deliver workshops
- Workshops must be branded as "Scaling Up" (not under another brand)
- Materials cannot be modified or rebranded
- Coach may add logo/bio only in approved locations
- Marketing within 100 miles/160km of coach's primary location

### Compliance Requirements

- **GDPR** (EU data protection)
- **CCPA** (California privacy)
- **CAN-SPAM** (email marketing)

---

## API Configuration

### Circle.so (SunHub)

```
Plan: Enterprise
API Documentation: https://api.circle.so/docs
API Key: esuz3N4Q3xarzefFRDW1D3HX85VYuUQq (UNTESTED - verify before use)
Purpose: Certification verification
```

### HubSpot

```
Plan: Has Sales Hub (tier TBD)
Sandbox: NOT YET CONFIGURED (can create one)
Purpose: CRM, contact management, email lists
Note: Contact Carolyn for HubSpot property details
```

### Communication

```
Slack: NOT USED
Approval Channel: Teams or Email with direct link to app
```

---

## Functional Requirements

### FR-1: Workshop Request & Creation

**FR-1.1: Coach Submits Workshop Request**
```
TRIGGER: Coach submits workshop request form
INPUT:
  - Coach email (linked to HubSpot)
  - Workshop type (Exit/AI)
  - Event date & time
  - Format (In-person/Virtual/Hybrid)
  - Venue details (if in-person)
  - Requested pricing (if custom)
  - Bio (if not already on file)
  - Photo/Headshot (if not already on file)

VALIDATION:
  - In-person: Event date must be >= 90 days from request
  - Virtual: Event date must be >= 60 days from request

PROCESS:
  1. Validate coach exists in HubSpot
  2. Verify certification in Circle.so
  3. Check HubSpot: payment status, good standing
  4. IF custom pricing → route to approval queue
  5. ELSE → proceed to automatic creation

OUTPUT:
  - Workshop record created
  - Landing page generated (single page with all info)
  - Payment offer embedded (not separate page)
  - Event configured
  - Email sequence scheduled
```

**FR-1.2: Automatic Landing Page Generation**
```
TRIGGER: Workshop approved (auto or manual)
INPUT:
  - Coach bio (from HubSpot or coach portal)
  - Coach headshot OR workshop graphics (per Suzanne's requirement)
  - Event details
  - Pricing information

OUTPUT (Single Page - No Separate Offer Page):
  - Coach photo/workshop graphic prominently displayed
  - Bio section
  - Event details section
  - Payment/registration form (embedded, not linked)
  - Add to calendar links (Google, Outlook, Yahoo)
  - URL slug: /workshops/{coach-name}-{event-type}-{date}
```

**FR-1.3: Payment Processing**
```
TRIGGER: Attendee clicks "Register" on landing page
PROCESS:
  1. Create Stripe checkout session
  2. Customer completes payment
  3. Stripe webhook received
  4. Update registration status → PAID
  5. Send confirmation email immediately
  6. Create/update contact in HubSpot
  7. Tag contact with event identifier
  8. Grant access to prep materials
  9. Register for event (kicks off email flows)

OUTPUT:
  - Payment recorded
  - Registration confirmed
  - Redirect to thank you landing page
  - Automated email sequence activated
```

### FR-2: Certification Verification

**FR-2.1: Circle.so Integration**
```
ENDPOINT: GET /api/certifications/verify
INPUT: coach_email, workshop_type

CHECKS:
  1. Coach exists in Circle.so community (SunHub)
  2. Coach has completed {workshop_type} course
  3. Terms & Conditions accepted
  4. Badge/certificate issued
  5. Coach is active member in good standing

OUTPUT:
  {
    verified: boolean,
    certification_date: date,
    expiry_date: date | null,
    terms_accepted: boolean,
    confidence: number (0-100)
  }
```

**FR-2.2: HubSpot Good Standing Check**
```
ENDPOINT: GET /api/coaches/{email}/standing
INPUT: coach_email

CHECKS (HubSpot properties):
  1. coach_payment_status = "current"
  2. coach_certification_status = "active"
  3. No overdue invoices
  4. Not flagged for issues

OUTPUT:
  {
    in_good_standing: boolean,
    payment_status: string,
    certification_status: string,
    issues: string[] | null
  }
```

### FR-3: Human-in-the-Loop Approvals

**FR-3.1: Approval Queue**
```
TRIGGERS:
  - Custom pricing request
  - Certification verification confidence < 85%
  - Workshop cancellation request
  - Workshop date change request
  - Refund request

NOTIFICATION: Email to Suzanne (primary), Jeff (backup)
DELIVERY: Teams message or Email with direct link to app
CONTENT:
  - Request type
  - Coach name
  - Details requiring review
  - Approve/Deny links (one-click)

TIMEOUT: 24 hours
ESCALATION: If no response → email Jeff
```

**FR-3.2: Custom Pricing Approval**
```
TRIGGER: Coach requests price != standard tier
INPUT:
  - Standard price
  - Requested price
  - Coach justification
  - Coach market/territory

APPROVER: Suzanne
ACTIONS: Approve (with modified price) / Deny

OUTPUT:
  - Pricing locked for workshop
  - Coach notified of decision
```

**FR-3.3: Cancellation Processing**
```
TRIGGER: Coach requests workshop cancellation
INPUT:
  - Workshop ID
  - Cancellation reason
  - Days until event

BUSINESS RULES:
  - Cancellation = $500 fee (always)
  - If refunds to customers cost > $250, coach pays overage

PROCESS:
  1. Calculate fee ($500 + potential overage)
  2. Send approval to Suzanne
  3. On approval:
     - Charge $500+ to coach's card
     - Update workshop status → CANCELLED
     - Send cancellation emails to registrants
     - Process refunds to attendees
     - Update landing page → CANCELLED banner
```

**FR-3.4: Date Change/Reschedule Processing**
```
TRIGGER: Coach requests to change workshop date
INPUT:
  - Workshop ID
  - Original date
  - New requested date
  - Reason for change

BUSINESS RULES:
  - Date change = $500 processing fee
  - New date must be 60 days out (virtual) / 90 days out (on-site)

PROCESS:
  1. Validate new date meets lead time requirement
  2. Charge $500 processing fee
  3. Update all email campaigns
  4. Update LinkedIn campaigns (if applicable)
  5. Send date change notices to registered guests
  6. Update landing page with new date
```

### FR-4: Email Automation

**FR-4.1: Registration Confirmation (Immediate)**
```
TRIGGER: Payment successful
TIMING: Immediate

SUBJECT: "Thank you for registering for [Workshop Name]"

CONTENT:
  - Thank you message
  - Event details (date, time, location)
  - Access link to prep materials
  - Add to calendar links (Google, Outlook, Yahoo)
  - Coach contact information
```

**FR-4.2: Pre-Event Sequence**

**EMAIL 1: 5 Days Before**
```
SUBJECT: "Your Workshop is Coming - Important Details Inside"

CONTENT:
  - Event reminder (date, time, location)
  - Readiness-survey link (Typeform)
  - Pre-read recommendation (Verne Harnish content)
  - What to bring:
    - Recent P&L and Balance Sheet (for reference)
    - Current organizational chart
    - 3-5 year business and personal goals
    - Questions to explore
  - Add to calendar links
```

**EMAIL 2: 1 Day Before**
```
SUBJECT: "Your Workshop Is Tomorrow - Final Details Inside"

CONTENT:
  - Final event reminder
  - Assessment link (if not completed)
  - Pre-read link
  - What to bring (repeated)
  - Venue details / Virtual link
  - Contact information
```

**EMAIL 3: 2 Hours Before (for longer lead time workshops)**
```
SUBJECT: "We start in 2 hours!"

CONTENT:
  - Quick reminder
  - Date, time, location
  - Virtual link (if applicable)
```

**EMAIL 4: 1 Hour Before (current system)**
```
SUBJECT: "Your workshop starts in 1 hour"

CONTENT:
  - Final reminder
  - Location/link
  - Parking/directions (if in-person)
```

**FR-4.3: Post-Event Sequence**

**EMAIL 1: Post-Workshop Survey (Day +1)**
```
TRIGGER: Event date + 1 day
TO: All registrants

CONTENT:
  - Thank you message
  - Post-workshop survey link (Typeform)
  - Resources/next steps
```

**EMAIL 2: Coach Feedback Request (Day +1)**
```
TRIGGER: Event date + 1 day
TO: Coach

CONTENT:
  - Request for feedback
  - Headcount confirmation
  - Coach feedback survey link (Typeform)
  - Reminder: 90-day follow-up report required
```

### FR-5: Surveys Integration (Typeform)

| Survey | Timing | Recipient | Purpose |
|--------|--------|-----------|---------|
| Readiness Survey | Linked in pre-event emails | Registrants | Pre-workshop assessment |
| Post-Workshop Survey | Day after event | Registrants | Feedback collection |
| Coach Feedback Survey | Day after event | Coach | Headcount, feedback, issues |

### FR-6: Reporting Requirements

**FR-6.1: Participant Data Collection**
```
Required fields per Terms & Conditions:
  - Full name
  - Company
  - Job title
  - Email
  - Phone
  - Address

STORAGE: HubSpot contact record
ACCESS: Coach + Scaling Up
```

**FR-6.2: 90-Day Follow-Up Report**
```
TRIGGER: Event date + 90 days
TO: Coach (reminder)

REQUIRED CONTENT:
  - Status of each participant/prospect
  - Any coaching engagements secured
  - Leads being nurtured

PURPOSE: Track revenue share obligations
```

### FR-7: Coach Portal (Dashboard)

**FR-7.1: Dashboard Features (Confirmed Liked by Suzanne)**
```
- View upcoming workshops
- See registration counts per workshop
- View attendee list with contact details
- Access marketing materials (Marketing Promo Kit)
- View past workshops and metrics
```

**FR-7.2: Self-Service Actions**
```
- Request new workshop
- Update bio/photo
- Remove attendee (competitors)
- Request cancellation (triggers approval)
- Request date change (triggers approval)
- Download attendee lists
- Access 90-day follow-up form
```

---

## Non-Functional Requirements

### NFR-1: Performance

| Metric | Requirement |
|--------|-------------|
| Page load time | < 2 seconds |
| API response time | < 500ms (p95) |
| Workshop creation | < 30 seconds end-to-end |
| Concurrent users | Support 50+ simultaneous |

### NFR-2: Reliability

| Metric | Requirement |
|--------|-------------|
| Uptime | 99.5% |
| Data durability | No data loss |
| Error recovery | Automatic retry with backoff |
| Backup frequency | Daily |

### NFR-3: Security & Compliance

| Requirement | Implementation |
|-------------|----------------|
| Authentication | NextAuth with role-based access |
| Data encryption | TLS 1.3 in transit, AES-256 at rest |
| PCI compliance | Stripe handles all card data |
| Audit logging | All state changes logged |
| GDPR compliance | Data export, deletion capabilities |
| CCPA compliance | California privacy rights |
| CAN-SPAM compliance | Unsubscribe in all marketing |

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCALING UP PLATFORM V2                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│   │ Coach Portal │     │ Admin Panel  │     │ Landing Pages │   │
│   │ (Dashboard)  │     │ (Suzanne)    │     │ (Single Page) │   │
│   └──────┬───────┘     └──────┬───────┘     └──────┬───────┘   │
│          │                    │                     │            │
│          └────────────────────┼─────────────────────┘            │
│                               │                                  │
│                    ┌──────────▼──────────┐                      │
│                    │    Next.js API      │                      │
│                    │    (App Router)     │                      │
│                    └──────────┬──────────┘                      │
│                               │                                  │
│          ┌────────────────────┼────────────────────┐            │
│          │                    │                    │             │
│   ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐      │
│   │  Inngest    │     │  Postgres   │     │   Redis     │      │
│   │ (Job Queue) │     │ (Database)  │     │  (Cache)    │      │
│   └──────┬──────┘     └─────────────┘     └─────────────┘      │
│          │                                                       │
└──────────┼───────────────────────────────────────────────────────┘
           │
           │ EXTERNAL INTEGRATIONS
           │
┌──────────┼───────────────────────────────────────────────────────┐
│          │                                                        │
│   ┌──────▼──────┐   ┌─────────────┐   ┌─────────────┐           │
│   │  Circle.so  │   │   HubSpot   │   │   Stripe    │           │
│   │ (SunHub)    │   │   (CRM)     │   │ (Payments)  │           │
│   └─────────────┘   └─────────────┘   └─────────────┘           │
│                                                                   │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│   │   Teams/    │   │  Typeform   │   │  Blob Store │           │
│   │   Email     │   │  (Surveys)  │   │  (Assets)   │           │
│   └─────────────┘   └─────────────┘   └─────────────┘           │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### API Routes (V2 Additions)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/certifications/verify` | POST | Verify Circle.so certification |
| `/api/landing-pages` | POST | Generate landing page |
| `/api/landing-pages/[slug]` | GET | Retrieve landing page |
| `/api/approvals` | GET/POST | Manage approval queue |
| `/api/approvals/[id]/respond` | POST | Approve/deny request |
| `/api/email-campaigns` | POST | Schedule email sequence |
| `/api/email-campaigns/[id]/reschedule` | PUT | Update email timing |
| `/api/surveys/typeform` | POST | Embed Typeform surveys |
| `/api/portal/workshops` | GET | Coach's workshops |
| `/api/portal/registrations` | GET | Coach's registrations |
| `/api/portal/followup` | POST | Submit 90-day follow-up |
| `/api/reports/participant-data` | GET | Export participant data |

### Database Schema Additions

```prisma
// Add to existing schema

model ApprovalQueue {
  id            String   @id @default(cuid())
  type          ApprovalType
  workshopId    String?
  coachId       String
  requestData   Json
  status        ApprovalStatus @default(PENDING)
  requestedAt   DateTime @default(now())
  respondedAt   DateTime?
  respondedBy   String?
  decision      String?
  notes         String?

  workshop      Workshop? @relation(fields: [workshopId], references: [id])
  coach         Coach     @relation(fields: [coachId], references: [id])
}

model AuditLog {
  id          String   @id @default(cuid())
  entityType  String
  entityId    String
  action      String
  performedBy String?
  changes     Json
  timestamp   DateTime @default(now())
}

model EmailTemplate {
  id          String   @id @default(cuid())
  name        String   @unique
  subject     String
  body        String
  variables   String[] // e.g., ["coach_name", "event_date", "first_name"]
  type        EmailType
  timingDays  Int?     // Days before/after event (negative = before)
}

model LandingPage {
  id          String   @id @default(cuid())
  workshopId  String   @unique
  slug        String   @unique
  content     Json     // Rendered template data
  coachPhoto  String?  // URL to headshot
  graphicUrl  String?  // URL to workshop graphic
  status      PageStatus
  publishedAt DateTime?

  workshop    Workshop @relation(fields: [workshopId], references: [id])
}

model Survey {
  id           String   @id @default(cuid())
  workshopId   String
  type         SurveyType
  typeformId   String   // Typeform form ID
  sentAt       DateTime?
  completedAt  DateTime?
  responses    Json?

  workshop     Workshop @relation(fields: [workshopId], references: [id])
}

model FollowUpReport {
  id            String   @id @default(cuid())
  workshopId    String
  coachId       String
  dueDate       DateTime // Event date + 90 days
  submittedAt   DateTime?
  reportData    Json?
  status        ReportStatus @default(PENDING)

  workshop      Workshop @relation(fields: [workshopId], references: [id])
  coach         Coach    @relation(fields: [coachId], references: [id])
}

enum ApprovalType {
  CUSTOM_PRICING
  CANCELLATION
  DATE_CHANGE
  REFUND
  CERTIFICATION_EDGE_CASE
}

enum ApprovalStatus {
  PENDING
  APPROVED
  DENIED
  EXPIRED
}

enum EmailType {
  REGISTRATION_CONFIRMATION
  PRE_EVENT_5_DAYS
  PRE_EVENT_1_DAY
  PRE_EVENT_2_HOURS
  PRE_EVENT_1_HOUR
  POST_EVENT_SURVEY
  COACH_FEEDBACK_REQUEST
  CANCELLATION_NOTICE
  DATE_CHANGE_NOTICE
  FOLLOWUP_REMINDER
}

enum PageStatus {
  DRAFT
  PUBLISHED
  CANCELLED
}

enum SurveyType {
  READINESS
  POST_WORKSHOP
  COACH_FEEDBACK
}

enum ReportStatus {
  PENDING
  SUBMITTED
  OVERDUE
}
```

---

## Development Roadmap

### Week 1: Core Automation

| Day | Focus | Deliverables |
|-----|-------|--------------|
| Mon | Setup & Circle.so | Circle.so service, verification endpoint, API key validation |
| Tue | Landing Pages | Template engine, single-page with embedded payment, photo/graphic display |
| Wed | Email System | 5 email templates, Typeform survey links, HubSpot integration |
| Thu | HITL Approvals | Approval queue, Teams/Email notifications, one-click approve/deny |
| Fri | Integration Test | End-to-end workshop creation flow with real data |

### Week 2: Polish & Launch

| Day | Focus | Deliverables |
|-----|-------|--------------|
| Mon | Bug Fixes | Address Week 1 issues, **ampcode handoff for complex bugs** |
| Tue | Coach Portal | Dashboard, self-service actions, **ampcode review** |
| Wed | Documentation | User guides, API docs, Suzanne training materials |
| Thu | Load Testing | Verify 200+ workshop capacity, **ampcode performance optimization** |
| Fri | Go-Live | Production deployment, monitoring setup |

---

## Ampcode Handoff Guide

### When to Use Ampcode

Use **ampcode** (Anthropic's development assistant) for:

| Scenario | Handoff Trigger | What to Provide |
|----------|-----------------|-----------------|
| **Complex Bug Fixes** | Bug persists after 2 attempts | Error logs, reproduction steps, code context |
| **Performance Issues** | API response > 500ms consistently | Profiling data, bottleneck location |
| **Code Review** | Before merging critical features | PR link, architecture context |
| **Architecture Decisions** | Uncertain about patterns | Options considered, constraints |
| **Database Optimization** | Slow queries identified | Query explain plans, index analysis |
| **Security Review** | Handling sensitive data | Code sections, threat model |

### Ampcode Handoff Template

```markdown
## Ampcode Request

**Issue Type:** [Bug Fix / Performance / Review / Architecture]

**Context:**
- Feature: [e.g., Email scheduling system]
- File(s): [e.g., lib/email/scheduler.ts]
- Current behavior: [what's happening]
- Expected behavior: [what should happen]

**What I've Tried:**
1. [Attempt 1]
2. [Attempt 2]

**Relevant Code:**
[paste code snippet]

**Error/Logs:**
[paste error output]

**Constraints:**
- Must work with HubSpot API
- Must maintain <500ms response time
- Cannot modify database schema

**Questions:**
1. [Specific question 1]
2. [Specific question 2]
```

### Ampcode Priority Matrix

| Priority | Condition | Response Time |
|----------|-----------|---------------|
| **P0 - Critical** | Production down, data loss risk | Immediate |
| **P1 - High** | Feature blocker, deadline risk | Same day |
| **P2 - Medium** | Performance issue, non-critical bug | 24-48 hours |
| **P3 - Low** | Code cleanup, optimization | End of sprint |

---

## V1 vs V2 Comparison

### What V1 Has (Keep)

| Feature | Status |
|---------|--------|
| Workshop CRUD | ✅ Keep |
| Coach Management | ✅ Keep |
| Stripe Integration | ✅ Keep |
| HubSpot Sync | ✅ Keep |
| Registration System | ✅ Keep |
| API Handler Wrapper | ✅ Keep |
| Rate Limiting | ✅ Keep |
| Error Handling | ✅ Keep |

### What V2 Adds (New)

| Feature | Priority | Source Requirement |
|---------|----------|-------------------|
| Circle.so Integration | CRITICAL | Jeff call |
| Single-Page Landing (no offer page) | CRITICAL | Suzanne email |
| Coach Photo/Graphics on Page | CRITICAL | Suzanne email |
| Dashboard | HIGH | Suzanne email |
| Email Campaign System (5 emails) | CRITICAL | Workshop Dev doc |
| Typeform Survey Integration | HIGH | Suzanne email |
| Human-in-the-Loop Approvals | CRITICAL | Jeff call |
| Date Change Processing | HIGH | Terms & Conditions |
| 90-Day Follow-Up Tracking | MEDIUM | Terms & Conditions |
| Revenue Split Calculations | MEDIUM | Cheat Sheet |
| Lead Time Validation | HIGH | Workshop Dev doc |
| GDPR/CCPA/CAN-SPAM Compliance | HIGH | Terms & Conditions |

### What V2 Removes (Cleanup)

| Item | Reason |
|------|--------|
| Separate offer page flow | Suzanne prefers single page |
| Slack references | Scaling Up uses Teams/Email |
| Unused NextAuth complexity | Not needed for admin portal |

---

## Risk Mitigation

### Technical Risks

| Risk | Mitigation |
|------|------------|
| Circle.so API key untested | Validate Day 1 before building |
| HubSpot no sandbox | Request sandbox creation from Carolyn |
| Email deliverability | Verify domain, warm up sender |
| Typeform integration complexity | Use embed approach vs API |

### Business Risks

| Risk | Mitigation |
|------|------------|
| Workflow doesn't match reality | Weekly calls with Suzanne |
| Adoption resistance | Provide training, gradual rollout |
| Data migration issues | Run parallel with Kajabi initially |

---

## Appendix A: Email Copy Templates

### 5 Days Before Event

```
Subject: Your Workshop is Coming - Important Details Inside

Hi {{ first_name }},

We're looking forward to seeing you at the {{ workshop_name }} Workshop in just a few days!

As a reminder:
📅 Date: {{ event_date }}
⏰ Time: {{ event_time }}
📍 Location: {{ venue_name }} {{ venue_address }}

To help you get the most out of the session, please complete this short pre-workshop assessment:
[READINESS SURVEY LINK]

Optional Pre-Read (Recommended):
📖 Case Study: How he grew his company from $26 million to $71 million in Annual Revenue

What to Bring:
• Recent financial statements (P&L and Balance Sheet) - for your eyes only
• Current organizational chart with key roles
• Your 3-5 year business and personal goals
• Any questions or challenges you'd like to explore

See you soon,
{{ coach_name }} & The Scaling Up Team

[Add to Google Calendar] [Add to Outlook Calendar] [Add to Yahoo Calendar]
```

### 1 Day Before Event

```
Subject: Your Workshop Is Tomorrow - Final Details Inside

Hi {{ first_name }},

We're looking forward to tomorrow's {{ workshop_name }} Workshop.

📅 Date: {{ event_date }}
⏰ Time: {{ event_time }}
📍 Location: {{ venue_name }} {{ venue_address }}

Before You Arrive:
If you haven't already, take 5-10 minutes to complete the assessment:
[READINESS SURVEY LINK]

What to Bring:
• Recent P&L and Balance Sheet
• Current org chart
• Your 3-5 year goals
• Any specific questions

If you have any questions, just reply to this email.

Warm regards,
{{ coach_name }} & The Scaling Up Team
```

### 2 Hours Before Event

```
Subject: We start in 2 hours!

Just a quick reminder that the {{ workshop_name }} Workshop begins in two hours!

📅 Date: Today ({{ event_date }})
⏰ Time: {{ event_time }}
📍 Location: {{ venue_name }} {{ venue_address }}

See you shortly!

{{ coach_name }}
Scaling Up Certified Coach
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Coach** | Scaling Up certified consultant who hosts workshops |
| **Workshop** | Training event hosted by a coach for attendees |
| **Circle.so / SunHub** | Community platform where coaches complete certifications |
| **HubSpot** | CRM containing all coach and contact data |
| **Kajabi** | Current landing page/payment platform (being replaced) |
| **HITL** | Human-in-the-Loop approval requirement |
| **Prep Materials** | Documents/resources attendees receive before workshop |
| **Typeform** | Survey tool for readiness and feedback surveys |
| **Marketing Promo Kit** | Pre-made marketing assets for coaches |

---

## Appendix C: Related Documents

| Document | Location |
|----------|----------|
| V1 Deep Diagnostics | `docs/V1_DEEP_DIAGNOSTICS.md` |
| Call Transcript Analysis | `context/CALL_TRANSCRIPT_ANALYSIS.md` |
| Workshop Cheat Sheet | `docs/Scaling Up Workshop Cheat Sheet and FAQ pdf.pdf` |
| Terms & Conditions | `docs/SUN Workshop Terms and Conditions Agreement (2).pdf` |
| Workshop Development Notes | `docs/Scaling Up Workshop Development.docx` |
| Alternative MVP (Beta Swarm) | `D:\The CTO Project\Scaling Up Beta\` |
| CTO Project Commands | `D:\The CTO Project\slash-commands\` |

---

## Appendix D: Approved Partners (From Terms & Conditions)

| Partner | Commission Split |
|---------|------------------|
| Cornerstone Business Services | 50/50 |
| Cornerstone International Alliance | 50/50 |
| STS Capital | 50/50 |
| Schechter Investments | 50/50 |

*Additional partners added periodically.*

---

*PRD Version: 2.1*
*Last Updated: January 28, 2026*
*Status: Ready for Development*
*Incorporates: Suzanne Krygier feedback, Terms & Conditions, Workshop Cheat Sheet, Workshop Development notes*
