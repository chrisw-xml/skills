---
name: review-changes
description: Review the current branch's code changes and iterate one suggestion at a time, implementing each accepted suggestion and verifying it before moving on. Use when the user wants a code review of their work-in-progress, asks to "review my changes", "review the branch", "suggest improvements", or invokes /review-changes.
---

# Review Changes

Iterative code review of the current branch. Surface one suggestion at a time, let the user accept / reject / modify, then implement and verify accepted suggestions before moving on.

## Workflow

### 1. Pick the diff scope

Ask the user which scope to review (use `ask_user` with these choices):

- Uncommitted changes only (`git diff HEAD`)
- All commits on current branch vs default branch (`git diff <default>...HEAD`)
- A specific commit range (freeform)

Detect the default branch with `git symbolic-ref refs/remotes/origin/HEAD` (fall back to `main` then `master`).

### 2. Gather context

Run in parallel:

- `git --no-pager diff <scope>` — the changes
- `git --no-pager diff --stat <scope>` — file list
- Look for and read (only if present): `.editorconfig`, `.eslintrc*`, `.prettierrc*`, `pyproject.toml`, `ruff.toml`, `.rubocop.yml`, `.golangci.yml`, `tsconfig.json`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`
- Identify languages/frameworks from changed file extensions

Do **not** load standards files that aren't present. Combine repo-specific rules with general best practices for the detected language.

### 3. Build a suggestion backlog

Create a session SQL table to track suggestions:

```sql
CREATE TABLE IF NOT EXISTS review_suggestions (
  id TEXT PRIMARY KEY,
  file_path TEXT,
  line_range TEXT,
  category TEXT,    -- bug | security | perf | readability | style | test | design
  severity TEXT,    -- high | medium | low
  title TEXT,
  rationale TEXT,
  proposed_change TEXT,
  status TEXT DEFAULT 'pending'  -- pending | accepted | rejected | modified | implemented | skipped
);
```

Analyze the diff and INSERT one row per distinct suggestion. Order by severity (high → low), then by file.

Categories to look for:

- **Bugs**: logic errors, off-by-one, null/undefined handling, race conditions, incorrect error handling
- **Security**: injection, secrets in code, unsafe deserialization, missing authz checks
- **Performance**: N+1 queries, unnecessary allocations, sync I/O in hot paths
- **Readability**: unclear names, dead code, missing comments on non-obvious logic, deep nesting
- **Style**: violations of detected linter configs (only flag if config exists)
- **Tests**: missing coverage for new branches, brittle assertions
- **Design**: leaky abstractions, duplicated logic, single-responsibility violations

Skip nits: formatting the linter handles, personal preference, "you could also write this as".

### 4. Iterate one at a time

For each pending suggestion (highest severity first):

1. Present it to the user with: file:line, category, severity, title, rationale, and the proposed change (as a diff snippet when meaningful).
2. Use `ask_user` with choices: `["Accept", "Reject", "Modify", "Skip", "Stop reviewing"]`.
3. Handle the response:
   - **Accept** → implement the change with `edit`/`create`. Then run the project's lint/test commands for the affected files (see step 5). Mark `implemented`. If verification fails, report and ask whether to revert, fix, or keep.
   - **Reject** → mark `rejected`, move on.
   - **Modify** → ask freeform what to change, implement the modified version, then verify. Mark `modified`/`implemented`.
   - **Skip** → mark `skipped`, move on.
   - **Stop reviewing** → exit the loop, jump to step 6.

Update the SQL row's status after each action. Never batch — wait for the user's answer before showing the next suggestion.

### 5. Verify after each implementation

Detect and run only what already exists in the repo:

- JS/TS: `npm run lint` / `npm test` (only the changed files if the runner supports it)
- Python: `ruff check <files>` / `pytest <relevant tests>`
- Go: `go vet ./... && go test ./...` (scoped to affected packages)
- Rust: `cargo clippy && cargo test`

If no test/lint command is configured, skip verification and say so.

### 6. Wrap up

When the queue is empty or the user stops:

```sql
SELECT status, COUNT(*) FROM review_suggestions GROUP BY status;
```

Report: implemented count, rejected count, skipped count, any verification failures still outstanding. Do **not** commit unless the user asks.

## Notes

- Stay surgical — only touch lines tied to the accepted suggestion.
- If the diff is large (>500 lines changed), tell the user up front and offer to scope to specific files first.
- If a suggestion depends on another that was rejected, mark it `skipped` with a note rather than pushing it.
