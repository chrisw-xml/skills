---
name: playwright-browser
description: Start a headed Playwright browser session to visually inspect, debug, and interact with the local frontend dev server. Exposes screenshot, click, type, scroll, console-log, DOM, and accessibility tools via a local HTTP server. Use when the user wants you to "see" the UI, debug visual issues, verify UI changes, interact with the running frontend, or mentions "open the browser", "show me the page", "check how it looks", "what does it look like".
---

# Playwright Browser

Start a headed browser session against the project's local dev server. A bundled HTTP server exposes Playwright actions — take screenshots, click elements, read console logs, inspect the DOM.

## Setup (first use only)

```powershell
cd ~/.agents/skills/playwright-browser/scripts
npm install
```

## Quick start

### 1. Start the server (background)

Start as an **async background shell** and wait for: `Playwright server ready on http://localhost:7823`

```powershell
node ~/.agents/skills/playwright-browser/scripts/server.mjs
```

### 2. Open the browser on the project

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:7823/start `
  -ContentType 'application/json' `
  -Body (ConvertTo-Json @{ projectDir = (Get-Location).Path })
```

The server will: read `package.json` to find the dev command and port → start the dev server if the port isn't already listening → open a headed browser and navigate to the app.

### 3. Take a screenshot

```powershell
$r = Invoke-RestMethod http://localhost:7823/screenshot
# Use the view tool with $r.path to display the image
```

## Workflow

For each debugging or implementation step:

1. **Screenshot** → `GET /screenshot` → view the returned image path with the `view` tool
2. **Inspect** → `GET /console-logs`, `GET /network-errors`, `GET /accessibility` for context
3. **Interact** → `POST /click`, `POST /type`, `POST /scroll`, `POST /navigate`
4. **Verify** → take another screenshot to confirm the result
5. Repeat until the task is done

## Cleanup

Stop the server when done (also closes the browser and any dev server started by this skill):

```powershell
Invoke-RestMethod -Method POST http://localhost:7823/stop
```

## Notes

- The server captures up to 500 console log entries and all failed network requests automatically
- Screenshot files are written to the OS temp directory; clean them up when done
- To override the detected port, set the `DEV_PORT` env var before calling `/start`
- If the dev server takes more than 60 s to start, `/start` will return a 504 error

See [REFERENCE.md](REFERENCE.md) for all endpoints and parameters.
