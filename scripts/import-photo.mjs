#!/usr/bin/env node
/**
 * Import a studio photograph into public/studio/photos.
 *
 *   node scripts/import-photo.mjs <input.jpg> <view-id> [--blur l,t,w,h]... [--redact l,t,w,h[,#colour]]... [--max 2400]
 *
 * --blur softens a region (e.g. a name on a screen).
 * --redact covers a region with an opaque fill; use it for anything that
 *   must be unreadable, such as phone numbers.
 *
 * Prints a ready-to-paste StudioView record with the real dimensions.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { processPhoto } from "./process-photo.mjs";

const args = process.argv.slice(2);
const [input, id] = args;
if (!input || !id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error("Usage: node scripts/import-photo.mjs <input> <kebab-case-id> [--blur l,t,w,h]... [--max 2400]");
  process.exit(1);
}

const blur = [];
const redact = [];
let maxEdge = 2400;
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--blur") {
    const parts = (args[++i] ?? "").split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) throw new Error(`Bad --blur value: ${args[i]}`);
    const [left, top, width, height] = parts;
    blur.push({ left, top, width, height });
  } else if (args[i] === "--redact") {
    const parts = (args[++i] ?? "").split(",");
    const [left, top, width, height] = parts.slice(0, 4).map(Number);
    if ([left, top, width, height].some((n) => !Number.isFinite(n))) throw new Error(`Bad --redact value: ${args[i]}`);
    redact.push({ left, top, width, height, colour: parts[4] });
  } else if (args[i] === "--max") {
    maxEdge = Number(args[++i]);
  }
}

const { buffer, width, height } = await processPhoto(input, { blur, redact, maxEdge });
const outDir = path.resolve("public/studio/photos");
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `${id}.jpg`);
await writeFile(outFile, buffer);

console.log(`Wrote ${path.relative(process.cwd(), outFile)} (${width}×${height}, ${(buffer.length / 1024).toFixed(0)} KB, metadata removed${blur.length ? `, ${blur.length} region(s) blurred` : ""}${redact.length ? `, ${redact.length} region(s) redacted` : ""})`);
console.log(JSON.stringify({ id, src: `/studio/photos/${id}.jpg`, width, height }, null, 2));
