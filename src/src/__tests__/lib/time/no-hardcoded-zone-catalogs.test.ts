import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

function runtimeTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || fullPath.endsWith(join("lib", "time"))) return [];
      return runtimeTypeScriptFiles(fullPath);
    }
    return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

it("keeps IANA zone catalogs out of UI surfaces", () => {
  const sourceRoot = resolve(process.cwd(), "src");
  const offenders = runtimeTypeScriptFiles(sourceRoot)
    .filter((file) => readFileSync(file, "utf8").includes("America/Chicago"))
    .map((file) => relative(sourceRoot, file));
  expect(offenders).toEqual([]);
});
