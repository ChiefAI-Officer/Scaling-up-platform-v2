/**
 * Password Hashing Migration Script
 * Hashes existing user passwords for production security
 * Run once: npx tsx scripts/hash-passwords.ts
 */

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const db = new PrismaClient();

async function hashPasswords() {
  console.log("🔐 Starting password hashing migration...\n");

  try {
    // Get all users without hashed passwords
    const users = await db.user.findMany({
      where: {
        OR: [
          { passwordHash: null },
          { passwordHash: "" }
        ]
      }
    });

    if (users.length === 0) {
      console.log("✅ All users already have hashed passwords!");
      return;
    }

    console.log(`Found ${users.length} users without hashed passwords:\n`);

    // Default password for demo/development
    const defaultPassword = "demo123";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    let updated = 0;
    let errors = 0;

    for (const user of users) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { passwordHash: hashedPassword }
        });

        console.log(`✅ ${user.email} - Password hashed`);
        updated++;
      } catch (error) {
        console.error(`❌ ${user.email} - Error:`, error);
        errors++;
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Updated: ${updated} users`);
    if (errors > 0) {
      console.log(`   ❌ Errors: ${errors} users`);
    }
    console.log(`\n⚠️  Default password set to: "${defaultPassword}"`);
    console.log(`   Users should change their password after first login.\n`);

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// Run the migration
hashPasswords()
  .then(() => {
    console.log("✅ Password hashing migration complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
