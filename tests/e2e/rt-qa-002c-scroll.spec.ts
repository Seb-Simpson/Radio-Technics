import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * RT-QA-002C: competing scroll effects could move the reply box out of view
 * after an assistant message (seen at 1440×500). These tests drive real
 * conversations and wait for scrolling — including smooth-scroll animation —
 * to finish before checking, with and without reduced motion.
 * Each test sets its own window size, so it runs once (desktop project).
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "sets its own viewport sizes");
});

/** Wait until the page and the conversation log stop scrolling (smooth scrolling included). */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const log = document.querySelector('[role="log"]');
        let last = "";
        let stable = 0;
        const tick = () => {
          const now = `${window.scrollY}|${log?.scrollTop ?? 0}`;
          stable = now === last ? stable + 1 : 0;
          last = now;
          if (stable >= 8) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

async function fullyVisible(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [
      [0.5, 0.5],
      [0.1, 0.1],
      [0.9, 0.9],
    ].every(([fx, fy]) => {
      const x = r.left + r.width * fx!;
      const y = r.top + r.height * fy!;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    });
  });
}

/**
 * The first assistant message after the presenter's latest message, and
 * whether it fits on screen together with the reply box.
 */
async function replyLayout(page: Page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>('[role="log"] li[data-role]')];
    const lastUser = items.map((el) => el.dataset.role).lastIndexOf("user");
    const reply = items.slice(lastUser + 1).find((el) => el.dataset.role === "assistant") ?? items[items.length - 1]!;
    const form = document.querySelector("form:has(#troubleshooter-input)")!;
    const header = document.querySelector<HTMLElement>("[data-app-header]");
    const pos = header ? getComputedStyle(header).position : "";
    const headerBottom = header && (pos === "sticky" || pos === "fixed") ? header.getBoundingClientRect().bottom : 0;
    const r = reply.getBoundingClientRect();
    const fits = form.getBoundingClientRect().bottom - r.top <= innerHeight - 16 - headerBottom;
    const replyTopVisible = r.top >= headerBottom - 1 && r.top < innerHeight;
    return { fits, replyTopVisible };
  });
}

/** The newest message is in view (its top or bottom edge is on screen). */
async function newestMessageVisible(page: Page) {
  return page.evaluate(() => {
    const last = document.querySelector('[role="log"] li:last-child');
    if (!last) return false;
    const r = last.getBoundingClientRect();
    const log = document.querySelector('[role="log"]')!.getBoundingClientRect();
    const top = Math.max(0, log.top);
    const bottom = Math.min(innerHeight, log.bottom);
    return r.bottom > top && r.top < bottom;
  });
}

const SIZES = [
  [1440, 500],
  [1440, 719],
  [1440, 720],
  [1440, 768],
  [1440, 900],
  [390, 844],
  [375, 667],
  [320, 568],
] as const;

for (const motion of ["reduce", "no-preference"] as const) {
  for (const [width, height] of SIZES) {
    test(`${width}×${height}, motion ${motion}: the reply box stays usable through a long conversation`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await page.setViewportSize({ width, height });
      await page.goto("/troubleshooter");
      const input = page.getByLabel("Describe the problem");

      /**
       * The scroll rule: the new reply's start is always in view. If it fits on
       * screen with the reply box, both are visible; otherwise the reply box is
       * one focus away and becomes fully visible when focused.
       */
      const checkLayout = async (when: string) => {
        const { fits, replyTopVisible } = await replyLayout(page);
        expect(replyTopVisible, `start of the new reply visible ${when}`).toBe(true);
        expect(await newestMessageVisible(page), `newest message visible ${when}`).toBe(true);
        if (fits) {
          expect(await fullyVisible(input), `reply box visible ${when}`).toBe(true);
        } else {
          await input.focus();
          await settle(page);
          expect(await fullyVisible(input), `reply box visible once focused ${when}`).toBe(true);
        }
      };

      const send = async (text: string) => {
        await input.fill(text);
        await input.press("Enter");
        await expect(page.getByRole("log").getByText(text, { exact: true }).last()).toBeVisible();
        await settle(page);
        await checkLayout(`after "${text}"`);
      };

      const pressAnswer = async (name: string) => {
        await page.getByRole("button", { name }).click();
        await settle(page);
        await checkLayout(`after pressing "${name}"`);
      };

      await send("The green thing isn't working");
      await pressAnswer("Yes, that's it");
      await pressAnswer("Nothing changed");
      // A descriptive reply produces a confirmation question (RT-002D).
      await send("I think it's still going");
      for (let i = 0; i < 6; i++) await send(`Extra detail number ${i + 1} for technical support`);

      // A restored conversation is just as usable.
      await page.reload();
      await expect(page.getByText(/has been restored/)).toBeVisible();
      await settle(page);
      await input.focus();
      await settle(page);
      expect(await fullyVisible(input), "reply box visible after restore").toBe(true);
      await send("Still here after the reload");
    });
  }
}

test("focusing an answer button doesn't jump the page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("The green thing isn't working");
  await input.press("Enter");
  await settle(page);
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "I'm not sure" }).focus();
  await settle(page);
  const after = await page.evaluate(() => window.scrollY);
  // Focus only scrolls if the button itself was off screen.
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
});
