---
name: scaling-up-auth
description: Authentication patterns, role hierarchy, session handling, and authorization helpers for Scaling Up v2
---

# Scaling Up v2 — Auth & Authorization

## Auth Strategy
- **Library:** NextAuth v4 (`next-auth`)
- **Strategy:** JWT (not database sessions)
- **Provider:** CredentialsProvider (email + password)
- **Password:** bcryptjs (production) or `demo123` (when `DEMO_MODE=true`)
- **Session duration:** 30 days

## Role Hierarchy
```
ADMIN (3) > STAFF (2) > COACH (1)
```

| Role | Can See | Can Do |
|------|---------|--------|
| ADMIN | All workshops, all revenue, all coaches | Approve/deny, lock/unlock, manage coaches |
| STAFF | All workshops (no revenue) | View workshops, manage registrations |
| COACH | Own workshops only, attendee counts only (NO revenue) | Create workshops, edit own (if unlocked) |

## Key Files
- `src/lib/auth.ts` — NextAuth config, `authOptions`, `hasRole()`, `canAccess()`
- `src/lib/authorization.ts` — Server-side helpers
- `src/lib/access-control.ts` — `ApiActor` type, `normalizeRole()`, `canManageCoachData()`, `isPrivilegedRole()`

## Authorization Functions (use these, don't reinvent)

| Function | Returns | What It Does |
|----------|---------|-------------|
| `requireAuth()` | `ExtendedSession` | Get session or redirect to login |
| `requireAdmin()` | `ExtendedSession` | Require ADMIN role or redirect to portal |
| `requireCoach()` | `{ session, coach }` | Get session + coach profile or redirect |
| `getCoachForSession()` | `Coach \| null` | Get coach via userId FK or email fallback |
| `canAccessWorkshop(id)` | `boolean` | Admin=all, Coach=own only |
| `isWorkshopLocked(id)` | `boolean` | Check manual lock OR 48h auto-lock |
| `getWorkshopLockStatus(id)` | `WorkshopLockStatus` | Full lock details for UI |
| `getUserForApiRoute()` | `User \| null` | Get user with coachProfile for API routes |
| `getApiActor()` | `ApiActor \| null` | Normalized actor for access-control checks |
| `scopedWorkshopWhere(coachId)` | Prisma where clause | Coach-scoped data filter |

## Usage Patterns

### Server Component (Page)
```typescript
// Admin-only page
const session = await requireAdmin();

// Coach portal page
const { session, coach } = await requireCoach();
const workshops = await db.workshop.findMany({
  where: scopedWorkshopWhere(coach.id)
});
```

### API Route
```typescript
const actor = await getApiActor();
if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
if (!isPrivilegedRole(actor.role) && actor.coachId !== coachId) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

## Revenue Visibility Rule
> Coaches should NEVER see total revenue or `amountPaidCents`. They see attendee counts only.
> Always filter revenue fields when returning data to COACH role users.

## Admin Email Guard
Only the email matching `process.env.ADMIN_EMAIL` can log in with ADMIN role.
