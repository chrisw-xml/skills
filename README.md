# skills

A collection of agent skills.

## Install all skills

```bash
npx skills@latest add chrisw-xml/skills
```

## Skills

### `review-changes`

Iterative code review of the current branch. Surfaces one suggestion at a time — bugs, security issues, performance problems, and design concerns — letting you accept, reject, or modify each one before the agent implements and verifies it.

> Trigger: _"review my changes"_, _"review the branch"_, _"suggest improvements"_

### `playwright-browser`

Starts a headed Playwright browser session against your local frontend dev server. The agent can take screenshots, click elements, type into inputs, read console logs, inspect the DOM and accessibility tree, and run JavaScript — all to visually debug and verify UI changes in real time.

Auto-detects your dev server command and port from `package.json` (supports Vite, Next.js, Angular, Nuxt, SvelteKit, CRA). Starts the dev server automatically if it isn't already running.

> Trigger: _"open the browser"_, _"show me the page"_, _"check how it looks"_, _"debug the UI"_
>
> **First-time setup:** invoke the skill once, then follow the instructions to install the required Playwright dependencies.
