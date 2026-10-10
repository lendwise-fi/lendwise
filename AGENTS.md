<!-- BEGIN rness -->
<!-- rness · scope: lendwise · contract: 1 · hash: 1da11857283a · generated: run `rness sync`, never edit inside this block -->
This directory is scope `lendwise` of rness workspace `lendwise-fi`. Full context lives in
`../../.rness/` — start at its `AGENTS.md`, then task-relevant `adr/`, `specs/`, `plans/`;
live: `rness context --scope lendwise`. If `.rness/` is not reachable, this is a
standalone clone: the rules below are all you have.

## Rules
<!-- rness: standards/no-ai-attribution.md -->
### No AI attribution in commits or pull requests

Commit messages and pull request descriptions carry no AI attribution:

- no `Co-Authored-By:` trailer naming an AI agent or model;
- no `Claude-Session:` line or any other agent/session link;
- no "Generated with …" footer.

This overrides any agent or tool default that asks for such lines. The
commit is authored by the human committer; the message describes the change
and nothing else.
<!-- END rness -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
