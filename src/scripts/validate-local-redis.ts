/**
 * Local Redis Connection Validation
 */
import 'dotenv/config';
import { Redis } from 'ioredis';

async function validateRedisLocal() {
  console.log('\n========================================');
  console.log('  Local Redis Validation');
  console.log('========================================\n');

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.error('❌ REDIS_URL not found in .env file');
    process.exit(1);
  }

  console.log('Redis URL:', redisUrl.replace(/:[^:@]+@/, ':****@'));

  let client: Redis | null = null;

  try {
    console.log('\nConnecting to Redis...');
    client = new Redis(redisUrl);

    console.log('Test 1: PING');
    const pong = await client.ping();
    console.log('✅ PING returned:', pong);

    console.log('\nTest 2: Write');
    await client.set('test:validation', 'success', 'EX', 10);
    console.log('✅ Write successful');

    console.log('\nTest 3: Read');
    const value = await client.get('test:validation');
    console.log('✅ Read successful, value:', value);

    console.log('\nTest 4: Cleanup');
    await client.del('test:validation');
    console.log('✅ Cleanup successful');

    console.log('\n========================================');
    console.log('✅ Local Redis: READY');
    console.log('========================================\n');

    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Redis failed:', errorMessage);
    if (errorMessage?.includes('NOAUTH')) {
      console.error('🔴 Missing password in REDIS_URL');
    }
    process.exit(1);
  } finally {
    if (client) await client.quit();
  }
}

validateRedisLocal();
