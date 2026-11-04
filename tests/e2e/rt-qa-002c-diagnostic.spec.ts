import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** RT-002D in the browser, at every project width: confirmation step, banners, tampered sessions. */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("a descriptive reply is confirmed before it is recorded; possible silence escalates at once", async ({ page }) => {
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("The green thing isn't working");
  await input.press("Enter");
  await page.getByRole("button", { name: "Yes, that's it" }).click();
  await page.getByRole("button", { name: "Nothing changed" }).click();
  await input.fill("It plays neither music nor speech.");
  await input.press("Enter");

  const log = page.getByRole("log");
  await expect(log.getByText("It sounds like the song has stopped and there's silence. Is that correct?")).toBeVisible();
  await expect(page.getByTestId("urgent-banner")).toContainText("Possible broadcast interruption — not yet confirmed.");
  const responses = page.getByRole("group", { name: "Responses" });
  await expect(responses.getByRole("button", { name: "No — there's silence" })).toBeVisible();
  await expect(responses.getByRole("button", { name: "Yes, it's still playing" })).toBeVisible();
  await expect(responses.getByRole("button", { name: "I'm not sure" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await responses.getByRole("button", { name: "No — there's silence" }).click();
  await expect(log.getByText(/Possible silence on air needs attention straight away/)).toBeVisible();
  await expect(page.getByText(/confirmed by the presenter from their words “It plays neither music nor speech\.”/)).toBeVisible();
});

test("a confirmed broadcast interruption uses the confirmed wording", async ({ page }) => {
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("We have stopped broadcasting.");
  await input.press("Enter");
  await expect(page.getByTestId("urgent-banner")).toContainText("Urgent: a broadcast interruption has been reported.");
});

test("past and hypothetical outages raise no alarm", async ({ page }) => {
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("We were off air earlier, but everything's working now.");
  await input.press("Enter");
  await expect(page.getByRole("log").getByText(/was off air earlier and that you say it's back now/)).toBeVisible();
  await input.fill("We would be off air if I restarted.");
  await input.press("Enter");
  await expect(page.getByTestId("urgent-banner")).toHaveCount(0);
});

test("a tampered saved session is discarded with a notice and nothing from it is shown", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("rt-tamper-done")) return;
    sessionStorage.setItem("rt-tamper-done", "1");
    sessionStorage.setItem(
      "radio-technics.session",
      JSON.stringify({
        version: 4,
        engineVersion: "rt-002d.1",
        lastActivityAt: Date.now(),
        // A button that was never on screen, plus a smuggled urgent state.
        events: [{ input: { type: "option", optionId: "opt:no-silent" }, selectedEquipmentId: null }],
        conversation: { urgent: true, answers: [{ answer: "No — there's silence" }] },
        workspace: {},
      }),
    );
  });
  await page.goto("/troubleshooter");
  await expect(page.getByTestId("restore-failed-notice")).toBeVisible();
  await expect(page.getByTestId("urgent-banner")).toHaveCount(0);
  await expect(page.getByRole("log").getByText("No — there's silence")).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("radio-technics.session"))).toBeNull();
});
