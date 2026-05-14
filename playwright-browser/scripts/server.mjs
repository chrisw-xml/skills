import { chromium } from 'playwright';
import http from 'http';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createServer } from 'net';

const PORT = 7823;

let browser = null;
let page = null;
let devProcess = null;
let consoleLogs = [];
let networkErrors = [];

// ---- Dev server detection ----

function detectDevConfig(projectDir) {
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const scriptName = pkg.scripts?.dev ? 'dev'
    : pkg.scripts?.start ? 'start'
    : pkg.scripts?.serve ? 'serve'
    : null;

  if (!scriptName) return null;
  const devScript = pkg.scripts[scriptName];

  let port = 3000;

  // Extract explicit --port/-p flag from the script command
  const portFlag = devScript?.match(/(?:--port|-p)\s+(\d+)/);
  if (portFlag) port = parseInt(portFlag[1]);

  // Framework-specific defaults (override generic default)
  if (devScript?.includes('vite') || devScript?.includes('sveltekit')) port = 5173;
  if (devScript?.includes('next')) port = 3000;
  if (devScript?.includes('ng serve')) port = 4200;
  if (devScript?.includes('nuxt')) port = 3000;
  if (devScript?.includes('react-scripts')) port = 3000;

  // Check vite.config for an explicit server.port
  const viteConfigs = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'];
  for (const f of viteConfigs) {
    const vitePath = join(projectDir, f);
    if (existsSync(vitePath)) {
      const content = readFileSync(vitePath, 'utf8');
      const m = content.match(/port\s*:\s*(\d+)/);
      if (m) port = parseInt(m[1]);
      break;
    }
  }

  // Env var override always wins
  if (process.env.DEV_PORT) port = parseInt(process.env.DEV_PORT);

  return { port, scriptName };
}

// ---- Port helpers ----

function isPortListening(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(true));   // EADDRINUSE → something is listening
    s.once('listening', () => { s.close(); resolve(false); });
    s.listen(port, '127.0.0.1');
  });
}

async function waitForPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// ---- HTTP helpers ----

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
  });
}

// ---- Route handlers ----

const routes = {

  'GET /status': async (_req, res) => {
    send(res, 200, { ok: true, page: page?.url() ?? null });
  },

  'POST /start': async (req, res) => {
    const { projectDir = process.cwd() } = await readBody(req);
    const dir = resolve(projectDir);
    const config = detectDevConfig(dir);

    if (!config) {
      return send(res, 400, { error: `No package.json with a dev/start/serve script found in: ${dir}` });
    }

    const alreadyRunning = await isPortListening(config.port);
    if (!alreadyRunning) {
      console.log(`[skill] Starting dev server: npm run ${config.scriptName} in ${dir}`);
      devProcess = spawn('npm', ['run', config.scriptName], {
        cwd: dir,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      devProcess.stdout.on('data', d => process.stdout.write(`[dev] ${d}`));
      devProcess.stderr.on('data', d => process.stderr.write(`[dev] ${d}`));
      devProcess.on('exit', code => console.log(`[dev] process exited with code ${code}`));

      console.log(`[skill] Waiting for port ${config.port}...`);
      const ready = await waitForPort(config.port, 60_000);
      if (!ready) {
        devProcess.kill();
        devProcess = null;
        return send(res, 504, { error: `Dev server did not become available on port ${config.port} within 60 s` });
      }
    } else {
      console.log(`[skill] Port ${config.port} already listening — skipping dev server start`);
    }

    if (!browser) {
      browser = await chromium.launch({ headless: false });
    }

    const context = await browser.newContext();
    page = await context.newPage();

    consoleLogs = [];
    networkErrors = [];

    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text(), timestamp: new Date().toISOString() });
      if (consoleLogs.length > 500) consoleLogs.shift();
    });

    page.on('requestfailed', request => {
      networkErrors.push({
        url: request.url(),
        failure: request.failure()?.errorText ?? 'unknown',
        timestamp: new Date().toISOString(),
      });
    });

    const url = `http://localhost:${config.port}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    send(res, 200, { ok: true, url, port: config.port });
  },

  'GET /screenshot': async (_req, res) => {
    if (!page) return send(res, 400, { error: 'No page open. Call POST /start first.' });
    const path = join(tmpdir(), `pw-screenshot-${Date.now()}.png`);
    await page.screenshot({ path, fullPage: false });
    send(res, 200, { path });
  },

  'POST /navigate': async (req, res) => {
    if (!page) return send(res, 400, { error: 'No page open.' });
    const { url } = await readBody(req);
    if (!url) return send(res, 400, { error: 'Provide { url }' });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    send(res, 200, { ok: true, url: page.url() });
  },

  'POST /click': async (req, res) => {
    if (!page) return send(res, 400, { error: 'No page open.' });
    const { selector, x, y } = await readBody(req);
    if (selector) await page.click(selector);
    else if (x != null && y != null) await page.mouse.click(x, y);
    else return send(res, 400, { error: 'Provide { selector } or { x, y }' });
    send(res, 200, { ok: true });
  },

  'POST /type': async (req, res) => {
    if (!page) return send(res, 400, { error: 'No page open.' });
    const { selector, text, clear = false } = await readBody(req);
    if (!selector || text == null) return send(res, 400, { error: 'Provide { selector, text }' });
    if (clear) await page.fill(selector, text);
    else await page.type(selector, text);
    send(res, 200, { ok: true });
  },

  'POST /scroll': async (req, res) => {
    if (!page) return send(res, 400, { error: 'No page open.' });
    const { selector, deltaY = 300 } = await readBody(req);
    if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
    else await page.mouse.wheel(0, deltaY);
    send(res, 200, { ok: true });
  },

  'GET /console-logs': async (_req, res) => {
    send(res, 200, { logs: consoleLogs });
  },

  'GET /network-errors': async (_req, res) => {
    send(res, 200, { errors: networkErrors });
  },

  'GET /dom': async (_req, res) => {
    if (!page) return send(res, 400, { error: 'No page open.' });
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    send(res, 200, { html: html.slice(0, 50_000) });
  },

  'GET /accessibility': async (_req, res) => {
    if (!page) return send(res, 400, { error: 'No page open.' });
    const snapshot = await page.accessibility.snapshot();
    send(res, 200, { snapshot });
  },

  'POST /evaluate': async (req, res) => {
    if (!page) return send(res, 400, { error: 'No page open.' });
    const { expression } = await readBody(req);
    if (!expression) return send(res, 400, { error: 'Provide { expression }' });
    try {
      const result = await page.evaluate(expression);
      send(res, 200, { result });
    } catch (e) {
      send(res, 400, { error: e.message });
    }
  },

  'POST /hover': async (req, res) => {
    if (!page) return send(res, 400, { error: 'No page open.' });
    const { selector } = await readBody(req);
    if (!selector) return send(res, 400, { error: 'Provide { selector }' });
    await page.hover(selector);
    send(res, 200, { ok: true });
  },

  'POST /stop': async (_req, res) => {
    send(res, 200, { ok: true });
    shutdown(0);
  },
};

// ---- Server ----

const server = http.createServer(async (req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`;
  const handler = routes[key];
  if (!handler) return send(res, 404, { error: `Unknown route: ${key}` });
  try {
    await handler(req, res);
  } catch (e) {
    console.error(`[skill] Error in ${key}:`, e);
    // Only send error response if headers not yet sent
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Playwright server ready on http://localhost:${PORT}`);
});

// ---- Graceful shutdown ----

async function shutdown(code = 0) {
  console.log('[skill] Shutting down...');
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  try { if (devProcess) devProcess.kill(); } catch { /* ignore */ }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
