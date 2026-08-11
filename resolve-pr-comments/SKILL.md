---
name: resolve-pr-comments
description: Fetch unresolved review comments on a pull request, independently verify each one against the code, then fix it or reply explaining why no change is needed. Dispatches a subagent to do the work. Use when the user asks to "resolve the PR comments", "address review feedback", "action the review comments", or invokes /resolve-pr-comments.
---

# Resolve PR Comments

Work through a pull request's unresolved review comments. **Never assume the reviewer is correct** — a comment is a hypothesis, verify it against the code before changing anything.

## 1. Fetch the comments

Use the PR the user named, or the one for the current branch (`gh pr view --json number,url`). Then get the unresolved threads:

```powershell
gh api graphql -f query='
query($owner:String!, $repo:String!, $pr:Int!) {
  repository(owner:$owner, name:$repo) { pullRequest(number:$pr) {
    reviewThreads(first:100) { nodes {
      id isResolved isOutdated path line
      comments(first:20) { nodes { author { login } body } }
    } }
  } }
}' -F owner=<owner> -F repo=<repo> -F pr=<number>
```

Keep the unresolved ones. `isOutdated` threads point at code that has since changed — verify against current `HEAD`.

## 2. Dispatch one subagent for all comments

Use a single subagent unless the user asks for one per comment. Brief it:

> Resolve these PR review comments, working through them one at a time:
> ```
> <for each thread: id, path:line, author, verbatim thread including replies>
> ```
>
> Do **not** assume the reviewer is correct. For each comment, read the file and enough surrounding code, callers, and tests to judge for yourself. If they assert a bug, try to prove it. Check whether a later commit already fixed it.
>
> Then pick a verdict per comment:
> - **valid** — make the minimal fix, run lint/tests for the touched files.
> - **partly-valid** — the concern is real but the suggested fix is wrong; fix the real problem.
> - **invalid** — change nothing; draft a short reply citing `file:line` evidence.
> - **out-of-scope / needs-user** — draft a reply or a question for the user.
>
> Don't commit, push, or post to GitHub. Don't touch unrelated code.
>
> Return per comment: thread id, verdict, brief rationale, files changed, verification output, draft reply.

## 3. Report back

Per comment: location, verdict, rationale, diff (if any), draft reply. Scrutinise **invalid** verdicts hardest — that's where the agent, not the reviewer, is most likely wrong.

Post replies and resolve threads only if the user asks:

```powershell
gh api graphql -f query='mutation($t:ID!, $b:String!) { addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$t, body:$b}) { clientMutationId } }' -F t=<threadId> -F b='<reply>'
gh api graphql -f query='mutation($t:ID!) { resolveReviewThread(input:{threadId:$t}) { thread { isResolved } } }' -F t=<threadId>
```

Never resolve a thread to silence an open disagreement. Don't commit or push unless asked.

## Notes

- Keep each fix minimal and scoped to its comment — drive-by refactors cause review churn.
- If two comments demand contradictory changes, surface the conflict rather than picking a side.
- Replies should be short and cite `file:line`, not opinion.
- If a comment is a question rather than a request, the answer is usually a reply, not a code change.
