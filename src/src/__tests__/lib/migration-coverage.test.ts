import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const PRISMA_ROOT = join(__dirname, "../../../prisma");

function getSchemaModels(): { model: string; table: string }[] {
  const schema = readFileSync(join(PRISMA_ROOT, "schema.prisma"), "utf-8");
  const models: { model: string; table: string }[] = [];
  const modelRegex = /^model\s+(\w+)\s*\{/gm;
  const mapRegex = /@@map\("([^"]+)"\)/;
  let match;
  while ((match = modelRegex.exec(schema)) !== null) {
    const modelName = match[1];
    const blockStart = match.index;
    const blockEnd = schema.indexOf("\n}", blockStart) + 2;
    const block = schema.slice(blockStart, blockEnd);
    const mapMatch = mapRegex.exec(block);
    const tableName = mapMatch ? mapMatch[1] : modelName.toLowerCase() + "s";
    models.push({ model: modelName, table: tableName });
  }
  return models;
}

function getMigrationSQL(): string {
  const migrationsDir = join(PRISMA_ROOT, "migrations");
  const entries = readdirSync(migrationsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      try {
        return readFileSync(
          join(migrationsDir, e.name, "migration.sql"),
          "utf-8"
        );
      } catch {
        return "";
      }
    })
    .join("\n");
}

describe("Prisma migration coverage", () => {
  it("every schema model has a CREATE TABLE in migration files", () => {
    const models = getSchemaModels();
    const sql = getMigrationSQL().toLowerCase();
    const missing = models.filter(
      ({ table }) =>
        !sql.includes(`create table "${table}"`) &&
        !sql.includes(`create table if not exists "${table}"`)
    );
    if (missing.length > 0) {
      console.log(
        "Missing from migrations:",
        missing.map((m) => m.table).join(", ")
      );
    }
    expect(missing).toEqual([]);
  });
});
