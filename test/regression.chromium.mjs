import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const baseUrl = "http://localhost:5001";
const artifactRoot = path.join(projectRoot, "tmp", "regression-artifacts");

const scenarios = [
  {
    id: "utah-ikon-8",
    title: "Utah Ikon hybrid group",
    form: {
      start_date: "2026-03-13",
      end_date: "2026-03-15",
      destination_preference: "Utah",
      open_to_suggestions: false,
      group_size: "8",
      group_rider_mix: "hybrid",
      skill_levels: ["intermediate", "advanced"],
      travel_mode: "flexible",
      max_drive_hours: "",
      budget_per_person: "1500",
      pass_preset: "ikon",
      pass_breakdown: "",
      lodging_style_preference: "shared_house",
      min_bedrooms: "4",
      max_walk_minutes: "15",
      hot_tub_required: true,
      kitchen_required: true,
      laundry_required: false,
      rental_required: "yes",
      rental_count: "4",
      rental_type: "both"
    }
  },
  {
    id: "tahoe-drive-budget",
    title: "Tahoe drive-only budget snowboard-heavy",
    form: {
      start_date: "2026-04-10",
      end_date: "2026-04-12",
      destination_preference: "Lake Tahoe",
      open_to_suggestions: false,
      group_size: "5",
      group_rider_mix: "snowboarders",
      skill_levels: ["beginner", "intermediate"],
      travel_mode: "drive_only",
      max_drive_hours: "6",
      budget_per_person: "900",
      pass_preset: "none",
      pass_breakdown: "",
      lodging_style_preference: "separate_rooms",
      min_bedrooms: "2",
      max_walk_minutes: "",
      hot_tub_required: false,
      kitchen_required: true,
      laundry_required: true,
      rental_required: "yes",
      rental_count: "3",
      rental_type: "snowboarders"
    }
  }
];

let server = null;
let startedServer = false;

try {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to run regression tests.");
  }

  ensureDir(artifactRoot);

  const healthy = await isServerHealthy();
  if (!healthy) {
    ({ child: server } = await startServer());
    startedServer = true;
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromePath()
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } });

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(artifactRoot, runId);
  ensureDir(runDir);

  const summary = [];
  for (const scenario of scenarios) {
    const outcome = await runScenario(context, scenario, runDir);
    summary.push(outcome);
  }

  await browser.close();
  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ runDir, summary }, null, 2));
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(msg);
  process.exitCode = 1;
} finally {
  if (startedServer && server) {
    server.kill("SIGTERM");
  }
}

async function runScenario(context, scenario, runDir) {
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  const logs = [];
  const started = Date.now();

  page.on("console", (msg) => logs.push(`console:${msg.type()}:${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`pageerror:${err.message}`));

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#trip-intake-form");

    await fillScenario(page, scenario.form);
    await page.screenshot({ path: path.join(runDir, `${scenario.id}-intake.png`), fullPage: true });

    await Promise.all([
      page.waitForURL(/\/results\//, { timeout: 12 * 60 * 1000 }),
      page.click("#generate-itineraries-btn")
    ]);
    await page.waitForSelector("#formatted-results", { timeout: 120000 });
    await page.waitForTimeout(2500);

    const state = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".card.itinerary-card")).map((card) => ({
        title: card.querySelector("h3")?.textContent?.trim() || "",
        sectionCount: card.querySelectorAll(".tile-section").length
      }));
      return {
        path: location.pathname,
        cards,
        cardCount: cards.length,
        fallbackVisible: Boolean(
          Array.from(document.querySelectorAll("#formatted-results .small-muted")).some((el) =>
            el.textContent?.includes("Could not detect itinerary sections automatically")
          )
        ),
        rawToggleText: document.querySelector(".raw-toggle summary")?.textContent?.trim() || ""
      };
    });

    if (state.cardCount < 2) {
      throw new Error(`Expected at least 2 itinerary cards for ${scenario.id}, got ${state.cardCount}.`);
    }
    if (state.fallbackVisible) {
      throw new Error(`Fallback parser message shown for ${scenario.id}.`);
    }
    if (!state.rawToggleText.toLowerCase().includes("raw chatgpt interaction")) {
      throw new Error(`Raw interaction toggle missing for ${scenario.id}.`);
    }

    await page.screenshot({ path: path.join(runDir, `${scenario.id}-results.png`), fullPage: true });
    fs.writeFileSync(
      path.join(runDir, `${scenario.id}.json`),
      JSON.stringify({ scenario, state, logs }, null, 2)
    );

    return {
      id: scenario.id,
      title: scenario.title,
      ok: true,
      durationSec: Math.round((Date.now() - started) / 1000),
      cardCount: state.cardCount,
      path: state.path
    };
  } catch (error) {
    await page.screenshot({ path: path.join(runDir, `${scenario.id}-error.png`), fullPage: true });
    const msg = error instanceof Error ? error.message : String(error);
    fs.writeFileSync(path.join(runDir, `${scenario.id}-error.txt`), `${msg}\n\n${logs.join("\n")}`);
    throw error;
  } finally {
    await page.close();
  }
}

async function fillScenario(page, f) {
  await page.fill('input[name="start_date"]', f.start_date);
  await page.fill('input[name="end_date"]', f.end_date);

  if (f.open_to_suggestions) await page.check('input[name="open_to_suggestions"]');
  await page.fill('input[name="destination_preference"]', f.destination_preference || "");

  await page.fill('input[name="group_size"]', f.group_size);
  if (f.group_rider_mix) await page.selectOption('select[name="group_rider_mix"]', f.group_rider_mix);
  for (const skill of f.skill_levels || []) {
    await page.check(`input[name="skill_levels"][value="${skill}"]`);
  }

  if (f.travel_mode) await page.selectOption('select[name="travel_mode"]', f.travel_mode);
  await page.fill('input[name="max_drive_hours"]', f.max_drive_hours || "");

  await page.fill('input[name="budget_per_person"]', f.budget_per_person);
  if (f.pass_preset) await page.selectOption('select[name="pass_preset"]', f.pass_preset);
  if (f.pass_preset === "explicit_breakdown") {
    await page.fill('textarea[name="pass_breakdown"]', f.pass_breakdown || "");
  }

  if (f.lodging_style_preference) {
    await page.selectOption('select[name="lodging_style_preference"]', f.lodging_style_preference);
  }
  await page.fill('input[name="min_bedrooms"]', f.min_bedrooms || "");
  await page.fill('input[name="max_walk_minutes"]', f.max_walk_minutes || "");

  await setCheckbox(page, 'input[name="hot_tub_required"]', !!f.hot_tub_required);
  await setCheckbox(page, 'input[name="kitchen_required"]', !!f.kitchen_required);
  await setCheckbox(page, 'input[name="laundry_required"]', !!f.laundry_required);

  if (f.rental_required) await page.selectOption('select[name="rental_required"]', f.rental_required);
  await page.fill('input[name="rental_count"]', f.rental_count || "");
  if (f.rental_type) await page.selectOption('select[name="rental_type"]', f.rental_type);
}

async function setCheckbox(page, selector, checked) {
  const current = await page.isChecked(selector);
  if (checked && !current) await page.check(selector);
  if (!checked && current) await page.uncheck(selector);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function isServerHealthy() {
  try {
    const response = await fetch(`${baseUrl}/`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  const child = spawn("npm", ["run", "dev"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: "5001" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const start = Date.now();
  const timeoutMs = 30000;
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  while (Date.now() - start < timeoutMs) {
    if (await isServerHealthy()) {
      return { child };
    }
    if (child.exitCode != null) {
      throw new Error(`Server exited early.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  child.kill("SIGTERM");
  throw new Error(`Timed out waiting for dev server.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
}

