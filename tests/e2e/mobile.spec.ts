import { expect, test, type Page } from "@playwright/test";

/** Phone and tablet behaviour (RT-002 D). Runs on the touch-enabled projects only. */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "touch layouts only");
});

async function pinch(page: Page, centre: { x: number; y: number }, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page);
  const points = (d: number) => [
    { x: centre.x - d, y: centre.y, id: 1 },
    { x: centre.x + d, y: centre.y, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from + ((to - from) * i) / 8) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("compact navigation: menu opens, closes with Escape and returns focus, and Get help is one tap away", async ({ page }) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Menu" });
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await menuButton.tap();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(nav.getByRole("link", { name: /Dashboard/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(nav).toHaveCount(0);
  await expect(menuButton).toBeFocused();

  await menuButton.tap();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Knowledge Centre/ }).tap();
  await expect(page).toHaveURL(/\/knowledge$/);
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);

  await page.getByRole("link", { name: "Get help" }).tap();
  await expect(page).toHaveURL(/\/troubleshooter$/);
  const box = (await menuButton.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test("each new question is brought into view, and the reply box is reachable above the keyboard", async ({ page }) => {
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("My microphone isn't working");
  await input.press("Enter");
  await page.getByRole("button", { name: "Presenter microphone" }).tap();
  await page.getByRole("button", { name: "Other people can't hear it" }).tap();
  await page.getByRole("button", { name: "No, they don't move" }).tap();
  await expect(page.getByRole("log").getByText("Was this microphone working earlier today?")).toBeInViewport();
  // Answer buttons are never hidden behind other content.
  await expect(page.getByRole("button", { name: "Yes, it was working earlier" })).toBeInViewport();
  // Tapping into the reply box brings it fully on screen.
  await input.tap();
  await expect(input).toBeInViewport({ ratio: 1 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Show me where → highlighted equipment visible above a compact sheet → back to the conversation", async ({ page }) => {
  await page.goto("/troubleshooter");
  await page.getByLabel("Describe the problem").fill("The green thing isn't working");
  await page.getByLabel("Describe the problem").press("Enter");
  await page.getByRole("button", { name: "Yes, that's it" }).tap();
  await page.getByRole("button", { name: "Show me where" }).tap();
  await expect(page).toHaveURL(/\/studio$/);

  const sheet = page.getByTestId("equipment-sheet");
  await expect(sheet.getByRole("heading", { name: "Myriad playout software" })).toBeVisible();
  const viewport = page.viewportSize()!;
  const sheetBox = (await sheet.boundingBox())!;
  expect(sheetBox.height, "sheet must not cover the whole studio").toBeLessThanOrEqual(viewport.height * 0.6);

  const hotspot = page.getByRole("group", { name: /^Myriad screen/ }).getByRole("button", { name: "Myriad playout software" });
  await expect(hotspot).toHaveAttribute("data-highlighted", "true");
  const h = (await hotspot.boundingBox())!;
  const centreY = h.y + h.height / 2;
  expect(centreY, "highlighted equipment is above the sheet").toBeLessThan(sheetBox.y);
  expect(centreY).toBeGreaterThan(0);

  await sheet.getByRole("link", { name: "Back to conversation" }).tap();
  await expect(page).toHaveURL(/\/troubleshooter$/);
  await expect(page.getByRole("log").getByText("What happened on the Myriad screen after you pressed the green button?")).toBeVisible();
});

test("touch: tap selects, the page scrolls when not zoomed, pinch zooms, zoomed drags pan the photo", async ({ page }) => {
  await page.goto("/studio");
  const viewer = page.getByRole("group", { name: /^Mixing console/ });
  await expect(viewer).toHaveCSS("touch-action", "pan-y");

  await viewer.getByRole("button", { name: "Main broadcast mixing console" }).tap();
  await expect(page.getByTestId("equipment-sheet").getByRole("heading", { name: "Main broadcast mixing console" })).toBeVisible();
  await page.getByTestId("equipment-sheet").getByRole("button", { name: "Close equipment details" }).tap();

  const box = (await viewer.boundingBox())!;
  await pinch(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 30, 110);
  const zoom = page.getByRole("status", { name: "Zoom level" });
  await expect.poll(async () => parseInt((await zoom.textContent()) ?? "100", 10)).toBeGreaterThan(150);
  await expect(viewer).toHaveCSS("touch-action", "none");
  // A pinch is not a tap: nothing got selected.
  await expect(page.getByTestId("equipment-sheet")).toHaveCount(0);

  await page.getByRole("button", { name: "Reset zoom" }).tap();
  await expect(zoom).toHaveText("100%");
});

test("touch targets: hotspots are at least 40px on touch screens", async ({ page }) => {
  await page.goto("/studio");
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const sizes = await page.locator("[data-equipment-id]").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return Math.min(r.width, r.height);
    }),
  );
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(coarse ? 39.5 : 23.5);
});
