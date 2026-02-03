import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

// Hardcoded path to the CSV file provided by user
const CSV_PATH = String.raw`D:\The CTO Project\Scaling Up Platform v2\docs\Kajabi Exported Contacts\site_2148726018_contacts_42cdb06a-0cbd-4833-958b-c04d3f7ebe31_complete.csv`;

// Helper to parse CSV line respecting quotes
function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            // Check for escaped quotes (quote followed by quote)
            if (insideQuotes && line[i + 1] === '"') {
                currentValue += '"';
                i++; // Skip next quote
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            values.push(currentValue);
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    values.push(currentValue);
    // Trim values and remove surrounding quotes
    return values.map(v => {
        let val = v.trim();
        if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
        }
        return val.trim();
    });
}

async function main() {
    console.log(`Starting import from: ${CSV_PATH}`);

    if (!fs.existsSync(CSV_PATH)) {
        console.error("❌ File not found at path: " + CSV_PATH);
        process.exit(1);
    }

    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    if (lines.length < 2) {
        console.error("❌ CSV file is empty or missing headers");
        process.exit(1);
    }

    const headers = parseCSVLine(lines[0]);
    console.log("Headers found:", headers);

    // Map header names to indices
    const idx = {
        name: headers.indexOf('Name'),
        firstName: headers.indexOf('First Name'),
        lastName: headers.indexOf('Last Name'),
        email: headers.indexOf('Email'),
        products: headers.indexOf('Products'),
        tags: headers.indexOf('Tags'),
        memberId: headers.indexOf('Member ID'),
        createdAt: headers.indexOf('Created At'),
        lastActivity: headers.indexOf('Last Activity'),
    };

    if (idx.email === -1) {
        console.error("❌ Could not find 'Email' column in CSV");
        process.exit(1);
    }

    console.log(`Found ${lines.length - 1} contacts to process.`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // Skip empty lines
        if (!line.trim()) continue;

        try {
            const cols = parseCSVLine(line);
            const email = cols[idx.email];

            if (!email) {
                console.warn(`Skipping row ${i + 1}: Missing email`);
                errorCount++;
                continue;
            }

            const products = idx.products > -1 ? cols[idx.products] : '';
            // Logic: If they have products, they are subscribed. Or default to 'Subscribed' if ambiguous?
            // User screenshot shows 'Subscribed', 'Never subscribed'. 
            // We'll assume if they have purchased (Products exists) OR have positive tags, they are likely engaged.
            // Let's rely on checking if "Products" is non-empty for 'Subscribed' status for now.
            const isSubscribed = (products && products.length > 0) ? "Subscribed" : "Never subscribed";

            const addedAtStr = idx.createdAt > -1 ? cols[idx.createdAt] : null;
            const lastActivityStr = idx.lastActivity > -1 ? cols[idx.lastActivity] : null;

            const addedAt = addedAtStr ? new Date(addedAtStr) : new Date();
            const lastActivity = lastActivityStr ? new Date(lastActivityStr) : null;

            const validAddedAt = isNaN(addedAt.getTime()) ? new Date() : addedAt;
            const validLastActivity = (lastActivity && !isNaN(lastActivity.getTime())) ? lastActivity : null;

            await prisma.contact.upsert({
                where: { email: email.toLowerCase() },
                update: {
                    firstName: idx.firstName > -1 ? cols[idx.firstName] : undefined,
                    lastName: idx.lastName > -1 ? cols[idx.lastName] : undefined,
                    name: idx.name > -1 ? cols[idx.name] : (email.split('@')[0]),
                    tags: idx.tags > -1 ? cols[idx.tags] : undefined,
                    products: products,
                    kajabiId: idx.memberId > -1 ? cols[idx.memberId] : undefined,
                    lastActivityAt: validLastActivity,
                    emailMarketing: isSubscribed,
                    // Don't overwrite LTV on update if we don't have better data
                },
                create: {
                    email: email.toLowerCase(),
                    name: idx.name > -1 ? cols[idx.name] : (email.split('@')[0]),
                    firstName: idx.firstName > -1 ? cols[idx.firstName] : undefined,
                    lastName: idx.lastName > -1 ? cols[idx.lastName] : undefined,
                    tags: idx.tags > -1 ? cols[idx.tags] : undefined,
                    products: products,
                    kajabiId: idx.memberId > -1 ? cols[idx.memberId] : undefined,
                    addedAt: validAddedAt,
                    lastActivityAt: validLastActivity,
                    emailMarketing: isSubscribed,
                    lifetimeValue: 0.0, // Default to 0
                }
            });
            successCount++;
            if (successCount % 50 === 0) process.stdout.write('.');
        } catch (err) {
            console.error(`Error processing row ${i + 1}:`, err);
            errorCount++;
        }
    }

    console.log(`\nImport complete!`);
    console.log(`✅ Successfully imported/updated: ${successCount}`);
    console.log(`❌ Failed rows: ${errorCount}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
