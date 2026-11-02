// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { processPhoto } from "../../scripts/process-photo.mjs";

async function noisyJpegWithGps() {
  const width = 400;
  const height = 300;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 256; // high-detail pattern
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestCam", Model: "Phone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 45/1 0/1" } })
    .toBuffer();
}

async function stdDev(buffer: Buffer, region: { left: number; top: number; width: number; height: number }) {
  // stats() describes its input, so extract to a new buffer first.
  const patch = await sharp(buffer).extract(region).png().toBuffer();
  const stats = await sharp(patch).stats();
  return stats.channels[0]!.stdev;
}

describe("photo import pipeline", () => {
  it("removes EXIF (including GPS) and other metadata", async () => {
    const input = await noisyJpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const { buffer, width, height } = await processPhoto(input);
    const meta = await sharp(buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect([width, height]).toEqual([400, 300]);
  });

  it("blurs requested regions and leaves the rest sharp", async () => {
    const input = await noisyJpegWithGps();
    const region = { left: 50, top: 50, width: 120, height: 40 };
    const { buffer } = await processPhoto(input, { blur: [region] });
    const blurred = await stdDev(buffer, region);
    const untouched = await stdDev(buffer, { left: 250, top: 200, width: 120, height: 40 });
    expect(blurred).toBeLessThan(untouched / 3);
  });

  it("rejects blur regions outside the image", async () => {
    await expect(processPhoto(await noisyJpegWithGps(), { blur: [{ left: 380, top: 0, width: 50, height: 10 }] })).rejects.toThrow(/outside/);
  });

  it("caps the long edge without enlarging", async () => {
    const big = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#123" } }).jpeg().toBuffer();
    expect((await processPhoto(big, { maxEdge: 1500 })).width).toBe(1500);
    expect((await processPhoto(await noisyJpegWithGps(), { maxEdge: 1500 })).width).toBe(400);
  });

  it("the committed studio photos contain no metadata", async () => {
    const { studioPhotos } = await import("@/data/studio-views");
    for (const view of studioPhotos) {
      const meta = await sharp(`public${view.src}`).metadata();
      expect(meta.exif, view.id).toBeUndefined();
      expect(meta.xmp, view.id).toBeUndefined();
      expect([meta.width, meta.height], view.id).toEqual([view.width, view.height]);
    }
  });

  it("redaction replaces a region with an opaque, detail-free fill", async () => {
    const input = await noisyJpegWithGps();
    const region = { left: 40, top: 60, width: 150, height: 30 };
    expect(await stdDev(input, region)).toBeGreaterThan(30);
    const { buffer } = await processPhoto(input, { redact: [{ ...region, colour: "#b8ae4c" }] });
    // JPEG compression leaves only tiny variation; no original detail survives.
    expect(await stdDev(buffer, { left: 44, top: 64, width: 142, height: 22 })).toBeLessThan(3);
    await expect(processPhoto(input, { redact: [{ ...region, colour: "red" }] })).rejects.toThrow(/colour/);
    await expect(processPhoto(input, { redact: [{ left: 390, top: 0, width: 50, height: 5 }] })).rejects.toThrow(/outside/);
  });

  it("RT-QA-002: the phone number on the equipment-rack sticker is unreadable in the served photo", async () => {
    // The only served version of this photo (thumbnails use the same file).
    const file = "public/studio/photos/equipment-rack.jpg";
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 1200]);
    // The sticker text sat at roughly x 640–752, y 657–669 at full resolution.
    expect(await stdDev(await sharp(file).toBuffer(), { left: 626, top: 655, width: 134, height: 16 })).toBeLessThan(3);
  });
});
