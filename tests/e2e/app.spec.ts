import { expect, test, type Page } from "@playwright/test";

const sections = [
  { label: "Studio Explorer", path: "/studio", heading: "Explore the studio" },
  { label: "Troubleshooter", path: "/troubleshooter", heading: "What's the problem?" },
  { label: "Knowledge Centre", path: "/knowledge", heading: "Guides and help topics" },
  { label: "Administration", path: "/admin", heading: "Content records" },
  { label: "Dashboard", path: "/", heading: "Studio help, in plain English" },
];

async function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("main navigation reaches every section without errors", async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto("/");
  for (const section of sections) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: section.label }).click();
    await expect(page).toHaveURL(new RegExp(`${section.path === "/" ? "/$" : section.path}$`));
    await expect(page.getByRole("heading", { level: 1, name: section.heading })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test("selecting a hotspot shows equipment details", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: /^Green Myriad button \(placeholder/ }).click();
  const panel = page.getByRole("complementary", { name: "Selected equipment" });
  await expect(panel.getByRole("heading", { name: "Green Myriad button" })).toBeVisible();
  await expect(panel.getByText("Advances Myriad to the next song.", { exact: true })).toBeVisible();
});

test("zoom controls work and dragging pans without selecting", async ({ page }) => {
  await page.goto("/studio");
  const zoom = page.getByRole("status", { name: "Zoom level" });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).toHaveText("196%");

  const console = page.getByRole("button", { name: /^Main broadcast mixing console \(placeholder/ });
  const box = (await console.boundingBox())!;
  const stage = page.getByTestId("viewer-stage");
  const before = await stage.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => stage.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
  await expect(page.getByText("Select a piece of equipment")).toBeVisible();

  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(zoom).toHaveText("100%");
});

test("keyboard users can reach hotspots and see focus", async ({ page }) => {
  await page.goto("/studio");
  const viewer = page.getByRole("group", { name: /Illustrative layout/ });
  await viewer.focus();
  await page.keyboard.press("+");
  await expect(page.getByRole("status", { name: "Zoom level" })).toHaveText("140%");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("data-equipment-id", /.+/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Selected equipment" }).getByRole("heading", { level: 2 })).toBeVisible();
});

test("troubleshooter clarifies, then highlights equipment in the studio", async ({ page }, testInfo) => {
  const errors = await collectErrors(page);
  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("It's not doing anything");
  await input.press("Enter");
  await expect(page.getByRole("log").getByText(/^What isn't responding\?/)).toBeVisible();

  await page.getByRole("group", { name: "Responses" }).getByRole("button", { name: "Green Myriad button" }).click();
  await expect(page.getByRole("log").getByText("What happened on the Myriad screen after you pressed the green button?")).toBeVisible();

  await page.getByRole("button", { name: "Show me where" }).click();
  const wide = testInfo.project.name === "desktop";
  if (wide) {
    // Embedded workspace beside the chat.
    const workspace = page.getByRole("region", { name: "Studio workspace" });
    await expect(workspace.getByRole("button", { name: /^Myriad playout software \(placeholder/ })).toHaveAttribute("data-highlighted", "true");
    await expect(page).toHaveURL(/\/troubleshooter$/);
  } else {
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("button", { name: /^Myriad playout software \(placeholder/ })).toHaveAttribute("data-highlighted", "true");
    await page.getByRole("link", { name: "Back to troubleshooter" }).click();
    await expect(page.getByRole("log").getByText("What happened on the Myriad screen after you pressed the green button?")).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("dashboard topic starts a troubleshooting conversation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /My microphone isn't working/ }).click();
  await expect(page).toHaveURL(/\/troubleshooter$/);
  await expect(page.getByRole("log").getByText("I want to make sure I've got the right thing. Which of these do you mean?")).toBeVisible();
});

test("knowledge article shows verification status", async ({ page }) => {
  await page.goto("/knowledge");
  await page.getByLabel("Search help topics").fill("green");
  await page.getByRole("link", { name: /The green Myriad button/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "The green Myriad button" })).toBeVisible();
  await expect(page.getByText("Do not treat this article as an official station procedure.", { exact: false })).toBeVisible();
});

test("unknown pages show a helpful not-found page", async ({ page }) => {
  const response = await page.goto("/knowledge/not-a-real-article");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
});
