#!/usr/bin/env node
/** Generate app icons from the brand mark. Run: node scripts/generate-icons.mjs */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// Same geometry as src/components/shell/BrandMark.tsx, with literal colours.
const mark = (padding) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${28 + padding * 2} ${28 + padding * 2}">
  <rect x="${-padding}" y="${-padding}" width="${28 + padding * 2}" height="${28 + padding * 2}" fill="#0b0e10"/>
  <rect width="28" height="28" rx="7" fill="#192024"/>
  <rect x="7" y="14" width="3" height="7" rx="1" fill="#2fae9d"/>
  <rect x="12.5" y="10" width="3" height="11" rx="1" fill="#4cc9b8"/>
  <rect x="18" y="7" width="3" height="14" rx="1" fill="#7fe0d2"/>
</svg>`;

await mkdir("public/icons", { recursive: true });
const outputs = [
  ["public/icons/icon-192.png", 192, 0],
  ["public/icons/icon-512.png", 512, 0],
  // Maskable icons keep the mark inside the 80% safe zone.
  ["public/icons/icon-maskable-512.png", 512, 4],
  ["src/app/apple-icon.png", 180, 2],
];
for (const [file, size, padding] of outputs) {
  await sharp(Buffer.from(mark(padding)), { density: 600 }).resize(size, size).png().toFile(file);
  console.log("Wrote", file);
}
