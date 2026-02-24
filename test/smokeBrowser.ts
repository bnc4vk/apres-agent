import assert from "node:assert/strict";
import { chromium, Page } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5051";
const PHASE = process.env.PHASE_NAME ?? "smoke";

async function waitForBubbleCount(page: Page, minCount: number, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (expected) => document.querySelectorAll("#chat .bubble").length >= expected,
    minCount,
    { timeout }
  );
}

async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator("#chat-input");
  await input.fill(text);
  await page.locator("#chat-form button[type='submit']").click();
}

async function waitForAssistantContains(page: Page, text: string, timeout = 45_000): Promise<void> {
  await page.waitForFunction(
    (needle) => {
      const bubbles = Array.from(document.querySelectorAll("#chat .bubble.assistant"));
      return bubbles.some((el) => (el.textContent ?? "").toLowerCase().includes(String(needle).toLowerCase()));
    },
    text,
    { timeout }
  );
}

async function run(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1");
    await page.waitForSelector("#chat-input");
    await waitForBubbleCount(page, 1);

    const title = await page.locator("h1").textContent();
    assert.equal(title?.trim(), "Apres AI");

    // Drive the app to a final itinerary state.
    await sendMessage(
      page,
      "We are 4 people, beginners. Feb 20-23, need rentals, mid budget, no flying, max 4 hours driving. Open to suggestions. No passes."
    );
    await waitForBubbleCount(page, 3);
    await waitForAssistantContains(page, "departure");

    await sendMessage(page, "3 from SF, 1 from Sacramento");
    await page.waitForSelector("text=Refresh Live Options");
    await page.waitForSelector("text=Decision matrix");

    // Exercise impacted interactive actions used across route refactors.
    const initialCount = await page.locator("#chat .bubble").count();
    await page.locator("button:has-text('Expand')").first().click();
    await waitForBubbleCount(page, initialCount + 1);

    await page.locator("button:has-text('Refresh Live Options')").click();
    await waitForAssistantContains(page, "refreshed live options and scoring");

    await page.locator("button:has-text('Lock + Recompute')").first().click();
    await waitForAssistantContains(page, "locked ");

    await page.locator("button:has-text('Bootstrap Splitwise')").click();
    await waitForAssistantContains(page, "splitwise bootstrap completed");

    await page.locator("button:has-text('Bootstrap Group Chat')").click();
    await waitForAssistantContains(page, "group chat bootstrap completed");

    console.log(`Chromium smoke passed: ${PHASE}`);
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(`Chromium smoke failed: ${PHASE}`);
  console.error(error);
  process.exit(1);
});
