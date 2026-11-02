/**
 * Prepare a studio photograph for the app.
 *
 * - Applies the camera's orientation, then discards ALL metadata
 *   (EXIF incl. GPS location, XMP, IPTC, ICC) by re-encoding.
 * - Optionally blurs regions (e.g. a logged-in user's name on a screen).
 * - Optionally REDACTS regions with an opaque fill, for anything that must
 *   be unreadable (e.g. a phone number). Use this rather than blur for text
 *   that must not be recoverable.
 * - Caps the long edge (default 2400px) without enlarging.
 * - Verifies the written file has no metadata before reporting success.
 */
import sharp from "sharp";

/**
 * @param {string | Buffer} input
 * @param {{ blur?: Region[], redact?: (Region & { colour?: string })[], maxEdge?: number, quality?: number }} [options]
 * @typedef {{left:number, top:number, width:number, height:number}} Region
 * @returns {Promise<{ buffer: Buffer, width: number, height: number }>}
 */
function checkRegion(region, width, height) {
  const r = {
    left: Math.max(0, Math.round(region.left)),
    top: Math.max(0, Math.round(region.top)),
    width: Math.round(region.width),
    height: Math.round(region.height),
  };
  if (![r.left, r.top, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0 || r.left + r.width > width || r.top + r.height > height) {
    throw new Error(`Region ${JSON.stringify(region)} is outside the ${width}×${height} image`);
  }
  return r;
}

export async function processPhoto(input, options = {}) {
  const { blur = [], redact = [], maxEdge = 2400, quality = 82 } = options;

  // Bake orientation into the pixels first so blur coordinates match what people see.
  let image = sharp(await sharp(input).rotate().toBuffer());
  const { width, height } = await image.metadata();
  if (!width || !height) throw new Error("Could not read image dimensions");

  if (blur.length > 0) {
    const overlays = [];
    for (const region of blur) {
      const r = {
        left: Math.max(0, Math.round(region.left)),
        top: Math.max(0, Math.round(region.top)),
        width: Math.round(region.width),
        height: Math.round(region.height),
      };
      if (r.width <= 0 || r.height <= 0 || r.left + r.width > width || r.top + r.height > height) {
        throw new Error(`Blur region ${JSON.stringify(region)} is outside the ${width}×${height} image`);
      }
      const patch = await sharp(input).rotate().extract(r).blur(Math.max(8, r.height / 2)).toBuffer();
      overlays.push({ input: patch, left: r.left, top: r.top });
    }
    image = sharp(await image.composite(overlays).toBuffer());
  }

  if (redact.length > 0) {
    const boxes = redact.map((region) => {
      const r = checkRegion(region, width, height);
      const colour = region.colour ?? "#2a2a2a";
      if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new Error(`Bad redaction colour ${colour}`);
      return `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" fill="${colour}"/>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${boxes.join("")}</svg>`;
    image = sharp(await image.composite([{ input: Buffer.from(svg) }]).toBuffer());
  }

  const buffer = await image
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  const meta = await sharp(buffer).metadata();
  if (meta.exif || meta.xmp || meta.iptc || meta.icc) throw new Error("Metadata survived processing");
  return { buffer, width: meta.width, height: meta.height };
}
