# Database Setup Guide - Scaling Up Platform v2

This guide walks through setting up your database infrastructure sequentially, from local development to production-ready options.

---

## Option 1: Local PostgreSQL (Fastest for Development)

### Windows Installation

1. **Download PostgreSQL**
   ```powershell
   # Using Chocolatey (recommended)
   choco install postgresql
   
   # Or download from: https://www.postgresql.org/download/windows/
   ```

2. **Start PostgreSQL Service**
   ```powershell
   # Check if running
   Get-Service postgresql*
   
   # Start service if not running
   Start-Service postgresql-x64-15
   ```

3. **Create Database**
   ```powershell
   # Connect to PostgreSQL
   psql -U postgres
   
   # In psql shell:
   CREATE DATABASE scaling_up_v2;
   CREATE USER scaling_up_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE scaling_up_v2 TO scaling_up_user;
   \q
   ```

4. **Update .env**
   ```bash
   DATABASE_URL="postgresql://scaling_up_user:your_secure_password@localhost:5432/scaling_up_v2?schema=public"
   ```

---

## Option 2: Docker Compose (Recommended for Team Consistency)

### Setup

1. **Verify Docker is Running**
   ```powershell
   docker --version
   docker-compose --version
   ```

2. **Use Existing docker-compose.yml**
   The V1 repo already includes a `docker-compose.yml`. Let's enhance it for V2:

   ```yaml
   # Located at: D:\The CTO Project\Scaling Up Platform v2\src\docker-compose.yml
   version: '3.8'
   
   services:
     postgres:
       image: postgres:15-alpine
       container_name: scaling-up-db
       environment:
         POSTGRES_USER: scaling_up_user
         POSTGRES_PASSWORD: scaling_up_password
         POSTGRES_DB: scaling_up_v2
       ports:
         - "5432:5432"
       volumes:
         - postgres_data:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U scaling_up_user"]
         interval: 10s
         timeout: 5s
         retries: 5
     
     redis:
       image: redis:7-alpine
       container_name: scaling-up-redis
       ports:
         - "6379:6379"
       volumes:
         - redis_data:/data
       healthcheck:
         test: ["CMD", "redis-cli", "ping"]
         interval: 10s
         timeout: 5s
         retries: 5
   
   volumes:
     postgres_data:
     redis_data:
   ```

3. **Start Services**
   ```powershell
   cd "D:\The CTO Project\Scaling Up Platform v2\src"
   docker-compose up -d
   
   # Check status
   docker-compose ps
   
   # View logs
   docker-compose logs -f postgres
   ```

4. **Update .env**
   ```bash
   DATABASE_URL="postgresql://scaling_up_user:scaling_up_password@localhost:5432/scaling_up_v2?schema=public"
   REDIS_URL="redis://localhost:6379"
   ```

5. **Stop Services (when needed)**
   ```powershell
   docker-compose down          # Stop and remove containers
   docker-compose down -v       # Also remove volumes (CAUTION: deletes data)
   ```

---

## Option 3: Supabase (Cloud PostgreSQL - Free Tier)

### Setup

1. **Create Supabase Project**
   - Go to https://supabase.com
   - Sign up / Log in
   - Click "New Project"
   - Name: `scaling-up-v2`
   - Database Password: Generate strong password
   - Region: Choose closest to you

2. **Get Connection String**
   - Go to Project Settings → Database
   - Copy "Connection string" under "Connection pooling"
   - Format: `postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

3. **Update .env**
   ```bash
   DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
   ```

4. **Update Prisma Schema**
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")  // Add this for migrations
   }
   ```

---

## Option 4: Neon (Serverless PostgreSQL - Free Tier)

### Setup

1. **Create Neon Project**
   - Go to https://neon.tech
   - Sign up / Log in
   - Create new project: `scaling-up-v2`
   - Region: Choose closest

2. **Get Connection String**
   - Dashboard shows connection string automatically
   - Format: `postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require`

3. **Update .env**
   ```bash
   DATABASE_URL="postgresql://[user]:[password]@[endpoint].neon.tech/scaling_up_v2?sslmode=require"
   ```

---

## Recommended Approach for This Project

**Development (Local):** Docker Compose
- ✅ Consistent across team
- ✅ Includes Redis for caching
- ✅ Easy to reset/rebuild
- ✅ No external dependencies

**Staging/Production:** Supabase or Neon
- ✅ Managed backups
- ✅ Connection pooling
- ✅ Monitoring included
- ✅ Free tier sufficient for MVP

---

## Next Steps After Database Setup

1. **Create .env.local**
   ```powershell
   cd "D:\The CTO Project\Scaling Up Platform v2\src"
   cp .env.example .env.local
   # Edit .env.local with your DATABASE_URL
   ```

2. **Run Prisma Migrations**
   ```powershell
   npx prisma migrate dev --name init_v2_schema
   ```

3. **Generate Prisma Client**
   ```powershell
   npx prisma generate
   ```

4. **Verify Connection**
   ```powershell
   npx prisma studio
   # Opens browser at http://localhost:5555
   ```

---

*Choose the option that best fits your workflow and proceed to the next steps.*
