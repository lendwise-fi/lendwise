---
name: status
description: The status of every decision, specification, plan and other tracked document of the rness workspace, one table per directory. Read-only.
argument-hint: '[tab]'
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PROJECT_DIR}/../../.rness/node_modules/@rness/cli/dist/bin/rness.js" status --cwd "${CLAUDE_PROJECT_DIR}")
---

!`node "${CLAUDE_PROJECT_DIR}/../../.rness/node_modules/@rness/cli/dist/bin/rness.js" status --cwd "${CLAUDE_PROJECT_DIR}"`

Show the output above to the user as it is: the heading and the tables,
nothing added, nothing summarised, no other tool. Arguments: `$ARGUMENTS`.
When they name a tab, show only that tab's section. If the output says the
module cannot be found, say instead that ../../.rness is not installed next to
this repository.

End with this line: _For the view with tabs and scrolling: here, Ctrl+Z,
then `npx @rness/cli status` (q to close), then `fg`; or in another
terminal, from the workspace's `.rness/`: `pnpm rness status`._
