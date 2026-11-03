import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * RT-QA-002B Priority 2 browser regressions (RT-002C).
 *
 * The audit report was not available to the development team; these
 * reproductions were written for each finding in the RT-002C brief and
 * failed against the audited baseline (2ae5b26) before the fixes.
 * Each test sets its own window size, so it runs once (desktop project).
 */
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "sets its own viewport sizes");
  await page.emulateMedia({ reducedMotion: "reduce" });
});

/** The element's own pixels are on screen and not covered or clipped by anything (checks 5 points). */
async function fullyVisible(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const points = [
      [0.5, 0.5],
      [0.1, 0.1],
      [0.9, 0.1],
      [0.1, 0.9],
      [0.9, 0.9],
    ].map(([fx, fy]) => [r.left + r.width * fx!, r.top + r.height * fy!] as const);
    return points.every(([x, y]) => {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    });
  });
}

/** Builds an urgent conversation with a summary, a selected item and (after reload) the restored notice. */
async function restoredUrgentConversation(page: Page) {
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("The green thing isn't working");
  await input.press("Enter");
  await page.getByRole("button", { name: "Yes, that's it" }).click();
  await page.getByRole("button", { name: "Nothing changed" }).click();
  await page.getByRole("button", { name: "No — there's silence" }).click();
  await expect(page.getByTestId("urgent-banner")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/has been restored/)).toBeVisible();
  await expect(page.getByText("Summary for technical support")).toBeVisible();
}

test.describe("item 6 — the restored conversation's composer is never clipped", () => {
  for (const height of [768, 721, 720, 719, 900]) {
    test(`1440×${height}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height });
      await restoredUrgentConversation(page);
      const input = page.getByLabel("Describe the problem");
      const send = page.getByRole("button", { name: "Send" });

      // The composer is usable without scrolling anything.
      expect(await fullyVisible(input), "textarea visible").toBe(true);
      expect(await fullyVisible(send), "Send visible").toBe(true);

      // Every other control can be reached by keyboard and seen when focused.
      for (const control of [
        page.getByRole("button", { name: "Dismiss restored conversation message" }),
        page.getByRole("button", { name: "Copy" }),
        page.getByRole("button", { name: "Start a new problem" }),
        page.getByRole("button", { name: "End session" }),
      ]) {
        await control.focus();
        expect(await fullyVisible(control), `${await control.textContent()} visible when focused`).toBe(true);
      }
      await expect(page.getByTestId("urgent-banner")).toBeVisible();

      // And it actually works.
      await input.fill("Can someone help?");
      await send.click();
      await expect(page.getByRole("log").getByText("Can someone help?")).toBeVisible();
      expect(await fullyVisible(input), "textarea still visible after sending").toBe(true);

      // The error notice also fits.
      await send.click();
      const error = page.getByRole("alert").filter({ hasText: "Type a short description" });
      await expect(error).toBeVisible();
      expect(await fullyVisible(error), "input error visible").toBe(true);
    });
  }
});

/** Selects the rack photo's third region ("power panel"), the one furthest from the first. */
async function selectThirdRackRegion(page: Page) {
  await page.getByRole("tab", { name: "Equipment rack" }).click();
  const viewer = page.getByRole("group", { name: /^Equipment rack/ });
  const third = viewer.getByRole("button", { name: "Technical equipment rack" }).nth(2);
  await third.click();
  await expect(third).toHaveAttribute("aria-pressed", "true");
  return { viewer, third };
}

/** The exact element has focus (not just any region for the same equipment). */
async function hasFocus(locator: Locator) {
  return locator.evaluate((el) => el === document.activeElement);
}

async function centreInside(target: Locator, container: Locator) {
  const t = (await target.boundingBox())!;
  const c = (await container.boundingBox())!;
  const x = t.x + t.width / 2;
  const y = t.y + t.height / 2;
  return x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height;
}

test.describe("item 7 — resizing keeps the selected individual hotspot visible", () => {
  test("at 400% zoom through several window sizes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/studio");
    const { viewer, third } = await selectThirdRackRegion(page);
    await viewer.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("+");
    await expect(page.getByRole("status", { name: "Zoom level" })).toHaveText("400%");
    // Bring the selected region into view the way a keyboard user would.
    await third.focus();
    await expect.poll(() => centreInside(third, viewer)).toBe(true);

    for (const [width, height] of [
      [1300, 900],
      [1280, 720],
      [1600, 1000],
      [1440, 760],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => centreInside(third, viewer), { message: `${width}×${height}` }).toBe(true);
      await expect(page.getByRole("status", { name: "Zoom level" })).toHaveText("400%");
    }
  });

  test("when only the width changes (the photo keeps its size)", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/studio");
    const { viewer, third } = await selectThirdRackRegion(page);
    await viewer.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("+");
    await third.focus();
    await expect.poll(() => centreInside(third, viewer)).toBe(true);
    for (const width of [1500, 1400, 1300]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => centreInside(third, viewer), { message: `width ${width}` }).toBe(true);
    }
  });
});

test.describe("item 8 — focus returns to the exact hotspot, and never overrides newer focus", () => {
  for (const [label, width, height] of [
    ["phone sheet", 390, 844],
    ["desktop panel", 1440, 900],
  ] as const) {
    test(`${label}: closing details refocuses the chosen region, not the first one`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/studio");
      const { third } = await selectThirdRackRegion(page);
      const close = page.getByRole("button", { name: "Close equipment details" });
      await close.focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => hasFocus(third)).toBe(true);
    });

    test(`${label}: a delayed restore doesn't steal focus the user has moved`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/studio");
      await selectThirdRackRegion(page);
      await page.getByRole("button", { name: "Close equipment details" }).focus();
      // Close, then move focus in the same task, before the next frame.
      await page.evaluate(() => {
        (document.activeElement as HTMLElement).click();
        document.querySelector<HTMLElement>('[aria-label="Zoom in"]')!.focus();
      });
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Zoom in");
    });
  }

  test("phone sheet: Escape also returns to the chosen region", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/studio");
    const { third } = await selectThirdRackRegion(page);
    await page.getByTestId("equipment-sheet").getByRole("button", { name: "More details" }).focus();
    await page.keyboard.press("Escape");
    await expect.poll(() => hasFocus(third)).toBe(true);
  });
});

test.describe("reloads keep the individual hotspot", () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`${width}×${height}: the chosen region stays selected and visible after a reload`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/studio");
      await selectThirdRackRegion(page);
      await page.reload();
      const viewer = page.getByRole("group", { name: /^Equipment rack/ });
      const regions = viewer.getByRole("button", { name: "Technical equipment rack" });
      await expect(viewer.locator("[data-selected]")).toHaveCount(1);
      await expect(regions.nth(2)).toHaveAttribute("aria-pressed", "true");
      // Keyboard: it can be focused and is visible when focused.
      await regions.nth(2).focus();
      expect(await fullyVisible(regions.nth(2))).toBe(true);
    });
  }
});
