/**
 * patch-solo-landing-logo-template.ts  (one-off, guarded)
 *
 * #18 — swap the prod SOLO_LANDING PageTemplate.customHtml from the old
 * CSS-quadrant logo to the official white no-tagline SU logo (inline data-URI).
 *
 * SAFETY: only overwrites a template whose current customHtml hashes EXACTLY to
 * sanitize(old-starter) — proving it's the unmodified pasted starter, so the
 * swap to sanitize(new-starter) is a pure logo change. Diverged rows are
 * reported and LEFT UNTOUCHED. Backs up old values first; CAS-writes on
 * updatedAt. Default = dry-run. Prod write needs --apply --i-know-this-is-prod.
 */
import { PrismaClient } from "@prisma/client";
import { sanitizeCustomHtml } from "@/lib/templates/sanitize-custom-html";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OVERRIDE = process.argv.includes("--i-know-this-is-prod");
const NEW_PATH = process.argv.find((a) => a.startsWith("--new="))?.slice(6);
const OLD_PATH = process.argv.find((a) => a.startsWith("--old="))?.slice(6);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const db = new PrismaClient();

(async () => {
  if (!NEW_PATH || !OLD_PATH) throw new Error("pass --new=<path> --old=<path>");
  const newSan = sanitizeCustomHtml(readFileSync(NEW_PATH, "utf8"));
  const oldSan = sanitizeCustomHtml(readFileSync(OLD_PATH, "utf8"));

  if (newSan.strippedTags.length || newSan.strippedAttrs.length)
    throw new Error("sanitizer stripped NEW starter: " + JSON.stringify({ t: newSan.strippedTags, a: newSan.strippedAttrs }));
  if (!newSan.sanitized.includes("data:image/svg+xml;base64,")) throw new Error("NEW lost data-URI logo");
  if (newSan.sanitized.includes("su-mark-q")) throw new Error("NEW still has old quadrant logo");

  const oldSha = sha(oldSan.sanitized);
  const newSha = sha(newSan.sanitized);
  console.log(`oldSanitized: sha=${oldSha.slice(0, 12)} len=${oldSan.sanitized.length}`);
  console.log(`newSanitized: sha=${newSha.slice(0, 12)} len=${newSan.sanitized.length}`);

  const tpls = await db.pageTemplate.findMany({
    where: { templateType: "SOLO_LANDING" },
    select: { id: true, name: true, isActive: true, customHtml: true, updatedAt: true },
  });

  const backup = { kind: "solo-landing-template-logo-patch", createdAtFromArg: APPLY, entries: [] as Record<string, unknown>[] };
  const toWrite: typeof tpls = [];
  for (const t of tpls) {
    const cur = t.customHtml ?? "";
    const curSha = sha(cur);
    const matchesOld = curSha === oldSha;
    const alreadyNew = curSha === newSha;
    console.log(`\n[${t.isActive ? "ACTIVE  " : "inactive"}] ${t.id} "${t.name}" curSha=${curSha.slice(0, 12)} matchesOldStarter=${matchesOld} alreadyNew=${alreadyNew}`);
    if (alreadyNew) { console.log("  -> already new logo, skip"); continue; }
    if (!matchesOld) { console.log(`  -> DIVERGED from known old starter; NOT overwriting. hasOldLogo=${cur.includes("su-mark-q")} len=${cur.length}`); continue; }
    toWrite.push(t);
    backup.entries.push({ id: t.id, name: t.name, oldCustomHtml: cur, oldSha: curSha, oldUpdatedAt: t.updatedAt.toISOString(), newSha });
  }

  console.log(`\n${toWrite.length} template(s) eligible to update (all matched old starter exactly).`);
  if (!APPLY) { console.log("DRY-RUN — no writes. Re-run with --apply --i-know-this-is-prod to write."); await db.$disconnect(); return; }

  const host = (process.env.DATABASE_URL || "").replace(/.*@/, "").replace(/[:/].*/, "");
  const isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(host);
  if (!isLocal && !OVERRIDE) throw new Error(`Refusing to write to non-local host "${host}" without --i-know-this-is-prod`);

  const backupPath = `backup-solo-template-logo-${newSha.slice(0, 8)}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`backup written: ${backupPath} (${backup.entries.length} entries)`);

  let updated = 0, skipped = 0;
  for (const t of toWrite) {
    const res = await db.pageTemplate.updateMany({ where: { id: t.id, updatedAt: t.updatedAt }, data: { customHtml: newSan.sanitized } });
    if (res.count === 0) { skipped++; console.log(`  SKIP concurrent-edit ${t.id}`); continue; }
    updated++; console.log(`  UPDATED ${t.id} "${t.name}"`);
  }
  console.log(`\nDONE updated=${updated} skipped=${skipped} backup=${backupPath}`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
