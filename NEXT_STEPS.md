# Quick Database Setup - Next Steps

## Current Status

✅ **Circle.so API** - Validated successfully  
✅ **Docker** - Installed (v28.5.1)  
✅ **docker-compose.yml** - Updated for V2  
⚠️ **Docker Desktop** - Not running

---

## Option 1: Start Docker Desktop (Recommended)

### Steps:
1. **Start Docker Desktop**
   - Press Windows key, search "Docker Desktop"
   - Click to start
   - Wait for "Docker Desktop is running" notification

2. **Verify Docker is Running**
   ```powershell
   docker ps
   # Should show: CONTAINER ID   IMAGE   ...
   ```

3. **Start Database Containers**
   ```powershell
   cd "D:\The CTO Project\Scaling Up Platform v2\src"
   docker-compose up -d
   
   # Verify containers are running
   docker-compose ps
   ```

4. **Update .env**
   ```bash
   DATABASE_URL="postgresql://scaling_up_user:scaling_up_password@localhost:5432/scaling_up_v2?schema=public"
   REDIS_URL="redis://localhost:6379"
   ```

---

## Option 2: Cloud Database (No Docker Needed)

If you prefer not to use Docker, use **Supabase** (fastest cloud option):

### Steps:
1. **Go to** https://supabase.com
2. **Sign up/Login** with GitHub or email
3. **Create New Project**
   - Name: `scaling-up-v2`
   - Database Password: (generate strong password)
   - Region: Choose closest to you
   - Click "Create new project"

4. **Get Connection String**
   - Go to Project Settings → Database
   - Copy "Connection string" under "Connection pooling"
   - Replace `[YOUR-PASSWORD]` with your database password

5. **Update .env**
   ```bash
   DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
   ```

6. **Update Prisma Schema**
   Add this line to `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")  // Add this line
   }
   ```

---

## Option 3: Local PostgreSQL (Windows)

If you have PostgreSQL installed locally:

1. **Check if PostgreSQL is Running**
   ```powershell
   Get-Service postgresql*
   ```

2. **Start PostgreSQL Service**
   ```powershell
   Start-Service postgresql-x64-15  # Adjust version number
   ```

3. **Create Database**
   ```powershell
   psql -U postgres
   # In psql:
   CREATE DATABASE scaling_up_v2;
   CREATE USER scaling_up_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE scaling_up_v2 TO scaling_up_user;
   \q
   ```

4. **Update .env**
   ```bash
   DATABASE_URL="postgresql://scaling_up_user:your_password@localhost:5432/scaling_up_v2?schema=public"
   ```

---

## After Database is Ready

Run these commands:

```powershell
# 1. Generate Prisma Client
npx prisma generate

# 2. Run Migrations
npx prisma migrate dev --name init_v2_schema

# 3. Verify with Prisma Studio
npx prisma studio
# Opens http://localhost:5555
```

---

**Which option would you like to proceed with?**
