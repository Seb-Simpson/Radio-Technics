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
});
