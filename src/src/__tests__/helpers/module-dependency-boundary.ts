import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import ts from "typescript";

const PROJECT_ROOT = resolve(process.cwd());
const SOURCE_ROOT = join(PROJECT_ROOT, "src");
const MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

function hasRuntimeImportBindings(
  clause: ts.ImportClause | undefined,
): boolean {
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  if (!clause.namedBindings) return true;
  if (ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function hasRuntimeExportBindings(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return true;
  return node.exportClause.elements.some((element) => !element.isTypeOnly);
}

/**
 * Returns runtime module specifiers in stable order. Type-only imports are
 * intentionally excluded because they are erased and cannot make a renderer
 * reachable in the built route graph.
 */
export function extractModuleSpecifiers(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    "dependency-boundary.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const specifiers = new Set<string>();

  const addStringLiteral = (value: ts.Expression | undefined) => {
    if (
      value &&
      (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
    ) {
      specifiers.add(value.text);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      hasRuntimeImportBindings(node.importClause)
    ) {
      addStringLiteral(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      hasRuntimeExportBindings(node)
    ) {
      addStringLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addStringLiteral(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        addStringLiteral(node.arguments[0]);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...specifiers].sort();
}

function isInsideSourceRoot(path: string): boolean {
  const fromSourceRoot = relative(SOURCE_ROOT, path);
  return (
    fromSourceRoot === "" ||
    (!fromSourceRoot.startsWith(`..${sep}`) &&
      fromSourceRoot !== ".." &&
      !isAbsolute(fromSourceRoot))
  );
}

function moduleCandidates(basePath: string): string[] {
  const candidates: string[] = [];
  const extension = extname(basePath);
  const hasKnownSourceExtension = MODULE_EXTENSIONS.some(
    (candidateExtension) => candidateExtension === extension,
  );

  if (hasKnownSourceExtension) {
    candidates.push(basePath);
    if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
      const withoutExtension = basePath.slice(0, -extension.length);
      candidates.push(
        ...MODULE_EXTENSIONS.map((candidateExtension) =>
          `${withoutExtension}${candidateExtension}`,
        ),
      );
    }
  } else {
    candidates.push(
      ...MODULE_EXTENSIONS.map((candidateExtension) =>
        `${basePath}${candidateExtension}`,
      ),
      ...MODULE_EXTENSIONS.map((candidateExtension) =>
        join(basePath, `index${candidateExtension}`),
      ),
    );
  }

  return [...new Set(candidates)];
}

function resolveRepoLocalModule(
  importer: string,
  moduleSpecifier: string,
): string | null {
  let basePath: string;
  if (moduleSpecifier.startsWith("@/")) {
    basePath = join(SOURCE_ROOT, moduleSpecifier.slice(2));
  } else if (moduleSpecifier.startsWith(".")) {
    basePath = resolve(dirname(importer), moduleSpecifier);
  } else {
    return null;
  }

  for (const candidate of moduleCandidates(basePath)) {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    const realPath = realpathSync(candidate);
    if (isInsideSourceRoot(realPath)) return realPath;
  }

  return null;
}

function isRepoLocalModuleSpecifier(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith("@/") || moduleSpecifier.startsWith(".");
}

function resolveEntryPoint(entryPoint: string): string {
  const absolutePath = isAbsolute(entryPoint)
    ? entryPoint
    : resolve(PROJECT_ROOT, entryPoint);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Dependency-boundary entry point not found: ${entryPoint}`);
  }
  const realPath = realpathSync(absolutePath);
  if (!isInsideSourceRoot(realPath)) {
    throw new Error(
      `Dependency-boundary entry point is outside src/: ${entryPoint}`,
    );
  }
  return realPath;
}

function projectRelative(path: string): string {
  return relative(PROJECT_ROOT, path).split(sep).join("/");
}

/**
 * Resolves the complete repo-local runtime graph from explicit route/model
 * roots. Traversal and output are sorted so failures are deterministic.
 */
export function collectRepoLocalModuleGraph(
  entryPoints: readonly string[],
): string[] {
  const pending = entryPoints.map(resolveEntryPoint).sort();
  const visited = new Set<string>();

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const dependencies: string[] = [];
    for (const moduleSpecifier of extractModuleSpecifiers(
      readFileSync(current, "utf8"),
    )) {
      if (!isRepoLocalModuleSpecifier(moduleSpecifier)) continue;
      const dependency = resolveRepoLocalModule(current, moduleSpecifier);
      if (!dependency) {
        throw new Error(
          `Unresolved repo-local dependency "${moduleSpecifier}" imported by "${projectRelative(current)}"`,
        );
      }
      if (!visited.has(dependency)) dependencies.push(dependency);
    }
    dependencies.sort();
    pending.push(...dependencies);
    pending.sort();
  }

  return [...visited].map(projectRelative).sort();
}

const INDIVIDUAL_APPEARANCE_MODULES = new Set([
  "src/components/assessments/BrandedReport.tsx",
  "src/lib/assessments/individual-report-presentation.ts",
  "src/lib/assessments/report-style-policy.ts",
  "src/lib/assessments/report-style-registry.ts",
  "src/lib/assessments/wave-report-styles-flags.ts",
]);
const INDIVIDUAL_RENDERER_DIRECTORY =
  "src/components/assessments/report-styles/";

export function findIndividualAppearanceModules(
  reachableModules: readonly string[],
): string[] {
  return reachableModules
    .filter(
      (modulePath) =>
        INDIVIDUAL_APPEARANCE_MODULES.has(modulePath) ||
        modulePath.startsWith(INDIVIDUAL_RENDERER_DIRECTORY),
    )
    .sort();
}

const INDIVIDUAL_APPEARANCE_IDENTIFIERS = new Set([
  "reportStyle",
  "reportStylesAvailable",
]);

export interface IndividualAppearanceSourceCoupling {
  modulePath: string;
  identifiers: string[];
}

/**
 * Finds direct appearance-state identifier usage in the resolved graph while
 * ignoring comments and string contents.
 */
export function findIndividualAppearanceSourceCouplings(
  reachableModules: readonly string[],
): IndividualAppearanceSourceCoupling[] {
  const couplings: IndividualAppearanceSourceCoupling[] = [];

  for (const modulePath of [...reachableModules].sort()) {
    const absolutePath = resolve(PROJECT_ROOT, modulePath);
    const sourceFile = ts.createSourceFile(
      modulePath,
      readFileSync(absolutePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const identifiers = new Set<string>();

    const visit = (node: ts.Node): void => {
      if (
        ts.isIdentifier(node) &&
        INDIVIDUAL_APPEARANCE_IDENTIFIERS.has(node.text)
      ) {
        identifiers.add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    if (identifiers.size > 0) {
      couplings.push({
        modulePath,
        identifiers: [...identifiers].sort(),
      });
    }
  }

  return couplings;
}
