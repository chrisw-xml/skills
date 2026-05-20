# Playwright Browser — API Reference

Base URL: `http://localhost:7823`  
All requests/responses are JSON. Errors return `{ "error": "..." }`.

---

## GET /status

Check server health.

- Response: `{ "ok": true, "page": "http://localhost:5173" | null }`

---

## POST /start

Initialise browser and optionally start the dev server.

- Body: `{ "projectDir": string }` — defaults to server process cwd
- Reads `package.json` to detect dev command and port
- Framework port defaults: Vite → 5173, Next.js → 3000, Angular → 4200, Nuxt → 3000, SvelteKit → 5173, CRA → 3000
- Override port: set `DEV_PORT` env var before starting the server
- Response: `{ "ok": true, "url": "http://localhost:5173", "port": 5173 }`

---

## GET /screenshot

Capture the current viewport as a PNG.

- Response: `{ "path": "C:/Temp/pw-screenshot-1234567890.png" }`
- Use the `view` tool with this path to display the image

---

## POST /navigate

Navigate to a URL.

- Body: `{ "url": string }`
- Response: `{ "ok": true, "url": "<final url>" }`

---

## POST /click

Click an element or an (x, y) coordinate.

- Body: `{ "selector": string }` OR `{ "x": number, "y": number }`
- Selector can be a CSS selector or text locator, e.g. `"button.submit"` or `"text=Submit"`
- Response: `{ "ok": true }`

---

## POST /type

Type text into an input field.

- Body: `{ "selector": string, "text": string, "clear"?: boolean }`
- `"clear": true` replaces existing value (uses `page.fill`); omit or `false` to append
- Response: `{ "ok": true }`

---

## POST /scroll

Scroll the page or bring an element into view.

- Body: `{ "selector"?: string, "deltaY"?: number }` — `deltaY` defaults to 300
- If `selector` given, scrolls that element into view; otherwise mouse-wheel scrolls the page
- Response: `{ "ok": true }`

---

## GET /console-logs

Get captured browser console messages (last 500 entries).

- Response: `{ "logs": [{ "type": "log"|"error"|"warn"|"info", "text": string, "timestamp": string }] }`

---

## GET /network-errors

Get failed network requests captured since the page opened.

- Response: `{ "errors": [{ "url": string, "failure": string, "timestamp": string }] }`

---

## GET /dom

Get the page's full outer HTML (capped at 50,000 characters).

- Response: `{ "html": string }`

---

## GET /accessibility

Get the Playwright accessibility tree snapshot (compact semantic representation — prefer this over raw DOM for understanding page structure).

- Response: `{ "snapshot": object }`

---

## POST /evaluate

Run arbitrary JavaScript in the page context.

- Body: `{ "expression": string }`
- Response: `{ "result": any }` or `{ "error": string }`
- Example: `{ "expression": "document.title" }` → `{ "result": "My App" }`

---

## POST /hover

Hover over an element (useful for triggering tooltips and hover states before screenshotting).

- Body: `{ "selector": string }`
- Response: `{ "ok": true }`

---

## POST /stop

Gracefully shut down: close browser, kill any dev server started by this skill, then exit.

- Response: `{ "ok": true }` — server process exits immediately after responding
