import { expect, test, type Page } from "@playwright/test";

/** RT-QA-001 B1/B2 regressions. Desktop project only; it resizes the viewport itself. */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "resizes the window itself");
});

async function visibleFraction(page: Page) {
  return page.evaluate(() => {
    const viewer = document.querySelector('[aria-roledescription="zoomable studio view"]')!.getBoundingClientRect();
    const stage = document.querySelector('[data-testid="viewer-stage"]')!.getBoundingClientRect();
    const w = Math.max(0, Math.min(viewer.right, stage.right) - Math.max(viewer.left, stage.left));
    const h = Math.max(0, Math.min(viewer.bottom, stage.bottom) - Math.max(viewer.top, stage.top));
    return (w * h) / (viewer.width * viewer.height);
  });
}

test("zoom and pan on desktop, then resize to mobile keeps the studio and selection visible (B1)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/studio");
  await page.getByRole("button", { name: /^Technical equipment rack \(placeholder/ }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();

  // Drag hard towards one corner.
  const viewer = page.getByRole("group", { name: /Illustrative layout/ });
  const box = (await viewer.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.95, { steps: 8 });
  await page.mouse.up();

  for (const width of [820, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(400);
    // The viewer is always filled by the image when zoomed — never empty.
    expect(await visibleFraction(page), `at ${width}px`).toBeGreaterThan(0.5);
    const rack = page.getByRole("button", { name: /^Technical equipment rack \(placeholder/ });
    const rackBox = (await rack.boundingBox())!;
    const viewerBox = (await page.getByRole("group", { name: /Illustrative layout/ }).boundingBox())!;
    const cx = rackBox.x + rackBox.width / 2;
    expect(cx, `selected equipment visible at ${width}px`).toBeGreaterThanOrEqual(viewerBox.x);
    expect(cx).toBeLessThanOrEqual(viewerBox.x + viewerBox.width);
  }

  // Reset still restores the full view.
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.getByRole("status", { name: "Zoom level" })).toHaveText("100%");
});

test("after dragging, Enter and Space still activate hotspots (B2)", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Zoom in" }).click();
  const viewer = page.getByRole("group", { name: /Illustrative layout/ });
  // Start the drag on a hotspot — the case that used to leave clicks suppressed.
  const consoleHotspot = page.getByRole("button", { name: /^Main broadcast mixing console \(placeholder/ });
  const c = (await consoleHotspot.boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 + 60, c.y + c.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText("Select a piece of equipment")).toBeVisible();

  await viewer.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  const panel = page.getByRole("complementary", { name: "Selected equipment" });
  await expect(panel.getByRole("heading", { level: 2 })).toBeVisible();
  const first = await panel.getByRole("heading", { level: 2 }).textContent();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(panel.getByRole("heading", { level: 2 })).not.toHaveText(first ?? "");
  // The selected hotspot is highlighted and keeps a visible focus indicator.
  const focused = page.locator("[data-equipment-id]:focus");
  await expect(focused).toHaveAttribute("aria-pressed", "true");
  const outline = await focused.evaluate((el) => getComputedStyle(el).borderColor);
  expect(outline).not.toBe("rgba(0, 0, 0, 0)");
});
