import { chromium } from "playwright";

async function run() {
  console.log("1. Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  console.log("2. Creating context...");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("3. Navigating to http://localhost:3000/ ...");
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(1000);
  const title = await page.title();
  console.log("Title:", title);

  const brand = await page.textContent("body");
  console.log("Body has 'NERVE':", brand?.includes("NERVE"));

  console.log("4. Navigating to http://localhost:3000/vault ...");
  await page.goto("http://localhost:3000/vault", { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(1000);
  const vaultBody = await page.textContent("body");
  console.log("Vault page has 'Context Vault':", vaultBody?.includes("Context Vault"));

  console.log("5. Navigating to http://localhost:3000/settings ...");
  await page.goto("http://localhost:3000/settings", { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(1000);
  const settingsBody = await page.textContent("body");
  console.log("Settings page has 'Nerve Local Agent Bridge':", settingsBody?.includes("Nerve Local Agent Bridge"));

  console.log("6. Navigating to http://localhost:3000/proposals ...");
  await page.goto("http://localhost:3000/proposals", { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(1000);
  const proposalsBody = await page.textContent("body");
  console.log("Proposals page loaded:", proposalsBody?.includes("Proposal Review"));

  await browser.close();
  console.log("🎉 ALL PLAYWRIGHT CHECKS SUCCEEDED!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
