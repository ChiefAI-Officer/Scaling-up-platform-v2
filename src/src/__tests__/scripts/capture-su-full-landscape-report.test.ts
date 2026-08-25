import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

const scriptPath = join(
  process.cwd(),
  "scripts",
  "capture-su-full-landscape-report.tsx",
);

function expectCompleteSequentialPdf(pdfPath: string, pages: number): string[] {
  const pageTexts = Array.from({ length: pages }, (_, index) =>
    execFileSync("pdftotext", [
      "-f",
      String(index + 1),
      "-l",
      String(index + 1),
      "-layout",
      pdfPath,
      "-",
    ], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
  );
  const footerNumbers = pageTexts.map((text) =>
    Number(text.replace(/\f/g, "").trimEnd().match(/(?:^|\s)(\d+)\s*$/)?.[1]),
  );
  expect(footerNumbers).toEqual(
    Array.from({ length: pages }, (_, index) => index + 1),
  );

  const normalizedBodies = pageTexts.map((text, index) =>
    text
      .replace(/\f/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(new RegExp(`\\s${index + 1}$`), "")
      .trim(),
  );
  expect(normalizedBodies.every((body) => body.length >= 100)).toBe(true);
  const hashes = normalizedBodies.map((body) =>
    createHash("sha256").update(body).digest("hex"),
  );
  expect(new Set(hashes).size).toBe(pages);
  return pageTexts;
}

async function rawRgbHash(path: string): Promise<string> {
  const pixels = await sharp(path)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer();
  return createHash("sha256").update(pixels).digest("hex");
}

async function expectEditionSixBrandAssets(pdfPath: string, directory: string): Promise<void> {
  const coverPrefix = join(directory, "cover-page");
  execFileSync("pdftoppm", [
    "-f", "1", "-l", "1", "-singlefile", "-png", "-r", "150", pdfPath, coverPrefix,
  ]);
  const logoPath = join(process.cwd(), "public", "brand", "su-logo-white.svg");
  const expectedLogo = await sharp(logoPath)
    .resize({ width: 281 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const renderedCover = await sharp(`${coverPrefix}.png`)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const expectedMask = Array.from(
    { length: expectedLogo.info.width * expectedLogo.info.height },
    (_, index) => expectedLogo.data[(index * expectedLogo.info.channels) + 3] > 128,
  );
  let bestLogoSimilarity = 0;
  for (let top = 78; top <= 86; top += 1) {
    for (let left = 90; left <= 98; left += 1) {
      let intersection = 0;
      let union = 0;
      for (let y = 0; y < expectedLogo.info.height; y += 1) {
        for (let x = 0; x < expectedLogo.info.width; x += 1) {
          const expected = expectedMask[(y * expectedLogo.info.width) + x];
          const offset = (
            ((top + y) * renderedCover.info.width) + left + x
          ) * renderedCover.info.channels;
          const rendered = renderedCover.data[offset] > 200
            && renderedCover.data[offset + 1] > 200
            && renderedCover.data[offset + 2] > 200;
          if (expected && rendered) intersection += 1;
          if (expected || rendered) union += 1;
        }
      }
      bestLogoSimilarity = Math.max(bestLogoSimilarity, intersection / union);
    }
  }
  expect(bestLogoSimilarity).toBeGreaterThanOrEqual(0.85);

  const imagePrefix = join(directory, "preface-image");
  execFileSync("pdfimages", ["-f", "2", "-l", "2", "-png", pdfPath, imagePrefix]);
  const extractedImagePaths = readdirSync(directory)
    .filter((name) => name.startsWith("preface-image-") && name.endsWith(".png"))
    .map((name) => join(directory, name));
  const extractedImageHashes = await Promise.all(extractedImagePaths.map(rawRgbHash));
  const signaturePath = join(
    process.cwd(),
    "public",
    "brand",
    "verne-harnish-signature.png",
  );
  expect(extractedImageHashes).toContain(await rawRgbHash(signaturePath));
}

test("captures the canonical landscape fixture as a CSS-sized print PDF", () => {
  expect(existsSync(scriptPath)).toBe(true);

  const script = readFileSync(scriptPath, "utf8");
  expect(script).toContain("completeSuFullLandscapeReport");
  expect(script).toContain("completeSuFullLandscapePresentation");
  expect(script).toContain("buildSuFullLandscapeReportModel");
  expect(script).toContain("renderToStaticMarkup");
  expect(script).toContain("su-report.css");
  expect(script).toContain("chromium.launch");
  expect(script).toContain('emulateMedia({ media: "print" })');
  expect(script).toContain("preferCSSPageSize: true");
  expect(script).toContain("landscape: true");
  expect(script).toContain("printBackground: true");
  expect(script).toContain("tmp/pdfs/su-full-landscape-fixture.pdf");
  expect(script).not.toContain('<div className="su-public-brand su-report su-full-landscape">');
});

test.each([
  { variant: "edition-6", pages: 25, requiredText: "PREFACE" },
  { variant: "null-preface", pages: 24, requiredText: "TABLE OF CONTENTS" },
])("captures the $variant fixture as a sequential $pages-page PDF", async ({ variant, pages, requiredText }) => {
  const directory = mkdtempSync(join(tmpdir(), "su-full-landscape-capture-"));
  const pdfPath = join(directory, `${variant}.pdf`);

  try {
    execFileSync(join(process.cwd(), "node_modules", ".bin", "tsx"), [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SU_FULL_LANDSCAPE_CAPTURE_VARIANT: variant,
        SU_FULL_LANDSCAPE_CAPTURE_OUTPUT: pdfPath,
      },
      stdio: "pipe",
    });

    expect(existsSync(pdfPath)).toBe(true);
    expect(execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" })).toMatch(
      new RegExp(`^Pages:\\s+${pages}$`, "m"),
    );
    const pageTexts = expectCompleteSequentialPdf(pdfPath, pages);
    expect(pageTexts.join("\n")).toContain(requiredText);
    if (variant === "null-preface") {
      expect(pageTexts.join("\n")).not.toMatch(/(?:^|\n)\s*welcome\s*(?:\n|$)/im);
    } else {
      await expectEditionSixBrandAssets(pdfPath, directory);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
