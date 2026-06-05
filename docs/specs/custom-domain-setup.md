# Custom Domain Setup — `platform.scalingup.com` (prod) + `platformtest.scalingup.com` (test)

**Status:** Handoff doc. No code change. **Jeff owns the `scalingup.com` registrar** and creates the DNS records; this doc gives him the exact records + the Vercel/env steps the platform side needs.

**Goal:** Serve the Scaling Up Platform at a branded domain instead of `scaling-up-platform-v2.vercel.app`:

| Environment | Domain | Serves |
|---|---|---|
| Production | `platform.scalingup.com` | the `main` branch (live coaches/admin) |
| Test | `platformtest.scalingup.com` | a non-prod deployment, **its own database** |

> ⚠️ **The test domain must NOT point at the production database.** Test must use a separate (non-prod) `DATABASE_URL`. Mixing them is how you get test activity mutating live coach/user data — the exact failure mode this platform has already been bitten by twice.

---

## 0. Background the platform side needs

- The app is hosted on **Vercel** (project `scaling-up-platform-v2`, Root Directory `src`), deploying from `main` via git integration.
- Two env vars carry the public origin and **both must be updated** for a custom domain (today they fall back to `https://scaling-up-platform-v2.vercel.app`):
  - `NEXTAUTH_URL` — used by NextAuth for login/callback redirects. **If this doesn't exactly match the domain serving the app, login breaks** (redirect loop / callback error).
  - `APP_URL` — used to build absolute links in **emails and server responses**: approval action links, coach invites, password-reset links, assessment invitation/reminder links, and landing-page URLs. A stale value silently sends recipients to the old domain.
- Vercel scopes env vars per environment: **Production** vs **Preview** vs **Development**. The prod domain reads Production vars; the test domain reads either Preview vars (Model A) or its own project's Production vars (Model B) — see §3.

---

## 1. Add the domains in Vercel

In **Vercel → project `scaling-up-platform-v2` → Settings → Domains**:

1. Add `platform.scalingup.com`. Assign it to the **Production** branch (`main`).
2. Add `platformtest.scalingup.com`. Assign it per the model you pick in §3.

After you add each domain, **Vercel displays the exact DNS record value to create** (the CNAME target). Use Vercel's displayed value as authoritative if it differs from the defaults in §2 (Vercel occasionally issues account-specific targets).

---

## 2. DNS records to create at the `scalingup.com` registrar (Jeff)

Both are subdomains, so both use a **CNAME**. Create these at whatever hosts `scalingup.com` DNS (e.g. GoDaddy / Cloudflare / Route 53):

| Type | Name / Host | Value / Target | TTL |
|---|---|---|---|
| CNAME | `platform` | `cname.vercel-dns.com.` | 3600 (or Auto) |
| CNAME | `platformtest` | `cname.vercel-dns.com.` | 3600 (or Auto) |

Notes:
- `Name` is the subdomain label only (`platform`), not the full domain — most registrars append `.scalingup.com` automatically.
- If the registrar is **Cloudflare**, set the proxy status to **DNS only (grey cloud)** for these records, otherwise Cloudflare's proxy fights Vercel's TLS/edge.
- **Do not** create an A record for these subdomains — CNAME is correct for subdomains on Vercel. (An apex like `scalingup.com` itself would need an `A → 76.76.21.21`, but we are not touching the apex here.)
- Verify against the value Vercel shows in §1 — that is the source of truth.

Once DNS resolves, **Vercel auto-provisions the TLS certificate** (Let's Encrypt). This is automatic but can take anywhere from a few minutes to a couple of hours.

---

## 3. Test vs prod split — pick a model

**Model A — one Vercel project, branch-assigned test domain (simplest).**
- `platform.scalingup.com` → Production (`main`).
- `platformtest.scalingup.com` → assigned to a dedicated git branch (e.g. `staging`) in Vercel's domain settings, so pushes to that branch serve the test domain.
- Test reads **Preview** env vars. Set a **non-prod `DATABASE_URL`/`DIRECT_URL`** (a separate Neon branch/DB) in the Preview scope.
- Pros: minimal setup. Cons: Preview env is shared by all preview deployments, so the test DB is shared with PR previews.

**Model B — two Vercel projects (strongest isolation).**
- A second Vercel project (e.g. `scaling-up-platform-test`) deploys the test branch, owns `platformtest.scalingup.com`, and has its **own** Production env (own non-prod DB, own secrets).
- Pros: full isolation of test from prod (DB, env, deploys). Cons: a second project to maintain.

**Recommendation:** Model A to start (fast), with a dedicated non-prod Neon database for the Preview scope. Move to Model B if test traffic/data needs hard isolation.

---

## 4. Environment variable changes (Vercel → Settings → Environment Variables)

After saving any env var, **a redeploy is required** for it to take effect.

**Production scope** (serves `platform.scalingup.com`):
| Var | New value |
|---|---|
| `NEXTAUTH_URL` | `https://platform.scalingup.com` |
| `APP_URL` | `https://platform.scalingup.com` |

**Test scope** (Preview in Model A, or the test project's Production in Model B — serves `platformtest.scalingup.com`):
| Var | New value |
|---|---|
| `NEXTAUTH_URL` | `https://platformtest.scalingup.com` |
| `APP_URL` | `https://platformtest.scalingup.com` |
| `DATABASE_URL` / `DIRECT_URL` | **non-prod** database (NOT the prod Neon DB) |

Leave all other secrets (Stripe, HubSpot, Circle, SMTP, etc.) as-is unless they embed the old domain (see §5).

---

## 5. Other places the domain may be referenced (check before flipping)

- **Stripe** — checkout success/cancel URLs and the webhook endpoint are built from `APP_URL`/request origin. After the domain change, confirm the Stripe webhook still points at a valid URL and that checkout redirects land on the new domain. (Webhook endpoint may need re-pointing if it was hardcoded to the `.vercel.app` host.)
- **Circle / HubSpot** — any OAuth/redirect/callback URL registered with the old domain must be updated to the new one.
- **`vercel.json` CSP** — the Content-Security-Policy is origin-relative (`'self'`), so a domain swap needs no CSP change. Only revisit if a third party requires the new origin on an allowlist.
- **Email deliverability** — `FROM_EMAIL` is already `noreply@scalingup.com`; unaffected by the app domain. No SPF/DKIM change is needed for the app domain (that's the mail domain, separate concern).

---

## 6. Verification steps (after DNS + env + redeploy)

1. **DNS resolves:** `dig +short platform.scalingup.com` and `dig +short platformtest.scalingup.com` return Vercel's CNAME/edge. 
2. **TLS valid:** `https://platform.scalingup.com` loads with a valid certificate (no warning).
3. **Login works (the NEXTAUTH_URL check):** sign in on the new domain — you should land back on the app, not hit a redirect loop or callback error. A failure here almost always means `NEXTAUTH_URL` doesn't match the serving domain.
4. **APP_URL-derived links are correct:** trigger one email path (e.g. a coach invite or a password reset) and confirm the link in the email points at the new domain, not `…vercel.app`.
5. **Test isolation:** confirm `platformtest.scalingup.com` is talking to the **non-prod** database (e.g. its data differs from prod / row counts differ).
6. **Old domain still works as a fallback** during cutover (Vercel keeps `…vercel.app` serving) so nothing breaks mid-migration.

---

## 7. What needs whom

| Step | Owner |
|---|---|
| Create the two CNAME records at the registrar (§2) | **Jeff** (owns `scalingup.com`) |
| Add domains + assign to branch/env in Vercel (§1, §3) | Platform admin (Vercel access) |
| Decide Model A vs B + provision a non-prod test DB (§3) | Platform admin + decision |
| Update `NEXTAUTH_URL` / `APP_URL` per scope + redeploy (§4) | Platform admin (Vercel access) |
| Re-point Stripe/Circle/HubSpot callback URLs if needed (§5) | Platform admin |
| Run verification (§6) | Platform admin |

No application code changes are required — both `NEXTAUTH_URL` and `APP_URL` are already read from the environment with a `.vercel.app` fallback; setting them to the custom domain is sufficient.
