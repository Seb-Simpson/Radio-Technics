import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** RT-003 Knowledge Centre: search, articles and links to the studio, at every width. */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("presenter phrasing finds help, and Show in studio highlights the equipment", async ({ page }) => {
  await page.goto("/knowledge");
  await page.getByLabel("Describe the problem, or search for a topic").fill("The green button stopped working");
  const results = page.getByRole("region", { name: "Search results" });
  await expect(results.getByText("The green next-song button isn't working", { exact: true })).toBeVisible();
  await expect(results.locator('a[href="/knowledge/guide-green-button"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await results.getByRole("button", { name: "Show in studio" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("group", { name: /^Green button/ }).getByRole("button", { name: "Green Myriad button" })).toHaveAttribute("data-highlighted", "true");
});

test("Start troubleshooting hands over to the troubleshooter", async ({ page }) => {
  await page.goto("/knowledge");
  await page.getByLabel("Describe the problem, or search for a topic").fill("It's stuck on the same song");
  await page.getByRole("region", { name: "Search results" }).getByRole("button", { name: "Start troubleshooting" }).first().click();
  await expect(page).toHaveURL(/\/troubleshooter$/);
  await expect(page.getByRole("log").getByText("The next song won't play")).toBeVisible();
});

test("ambiguous and unknown questions are handled honestly", async ({ page }) => {
  await page.goto("/knowledge");
  const box = page.getByLabel("Describe the problem, or search for a topic");
  await box.fill("Nothing's coming out");
  await expect(page.getByText("Which is closest?")).toBeVisible();
  await expect(page.getByText("Listeners may be hearing nothing (possible silence on air)", { exact: true })).toBeVisible();
  await box.fill("how do I make a cup of tea");
  await expect(page.getByText(/won't guess an answer/)).toBeVisible();
});

test("selected equipment is used as context for a vague question", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Green button" }).click();
  await page.getByRole("group", { name: /^Green button/ }).getByRole("button", { name: "Green Myriad button" }).click();
  // Navigate within the app so the selection is kept.
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Knowledge Centre/ }).click();
  await page.getByLabel("Describe the problem, or search for a topic").fill("Why isn't it working?");
  await expect(page.getByText(/these results use your selection/)).toBeVisible();
  await expect(page.getByText("The green next-song button isn't working", { exact: true })).toBeVisible();
});

test("an article shows authority, sources, open questions and related links", async ({ page }) => {
  await page.goto("/knowledge/kb-myriad-screen");
  await expect(page.getByRole("heading", { level: 1, name: "What the Myriad screen shows" })).toBeVisible();
  await expect(page.getByText("Information only").first()).toBeVisible();
  await expect(page.getByText("Applies to:")).toContainText("Myriad Playout 6");
  await expect(page.getByRole("region", { name: "Unresolved — waiting for the station engineer" })).toContainText("red and green squares");
  const sources = page.getByRole("region", { name: "Sources" });
  await expect(sources.getByRole("link", { name: /Understanding the Dashboard in Myriad Playout 6/ })).toHaveAttribute("href", /help\.broadcastradio\.com/);
  await expect(sources.getByText(/read 2026-11-26/).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("region", { name: "Related articles" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/knowledge\/kb-myriad-/);
});

test("the search box stays visible and usable when focused on phones", async ({ page }) => {
  await page.goto("/knowledge");
  const box = page.getByLabel("Describe the problem, or search for a topic");
  await box.focus();
  await expect(box).toBeInViewport({ ratio: 1 });
  await page.keyboard.type("red square");
  await expect(page.getByText("What a colour or symbol on the Myriad screen means", { exact: true })).toBeVisible();
});
