/**
 * Takes the Help page pictures from a running SampTrek (feedback 2026-11-18).
 *
 *   1. Start the API and the web app with the demo data (pnpm db:seed).
 *   2. node scripts/help-shots.mjs [http://localhost:3000] [admin@projexa.local] [password]
 *   3. python3 scripts/help-gifs.py        (makes the walkthrough GIFs from the pictures)
 *
 * For every guide in lib/help-guides.ts with a `shot`, it opens the page, does the clicks, takes a
 * screenshot to public/help/guides/<id>.jpg and records where each step's target is on it, in % of
 * the picture, in lib/help-shots.json. A step whose target is not on screen gets no marker.
 * Needs Playwright (preinstalled in the dev container; otherwise `npx playwright install chromium`).
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright from the project, or the one installed globally.
const req = createRequire(import.meta.url);
const { chromium } = (() => { try { return req('playwright'); } catch { return createRequire(process.env.PLAYWRIGHT_FROM ?? '/usr/lib/node_modules/')('playwright'); } })();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.argv[3] ?? 'admin@projexa.local';
const PASSWORD = process.argv[4] ?? 'projexa-demo-2026';
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const only = process.env.ONLY?.split(',');

// Read the guides without a TypeScript build: Node strips the types.
const { GUIDES } = await import(join(root, 'lib/help-guides.ts'));
const outDir = join(root, 'public/help/guides');
mkdirSync(outDir, { recursive: true });
const manifestPath = join(root, 'lib/help-shots.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${WEB}/login`);
await page.fill('input[type=email]', EMAIL);
await page.fill('input[type=password]', PASSWORD);
await page.click('button.btn-primary');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
// No product tour or tips over the pictures.
await page.evaluate(() => { for (const k of ['samptrek:tour-done', 'projexa:tour-done', 'projexa:tour']) localStorage.setItem(k, '1'); });

const j = async (path) => (await ctx.request.get(`${API}/api/v1${path}`)).json();
const projects = await j('/projects?q=PRX10001');
const demo = (projects.items ?? projects).find((p) => p.projectCode === 'PRX10001')?.id ?? (projects.items ?? projects)[0]?.id;
if (!demo) throw new Error('No demo project PRX10001: run pnpm db:seed');
const vendors = await j('/vendors');
const vendor = (vendors.items ?? vendors)[0]?.id;
const fill = (p) => p.replace(':demo', demo).replace(':vendor', vendor);

for (const g of GUIDES) {
  if (!g.shot || (only && !only.includes(g.id))) continue;
  try {
    await page.goto(`${WEB}${fill(g.shot.path)}`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape');
    for (const c of g.shot.clicks ?? []) {
      await page.locator(fill(c)).first().click({ timeout: 8000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
    }
    // One tall screen (900 to 1500 px, as long as the page needs) rather than a full-page shot, so the
    // fixed menu and header stay in place. `scroll` brings that element up under the header first.
    await page.setViewportSize({ width: 1440, height: 900 });
    if (g.shot.scroll) {
      await page.locator(g.shot.scroll).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80));
    }
    const rest = await page.evaluate(() => document.documentElement.scrollHeight - window.scrollY);
    const size = { w: 1440, h: g.shot.full === false ? 900 : Math.max(900, Math.min(1500, rest)) };
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.waitForTimeout(700);
    const markers = [];
    for (const [i, s] of g.steps.entries()) {
      if (!s.target) continue;
      const loc = page.locator(`${fill(s.target)} >> visible=true`).first();
      const box = await loc.boundingBox({ timeout: 1500 }).catch(() => null);
      if (process.env.DEBUG && !box) console.log(`  · step ${i + 1}: ${await page.locator(fill(s.target)).count()} match(es) for ${s.target}`);
      if (!box || box.width < 2) continue;
      const { x, y } = box;
      if (x + box.width < 0 || y + box.height < 0 || x > size.w || y > size.h) { if (process.env.DEBUG) console.log(`  · step ${i + 1}: off screen at y=${Math.round(y)}`); continue; }
      const pad = 4;
      const pc = (v, of) => Math.round((Math.max(0, Math.min(of, v)) / of) * 10000) / 100;
      const x0 = pc(x - pad, size.w), y0 = pc(y - pad, size.h);
      markers.push({ step: i + 1, x: x0, y: y0, w: Math.round((pc(x + box.width + pad, size.w) - x0) * 100) / 100, h: Math.round((pc(y + box.height + pad, size.h) - y0) * 100) / 100 });
    }
    await page.screenshot({ path: join(outDir, `${g.id}.jpg`), type: 'jpeg', quality: 62 });
    manifest[g.id] = { w: size.w, h: size.h, gif: manifest[g.id]?.gif ?? false, markers };
    console.log(`✓ ${g.id}: ${markers.length}/${g.steps.filter((s) => s.target).length} markers`);
  } catch (e) {
    console.log(`✗ ${g.id}: ${String(e).split('\n')[0]}`);
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
await browser.close();
