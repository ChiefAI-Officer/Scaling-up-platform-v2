/**
 * Local Inngest Connection Validation
 */
import 'dotenv/config';

async function validateInngestLocal() {
  console.log('\n========================================');
  console.log('  Local Inngest Validation');
  console.log('========================================\n');

  const eventKey = process.env.INNGEST_EVENT_KEY;
  const signingKey = process.env.INNGEST_SIGNING_KEY;

  if (!eventKey || !signingKey) {
    console.error('❌ Inngest keys not found in .env file');
    process.exit(1);
  }

  console.log('Event Key:', eventKey.substring(0, 20) + '...');
  console.log('Signing Key:', signingKey.substring(0, 30) + '...');
  try {
    console.log('\nSending test event to Inngest...');

    const response = await fetch(`https://inn.gs/e/${eventKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'test/validation',
        data: { test: true, timestamp: new Date().toISOString() },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Event sent successfully');
      console.log('   Response:', JSON.stringify(result, null, 2));
      console.log('\n========================================');
      console.log('✅ Local Inngest: READY');
      console.log('========================================\n');
      process.exit(0);
    } else {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Inngest failed:', errorMessage);
    if (errorMessage?.includes('401')) {
      console.error('🔴 Invalid event key');
      console.error('   Next step: refresh INNGEST_EVENT_KEY from Inngest Cloud > Environment > Event Keys');
    }
    process.exit(1);
  }
}

validateInngestLocal();
