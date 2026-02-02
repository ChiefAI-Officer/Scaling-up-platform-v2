# Scaling Up Platform v2 - Admin User Guide

> Quick reference for Suzanne and team on using the admin panel

---

## Accessing the Platform

### Login
1. Navigate to `https://platform.scalingup.com/admin`
2. Sign in with your Microsoft account
3. You'll be redirected to the Admin Dashboard

### Quick Links
| Page | URL |
|------|-----|
| Admin Dashboard | `/admin` |
| Approval Queue | `/admin/approvals` |
| Workshops | `/admin/workshops` |
| Coaches | `/admin/coaches` |
| Reports | `/admin/reports` |

---

## Daily Tasks

### 1. Review Approval Queue (Morning Priority)
Navigate to **Admin → Approvals** to see pending items:

- **PENDING** = Needs your decision
- **ESCALATED** = Needs urgent attention (24+ hours old)

**Actions:**
- Click ✅ **Approve** or ❌ **Deny**
- Add notes for coach feedback
- Approvals expire after 7 days if not actioned

### 2. Monitor Upcoming Workshops
Navigate to **Admin → Workshops** and filter by "Upcoming":

- Verify landing pages are live
- Check registration counts
- Confirm email sequences are scheduled

### 3. Check Coach Certifications
Navigate to **Admin → Coaches**:

- 🟢 = Certified (current)
- 🟡 = Expires in 30 days
- 🔴 = Expired

---

## Approval Types

| Type | Auto-Approve? | Action |
|------|---------------|--------|
| Workshop Request | ✅ Yes (if certified) | Review new workshop details |
| Custom Pricing | ❌ No | Verify pricing justification |
| Cancellation | ❌ No | Check for 14-day lead time |
| Refund | ❌ No | Verify refund reason |
| Date Change | ❌ No | Check attendee impact |

---

## Email Sequences

Workshop attendees receive automated emails:

| Email | When | Template |
|-------|------|----------|
| Registration Confirmation | Immediately | ✅ Automated |
| 5-Day Reminder | 5 days before | ✅ Automated |
| Day Before | 1 day before | ✅ Automated |
| Morning Of | Day of event | ✅ Automated |
| Post-Workshop Survey | 2 hours after | ✅ Automated |

You can preview/edit templates at **Admin → Settings → Email Templates**

---

## Reports

### Workshop Performance
- View at **Admin → Reports → Workshop Summary**
- Metrics: registrations, attendance, revenue
- Export to CSV for spreadsheets

### Coach Leaderboard
- View at **Admin → Reports → Coach Performance**
- Sort by workshops hosted, attendees, revenue

### 90-Day Follow-up Status
- View at **Admin → Reports → Follow-ups**
- Track which attendees have completed surveys

---

## Troubleshooting

### Coach can't create workshop
1. Check certification status at **Admin → Coaches**
2. Verify payment is current
3. If still blocked, check **Admin → Approvals** for pending items

### Landing page not showing
1. Check workshop status is "APPROVED"
2. Navigate to **Admin → Workshops → [Workshop] → Landing Page**
3. Click "Regenerate" if needed

### Email not sending
1. Check **Admin → Workshops → [Workshop] → Emails**
2. Verify email addresses are correct
3. Contact support if 5+ emails show "FAILED"

---

## Emergency Contacts

| Issue | Contact |
|-------|---------|
| System outage | [tech@scalingup.com](mailto:tech@scalingup.com) |
| Payment issue | Stripe Dashboard |
| Coach escalation | Jeff Donaldson |

---

*Last updated: February 2, 2026*
