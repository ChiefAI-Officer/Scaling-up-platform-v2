/**
 * API Validation Script
 * Run this on Day 1 to validate all external API connections
 * 
 * Usage: npx tsx scripts/validate-apis.ts
 */

import 'dotenv/config';

interface ValidationResult {
    service: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    message: string;
    data?: unknown;
}

const results: ValidationResult[] = [];

// =============================================
// Circle.so Validation (CRITICAL - Untested key)
// =============================================
async function validateCircleSo(): Promise<ValidationResult> {
    const apiKey = process.env.CIRCLE_API_KEY;

    if (!apiKey) {
        return {
            service: 'Circle.so',
            status: 'SKIPPED',
            message: 'CIRCLE_API_KEY not set in environment'
        };
    }

    try {
        // Test API by fetching community info
        const response = await fetch('https://app.circle.so/api/v1/me', {
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return {
                service: 'Circle.so',
                status: 'SUCCESS',
                message: 'API key validated successfully',
                data: { email: data.email, name: data.name }
            };
        } else {
            const error = await response.text();
            return {
                service: 'Circle.so',
                status: 'FAILED',
                message: `API returned ${response.status}: ${error}`
            };
        }
    } catch (error) {
        return {
            service: 'Circle.so',
            status: 'FAILED',
            message: `Connection error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// =============================================
// HubSpot Validation
// =============================================
async function validateHubSpot(): Promise<ValidationResult> {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;

    if (!accessToken) {
        return {
            service: 'HubSpot',
            status: 'SKIPPED',
            message: 'HUBSPOT_ACCESS_TOKEN not set in environment'
        };
    }

    try {
        const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            return {
                service: 'HubSpot',
                status: 'SUCCESS',
                message: 'Access token validated successfully'
            };
        } else {
            const error = await response.text();
            return {
                service: 'HubSpot',
                status: 'FAILED',
                message: `API returned ${response.status}: ${error}`
            };
        }
    } catch (error) {
        return {
            service: 'HubSpot',
            status: 'FAILED',
            message: `Connection error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// =============================================
// Stripe Validation
// =============================================
async function validateStripe(): Promise<ValidationResult> {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
        return {
            service: 'Stripe',
            status: 'SKIPPED',
            message: 'STRIPE_SECRET_KEY not set in environment'
        };
    }

    try {
        const response = await fetch('https://api.stripe.com/v1/balance', {
            headers: {
                'Authorization': `Bearer ${secretKey}`,
            }
        });

        if (response.ok) {
            return {
                service: 'Stripe',
                status: 'SUCCESS',
                message: 'Secret key validated successfully'
            };
        } else {
            const error = await response.text();
            return {
                service: 'Stripe',
                status: 'FAILED',
                message: `API returned ${response.status}: ${error}`
            };
        }
    } catch (error) {
        return {
            service: 'Stripe',
            status: 'FAILED',
            message: `Connection error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// =============================================
// Database Validation
// =============================================
async function validateDatabase(): Promise<ValidationResult> {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        return {
            service: 'PostgreSQL',
            status: 'SKIPPED',
            message: 'DATABASE_URL not set in environment'
        };
    }

    try {
        // Dynamic import to avoid build errors if Prisma not set up
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        await prisma.$queryRaw`SELECT 1`;
        await prisma.$disconnect();

        return {
            service: 'PostgreSQL',
            status: 'SUCCESS',
            message: 'Database connection validated'
        };
    } catch (error) {
        return {
            service: 'PostgreSQL',
            status: 'FAILED',
            message: `Connection error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// =============================================
// Run All Validations
// =============================================
async function main() {
    console.log('\n========================================');
    console.log('  Scaling Up Platform v2 - API Validation');
    console.log('========================================\n');

    console.log('Validating Circle.so (CRITICAL)...');
    results.push(await validateCircleSo());

    console.log('Validating HubSpot...');
    results.push(await validateHubSpot());

    console.log('Validating Stripe...');
    results.push(await validateStripe());

    console.log('Validating Database...');
    results.push(await validateDatabase());

    // Summary
    console.log('\n========================================');
    console.log('  VALIDATION RESULTS');
    console.log('========================================\n');

    let hasFailures = false;

    for (const result of results) {
        const icon = result.status === 'SUCCESS' ? '✅' : result.status === 'FAILED' ? '❌' : '⏭️';
        console.log(`${icon} ${result.service}: ${result.status}`);
        console.log(`   ${result.message}`);
        if (result.data) {
            console.log(`   Data: ${JSON.stringify(result.data)}`);
        }
        console.log('');

        if (result.status === 'FAILED') hasFailures = true;
    }

    if (hasFailures) {
        console.log('⚠️  Some validations FAILED. Fix before proceeding.\n');
        process.exit(1);
    } else {
        console.log('✅ All validations passed. Ready to proceed.\n');
        process.exit(0);
    }
}

main().catch(console.error);
