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
  const menu = page.getByRole("button", { name: "Menu" });
  for (const section of sections) {
    // Phones and tablets use the compact menu; large screens the sidebar.
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: new RegExp(`^${section.label}`) }).click();
    await expect(page).toHaveURL(new RegExp(`${section.path === "/" ? "/$" : section.path}$`));
    await expect(page.getByRole("heading", { level: 1, name: section.heading })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test("selecting a hotspot shows equipment details", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Green button" }).click();
  await page.getByRole("group", { name: /^Green button/ }).getByRole("button", { name: "Green Myriad button" }).click();
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

  const console = page.getByRole("group", { name: /^Mixing console/ }).getByRole("button", { name: "Main broadcast mixing console" });
  const box = (await console.boundingBox())!;
  const stage = page.getByTestId("viewer-stage");
  const before = await stage.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => stage.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
  // The drag must not have selected anything (side panel on desktop, sheet on smaller screens).
  await expect(page.getByRole("heading", { level: 2, name: "Main broadcast mixing console" })).toHaveCount(0);

  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(zoom).toHaveText("100%");
});

test("keyboard users can reach hotspots and see focus", async ({ page }) => {
  await page.goto("/studio");
  const viewer = page.getByRole("group", { name: /^Mixing console/ });
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
    await expect(workspace.getByRole("group", { name: /^Myriad screen/ }).getByRole("button", { name: "Myriad playout software" })).toHaveAttribute("data-highlighted", "true");
    await expect(page).toHaveURL(/\/troubleshooter$/);
  } else {
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("group", { name: /^Myriad screen/ }).getByRole("button", { name: "Myriad playout software" })).toHaveAttribute("data-highlighted", "true");
    await page.getByRole("link", { name: "Back to conversation" }).first().click();
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
  await page.getByLabel("Describe the problem, or search for a topic").fill("green button");
  await page.getByRole("region", { name: "Search results" }).locator('a[href="/knowledge/guide-green-button"]').click();
  await expect(page.getByRole("heading", { level: 1, name: "The green next-song button" })).toBeVisible();
  await expect(page.getByText("It is not an approved station procedure", { exact: false })).toBeVisible();
});

test("unknown pages show a helpful not-found page", async ({ page }) => {
  const response = await page.goto("/knowledge/not-a-real-article");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
});

test("web app manifest and icons are served", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "Radio Technics", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
  expect((await request.get("/apple-icon.png")).ok()).toBe(true);
});
