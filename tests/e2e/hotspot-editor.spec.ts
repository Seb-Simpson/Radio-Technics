import { expect, test } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "pointer-precision tool; desktop only");
});

test("draw, move and resize a hotspot, then preview and generate configuration", async ({ page }) => {
  // Tall window so the whole drawing area is on screen for real pointer hit-testing.
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto("/dev/hotspots");
  await page.getByRole("combobox", { name: "Photograph" }).selectOption("green-button");
  await page.getByRole("combobox", { name: "Equipment for new regions" }).selectOption("headphone-monitoring");
  const canvas = page.getByTestId("hotspot-canvas");
  const box = (await canvas.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

  // Draw in an empty area (bottom-right of the photo).
  let p = at(0.6, 0.6);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  p = at(0.8, 0.75);
  await page.mouse.move(p.x, p.y, { steps: 5 });
  await page.mouse.up();

  const left = page.getByRole("spinbutton", { name: "Left (px)" });
  const right = page.getByRole("spinbutton", { name: "Right (px)" });
  const l0 = Number(await left.inputValue());
  const r0 = Number(await right.inputValue());
  expect(l0).toBeGreaterThan(700);
  expect(r0 - l0).toBeGreaterThan(200);

  // Move it left by dragging its middle.
  p = at(0.7, 0.68);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  p = at(0.6, 0.68);
  await page.mouse.move(p.x, p.y, { steps: 5 });
  await page.mouse.up();
  const l1 = Number(await left.inputValue());
  expect(l1).toBeLessThan(l0 - 60);
  expect(Number(await right.inputValue()) - l1).toBe(r0 - l0);

  // Resize from the bottom-right corner handle.
  const handle = page.locator('[data-corner="se"]');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 60, h.y + 40, { steps: 5 });
  await page.mouse.up();
  expect(Number(await right.inputValue())).toBeGreaterThan(r0 - (l0 - l1) + 40);

  // Keyboard nudging.
  await canvas.focus();
  const before = Number(await left.inputValue());
  await page.keyboard.press("ArrowRight");
  expect(Number(await left.inputValue())).toBe(before + 2);

  // Generated configuration includes the new region, ready to paste.
  await expect(page.getByTestId("hotspot-code")).toContainText('onPhoto("green-button", "monitoring", "headphone-monitoring"');

  // Invalid coordinates are rejected.
  await right.fill("99999");
  await expect(page.getByRole("complementary", { name: "Hotspot details" }).getByRole("alert")).toContainText("outside the photo");
  await expect(page.getByRole("button", { name: "Copy" })).toBeDisabled();
  await right.fill("900");
  await expect(page.getByRole("button", { name: "Copy" })).toBeEnabled();

  // Preview uses the real viewer.
  await page.getByRole("button", { name: "Preview in viewer" }).click();
  await expect(page.getByRole("group", { name: /^Green button/ }).getByRole("button", { name: "Headphone monitoring" })).toHaveCount(2);
});
