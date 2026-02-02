# Scaling Up Workshop Platform - User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Managing Workshops](#managing-workshops)
4. [Managing Coaches](#managing-coaches)
5. [Registration Flow](#registration-flow)
6. [Workshop Pipeline](#workshop-pipeline)

---

## Getting Started

### Accessing the Platform

1. Open your web browser and navigate to `http://localhost:3000`
2. You'll see the home page with the Scaling Up branding

### Navigation

The main navigation bar appears at the top of every page and includes:
- **Scaling Up** (logo) - Click to return to dashboard
- **Dashboard** - Overview and metrics
- **Workshops** - Workshop management and pipeline
- **Coaches** - Coach directory and management
- **+ New Workshop** (button) - Quick access to create a new workshop

```
┌─────────────────────────────────────────────────────────────────────┐
│  Scaling Up    Dashboard    Workshops    Coaches    [+ New Workshop]│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Dashboard Overview

The Dashboard (`/dashboard`) provides a real-time overview of your workshop operations.

### Key Metrics Cards

At the top of the dashboard, you'll see four metric cards:

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Total Workshops  │ │ Upcoming         │ │ Total            │ │ Total Revenue    │
│       3          │ │ Workshops: 0     │ │ Registrations: 3 │ │     $798.00      │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
```

- **Total Workshops**: Count of all workshops in the system
- **Upcoming Workshops**: Workshops scheduled for the future (not completed/cancelled)
- **Total Registrations**: All confirmed registrations across workshops
- **Total Revenue**: Sum of all completed payments

### Workshop Pipeline Summary

Below the metrics, the pipeline summary shows workshop counts by status:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Workshop Pipeline                                                    │
├─────────────────────────────────────────────────────────────────────┤
│ [Requested: 0] [Validating: 0] [Approved: 0] [Setup: 0]             │
│ [Marketing: 1] [Registration Open: 2] [Completed: 0]                │
└─────────────────────────────────────────────────────────────────────┘
```

Each status badge is color-coded:
- 🟡 **Requested** - Yellow - New workshop requests
- 🔵 **Validating** - Blue - Under review
- 🟢 **Approved** - Green - Ready for setup
- 🟣 **Setup in Progress** - Purple - Being configured
- 🔷 **Marketing Active** - Indigo - Promotion underway
- 🟩 **Registration Open** - Emerald - Accepting registrations
- ⬜ **Completed** - Slate - Finished workshops

### Recent Workshops

The bottom section shows the 5 most recent workshops with quick access to details:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Recent Workshops                                        [View All →]│
├─────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ AI Workshop - Chicago March 2025          [Registration Open]  │ │
│ │ AI Workshop • Sarah Johnson • Mar 14, 2025                     │ │
│ │                                           2 registrations      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

Click on any workshop row to view its details.

---

## Managing Workshops

### Viewing All Workshops

Navigate to **Workshops** in the main menu to see all workshops organized by date.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Workshops                                         [+ New Workshop]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Introduction to AI for Business - Virtual    [Registration Open]│ │
│ │ Feb 19, 2025 • Virtual • Emily Rodriguez                        │ │
│ │ 1 / 100 registrations                                           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ AI Workshop - Chicago March 2025             [Registration Open]│ │
│ │ Mar 14, 2025 • In-Person • Sarah Johnson                        │ │
│ │ 2 / 30 registrations                                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Creating a New Workshop

1. Click **+ New Workshop** button (top right of navigation or workshops page)
2. Fill out the workshop form:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Create New Workshop                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Workshop Type *                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Select workshop type...                                    ▼    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Coach *                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Select coach...                                            ▼    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Title *                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ e.g., AI Workshop - Chicago March 2025                          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Format *                    Duration *                              │
│ ┌───────────────────┐      ┌───────────────────────────────────┐   │
│ │ ○ In-Person       │      │ Select duration...            ▼   │   │
│ │ ○ Virtual         │      └───────────────────────────────────┘   │
│ │ ○ Hybrid          │                                              │
│ └───────────────────┘                                              │
│                                                                     │
│ Event Date *                Event Time                              │
│ ┌───────────────────┐      ┌───────────────────────────────────┐   │
│ │ 📅 Select date    │      │ e.g., 9:00 AM                     │   │
│ └───────────────────┘      └───────────────────────────────────┘   │
│                                                                     │
│                           [Create Workshop]                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Required Fields:**
- Workshop Type - Select from available types (AI Workshop, Exit Evaluation, Scaling Up Basics)
- Coach - Must be certified for the selected workshop type
- Title - Descriptive name for the workshop
- Format - In-Person, Virtual, or Hybrid
- Duration - Based on workshop type options
- Event Date - When the workshop will be held

**Optional Fields:**
- Event Time
- Venue Name (for in-person)
- Venue Address (for in-person)
- Parking Instructions (for in-person)
- Virtual Platform (for virtual/hybrid)
- Virtual Link (for virtual/hybrid)
- Pricing (leave unchecked for free workshops)
- Maximum Attendees

3. Click **Create Workshop** to submit

> **Note**: The system validates that the selected coach is certified for the chosen workshop type. If not certified, an error will be displayed.

### Viewing Workshop Details

Click on any workshop to view its full details:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Back to Workshops                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ AI Workshop - Chicago March 2025              [Registration Open]   │
│                                                                     │
│ [Move to Registration Closed] [Move to Marketing Active] [Cancel]   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Workshop Details                    │ Registrations (2)             │
│                                     │                               │
│ Type: AI Workshop                   │ ┌───────────────────────────┐ │
│ Coach: Sarah Johnson                │ │ John Smith                │ │
│ Date: Mar 14, 2025                  │ │ CEO, Smith Industries     │ │
│ Time: 9:00 AM                       │ │ ✓ Confirmed | $399 paid   │ │
│ Format: In-Person                   │ └───────────────────────────┘ │
│ Duration: Full Day                  │                               │
│ Price: $499.00                      │ ┌───────────────────────────┐ │
│   Early bird: $399 until Feb 28    │ │ Jane Doe                  │ │
│                                     │ │ COO, Doe Consulting       │ │
│ Location:                           │ │ ✓ Confirmed | $399 paid   │ │
│ Marriott Chicago Downtown           │ └───────────────────────────┘ │
│ 540 N Michigan Ave                  │                               │
│ Chicago, IL 60611                   │                               │
│                                     │                               │
│ Landing Page:                       │                               │
│ /workshop/ai-workshop-chicago-...   │                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Updating Workshop Status

From the workshop detail page, use the status action buttons to move the workshop through the pipeline:

**Valid Status Transitions:**

| Current Status | Can Move To |
|----------------|-------------|
| Requested | Validating, Cancelled |
| Validating | Approved, Requested (back), Cancelled |
| Approved | Setup in Progress, Cancelled |
| Setup in Progress | Marketing Active, Approved (back), Cancelled |
| Marketing Active | Registration Open, Setup in Progress (back), Cancelled |
| Registration Open | Registration Closed, Marketing Active (back), Cancelled |
| Registration Closed | Completed, Registration Open (back), Cancelled |
| Completed | (No transitions) |
| Cancelled | Requested (to restart) |

When you click a status button:
1. A confirmation dialog appears
2. Click OK to confirm the change
3. The page refreshes with the new status

---

## Managing Coaches

### Viewing All Coaches

Navigate to **Coaches** to see all coaches and their certifications:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Coaches                                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 👤 Sarah Johnson                                    [Active]    │ │
│ │    Growth Strategies LLC                                        │ │
│ │    sarah.johnson@scalingup.com                                  │ │
│ │                                                                 │ │
│ │    Certifications:                                              │ │
│ │    • AI Workshop (expires Dec 2026)                             │ │
│ │    • Scaling Up Basics (expires Dec 2026)                       │ │
│ │                                                                 │ │
│ │    1 workshop hosted                                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 👤 Michael Chen                                     [Active]    │ │
│ │    Chen Business Consulting                                     │ │
│ │    michael.chen@scalingup.com                                   │ │
│ │                                                                 │ │
│ │    Certifications:                                              │ │
│ │    • Exit Evaluation Workshop (expires Jun 2026)                │ │
│ │                                                                 │ │
│ │    1 workshop hosted                                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Coach Certification Rules

- Coaches can only host workshops for which they are **certified**
- Certifications have expiration dates
- When creating a workshop, only certified coaches appear in the dropdown for that workshop type

---

## Registration Flow

### Public Landing Pages

Each workshop has a public landing page that attendees can access to register:

**URL Pattern**: `/workshop/{landing-page-slug}`

**Example**: `/workshop/ai-workshop-chicago-march-2025`

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                    AI Workshop - Chicago March 2025                 │
│                                                                     │
│ 📅 March 14, 2025 • 9:00 AM                                        │
│ 📍 Marriott Chicago Downtown, Chicago, IL                          │
│ 👤 Hosted by Sarah Johnson                                         │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │                                                                 │ │
│ │  About This Workshop                                            │ │
│ │                                                                 │ │
│ │  Learn how to leverage AI tools to transform your business      │ │
│ │  operations. This hands-on workshop covers practical AI         │ │
│ │  implementation strategies, automation opportunities, and       │ │
│ │  how to build an AI-ready organization.                        │ │
│ │                                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │                                                                 │ │
│ │  Location                                                       │ │
│ │                                                                 │ │
│ │  Marriott Chicago Downtown                                      │ │
│ │  540 N Michigan Ave                                             │ │
│ │  Chicago, IL 60611                                              │ │
│ │                                                                 │ │
│ │  Parking: Valet parking available at hotel.                     │ │
│ │                                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌───────────────────────────────────┐                              │
│ │      Register for Workshop        │                              │
│ │                                   │                              │
│ │  Price: $499.00                   │                              │
│ │  Early Bird: $399.00              │                              │
│ │  (until Feb 28, 2025)             │                              │
│ │                                   │                              │
│ │  First Name *  [_______________]  │                              │
│ │  Last Name *   [_______________]  │                              │
│ │  Email *       [_______________]  │                              │
│ │  Company       [_______________]  │                              │
│ │  Job Title     [_______________]  │                              │
│ │  Phone         [_______________]  │                              │
│ │                                   │                              │
│ │     [Continue to Payment →]       │                              │
│ │                                   │                              │
│ └───────────────────────────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Registration Process

**For Free Workshops:**
1. Attendee fills out the registration form
2. Clicks "Register Now"
3. Redirected to success page with confirmation

**For Paid Workshops:**
1. Attendee fills out the registration form
2. Clicks "Continue to Payment"
3. Redirected to Stripe Checkout (requires Stripe configuration)
4. After payment, redirected to success page

### Registration Success Page

After successful registration, attendees see a confirmation:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                    ┌─────────────────────┐                          │
│                    │         ✓           │                          │
│                    └─────────────────────┘                          │
│                                                                     │
│                    Registration Confirmed!                          │
│                    You're all set for the workshop                  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  AI Workshop - Chicago March 2025                                   │
│  AI Workshop                                                        │
│                                                                     │
│  Date: Mar 14, 2025          Format: In-Person                      │
│  Time: 9:00 AM               Facilitator: Sarah Johnson             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Location                                                        ││
│  │ Marriott Chicago Downtown                                       ││
│  │ 540 N Michigan Ave, Chicago, IL 60611                           ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  What's Next?                                                       │
│  ✉️  Check your email for confirmation and details                  │
│  📅 Add this event to your calendar                                 │
│  📋 Please bring a laptop with internet access                      │
│                                                                     │
│                      [Return to Home]                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Workshop Pipeline

### Understanding the Pipeline

Workshops progress through a defined pipeline from request to completion:

```
┌──────────┐    ┌────────────┐    ┌──────────┐    ┌─────────────────┐
│ REQUESTED│───▶│ VALIDATING │───▶│ APPROVED │───▶│SETUP IN PROGRESS│
└──────────┘    └────────────┘    └──────────┘    └─────────────────┘
                                                           │
                                                           ▼
┌───────────┐    ┌────────────────────┐    ┌──────────────────────┐
│ COMPLETED │◀───│ REGISTRATION CLOSED│◀───│ REGISTRATION OPEN    │
└───────────┘    └────────────────────┘    └──────────────────────┘
                                                           ▲
                                                           │
                                           ┌───────────────────────┐
                                           │ MARKETING ACTIVE      │
                                           └───────────────────────┘

                    ╔═══════════╗
    Any status ────▶║ CANCELLED ║────▶ REQUESTED (restart)
                    ╚═══════════╝
```

### Pipeline Stages Explained

| Stage | Description | Actions Available |
|-------|-------------|-------------------|
| **Requested** | Initial request submitted by coach | Review and validate |
| **Validating** | Staff reviewing coach certification and details | Approve or request changes |
| **Approved** | Workshop approved, ready for setup | Begin setup process |
| **Setup in Progress** | Landing page, payments, materials being configured | Complete setup |
| **Marketing Active** | Promotional campaigns running | Open registration |
| **Registration Open** | Accepting attendee registrations | Close when full or near event |
| **Registration Closed** | No more registrations accepted | Mark complete after event |
| **Completed** | Workshop finished | Archive/reporting only |
| **Cancelled** | Workshop cancelled | Can restart if needed |

### Best Practices

1. **Don't skip stages** - Follow the pipeline in order for proper tracking
2. **Close registration early** - Close 24-48 hours before event for final prep
3. **Use cancellation sparingly** - Only cancel when workshop truly won't happen
4. **Track automation tasks** - The system logs all status changes for audit

---

## Quick Reference

### Keyboard Shortcuts

Currently, the platform is mouse/touch operated. No keyboard shortcuts are implemented.

### Common Tasks

| Task | Steps |
|------|-------|
| Create a workshop | Dashboard → + New Workshop → Fill form → Submit |
| View registrations | Workshops → Click workshop → See Registrations panel |
| Change workshop status | Workshops → Click workshop → Click status button |
| Share landing page | Workshops → Click workshop → Copy landing page URL |
| View coach certifications | Coaches → View coach card |

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Coach not certified" error | Select a coach who has active certification for the workshop type |
| Payment not working | Ensure Stripe API keys are configured in environment variables |
| Page not loading | Check that the development server is running (`npm run dev`) |
| Status button not appearing | Workshop may be in a terminal status (Completed/Cancelled) |

---

## Getting Help

For technical issues or feature requests, contact your system administrator.

**Platform Version**: 1.0.0
**Last Updated**: January 2026
