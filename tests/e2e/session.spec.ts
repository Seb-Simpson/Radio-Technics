import { expect, test } from "@playwright/test";

test("a refresh restores the conversation, step and selected equipment; End session clears it", async ({ page }) => {
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("The green thing isn't working");
  await input.press("Enter");
  await page.getByRole("button", { name: "Yes, that's it" }).click();
  const question = "What happened on the Myriad screen after you pressed the green button?";
  await expect(page.getByRole("log").getByText(question)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("log").getByText("The green thing isn't working")).toBeVisible();
  await expect(page.getByText(/has been restored/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Nothing changed" })).toBeVisible(); // same step
  await expect(page.getByText("Selected in Studio Explorer:")).toBeVisible();

  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "End session" }).click();
  await page.reload();
  await expect(page.getByRole("log").getByText("The green thing isn't working")).toHaveCount(0);
  await expect(page.getByText(/has been restored/)).toHaveCount(0);
});

test("a new tab does not see another tab's conversation", async ({ page, context }) => {
  await page.goto("/troubleshooter");
  await page.getByLabel("Describe the problem").fill("dead air");
  await page.getByLabel("Describe the problem").press("Enter");
  const other = await context.newPage();
  await other.goto("/troubleshooter");
  await expect(other.getByRole("log").getByText("dead air")).toHaveCount(0);
});

test("choosing a dashboard topic mid-conversation keeps what was already said", async ({ page }) => {
  await page.goto("/troubleshooter");
  await page.getByLabel("Describe the problem").fill("The green thing isn't working");
  await page.getByLabel("Describe the problem").press("Enter");
  await page.goto("/");
  await page.getByRole("button", { name: /I can't hear anything/ }).click();
  await expect(page).toHaveURL(/\/troubleshooter$/);
  await expect(page.getByRole("log").getByText("The green thing isn't working")).toBeVisible();
  await expect(page.getByRole("log").getByText("Where are you trying to hear the sound?")).toBeVisible();
});

test("corrupted saved data is ignored without breaking the page", async ({ page }) => {
  await page.goto("/troubleshooter");
  await page.evaluate(() => sessionStorage.setItem("radio-technics.session", "{broken"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "What's the problem?" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("radio-technics.session"))).toBeNull();
  expect(errors).toEqual([]);
});
