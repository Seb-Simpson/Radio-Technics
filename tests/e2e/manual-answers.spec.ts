import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Phase 1: short answers from the manual, shown in search, on the article and at troubleshooter outcomes. */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function expectCleanLayout(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("a presenter's question shows the manual's short answer and opens the article", async ({ page }) => {
  await page.goto("/knowledge");
  await page.getByLabel("Describe the problem, or search for a topic").fill("how do I play the next song");
  const results = page.getByRole("region", { name: "Search results" });
  await expect(results.getByText("Quick answer").first()).toBeVisible();
  await expect(results.getByText("From the Myriad 6 manual").first()).toBeVisible();
  await expectCleanLayout(page);

  await page.goto("/knowledge/kb-myriad-next-item");
  const quick = page.getByRole("region", { name: "Quick answer" });
  await expect(quick).toBeVisible();
  await expect(quick.getByText("From the Myriad 6 manual")).toBeVisible();
  const original = quick.getByRole("link", { name: /Read the original/ });
  await expect(original).toBeVisible();
  await expect(original).toHaveAttribute("href", /^https:\/\//);
  await expectCleanLayout(page);
});

test("the troubleshooter outcome points to the manual after the technical-support message", async ({ page }) => {
  await page.goto("/troubleshooter");
  await page.getByLabel("Describe the problem").fill("the green thing isn't working");
  await page.keyboard.press("Enter");
  const press = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    await page.waitForTimeout(400); // new answer buttons are armed after a short pause
    await button.click();
  };
  await press("Yes, that's it");
  await press("Nothing changed");
  await press("Yes, it's still playing");
  await expect(page.getByRole("log").getByText(/Please contact technical support/)).toBeVisible();
  const section = page.getByRole("region", { name: "What the manual says" });
  await expect(section).toBeVisible();
  const item = section.getByRole("listitem").filter({ has: page.getByRole("link", { name: /Understanding the next item in the log/ }) });
  await expect(item.getByText("From the Myriad 6 manual")).toBeVisible();
  await section.getByRole("link", { name: /Understanding the next item in the log/ }).click();
  await expect(page).toHaveURL(/\/knowledge\/kb-myriad-next-item$/);
});

test("the troubleshooter outcome is accessible with the manual links showing", async ({ page }) => {
  await page.goto("/troubleshooter");
  await page.getByLabel("Describe the problem").fill("the green thing isn't working");
  await page.keyboard.press("Enter");
  for (const name of ["Yes, that's it", "Nothing changed", "Yes, it's still playing"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.getByRole("region", { name: "What the manual says" })).toBeVisible();
  await expectCleanLayout(page);
});
