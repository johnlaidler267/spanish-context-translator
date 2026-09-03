# How to talk to me

I'm a software engineer, but I'm running this project solo and I'm juggling a lot — I don't have bandwidth to read a wall of text every time you finish something. I also don't know every tool/library inside and out, so don't assume I do.

**Start every response with a short, plain-language summary of what happened** — a few sentences, no jargon, like you're catching a busy friend up. Save the technical detail (file names, exact commands, library internals) for after that, so I can stop reading once I have what I need.

**When you do use a technical term I might not know** (a library, a pattern, an error class, whatever), give a quick one-line plain-English gloss the first time it comes up in a response — not a lecture, just enough that I'm not left guessing. If it's something any working engineer would already know, skip the explanation.

**Don't pad things out.** If something's simple, say it in one line. If I ask a follow-up like "more concise" or "higher level," take that as a standing preference for the rest of that thread, not a one-off.

**Keep replies short by default.** I want the high-level outcome, not a full walkthrough. Skip step-by-step narration and only go deep if I ask.

**When something's genuinely a judgment call or could affect users/money/data, flag it clearly** rather than quietly picking an option — but don't ask permission for routine stuff.

**Send me a notification when a longer or background task finishes**, or when you hit something that needs my decision before you can keep going — I might have stepped away. Don't bother notifying for quick, in-the-moment back-and-forth like a normal chat exchange; I'm already watching for those.

# Engineering workflow

These apply whether you're working directly in a conversation with me or picking up a task on your own (e.g. from the LexaLens board).

- **Verify before committing, always**: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`. All four should be clean before a commit. If the sandbox lacks real Supabase/Groq credentials, a dummy `.env.local` (fake URL/key) is fine for local visual verification only — delete it before finishing, never commit it.
- **Don't claim a UI or behavior fix works without having actually seen it work.** Reproduce the bug first, then confirm the fix — with real data where possible (Playwright against a local build/preview server, a small component harness, seeded `localStorage`/`sessionStorage`), not just by reading the code and reasoning about it. For a Playwright repro, **use the `tests/e2e-mocks/` harness** (`npm run test:e2e`) instead of hand-rolling a fake signed-in session and backend mocks — see `tests/e2e-mocks/README.md`. It fakes a signed-in Supabase session and mocks the main backend calls (auth, `discover_items`/`user_subscriptions`, `groq-chat`/`chunk-details`/`track-usage`) with no real Supabase project or Groq key needed. If the bug is about component logic/state rather than actual visual/cross-page behavior, a plain Vitest + React Testing Library test (`npm run test`) is cheaper and usually sufficient — prefer that when it is.
- **Push straight to `main`** once verified — this repo doesn't use a PR-per-change workflow. Before pushing, `git fetch origin main` and check whether another session has pushed since you started; if so, `git rebase origin/main` (never merge), re-run the full verification, then push.
- **Commit messages explain the root cause**, not just what changed — what was actually broken and why, in plain terms. Match the style of recent commits on `main`.
- **Clean up after yourself**: delete temporary test/harness files, `.env.local`, and scratch scripts before finishing. Never commit them.
- **If a task is genuinely ambiguous or architecturally significant** (not a routine fix), don't guess — flag it instead of shipping something speculative.
