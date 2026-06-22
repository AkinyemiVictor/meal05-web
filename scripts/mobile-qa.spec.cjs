const { test, expect } = require("@playwright/test");

const baseURL = process.env.QA_BASE_URL || "http://localhost:3000";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

const waitForSettledPage = async (page) => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(700);
};

const getOverflow = (page) =>
  page.evaluate(() => {
    const body = document.body;
    const root = document.documentElement;
    return Math.max(body?.scrollWidth || 0, root?.scrollWidth || 0) - window.innerWidth;
  });

const pageText = (page) => page.locator("body").innerText({ timeout: 5000 }).catch(() => "");

test("mobile main customer flows", async ({ page, request }) => {
  test.setTimeout(120000);
  const errors = [];
  const visited = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (!/favicon|Failed to load resource: the server responded with a status of 404/i.test(text)) {
        errors.push(`console: ${text}`);
      }
    }
  });

  const visit = async (path, label) => {
    await page.goto(`${baseURL}${path}`);
    await waitForSettledPage(page);
    const overflow = await getOverflow(page);
    const text = await pageText(page);
    visited.push({ label, path, overflow, text: text.slice(0, 160).replace(/\s+/g, " ") });
    expect(overflow, `${label} should not overflow horizontally`).toBeLessThanOrEqual(4);
    expect(text.trim().length, `${label} should render body content`).toBeGreaterThan(0);
  };

  await visit("/", "home");
  await visit("/categories", "category index");

  const categoriesResponse = await request.get(`${baseURL}/api/categories`);
  if (categoriesResponse.ok()) {
    const payload = await categoriesResponse.json();
    const slug = Array.isArray(payload?.categories) ? payload.categories.find((entry) => entry?.slug)?.slug : "";
    if (slug) {
      await visit(`/categories/${slug}`, "category detail");
    }
  }

  await visit("/search?q=zzzz-mobile-qa-no-results", "search no results");
  await expect(page.locator("body")).toContainText(/No|Search|results|Browse/i);

  await page.goto(`${baseURL}/shop`);
  await waitForSettledPage(page);
  const productHref = await page.locator('a[href^="/products/"]').first().getAttribute("href").catch(() => "");
  if (productHref) {
    await visit(productHref, "product detail");
  }

  await page.goto(`${baseURL}/categories/fruits`);
  await waitForSettledPage(page);
  const quickAddButton = page
    .getByRole("button", { name: /add to order|add to cart/i })
    .first();
  await expect(quickAddButton, "in-stock category should expose quick add").toBeVisible();
  await expect(quickAddButton, "quick add button should be enabled").toBeEnabled();
  await quickAddButton.click();
  await expect(page.locator(".quick-add-panel"), "quick add should open on mobile").toBeVisible();
  await expect(page.locator(".quick-add-cta"), "quick add should load purchasable options").toBeVisible();

  await visit("/cart", "cart");
  await visit("/checkout", "checkout");
  await expect(page.locator("body")).toContainText(/Checkout|cart|Loading|empty|order/i);
  await visit("/sign-in?tab=login#loginForm", "login");
  await expect(page.locator("#login-email")).toBeVisible();

  console.log("MOBILE_QA_VISITED", JSON.stringify(visited, null, 2));
  expect(errors, `browser errors:\n${errors.join("\n")}`).toEqual([]);
});
