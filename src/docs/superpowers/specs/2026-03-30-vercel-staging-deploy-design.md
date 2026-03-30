# Design: Push Local Revisions to Vercel Staging (Preview)

**Date:** 2026-03-30
**Author:** Claude (reviewed with user)
**Status:** Approved for implementation

---

## Context

All Figma revisions and admin capability work for the Scaling Up Platform v2 has been
completed on this Mac at `/Users/diushianstand/Scaling-up-platform-v2/src/`. The work was
done by downloading a copy of the GitHub repo (no local git history). Josh reviewed and
approved the work and authorized pushing to a Vercel staging/preview deployment.

The goal is to create a Vercel Preview URL (not production) so the work can be viewed live
without affecting `main` or the production deployment at `scaling-up-platform-v2.vercel.app`.

---

## Constraints

- No local git repository — code was downloaded as a ZIP/copy, not cloned
- No GitHub SSH auth on this Mac — needs one-time setup
- No pushing to `main` — preview branch only
- Must pass CLAUDE.md Deployment Verification Protocol before pushing
- Vercel's "Root Directory" is `src/` in the project settings

---

## Design: 6-Phase Deployment Workflow

### Phase 0 — GitHub SSH Authentication (one-time setup)
Set up SSH key on this Mac and register it with GitHub so `git push` works.

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub   # Copy this → GitHub → Settings → SSH Keys → New SSH key
ssh -T git@github.com       # Verify: "Hi jcbdelo26! You've successfully authenticated"
```

### Phase 1 — Pre-Deploy Checks (mandatory per CLAUDE.md)
Run inside `src/` with a valid `.env` file present:

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
CI=true npm run build       # Must pass — mirrors Vercel's exact pipeline
npm run test                # Must pass — 52 suites, ~488 tests
npx eslint src/             # Fix all errors (warnings may fail Vercel build)
```

All three must be green before proceeding. If any fail, fix first.

### Phase 2 — AI Code Review
Invoke the `/requesting-code-review` skill to get a second opinion on the local
`src/` changes before they're pushed to GitHub. Address any critical findings.

### Phase 3 — Clone Repo + Create Staging Branch
Clone the existing GitHub repo and create a new branch from `main`:

```bash
git clone git@github.com:jcbdelo26/Scaling-up-platform-v2.git ~/scaling-up-clone
cd ~/scaling-up-clone
git checkout -b staging-mar2026
```

### Phase 4 — Sync Local Changes Into Clone
Copy local `src/` into the cloned repo's `src/` directory, excluding build artifacts:

```bash
rsync -av \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='*.tsbuildinfo' \
  --exclude='.env' \
  /Users/diushianstand/Scaling-up-platform-v2/src/ \
  ~/scaling-up-clone/src/
```

Review the diff before committing:
```bash
cd ~/scaling-up-clone
git diff --stat             # Summary of changed files
git status                  # Untracked new files
```

### Phase 5 — Commit + Push to GitHub
```bash
git add -A
git commit -m "Staging: figma revisions + admin capabilities (Mar 2026)

- All 11 Figma revisions complete
- Admin create workshop, invite system, permanent delete
- UI/UX overhaul: design tokens, dark mode, animations
- Security hardening S1-S8
- 52 test suites / 488 tests passing"

git push -u origin staging-mar2026
```

### Phase 6 — Verify Vercel Preview Deployment
- Go to vercel.com → project → Deployments
- Find the `staging-mar2026` deployment (auto-triggered within ~1 min)
- Check build logs for errors
- Once green, copy the preview URL and share with Josh

---

## Files Excluded from Sync

| File/Dir | Reason |
|----------|--------|
| `node_modules/` | Rebuilt by Vercel on deploy |
| `.next/` | Build artifact, regenerated |
| `*.tsbuildinfo` | TypeScript incremental cache |
| `.env` | Never committed — secrets |

---

## Verification

1. Vercel dashboard shows green build for `staging-mar2026` branch
2. Preview URL loads the app without errors
3. Key pages work: `/admin/dashboard`, `/portal/home`, `/workshop/[slug]`
4. No build errors in Vercel logs

---

## Notes

- `main` branch is NOT touched — this is preview only
- Vercel's root directory must be set to `src/` in project settings
- `CI=true npm run build` also runs `prisma generate && prisma migrate deploy`
  (per `vercel.json` buildCommand) — needs live `DATABASE_URL` to succeed locally
- If local build fails due to missing env vars, the pre-deploy check can be scoped
  to lint + tests only, and the build is verified via Vercel's own pipeline
