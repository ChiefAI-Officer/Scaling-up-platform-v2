---
name: scaling-up-api
description: API route conventions, error handling patterns, and response formats for Scaling Up v2
---

# Scaling Up v2 — API Routes

## Route Structure
```
src/app/api/
  auth/[...nextauth]/route.ts   — NextAuth handler
  workshops/
    route.ts                     — GET (list), POST (create)
    [id]/route.ts                — GET, PATCH, DELETE
    [id]/clone/route.ts          — POST (clone workshop)
    [id]/request-edit/route.ts   — POST (request edit on locked)
    [id]/registrations/route.ts  — GET (list), POST (add)
  coaches/
    route.ts                     — GET (list), POST (create)
    [id]/route.ts                — GET, PATCH
  contacts/
    route.ts                     — GET (list), POST (import CSV)
  approval-queue/
    route.ts                     — GET (list pending)
    [id]/route.ts                — PATCH (approve/deny)
  landing-pages/
    [id]/route.ts                — GET, PATCH
  admin/
    set-password/route.ts        — POST (admin password management)
```

## Standard Response Format
```typescript
// Success
return NextResponse.json({ data: result }, { status: 200 });
return NextResponse.json({ data: created }, { status: 201 });

// Error
return NextResponse.json({ error: "Message" }, { status: 400 });
return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
return NextResponse.json({ error: "Forbidden" }, { status: 403 });
return NextResponse.json({ error: "Not found" }, { status: 404 });
```

## Auth Pattern for API Routes
```typescript
import { getApiActor } from "@/lib/authorization";
import { isPrivilegedRole } from "@/lib/access-control";

export async function GET(req: Request) {
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Scope data: admin sees all, coach sees own
  const where = isPrivilegedRole(actor.role)
    ? {}
    : { coachId: actor.coachId! };
    
  const data = await db.workshop.findMany({ where });
  return NextResponse.json({ data });
}
```

## Error Handling Pattern
```typescript
try {
  // ... operation
} catch (error) {
  console.error(`[API] /api/workshops error:`, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Internal Server Error" },
    { status: 500 }
  );
}
```

## Rules
1. Always auth-check first with `getApiActor()`
2. Always scope data with role-based where clauses
3. Use `NextResponse.json()` — never `Response.json()` or `new Response()`
4. Log errors with `[API]` prefix and route path
5. Validate request body with zod before processing
6. Use try/catch on all database operations
7. Return early on auth failures (don't nest)
8. Use `revalidatePath()` after mutations for ISR pages
