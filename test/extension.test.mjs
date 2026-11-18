// End-to-end test of the Chrome/Edge package: loads the built extension into a real Chrome,
// "clicks" the toolbar button, draws, toggles and checks the behaviour on a restricted page.
// Run:  npm run build:extension && xvfb-run -a npm run test:extension   (or on a desktop: npm run test:extension)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
let server, url, ctx, sw, dir, userData;

before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>Test page</title><body style="margin:0"><h1>Hello</h1><p>Some page to draw on.</p>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;

  // Real users get access through the "activeTab" permission when they click the button.
  // Automation can't click the toolbar, so the test copy gets host access instead.
  dir = mkdtempSync(join(tmpdir(), 'ritlager-ext-'));
  cpSync('dist/ritlager-chrome-edge', dir, { recursive: true });
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions = ['http://127.0.0.1/*'];
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m));

  userData = mkdtempSync(join(tmpdir(), 'ritlager-profile-'));
  ctx = await chromium.launchPersistentContext(userData, {
    executablePath: CHROME,
    headless: false,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, '--no-sandbox']
  });
  sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
});

after(async () => {
  await ctx?.close();
  server?.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
});

const click = (tabUrlPart) =>
  sw.evaluate(async (part) => {
    const [tab] = await chrome.tabs.query({ url: `*://*/*${part}*` });
    await onActionClick(tab);
  }, tabUrlPart);

test('button opens Ritlager, drawing works, second click hides, third shows', async () => {
  const page = await ctx.newPage();
  await page.goto(url);
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await onActionClick(tab);
  });
  await page.waitForSelector('#ritlager-canvas', { state: 'attached', timeout: 10000 });
  await page.waitForSelector('#ritlager-bar');
  assert.ok(await page.locator('#ritlager-bar').isVisible(), 'toolbar visible');

  // draw a stroke
  await page.mouse.move(100, 120);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(100 + i * 8, 120 + Math.sin(i) * 20);
  await page.mouse.up();
  const painted = await page.evaluate(() => {
    const c = document.getElementById('ritlager-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  });
  assert.ok(painted, 'a stroke was painted on the canvas');

  // second click hides, third shows
  await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); await onActionClick(t); });
  await page.waitForFunction(() => document.getElementById('ritlager-canvas').style.display === 'none');
  await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); await onActionClick(t); });
  await page.waitForFunction(() => document.getElementById('ritlager-canvas').style.display !== 'none');
  assert.equal(await page.locator('#ritlager-canvas').count(), 1, 'still only one canvas');
});

test('restricted pages get a "!" badge instead of failing silently', async () => {
  const page = await ctx.newPage();
  await page.goto('chrome://version');
  const badge = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await onActionClick(tab);
    return chrome.action.getBadgeText({ tabId: tab.id });
  });
  assert.equal(badge, '!');
});
