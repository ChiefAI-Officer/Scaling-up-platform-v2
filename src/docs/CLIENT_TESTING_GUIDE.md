# Scaling Up Workshop Platform - Client Testing Guide

## Welcome!

This guide will walk you through testing the Scaling Up Workshop Management Platform. The platform is designed to manage workshop scheduling, coach certifications, attendee registrations, and payment processing.

---

## Quick Start

### Access the Platform

**Live URL:** https://scaling-deploy.vercel.app

### Login Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@scalingup.com` | `demo123` |
| **Staff** | `staff@scalingup.com` | `demo123` |

> **Tip:** Use the Admin account for full access to all features.

---

## Testing Checklist

Use this checklist to systematically test all features:

### 1. Authentication Testing
- [ ] Visit https://scaling-deploy.vercel.app
- [ ] Click "Sign In" or navigate to `/login`
- [ ] Login with `admin@scalingup.com` / `demo123`
- [ ] Verify you're redirected to the Dashboard
- [ ] Check that the navigation shows: Dashboard, Workshops, Coaches

### 2. Dashboard Testing
- [ ] View the Dashboard at `/dashboard`
- [ ] Verify you see 4 metric cards (Total Workshops, Upcoming, Registrations, Revenue)
- [ ] Check the Workshop Pipeline summary shows workshop counts by status
- [ ] View the Recent Workshops section
- [ ] Click "View All" to go to the workshops list

### 3. Workshop Management Testing

#### View Workshops
- [ ] Navigate to Workshops (`/workshops`)
- [ ] Verify you see the list of demo workshops
- [ ] Click on a workshop to view its details
- [ ] Check that workshop details show: date, coach, format, pricing, registrations

#### Create a New Workshop
- [ ] Click "+ New Workshop" button
- [ ] Select a Coach from the dropdown
- [ ] Select a Workshop Type (note: only types the coach is certified for will appear)
- [ ] Enter a Title (e.g., "Test Workshop - January 2026")
- [ ] Select Format: In-Person, Virtual, or Hybrid
- [ ] Select Duration from available options
- [ ] Set an Event Date (pick a future date)
- [ ] Optionally set Event Time
- [ ] For In-Person: Add venue name and address
- [ ] For Virtual: Select platform and add meeting link
- [ ] Set pricing or check "Free Workshop"
- [ ] Set Maximum Attendees
- [ ] Click "Create Workshop"
- [ ] Verify workshop is created and you see the detail page

#### Update Workshop Status
- [ ] From a workshop detail page, find the status action buttons
- [ ] Try moving a workshop from one status to another
- [ ] Valid transitions: Draft → Published, Published → Cancelled, etc.
- [ ] Verify status badge updates after change

### 4. Coach Management Testing

#### View Coaches
- [ ] Navigate to Coaches (`/coaches`)
- [ ] Verify you see the list of demo coaches
- [ ] Check each coach card shows: name, email, certification status, payment status
- [ ] View certifications for each coach

#### Add a New Coach
- [ ] Click "+ Add Coach" button
- [ ] Fill in required fields:
  - First Name
  - Last Name
  - Email (must be unique)
- [ ] Optionally fill in:
  - Phone
  - Company
  - Territory
  - Bio
  - HubSpot ID
  - Circle ID
- [ ] Click "Create Coach"
- [ ] Verify coach appears in the list with "Pending" status

#### View Coach Details
- [ ] Click on a coach name to view their detail page
- [ ] Verify you see: profile info, stats, certifications, recent workshops
- [ ] Test the "Create Workshop" quick action

### 5. Public Registration Testing

#### View Workshop Landing Page
- [ ] From a workshop detail page, find the Landing Page URL
- [ ] Open the URL in a new incognito/private browser window
- [ ] Verify the public landing page displays:
  - Workshop title and description
  - Date, time, and location
  - Coach information
  - Pricing information
  - Registration form

#### Test Registration (Free Workshop)
- [ ] Find or create a free workshop
- [ ] Open its landing page in incognito mode
- [ ] Fill out the registration form:
  - First Name
  - Last Name
  - Email
  - Company (optional)
  - Job Title (optional)
  - Phone (optional)
- [ ] Click "Register Now"
- [ ] Verify you see the success page
- [ ] Go back to the admin dashboard and verify the registration appears

#### Test Registration (Paid Workshop)
- [ ] Find or create a paid workshop
- [ ] Open its landing page in incognito mode
- [ ] Fill out the registration form
- [ ] Click "Continue to Payment"
- [ ] You should see a Stripe checkout page (if Stripe is configured)
- [ ] Note: For testing, you can use Stripe test card: `4242 4242 4242 4242`

### 6. API Endpoints Testing

You can test API endpoints directly:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/docs` | GET | API documentation |
| `/api/workshops` | GET | List workshops (requires auth) |
| `/api/coaches` | GET | List coaches (requires auth) |
| `/api/workshop-types` | GET | List workshop types (requires auth) |

### 7. Error Handling Testing
- [ ] Try accessing `/dashboard` without logging in (should redirect to login)
- [ ] Try creating a workshop without required fields (should show validation errors)
- [ ] Try registering with an invalid email format
- [ ] Try accessing a non-existent workshop URL (should show 404)

---

## Demo Data Reference

The platform comes pre-loaded with demo data for testing:

### Workshop Types
| Name | Duration Options |
|------|------------------|
| Scaling Up Basics | full-day, half-day |
| AI Workshop | full-day, half-day, virtual-2hr |
| Leadership Development | full-day, half-day |

### Demo Coaches
| Name | Email | Certifications |
|------|-------|----------------|
| Sarah Johnson | sarah.johnson@example.com | AI Workshop, Scaling Up Basics |
| Michael Chen | michael.chen@example.com | Leadership Development |
| Emily Rodriguez | emily.rodriguez@example.com | AI Workshop |

### Demo Workshops
Several workshops have been pre-created with sample registrations for testing.

---

## Feature Overview

### For Administrators

| Feature | Description |
|---------|-------------|
| **Dashboard** | Real-time overview of workshops, registrations, and revenue |
| **Workshop Management** | Create, edit, and manage workshop lifecycle |
| **Coach Management** | Add coaches, track certifications, assign workshops |
| **Registration Tracking** | View and manage attendee registrations |
| **Pipeline Management** | Move workshops through status workflow |

### For Public Users (Attendees)

| Feature | Description |
|---------|-------------|
| **Landing Pages** | Public workshop information pages |
| **Registration** | Self-service registration forms |
| **Payment** | Secure checkout via Stripe (when configured) |
| **Confirmation** | Success page with workshop details |

---

## Workshop Status Pipeline

Workshops progress through these statuses:

```
DRAFT → PUBLISHED → REGISTRATION_OPEN → REGISTRATION_CLOSED → COMPLETED
                                    ↓
                               CANCELLED
```

| Status | Description |
|--------|-------------|
| **Draft** | Workshop being set up, not visible publicly |
| **Published** | Workshop visible, registration not yet open |
| **Registration Open** | Accepting registrations |
| **Registration Closed** | No longer accepting registrations |
| **Completed** | Workshop has concluded |
| **Cancelled** | Workshop was cancelled |

---

## Known Limitations (Demo Version)

1. **Email Notifications**: Not configured in demo - no confirmation emails sent
2. **Stripe Payments**: Requires Stripe API keys to be configured for real payments
3. **HubSpot Integration**: CRM sync disabled without API key
4. **File Uploads**: Coach/workshop images not implemented

---

## Reporting Issues

When reporting issues, please include:

1. **URL** where the issue occurred
2. **Steps** to reproduce the problem
3. **Expected** behavior
4. **Actual** behavior
5. **Screenshots** if applicable
6. **Browser** and device information

---

## Technical Information

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16 with React 19 |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL (Neon) |
| Authentication | NextAuth.js |
| Payments | Stripe (optional) |
| Hosting | Vercel |

---

## Contact

For questions about this demo or to discuss customization needs, please contact your project representative.

---

**Version:** 1.0.0
**Last Updated:** January 2026
**Platform URL:** https://scaling-deploy.vercel.app
