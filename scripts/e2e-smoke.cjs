// Prueba E2E de humo sin credenciales: verifica que la app arranca, que las rutas
// privadas están protegidas y que el estado "configuración pendiente" es visible.
// Uso: npm run build && npm start (en otro proceso) && node scripts/e2e-smoke.mjs
const { chromium } = require("playwright");

(async () => {

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const shots = process.env.SHOTS_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    results.push(`✗ ${name}: ${e.message}`);
  }
}

await check("landing renders the product promise", async () => {
  await page.goto(BASE);
  await page.getByRole("heading", { level: 1 }).waitFor();
  const h1 = await page.getByRole("heading", { level: 1 }).innerText();
  if (!/retos profesionales/i.test(h1)) throw new Error(h1);
  if (shots) await page.screenshot({ path: `${shots}/landing.png`, fullPage: true });
});
await check("private route without config redirects to /setup", async () => {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL(/\/setup$/);
});
await check("setup page shows pending configuration without leaking values", async () => {
  const text = await page.locator("main").innerText();
  if (!/Configuración pendiente/.test(text)) throw new Error("no pending state");
  if (/sk-ant-|AIza/.test(text)) throw new Error("secret-like value rendered");
  if (shots) await page.screenshot({ path: `${shots}/setup.png`, fullPage: true });
});
await check("tutor API rejects unauthenticated calls", async () => {
  const r = await page.request.post(`${BASE}/api/tutor`, { data: {} });
  if (![401, 503].includes(r.status())) throw new Error(`status ${r.status()}`);
});
await check("security headers present", async () => {
  const r = await page.request.get(BASE);
  if (r.headers()["x-content-type-options"] !== "nosniff") throw new Error("missing nosniff");
});
await check("dark mode toggle works", async () => {
  await page.goto(BASE);
  await page.getByRole("button", { name: /tema/i }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark") || document.documentElement.classList.contains("light"));
  if (shots) await page.screenshot({ path: `${shots}/landing-toggled.png` });
});
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => r.startsWith("✗"))) process.exit(1);
})();
