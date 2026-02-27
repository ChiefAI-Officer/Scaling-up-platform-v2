#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Security Audit Script for Scaling Up Platform v2
 * 
 * Performs automated security checks:
 * - Dependency vulnerabilities
 * - Environment variable exposure
 * - API security headers
 * - Rate limiting verification
 * - Input validation coverage
 * 
 * Usage:
 *   node scripts/security-audit.js
 *   node scripts/security-audit.js --target http://localhost:3000
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Configuration
const config = {
    target: process.env.SECURITY_TARGET || "http://localhost:3000",
    verbose: process.argv.includes("--verbose"),
};

// Results
const results = {
    passed: [],
    warnings: [],
    failed: [],
};

function log(message, type = "info") {
    const icons = {
        pass: "✅",
        warn: "⚠️",
        fail: "❌",
        info: "ℹ️",
    };
    console.log(`${icons[type] || ""} ${message}`);
}

function addResult(category, check, status, details = "") {
    const result = { category, check, details };
    
    if (status === "pass") {
        results.passed.push(result);
        log(`${check}: PASS${details ? ` - ${details}` : ""}`, "pass");
    } else if (status === "warn") {
        results.warnings.push(result);
        log(`${check}: WARNING${details ? ` - ${details}` : ""}`, "warn");
    } else {
        results.failed.push(result);
        log(`${check}: FAIL${details ? ` - ${details}` : ""}`, "fail");
    }
}

// ============================================================
// CHECK 1: Dependency Vulnerabilities
// ============================================================
async function checkDependencies() {
    console.log("\n📦 Checking Dependencies...\n");
    
    try {
        const output = execSync("npm audit --json", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        
        const audit = JSON.parse(output);
        const vulnerabilities = audit.metadata?.vulnerabilities || {};
        
        const critical = vulnerabilities.critical || 0;
        const high = vulnerabilities.high || 0;
        const moderate = vulnerabilities.moderate || 0;
        
        if (critical > 0) {
            addResult("Dependencies", "Critical vulnerabilities", "fail", `${critical} critical`);
        } else {
            addResult("Dependencies", "No critical vulnerabilities", "pass");
        }
        
        if (high > 0) {
            addResult("Dependencies", "High vulnerabilities", "warn", `${high} high`);
        } else {
            addResult("Dependencies", "No high vulnerabilities", "pass");
        }
        
        if (moderate > 0) {
            addResult("Dependencies", "Moderate vulnerabilities", "warn", `${moderate} moderate`);
        } else {
            addResult("Dependencies", "No moderate vulnerabilities", "pass");
        }
        
    } catch (error) {
        // npm audit returns non-zero if vulnerabilities found
        try {
            const audit = JSON.parse(error.stdout);
            const vulns = audit.metadata?.vulnerabilities || {};
            
            if (vulns.critical > 0) {
                addResult("Dependencies", "Critical vulnerabilities", "fail", `${vulns.critical} critical`);
            }
            if (vulns.high > 0) {
                addResult("Dependencies", "High vulnerabilities", "warn", `${vulns.high} high`);
            }
        } catch {
            addResult("Dependencies", "npm audit", "warn", "Could not parse audit results");
        }
    }
}

// ============================================================
// CHECK 2: Environment Variable Exposure
// ============================================================
async function checkEnvExposure() {
    console.log("\n🔐 Checking Environment Security...\n");
    
    // Check .env is gitignored
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, "utf-8");
        if (gitignore.includes(".env")) {
            addResult("Environment", ".env in .gitignore", "pass");
        } else {
            addResult("Environment", ".env in .gitignore", "fail", ".env not gitignored!");
        }
    }
    
    // Check for secrets in source code
    const sensitivePatterns = [
        /sk_live_[a-zA-Z0-9]+/g,           // Stripe live key
        /sk_test_[a-zA-Z0-9]+/g,           // Stripe test key
        /ANTHROPIC_API_KEY\s*=\s*sk-/g,    // Anthropic key
        /OPENAI_API_KEY\s*=\s*sk-/g,       // OpenAI key
        /password\s*[:=]\s*["'][^"']+["']/gi, // Hardcoded passwords
    ];
    
    const srcDir = path.join(process.cwd(), "src");
    let foundSecrets = false;
    
    function scanDirectory(dir) {
        if (!fs.existsSync(dir)) return;
        
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                if (!file.includes("node_modules") && !file.startsWith(".")) {
                    scanDirectory(filePath);
                }
            } else if (file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js")) {
                const normalizedPath = filePath.replace(/\\/g, "/");
                const isTestFile =
                    normalizedPath.includes("/__tests__/") ||
                    normalizedPath.endsWith(".test.ts") ||
                    normalizedPath.endsWith(".test.tsx") ||
                    normalizedPath.endsWith(".spec.ts") ||
                    normalizedPath.endsWith(".spec.tsx");

                if (isTestFile) {
                    continue;
                }

                const content = fs.readFileSync(filePath, "utf-8");
                for (const pattern of sensitivePatterns) {
                    if (pattern.test(content)) {
                        foundSecrets = true;
                        addResult("Environment", `Potential secret in ${file}`, "fail", "Review file");
                    }
                }
            }
        }
    }
    
    scanDirectory(srcDir);
    
    if (!foundSecrets) {
        addResult("Environment", "No hardcoded secrets in source", "pass");
    }
    
    // Check .env.example exists
    if (fs.existsSync(path.join(process.cwd(), ".env.example"))) {
        addResult("Environment", ".env.example provided", "pass");
    } else {
        addResult("Environment", ".env.example provided", "warn", "Missing example env file");
    }
}

// ============================================================
// CHECK 3: Security Headers (if server running)
// ============================================================
async function checkSecurityHeaders() {
    console.log("\n🛡️ Checking Security Headers...\n");
    
    const requiredHeaders = [
        { name: "X-Frame-Options", expected: ["DENY", "SAMEORIGIN"] },
        { name: "X-Content-Type-Options", expected: ["nosniff"] },
        { name: "Referrer-Policy", expected: ["strict-origin", "strict-origin-when-cross-origin", "no-referrer"] },
        { name: "X-XSS-Protection", expected: ["1; mode=block", "0"] },
    ];
    
    return new Promise((resolve) => {
        const url = new URL(config.target);
        const protocol = url.protocol === "https:" ? https : http;
        
        const req = protocol.get(config.target, { timeout: 5000 }, (res) => {
            for (const header of requiredHeaders) {
                const value = res.headers[header.name.toLowerCase()];
                
                if (value && header.expected.some(exp => value.toLowerCase().includes(exp.toLowerCase()))) {
                    addResult("Headers", header.name, "pass", value);
                } else if (value) {
                    addResult("Headers", header.name, "warn", `Unexpected: ${value}`);
                } else {
                    addResult("Headers", header.name, "warn", "Not set");
                }
            }
            
            // Check for HSTS on HTTPS
            if (url.protocol === "https:") {
                const hsts = res.headers["strict-transport-security"];
                if (hsts) {
                    addResult("Headers", "HSTS", "pass", hsts);
                } else {
                    addResult("Headers", "HSTS", "warn", "Not set");
                }
            }
            
            resolve();
        });
        
        req.on("error", () => {
            addResult("Headers", "Server reachable", "warn", "Server not running - skipping header checks");
            resolve();
        });
        
        req.on("timeout", () => {
            req.destroy();
            addResult("Headers", "Server reachable", "warn", "Timeout - skipping header checks");
            resolve();
        });
    });
}

// ============================================================
// CHECK 4: Input Validation (Zod Usage)
// ============================================================
async function checkInputValidation() {
    console.log("\n✅ Checking Input Validation...\n");
    
    const apiDir = path.join(process.cwd(), "src", "app", "api");
    let zodCount = 0;
    let routeCount = 0;
    
    function scanApiRoutes(dir) {
        if (!fs.existsSync(dir)) return;
        
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                scanApiRoutes(filePath);
            } else if (file === "route.ts" || file === "route.tsx") {
                routeCount++;
                const content = fs.readFileSync(filePath, "utf-8");
                const normalizedPath = filePath.replace(/\\/g, "/");
                
                // Check for Zod patterns - including imports from validations
                const hasZod = 
                    content.includes("from \"zod\"") ||
                    content.includes("from 'zod'") ||
                    content.includes("z.object") ||
                    content.includes(".safeParse") ||
                    content.includes(".parse(") ||
                    content.includes("validations") ||
                    content.includes("Schema");
                
                // Skip system routes that don't need validation
                const isSystemRoute = 
                    normalizedPath.includes("/auth/") ||
                    normalizedPath.includes("/health") ||
                    normalizedPath.includes("/docs") ||
                    normalizedPath.includes("/inngest") ||
                    normalizedPath.includes("/debug-auth/") ||
                    normalizedPath.includes("/webhooks/stripe"); // Stripe validates via signature
                
                if (hasZod || isSystemRoute) {
                    zodCount++;
                }
            }
        }
    }
    
    scanApiRoutes(apiDir);
    
    if (routeCount === 0) {
        addResult("Validation", "API routes found", "warn", "No API routes detected");
    } else {
        const coverage = Math.round((zodCount / routeCount) * 100);
        
        if (coverage >= 80) {
            addResult("Validation", "Zod validation coverage", "pass", `${coverage}% (${zodCount}/${routeCount} routes)`);
        } else if (coverage >= 50) {
            addResult("Validation", "Zod validation coverage", "warn", `${coverage}% (${zodCount}/${routeCount} routes)`);
        } else {
            addResult("Validation", "Zod validation coverage", "fail", `Only ${coverage}% (${zodCount}/${routeCount} routes)`);
        }
    }
}

// ============================================================
// CHECK 5: Rate Limiting
// ============================================================
async function checkRateLimiting() {
    console.log("\n⏱️ Checking Rate Limiting...\n");
    
    // Check if rate limit code exists
    const rateLimitPath = path.join(process.cwd(), "src", "lib", "rate-limit.ts");
    
    if (fs.existsSync(rateLimitPath)) {
        addResult("Rate Limiting", "Rate limit module exists", "pass");
        
        const content = fs.readFileSync(rateLimitPath, "utf-8");
        
        // Check for key features
        if (content.includes("Redis") || content.includes("ioredis")) {
            addResult("Rate Limiting", "Uses Redis (distributed)", "pass");
        } else if (content.includes("Map") || content.includes("memory")) {
            addResult("Rate Limiting", "Uses in-memory (single instance only)", "warn");
        }
        
        if (content.includes("429")) {
            addResult("Rate Limiting", "Returns 429 status", "pass");
        }
    } else {
        addResult("Rate Limiting", "Rate limit module exists", "fail", "No rate-limit.ts found");
    }
    
    // Check if rate limiting is applied in middleware
    const middlewarePath = path.join(process.cwd(), "src", "middleware.ts");
    if (fs.existsSync(middlewarePath)) {
        const content = fs.readFileSync(middlewarePath, "utf-8");
        if (content.includes("rateLimit") || content.includes("rate-limit")) {
            addResult("Rate Limiting", "Applied in middleware", "pass");
        } else {
            addResult("Rate Limiting", "Applied in middleware", "warn", "Consider global rate limiting");
        }
    }
}

// ============================================================
// CHECK 6: Authentication
// ============================================================
async function checkAuthentication() {
    console.log("\n🔑 Checking Authentication...\n");
    
    // Check for NextAuth
    const authPath = path.join(process.cwd(), "src", "lib", "auth.ts");
    const authConfigPath = path.join(process.cwd(), "src", "app", "api", "auth");
    
    if (fs.existsSync(authPath) || fs.existsSync(authConfigPath)) {
        addResult("Authentication", "NextAuth configured", "pass");
    } else {
        addResult("Authentication", "NextAuth configured", "warn", "No auth.ts found");
    }
    
    // Check for protected routes
    const adminPath = path.join(process.cwd(), "src", "app", "admin");
    const portalPath = path.join(process.cwd(), "src", "app", "(portal)");
    
    if (fs.existsSync(adminPath)) {
        const layoutPath = path.join(adminPath, "layout.tsx");
        if (fs.existsSync(layoutPath)) {
            const content = fs.readFileSync(layoutPath, "utf-8");
            if (content.includes("getServerSession") || content.includes("useSession") || content.includes("auth")) {
                addResult("Authentication", "Admin routes protected", "pass");
            } else {
                addResult("Authentication", "Admin routes protected", "warn", "Verify auth check in layout");
            }
        }
    }
    
    if (fs.existsSync(portalPath)) {
        addResult("Authentication", "Portal routes exist", "pass");
    }
}

// ============================================================
// GENERATE REPORT
// ============================================================
function generateReport() {
    console.log("\n" + "=".repeat(70));
    console.log("  SECURITY AUDIT REPORT - Scaling Up Platform v2");
    console.log("=".repeat(70));
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Passed:   ${results.passed.length}`);
    console.log(`   ⚠️  Warnings: ${results.warnings.length}`);
    console.log(`   ❌ Failed:   ${results.failed.length}`);
    
    const total = results.passed.length + results.warnings.length + results.failed.length;
    const score = Math.round((results.passed.length / total) * 100);
    
    console.log(`\n   Score: ${score}%`);
    
    if (results.failed.length > 0) {
        console.log("\n❌ FAILED CHECKS:");
        results.failed.forEach(r => {
            console.log(`   • ${r.category}: ${r.check}${r.details ? ` - ${r.details}` : ""}`);
        });
    }
    
    if (results.warnings.length > 0) {
        console.log("\n⚠️  WARNINGS:");
        results.warnings.forEach(r => {
            console.log(`   • ${r.category}: ${r.check}${r.details ? ` - ${r.details}` : ""}`);
        });
    }
    
    console.log("\n" + "=".repeat(70));
    
    // Save report
    const report = {
        timestamp: new Date().toISOString(),
        target: config.target,
        score,
        summary: {
            passed: results.passed.length,
            warnings: results.warnings.length,
            failed: results.failed.length,
        },
        results: {
            passed: results.passed,
            warnings: results.warnings,
            failed: results.failed,
        },
    };
    
    const reportPath = path.join(process.cwd(), "security-audit-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📁 Report saved to: ${reportPath}\n`);
    
    // Exit code based on results
    if (results.failed.length > 0) {
        process.exit(1);
    }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log("🔒 Starting Security Audit for Scaling Up Platform v2");
    console.log(`   Target: ${config.target}\n`);
    
    await checkDependencies();
    await checkEnvExposure();
    await checkSecurityHeaders();
    await checkInputValidation();
    await checkRateLimiting();
    await checkAuthentication();
    
    generateReport();
}

main().catch((err) => {
    console.error("Security audit failed:", err);
    process.exit(1);
});
