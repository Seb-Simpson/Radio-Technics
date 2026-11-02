import { expect, test } from "@playwright/test";

/** RT-QA-002 P5 browser regressions. */

test("a photo that returns 404 immediately (before hydration) shows the fallback and no active hotspots", async ({ page }) => {
  await page.route("**/studio/photos/mixing-console.jpg", (route) => route.fulfill({ status: 404, body: "not found" }));
  await page.goto("/studio");
  const viewer = page.getByRole("group", { name: /^Mixing console/ });
  await expect(page.getByRole("alert").filter({ hasText: "This photograph couldn't be loaded" })).toBeVisible();
  await expect(viewer.locator("[data-equipment-id]")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Mixing console with eight faders/ })).toHaveCount(0);
  // Other photos are unaffected.
  await page.getByRole("tab", { name: "Green button" }).click();
  await expect(page.getByRole("group", { name: /^Green button/ }).getByRole("button", { name: "Green Myriad button" })).toBeVisible();
});

test("a photo that fails after the page is interactive also falls back", async ({ page }) => {
  // Hold the image request until the page has proved it is interactive, then fail it.
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/studio/photos/mixing-console.jpg", async (route) => {
    await released;
    await route.fulfill({ status: 404, body: "not found" });
  });
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  const viewer = page.getByRole("group", { name: /^Mixing console/ });
  // React is in control: zooming works and hotspots are live.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("status", { name: "Zoom level" })).toHaveText("140%");
  await expect(viewer.getByRole("button", { name: "Main broadcast mixing console" })).toBeAttached();

  release();
  await expect(page.getByRole("alert").filter({ hasText: "This photograph couldn't be loaded" })).toBeVisible();
  await expect(viewer.locator("[data-equipment-id]")).toHaveCount(0);
});

test("each rack hotspot shows its own identification and highlight", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Equipment rack" }).click();
  const viewer = page.getByRole("group", { name: /^Equipment rack/ });
  const regions = viewer.getByRole("button", { name: "Technical equipment rack" });
  await expect(regions).toHaveCount(3);
  const details = page.getByRole("complementary", { name: "Selected equipment" });
  const sheet = page.getByTestId("equipment-sheet");

  const expected = ["Axia QOR.16", "X-NODE 2", "Fourteen numbered switches"];
  for (let i = 0; i < 3; i++) {
    await regions.nth(i).focus();
    await page.keyboard.press("Enter");
    await expect(viewer.locator("[data-selected]")).toHaveCount(1);
    await expect(regions.nth(i)).toHaveAttribute("aria-pressed", "true");
    const usesSheet = (await sheet.count()) > 0;
    if (usesSheet) await sheet.getByRole("button", { name: "More details" }).click();
    const note = details.getByText("In this photo:").locator("xpath=..");
    await expect(note).toContainText(expected[i]!);
    for (const other of expected.filter((_, j) => j !== i)) await expect(note).not.toContainText(other);
    if (usesSheet) {
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
    }
  }
});
