import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(", ")}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

/** Every aria-labelledby / aria-describedby / aria-controls / for reference must point at a real element. */
async function expectValidIdReferences(page: Page, label: string) {
  const broken = await page.evaluate(() => {
    const problems: string[] = [];
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]) {
      for (const el of document.querySelectorAll(`[${attr}]`)) {
        for (const id of (el.getAttribute(attr) ?? "").split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(id)) problems.push(`${attr}="${el.getAttribute(attr)}" → missing #${id}`);
        }
      }
    }
    for (const labelEl of document.querySelectorAll("label[for]")) {
      const id = labelEl.getAttribute("for")!;
      if (!document.getElementById(id)) problems.push(`label for="${id}" → missing`);
    }
    return problems;
  });
  expect(broken, `broken ID references on ${label}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // Animations are disabled so axe measures final colours, not mid-fade ones.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const path of ["/", "/studio", "/dev/hotspots", "/troubleshooter", "/knowledge", "/knowledge/guide-green-button", "/knowledge/ts-next-song-wont-play", "/admin"]) {
  test(`no WCAG A/AA violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expectNoAxeViolations(page, path);
    await expectValidIdReferences(page, path);
  });
}

test("no violations in interactive states", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Green button" }).click();
  await page.getByRole("group", { name: /^Green button/ }).getByRole("button", { name: "Green Myriad button" }).click();
  await expectNoAxeViolations(page, "studio with selection");
  await expectValidIdReferences(page, "studio with selection");

  await page.goto("/troubleshooter");
  const input = page.getByLabel("Describe the problem");
  await input.fill("the green thing isn't working");
  await input.press("Enter");
  await expectNoAxeViolations(page, "troubleshooter question");
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expectNoAxeViolations(page, "clear confirmation");
  await expectValidIdReferences(page, "clear confirmation");
  await page.getByRole("button", { name: "Keep session" }).click();
  await input.fill("dead air");
  await input.press("Enter");
  await expectNoAxeViolations(page, "urgent outcome");
});

test("chat log uses valid list semantics and can be focused for scrolling", async ({ page }) => {
  await page.goto("/troubleshooter");
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log).toHaveAttribute("tabindex", "0");
  await expect(log.getByRole("list")).toHaveCount(1);
  await expect(log.getByRole("listitem").first()).toBeVisible();
});

test("article sections are labelled by their headings", async ({ page }) => {
  await page.goto("/knowledge/guide-green-button");
  await expect(page.getByRole("region", { name: "What it does" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Awaiting engineer confirmation" })).toBeVisible();
});

test("keyboard focus is visible on interactive elements", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab"); // skip link
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("reduced motion removes transitions", async ({ page }) => {
  await page.goto("/studio");
  const duration = await page.getByTestId("viewer-stage").evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.05);
});
