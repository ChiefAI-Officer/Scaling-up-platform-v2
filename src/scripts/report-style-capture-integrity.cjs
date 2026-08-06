"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const { execFileSync } = require("node:child_process");
const { readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");
const sharp = require("sharp");

function invariant(value, message) {
  if (!value) throw new Error(message);
}

async function assertMeaningfulImage(path, expected = {}) {
  const info = statSync(path);
  invariant(info.size > 0, `Generated image is empty: ${path}`);

  const image = sharp(path).removeAlpha().toColourspace("srgb");
  const { data, info: pixels } = await image.raw().toBuffer({
    resolveWithObject: true,
  });
  if (expected.width !== undefined) {
    invariant(
      pixels.width === expected.width,
      `Image width is ${pixels.width}, expected ${expected.width}: ${path}`,
    );
  }
  if (expected.height !== undefined) {
    invariant(
      pixels.height === expected.height,
      `Image height is ${pixels.height}, expected ${expected.height}: ${path}`,
    );
  }

  let nonWhite = 0;
  const buckets = new Set();
  const channelCount = pixels.channels;
  const stride = Math.max(1, Math.floor((pixels.width * pixels.height) / 50_000));
  for (let pixel = 0; pixel < pixels.width * pixels.height; pixel += 1) {
    const offset = pixel * channelCount;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if (red < 248 || green < 248 || blue < 248) nonWhite += 1;
    if (pixel % stride === 0) {
      buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
  }

  const coverage = nonWhite / (pixels.width * pixels.height);
  const stats = await sharp(path).stats();
  const meanDeviation =
    stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) /
    3;
  invariant(
    coverage > 0.002 && coverage < 0.995,
    `Image has implausible foreground coverage (${coverage.toFixed(4)}): ${path}`,
  );
  invariant(
    buckets.size >= 8 && meanDeviation >= 5,
    `Image is visually blank or flat (${buckets.size} colors, ${meanDeviation.toFixed(2)} deviation): ${path}`,
  );

  return Object.freeze({
    width: pixels.width,
    height: pixels.height,
    coverage,
    sampledColorBuckets: buckets.size,
    meanDeviation,
  });
}

async function assertSinglePagePdf(path, format, options = {}) {
  const info = execFileSync("pdfinfo", [path], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);
  invariant(
    pages === 1,
    `Preview PDF must be exactly one page for ${path}; got ${pages || "unknown"}`,
  );

  const pageSize = info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  invariant(pageSize, `Preview PDF has no readable page size: ${path}`);
  const [width, height] = pageSize.slice(1).map(Number);
  const expected = format === "A4" ? [595.28, 841.89] : [612, 792];
  invariant(
    Math.abs(width - expected[0]) < 2 && Math.abs(height - expected[1]) < 2,
    `Preview PDF is not ${format}: ${width}x${height} pts for ${path}`,
  );

  const text = execFileSync("pdftotext", [path, "-"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  invariant(
    text.replace(/\s+/g, " ").trim().length >= 24,
    `Preview PDF page is textually blank: ${path}`,
  );
  for (const marker of options.markers ?? []) {
    invariant(
      text.toLocaleLowerCase().includes(String(marker).toLocaleLowerCase()),
      `Preview PDF is missing expected content "${marker}": ${path}`,
    );
  }

  if (options.rasterDirectory) {
    const rasterPrefix = join(
      options.rasterDirectory,
      `pdf-evidence-${Buffer.from(path).toString("hex").slice(-20)}`,
    );
    execFileSync(
      "pdftoppm",
      ["-f", "1", "-l", "1", "-singlefile", "-png", "-r", "48", path, rasterPrefix],
      { stdio: "pipe" },
    );
    await assertMeaningfulImage(`${rasterPrefix}.png`);
  }

  return Object.freeze({ pages, width, height, text });
}

function assertWebpContainer(path) {
  const bytes = readFileSync(path);
  invariant(
    bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP",
    `Preview is not a true WebP: ${path}`,
  );
}

module.exports = {
  assertMeaningfulImage,
  assertSinglePagePdf,
  assertWebpContainer,
};
