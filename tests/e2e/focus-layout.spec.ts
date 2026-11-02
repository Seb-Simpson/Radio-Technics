import { expect, test, type Page } from "@playwright/test";

/**
 * RT-QA-002 P4: focus must never be obscured, and short desktop windows must
 * keep the chat usable. Each test sets its own window size, so it runs once.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "sets its own viewport sizes");
});

/** True when at least part of the focused element can actually be seen (not covered or clipped). */
async function focusedIsVisible(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { visible: false, label: "nothing focused" };
    const r = el.getBoundingClientRect();
    const points = [
      [0.5, 0.5],
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8],
    ].map(([fx, fy]) => [r.left + r.width * fx!, r.top + r.height * fy!]);
    const visible = points.some(([x, y]) => {
      if (x! < 0 || y! < 0 || x! > innerWidth || y! > innerHeight) return false;
      const hit = document.elementFromPoint(x!, y!);
      return !!hit && (hit === el || el.contains(hit));
    });
    return { visible, label: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? el.tagName };
  });
}

async function tabThroughExplorer(page: Page, steps: number) {
  const seen: string[] = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const inExplorer = await page.evaluate(() => !!document.activeElement?.closest("main"));
    if (!inExplorer) continue;
    const { visible, label } = await focusedIsVisible(page);
    seen.push(label);
    expect(visible, `focused "${label}" is obscured`).toBe(true);
  }
  return seen;
}

test.describe("chat at short desktop heights", () => {
  for (const height of [500, 495]) {
    test(`1440×${height}: the reply box is reachable and usable`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height });
      await page.goto("/troubleshooter");
      const input = page.getByLabel("Describe the problem");
      await input.focus();
      expect((await focusedIsVisible(page)).visible).toBe(true);
      await input.fill("The green thing isn't working");
      await input.press("Enter");
      await expect(page.getByRole("log").getByText("Are you referring to the green button that advances Myriad to the next song?")).toBeVisible();
      await page.getByRole("button", { name: "Yes, that's it" }).click();
      await input.focus();
      expect((await focusedIsVisible(page)).visible).toBe(true);
      // Every answer button can be reached by keyboard and seen.
      await page.getByRole("button", { name: "Nothing changed" }).focus();
      expect((await focusedIsVisible(page)).visible).toBe(true);
      await page.getByRole("button", { name: "I need technical support" }).focus();
      expect((await focusedIsVisible(page)).visible).toBe(true);
    });
  }

  test("1440×900 keeps the side-by-side layout", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/troubleshooter");
    await expect(page.getByRole("region", { name: "Studio workspace" })).toBeVisible();
    const box = (await page.getByRole("region", { name: "Troubleshooting conversation" }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(900);
  });
});

test.describe("focus is never hidden in the Studio Explorer", () => {
  for (const [width, height] of [
    [375, 667],
    [320, 568],
    [390, 844],
  ] as const) {
    test(`${width}×${height} with the equipment sheet open`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/studio");
      const viewer = page.getByRole("group", { name: /^Mixing console/ });
      await viewer.getByRole("button", { name: "Audio level meters" }).click();
      await expect(page.getByTestId("equipment-sheet")).toBeVisible();
      await viewer.focus();
      const seen = await tabThroughExplorer(page, 6);
      expect(seen).toEqual(expect.arrayContaining(["Main broadcast mixing console", "Audio level meters", "Headphone monitoring"]));
    });
  }

  test("desktop zoomed in: tabbing pans hotspots into view", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/studio");
    const viewer = page.getByRole("group", { name: /^Mixing console/ });
    await viewer.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("+");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const seen = await tabThroughExplorer(page, 3);
    expect(seen).toEqual(["Main broadcast mixing console", "Audio level meters", "Headphone monitoring"]);
  });

  // Browser zoom shrinks the CSS viewport: 1440×900 at 200% ≈ 720×450, at 400% ≈ 360×225.
  for (const [zoom, width, height] of [
    [200, 720, 450],
    [400, 360, 225],
  ] as const) {
    test(`browser zoom ${zoom}% (${width}×${height} CSS px) with the sheet open`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/studio");
      const viewer = page.getByRole("group", { name: /^Mixing console/ });
      await viewer.getByRole("button", { name: "Main broadcast mixing console" }).click();
      await viewer.focus();
      await tabThroughExplorer(page, 4);
    });
  }
});

test("sheet keyboard behaviour: focus kept on open, expand and collapse; Escape closes and returns focus; no trap", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/studio");
  const viewer = page.getByRole("group", { name: /^Mixing console/ });
  await viewer.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab"); // meters hotspot
  await page.keyboard.press("Enter");
  const sheet = page.getByTestId("equipment-sheet");
  await expect(sheet.getByRole("heading", { name: "Audio level meters" })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Audio level meters" })).toBeFocused();
  expect((await focusedIsVisible(page)).visible).toBe(true);

  await sheet.getByRole("button", { name: "More details" }).focus();
  await page.keyboard.press("Enter");
  await expect(sheet.getByRole("button", { name: "Show less" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet.getByRole("button", { name: "More details" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Audio level meters" })).toBeFocused();

  // Reopen, tab into and back out of the sheet: no keyboard trap.
  await page.keyboard.press("Enter");
  await sheet.getByRole("button", { name: "Close equipment details" }).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="equipment-sheet"]'))).toBe(false);
  await sheet.getByRole("button", { name: "Close equipment details" }).click();
  await expect(viewer.getByRole("button", { name: "Audio level meters" })).toBeFocused();
});
