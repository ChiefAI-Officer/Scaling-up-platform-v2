# Supabase Quick Reference Card

## Connection Strings (After Setup)

**Pooled Connection (for app):**
```
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

**Direct Connection (for migrations):**
```
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

---

## Common Commands

**Generate Prisma Client:**
```powershell
npx prisma generate
```

**Run Migrations:**
```powershell
npx prisma migrate dev --name your_migration_name
```

**Open Database GUI:**
```powershell
npx prisma studio
# Opens http://localhost:5555
```

**Reset Database (CAUTION - deletes all data):**
```powershell
npx prisma migrate reset
```

---

## Supabase Dashboard URLs

**Your Project:** https://supabase.com/dashboard/project/[your-project-id]

**Table Editor:** Click "Table Editor" in left sidebar

**SQL Editor:** Click "SQL Editor" to run custom queries

**Logs:** Click "Logs" to see database activity

---

## Free Tier Limits

- **Storage:** 500 MB
- **Bandwidth:** 2 GB/month
- **Database Size:** 500 MB
- **API Requests:** Unlimited
- **Backups:** Daily (7-day retention)

**Upgrade to Pro ($25/mo) when:**
- Storage > 500 MB
- Need more than 7-day backup retention
- Need custom domains
- Need point-in-time recovery

---

## Troubleshooting

**"Too many connections"**
- You're using `DATABASE_URL` (pooled) correctly ✅
- Check for connection leaks in code

**"Migration failed"**
- Ensure `DIRECT_URL` is set in `.env`
- Try: `npx prisma migrate reset` then re-run

**"Cannot connect"**
- Check password in `.env` (no spaces)
- Verify internet connection
- Check Supabase project status

---

*Quick reference for Scaling Up Platform v2*
