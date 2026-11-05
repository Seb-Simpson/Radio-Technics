import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** RT-QA-002D browser regressions (RT-002D-R1), at every project width. */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function toGreenScreenQuestion(page: Page) {
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("The green thing isn't working");
  await input.press("Enter");
  await page.getByRole("group", { name: "Responses" }).getByRole("button", { name: "Yes, that's it" }).click();
  await expect(page.getByRole("log").getByText("What happened on the Myriad screen after you pressed the green button?")).toBeVisible();
}

const responses = (page: Page) => page.getByRole("group", { name: "Responses" });
/** Presenter messages in the log, in order. */
const userMessages = (page: Page) => page.locator('[role="log"] li[data-role="user"]').allInnerTexts();
const savedEvents = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("radio-technics.session") ?? "{\"events\":[]}").events as { input: { type: string; optionId?: string } }[]);

test("a double-click answers one question only — never the next one in the same place", async ({ page }) => {
  await toGreenScreenQuestion(page);
  await responses(page).getByRole("button", { name: "Nothing changed" }).dblclick();
  await expect(page.getByRole("log").getByText("Is the song that was already playing still playing?")).toBeVisible();
  await page.waitForTimeout(300);
  const said = await userMessages(page);
  expect(said.filter((t) => t.includes("Nothing changed"))).toHaveLength(1);
  expect(said.some((t) => t.includes("still playing") || t.includes("silence"))).toBe(false);
  // Only one press was saved.
  const presses = (await savedEvents(page)).filter((e) => e.input.type === "option");
  expect(presses).toHaveLength(2); // "Yes, that's it" + "Nothing changed"
});

test("two fast separate clicks on the same spot don't cross question boundaries", async ({ page }) => {
  await toGreenScreenQuestion(page);
  const first = responses(page).getByRole("button", { name: "Nothing changed" });
  // Wait until this question's buttons are armed; then three raw clicks in a row.
  await expect(first).not.toHaveAttribute("aria-disabled", "true");
  const box = (await first.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  const said = await userMessages(page);
  expect(said.filter((t) => t.includes("Nothing changed"))).toHaveLength(1);
  expect(said.some((t) => /still playing|silence/.test(t))).toBe(false);
});

test("holding Enter down doesn't keep answering the following questions", async ({ page }) => {
  await toGreenScreenQuestion(page);
  const first = responses(page).getByRole("button", { name: "Nothing changed" });
  await expect(first).not.toHaveAttribute("aria-disabled", "true");
  await first.focus();
  await page.keyboard.down("Enter");
  for (let i = 0; i < 5; i++) await page.keyboard.down("Enter"); // auto-repeat
  await page.keyboard.up("Enter");
  await page.waitForTimeout(300);
  const said = await userMessages(page);
  expect(said.filter((t) => t.includes("Nothing changed"))).toHaveLength(1);
  expect(said.some((t) => /still playing|silence/.test(t))).toBe(false);
});

test("typed replies never become answers; a correction supersedes and survives a reload", async ({ page }) => {
  await toGreenScreenQuestion(page);
  await responses(page).getByRole("button", { name: "Nothing changed" }).click();
  const input = page.getByLabel("Describe the problem");
  await input.fill("yes it is");
  await input.press("Enter");
  // A suggestion, with the real buttons; nothing recorded yet.
  await expect(page.getByRole("log").getByText(/It sounds like .*Is that correct\?/).last()).toBeVisible();
  await responses(page).getByRole("button", { name: "Yes, it's still playing" }).click();

  // Change it.
  await responses(page).getByRole("button", { name: "Change an earlier answer" }).click();
  await responses(page).getByRole("button", { name: /still playing.*you answered “Yes, it's still playing”/ }).click();
  await responses(page).getByRole("button", { name: "No — there's silence" }).click();
  await expect(page.getByTestId("urgent-banner")).toBeVisible();
  const summary = page.getByLabel("Summary text");
  await expect(summary).toContainText("No — there's silence (corrected — was “Yes, it's still playing”)");
  await expect(summary).toContainText("Yes, it's still playing (superseded)");
  const before = await summary.innerText();

  // Real reload: the conversation is rebuilt by replaying the saved presses.
  await page.reload();
  await expect(page.getByText(/has been restored/)).toBeVisible();
  await expect(page.getByLabel("Summary text")).toHaveText(before);
});

test("the urgent control works from other pages; 'resumed' is shown as reported, not verified", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: "We're off air / urgent broadcast problem" }).click();
  await expect(page).toHaveURL(/\/troubleshooter$/);
  const banner = page.getByTestId("urgent-banner");
  await expect(banner).toContainText("Urgent: a broadcast interruption has been reported.");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await banner.getByRole("button", { name: "Broadcasting has resumed" }).click();
  await expect(banner).toContainText("You've reported that broadcasting has resumed");
  await expect(page.getByLabel("Summary text")).toContainText("not independently verified");
});

test("the Knowledge Centre hands a broadcast concern to the troubleshooter as possible, not as an answer", async ({ page }) => {
  await page.goto("/knowledge");
  await page.getByLabel("Describe the problem, or search for a topic").fill("we've gone off air");
  await page.getByRole("region", { name: "Search results" }).getByRole("button", { name: "Open the troubleshooter" }).click();
  await expect(page).toHaveURL(/\/troubleshooter$/);
  await expect(page.getByTestId("urgent-banner")).toContainText("Possible broadcast interruption — not yet confirmed.");
  await expect(page.getByRole("log").getByText("From my Knowledge Centre search: “we've gone off air”")).toBeVisible();
});

test("over-long text is refused with a reason, nothing is cut or saved", async ({ page }) => {
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill(`${"padding ".repeat(70)}we are off air`);
  await input.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: /the limit is 500/ })).toBeVisible();
  await expect(page.getByTestId("urgent-banner")).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("radio-technics.session"))).toBeNull();
});
