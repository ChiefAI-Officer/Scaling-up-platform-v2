#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Load Testing Script for Scaling Up Platform v2
 * 
 * Target: 200+ workshops capacity
 * Tests: API endpoints, landing pages, registration flow
 * 
 * Usage:
 *   node scripts/load-test.js --target http://localhost:3000 --duration 60 --concurrency 50
 * 
 * Requirements:
 *   npm install -g autocannon
 *   OR run: npx autocannon [options]
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration
const config = {
    target: process.env.LOAD_TEST_TARGET || "http://localhost:3000",
    duration: parseInt(process.env.LOAD_TEST_DURATION) || 30,
    concurrency: parseInt(process.env.LOAD_TEST_CONCURRENCY) || 50,
    pipelining: 10,
};

// Test scenarios
const scenarios = [
    {
        name: "Landing Page Load",
        path: "/workshop/test-workshop-slug",
        method: "GET",
        expectedRps: 500,
        description: "Simulates 200+ concurrent landing page views",
    },
    {
        name: "API - Get Approvals",
        path: "/api/approvals?status=PENDING",
        method: "GET",
        headers: {
            Authorization: "Bearer test-token",
        },
        expectedRps: 200,
        description: "Admin approval queue queries",
    },
    {
        name: "API - Workshop List",
        path: "/api/workshops",
        method: "GET",
        headers: {
            Authorization: "Bearer test-token",
        },
        expectedRps: 300,
        description: "Dashboard workshop listing",
    },
    {
        name: "API - Create Registration",
        path: "/api/registrations",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            workshopId: "test-ws-1",
            firstName: "Load",
            lastName: "Test",
            email: `loadtest+${Date.now()}@example.com`,
        }),
        expectedRps: 100,
        description: "Registration submissions during peak",
    },
    {
        name: "Static Assets",
        path: "/_next/static/chunks/main.js",
        method: "GET",
        expectedRps: 1000,
        description: "CDN/static file serving",
    },
];

// Results storage
const results = [];

/**
 * Run autocannon load test
 */
async function runAutocannon(scenario) {
    return new Promise((resolve) => {
        const url = `${config.target}${scenario.path}`;
        
        const args = [
            "-d", config.duration.toString(),
            "-c", config.concurrency.toString(),
            "-p", config.pipelining.toString(),
            "-m", scenario.method,
            "--json",
        ];

        if (scenario.headers) {
            Object.entries(scenario.headers).forEach(([key, value]) => {
                args.push("-H", `${key}: ${value}`);
            });
        }

        if (scenario.body) {
            args.push("-b", scenario.body);
        }

        args.push(url);

        console.log(`\n📊 Running: ${scenario.name}`);
        console.log(`   Target: ${url}`);
        console.log(`   Duration: ${config.duration}s, Concurrency: ${config.concurrency}`);

        const child = spawn("npx", ["autocannon", ...args], {
            stdio: ["inherit", "pipe", "inherit"],
            shell: true,
        });

        let output = "";
        child.stdout.on("data", (data) => {
            output += data.toString();
        });

        child.on("close", (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(output);
                    resolve({
                        scenario: scenario.name,
                        description: scenario.description,
                        expectedRps: scenario.expectedRps,
                        ...result,
                    });
                } catch {
                    resolve({
                        scenario: scenario.name,
                        error: "Failed to parse results",
                        raw: output,
                    });
                }
            } else {
                resolve({
                    scenario: scenario.name,
                    error: `Exit code ${code}`,
                });
            }
        });

        child.on("error", (err) => {
            resolve({
                scenario: scenario.name,
                error: err.message,
            });
        });
    });
}

/**
 * Generate load test report
 */
function generateReport(results) {
    const report = {
        timestamp: new Date().toISOString(),
        config,
        summary: {
            total: results.length,
            passed: 0,
            failed: 0,
        },
        results: [],
    };

    results.forEach((result) => {
        const passed = result.requests?.average >= result.expectedRps * 0.8;
        if (passed) report.summary.passed++;
        else report.summary.failed++;

        report.results.push({
            name: result.scenario,
            description: result.description,
            expectedRps: result.expectedRps,
            actualRps: result.requests?.average || 0,
            latencyP50: result.latency?.p50 || 0,
            latencyP99: result.latency?.p99 || 0,
            errors: result.errors || 0,
            passed,
        });
    });

    return report;
}

/**
 * Print report to console
 */
function printReport(report) {
    console.log("\n" + "=".repeat(70));
    console.log("  LOAD TEST REPORT - Scaling Up Platform v2");
    console.log("=".repeat(70));
    console.log(`\nTimestamp: ${report.timestamp}`);
    console.log(`Target: ${report.config.target}`);
    console.log(`Duration: ${report.config.duration}s per test`);
    console.log(`Concurrency: ${report.config.concurrency}`);
    console.log(`\nSummary: ${report.summary.passed}/${report.summary.total} passed\n`);

    report.results.forEach((r) => {
        const icon = r.passed ? "✅" : "❌";
        console.log(`${icon} ${r.name}`);
        console.log(`   Expected: ${r.expectedRps} RPS | Actual: ${r.actualRps.toFixed(0)} RPS`);
        console.log(`   Latency: p50=${r.latencyP50}ms, p99=${r.latencyP99}ms`);
        console.log(`   Errors: ${r.errors}`);
        console.log("");
    });

    console.log("=".repeat(70));

    if (report.summary.failed > 0) {
        console.log("⚠️  Some tests did not meet expected RPS thresholds.");
        console.log("    Consider optimizing or scaling infrastructure.\n");
    } else {
        console.log("✅ All load tests passed!\n");
    }
}

/**
 * Main execution
 */
async function main() {
    console.log("🚀 Starting Load Tests for Scaling Up Platform v2");
    console.log(`   Target: ${config.target}`);

    // Check if autocannon is available
    try {
        execSync("npx autocannon --version", { stdio: "ignore" });
    } catch {
        console.error("❌ autocannon is required. Install with: npm install -g autocannon");
        process.exit(1);
    }

    // Run each scenario
    for (const scenario of scenarios) {
        const result = await runAutocannon(scenario);
        results.push(result);
    }

    // Generate and print report
    const report = generateReport(results);
    printReport(report);

    // Save report to file
    const reportPath = path.join(__dirname, "..", "load-test-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📁 Report saved to: ${reportPath}`);

    // Exit with error if any tests failed
    process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error("Load test failed:", err);
    process.exit(1);
});
