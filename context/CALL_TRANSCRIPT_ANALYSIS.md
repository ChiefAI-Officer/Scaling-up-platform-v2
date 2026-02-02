# Call Transcript Analysis: Scaling Up App Development
## January 27, 2026 - Jeff Verdun (CIO) Context Building Call

**Duration:** 38 minutes
**Participants:** Joshua Delos Santos (ChiefAiOfficer.com), Jeff Verdun (Scaling Up CIO), Chris Daigle

---

## Executive Summary

The call revealed that Scaling Up's current workshop creation process in Kajabi is a **4-5 step manual bottleneck** for Suzanne. With ~200 coaches potentially requesting workshops in Q1, this process is unsustainable. The solution is to **replace Kajabi with a custom application** while maintaining human-in-the-loop approval for key actions.

---

## Workflow Analysis by Timestamp

### @0:00-3:00 - Current Tech Stack Clarification

**Key Information:**
- **HubSpot**: Primary CRM for coach/client data (higher tier plan - "everything you'll need")
- **Circle.so (Sun Hub)**: Community tool, certification courses
- **NOT using Slack** internally - uses Teams or Email for approvals
- Slack only for dev team communication

**Critical Quote:**
> "If I want to know anything about a coach, or anything about a coach's client, or anything about any contacts that we may have sold something to, that's going to be in HubSpot." - Jeff Verdun

### @3:00-6:00 - Certification Flow

**Workflow Identified: Coach Certification**
```
┌─────────────────────────────────────────────────────────────┐
│ COACH CERTIFICATION WORKFLOW                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Coach signs up for certification course in Circle        │
│                          ↓                                   │
│  2. Scaling Up notified of pre-registration                  │
│                          ↓                                   │
│  3. Suzanne MANUALLY verifies in HubSpot:                   │
│     - Financials OK                                          │
│     - Good standing                                          │
│                          ↓                                   │
│  4. Coach rolled into actual course                          │
│                          ↓                                   │
│  5. Course completion triggers:                              │
│     - Zapier → CertIO certificate                           │
│     - Access to facilitator guides                           │
│     - Marketing kit links                                    │
│     - Registration link (currently Google Drive)             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Two Certification Types:**
1. **Exit Workshop Certification**
2. **AI Workshop Certification**

**Key Quote:**
> "Once they complete that certification, then they're eligible to have us set up a workshop for them. So that Circle is where that first kind of check comes." - Jeff Verdun

### @6:00-12:00 - Workshop Request Process

**Workflow Identified: Workshop Request**
```
┌─────────────────────────────────────────────────────────────┐
│ WORKSHOP REQUEST WORKFLOW                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Coach completes certification                            │
│                          ↓                                   │
│  2. Coach fills HubSpot form (workshop request)              │
│     - Bio for bio page                                       │
│     - Event details                                          │
│     - Contact information                                    │
│                          ↓                                   │
│  3. Form captured in HubSpot for tracking                   │
│                          ↓                                   │
│  4. Manual workshop setup begins (Suzanne)                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Quote:**
> "My goal is, you know, in our application, we have a coach's kind of portal where they put their bio in, they put their picture. And then we can continuously reuse that, right, for any time that they do a workshop." - Jeff Verdun

**ACTION ITEM:** Jeff to send HubSpot workshop request form link

### @12:00-20:00 - Kajabi Manual Workshop Setup (CRITICAL)

**Workflow Identified: Manual Workshop Creation**

This is the **core bottleneck** that needs automation:

```
┌─────────────────────────────────────────────────────────────┐
│ CURRENT KAJABI WORKFLOW (MANUAL - 4-5 STEPS)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  STEP 1: Create Bio Landing Page                            │
│  ─────────────────────────────                              │
│  • Duplicate existing page                                   │
│  • Swap out picture (Canva template)                        │
│  • Update name                                               │
│  • Update event details                                      │
│  • Most text is stock/templated                             │
│                                                              │
│  STEP 2: Create Offer (Payment Module)                      │
│  ─────────────────────────────                              │
│  • Set price                                                 │
│  • Build payment image                                       │
│  • Configure "after purchase" redirect → thank you page     │
│  • Add tag to HubSpot record                                │
│  • Link to event registration                               │
│                                                              │
│  STEP 3: Embed Offer into Landing Page                      │
│  ─────────────────────────────────                          │
│  • Payment block must be created elsewhere first            │
│  • Then embedded into landing form                          │
│                                                              │
│  STEP 4: Create Event in Kajabi                             │
│  ────────────────────────                                   │
│  • Set up event details                                      │
│  • Configure automated emails:                               │
│    - 5 days before                                          │
│    - 1 day before                                           │
│    - 2 hours before                                         │
│    - Registration confirmation                               │
│  • Link to prep materials                                    │
│                                                              │
│  STEP 5: Connect Everything                                 │
│  ──────────────────────                                     │
│  • Ensure event links to offer                              │
│  • Ensure landing page links correctly                      │
│  • Verify all automations fire correctly                    │
│                                                              │
│  ⚠️ ORDER MATTERS: Bio page → Offer → Landing page → Event │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Quote:**
> "So she has to come in here. First thing she has to do is she has to build this landing page... This is called an offer in Kajabi, and then you can build the landing page for the event, and then you've got to go adjust the event. That's why it's so cumbersome." - Jeff Verdun

**Critical Pain Points:**
1. Copy-paste duplication (no true templating)
2. Order-dependent steps
3. Bouncing between 4-5 different spots in Kajabi
4. Same process repeated for every workshop

### @20:00-24:00 - Scale Problem

**Key Statistics:**
- ~300 coaches currently
- ~100 signed up for AI certification
- ~100 signed up for Exit certification
- All 200 could request workshops in Q1

**Key Quote:**
> "She could spend all day just depending on how many of those workshops come through." - Jeff Verdun

> "I don't want her to do any if I can. She's more, she's too important to be doing this work." - Jeff Verdun

### @24:00-28:00 - Edge Cases & Business Rules

**Workflow Identified: Workshop Cancellation**
```
┌─────────────────────────────────────────────────────────────┐
│ CANCELLATION WORKFLOW                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Trigger: Coach requests cancellation                        │
│                          ↓                                   │
│  Business Rule: $500 cancellation fee                       │
│                          ↓                                   │
│  Manual Updates Required:                                    │
│  • Update landing page → "CANCELLED"                        │
│  • Update Squarespace website listing                       │
│  • Update LinkedIn notification                              │
│  • Send cancellation emails (if needed)                     │
│                          ↓                                   │
│  Human Approval: REQUIRED                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Quote:**
> "That's why right now in the contract, there's a $500 charge. They cancel a workshop because we would have to go through, we'd have to update the landing page to say it was canceled. We'd have to update our web page where we post all these things showing that it was canceled." - Jeff Verdun

**Certification Types:**
1. **Function Certifications:** Exit, AI (for specific workshops)
2. **Main Certification:** Scaling Up Coach Certification (good standing, paid up)

**Future Consideration:** Certification modules may be added, requiring re-certification process.

### @28:00-35:00 - Technical Requirements

**Payment Processing:**
- Kajabi uses **Stripe** as payment processor
- Money flow: Stripe → Bank account

**Key Decision:**
> "Are you anticipating that we'll continue to use Kajabi and you're doing some sort of webhook or integration? Or are you thinking that we're just going to replace Kajabi with our web app?" - Jeff Verdun

**Answer:** Replace Kajabi with custom application for full control.

**Human-in-the-Loop Requirements:**
- Custom pricing approval (Suzanne can adjust pricing)
- Cancellation processing
- Certification edge cases

**Key Quote:**
> "Suzanne should be able to adjust the pricing on any workshop." - Jeff Verdun

### @35:00-38:00 - Action Items & Next Steps

**Confirmed Action Items:**
1. Joshua: Deliver v1 prototype development plan by EOD (via Slack)
2. Jeff: Get Suzanne's Kajabi workflow documentation
3. Jeff: Cancel old Zoom series, send new invite

---

## Workflows Requiring Automation

### Priority 1: Workshop Creation (Replace Kajabi)
| Step | Current | Automated |
|------|---------|-----------|
| Bio landing page | Manual duplicate/edit | Template + coach data |
| Payment offer | Manual creation | Auto-generate from event |
| Landing page | Manual embed | Single form creates all |
| Event creation | Manual setup | Triggered from request |
| Email automation | Kajabi events | Custom email system |

### Priority 2: Coach Verification
| Check | Source | Automation Level |
|-------|--------|------------------|
| Certification status | Circle.so | Full automation |
| Payment status | HubSpot | Full automation |
| Good standing | HubSpot | Full automation |
| Edge cases | Multiple | Human approval |

### Priority 3: Coach Portal (Future)
| Feature | Description |
|---------|-------------|
| View events | See their scheduled workshops |
| View registrations | See who registered |
| Remove attendees | Kick competitors |
| Cancel events | With $500 fee confirmation |

---

## Human-in-the-Loop Gates (Confirmed)

| Action | Approval Required | Approver |
|--------|-------------------|----------|
| Custom pricing | YES | Suzanne |
| Workshop cancellation | YES | Suzanne/Jeff |
| Certification edge cases | YES | Suzanne |
| Refund processing | YES | Suzanne |

**Communication Method:** Email or Teams (NOT Slack)

---

## Key Insights for V2 Development

1. **Replace, Don't Integrate:** Full replacement of Kajabi preferred over integration
2. **Order Matters:** System must enforce bio → offer → landing → event sequence
3. **Templates Are Key:** Most content is stock - only swap coach-specific data
4. **Scale is Urgent:** 200 potential workshops in Q1 pipeline
5. **Suzanne's Time is Valuable:** Goal is zero manual workshop setup
6. **Stripe Integration Required:** Direct payment processing, not through Kajabi
7. **HubSpot is Source of Truth:** All coach data flows from HubSpot

---

*Analysis completed: January 28, 2026*
*Source: January 27, 2026 Call Transcript*
