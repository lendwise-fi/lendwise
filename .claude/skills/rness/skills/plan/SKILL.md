---
name: plan
description: The plans of the rness workspace in .rness/plans/ — a plan from a specification (from, which approves it), from the conversation (create), reopened (open), or closed on evidence (check). Use when the developer asks for a plan, to approve a specification, or to check the work of a plan.
argument-hint: '[create <subject> | from <spec> | open NNNN | check NNNN]'
allowed-tools: Bash(node "${CLAUDE_PROJECT_DIR}/../../.rness/node_modules/@rness/cli/dist/bin/rness.js" status plans --cwd "${CLAUDE_PROJECT_DIR}"), Bash(node "../../.rness/node_modules/@rness/cli/dist/bin/rness.js" doc new plans)
---

!`node "${CLAUDE_PROJECT_DIR}/../../.rness/node_modules/@rness/cli/dist/bin/rness.js" status plans --cwd "${CLAUDE_PROJECT_DIR}"`

You keep the plans of this workspace, in `../../.rness/plans/`. The table above
lists the existing ones, newest first. Arguments: `$ARGUMENTS`.

The first word is the verb, when a reference (`0037`, or a path) follows
it — `check` alone means the plan `In progress`; a bare reference is
`open`; any other words are the subject of a `create`:

- `from NNNN`: a plan from specification NNNN, which this approves.
- `create [subject]`, or nothing: a plan from the conversation, for work
  too small for a specification; `spec:` is left empty.
- `open NNNN`: reopen plan NNNN.
- `check NNNN`: run the proofs of plan NNNN; close it when they all pass.

`from`:

1. Read the specification, `../../.rness/CONVENTIONS.md`, and the most recent plan
   above: match its front matter and sections. A specification that is
   `Implemented`, `Superseded` or `Rejected` is refused: say its status,
   write nothing. A plan of it that is neither `Completed` nor `Abandoned`:
   reopen it rather than write a second.
2. The developer typed this command: that is their approval, and the
   specification moves from `Draft` or `Proposed` to `Approved`, `updated`
   today, in the same commit as the plan — no confirmation question. If
   you are proposing it yourself, propose it in a single line and wait for
   a yes first: the approval is theirs, never yours.
3. Read the code and the repositories the specification touches: every
   task names real files and real commands.
4. Allocate the file: run `node "../../.rness/node_modules/@rness/cli/dist/bin/rness.js" doc new plans` from the project directory, where
   Claude Code was opened (pre-approved above as typed; `CLAUDE_PROJECT_DIR`
   is not set in your shell, so the path is relative). It writes
   `plans/NNNN-untitled.md` with the next number, the front matter
   and the opening sections, and prints the path. Rename it to
   `NNNN-<slug>.md`, the slug a few lowercase words of the title joined by
   hyphens, and write the title as `# NNNN — <title>`. Never choose the
   number yourself.
5. Fill it: `spec:` linking the specification; tasks in order, as
   checkboxes, each with the files, what changes, and the command that
   proves it (a test, a build, a run) — the last tasks the documentation
   the work makes inaccurate, then the release when the repository has
   one; where the plan decides something the specification leaves open, the
   section it opened with says so. Add `{ id: ${CLAUDE_SESSION_ID}, agent: <model> }` at the end of
  `sessions:` in the front matter, unless that id is already there;
  `<model>` is the model you run as, as Claude Code names it, after
  `Claude`: for example `Claude Opus 5.5`.
6. The rness hook checks every edit under `../../.rness/`: fix what it reports.

`create`: as `from`, without a specification. If the developer did not ask
for a plan in so many words, propose one in a single line and wait for a
yes. The body says what the work is and why it needs no specification.

`open`: read the plan and its specification; amend what the developer
asks — a task added, split or reworded, a blocker recorded — `updated`
today, the session line added; move `Draft` to `Ready` or `Blocked` as they
say. A `Completed` or `Abandoned` plan is not reopened: offer a new plan of
the same specification.

`check`:

1. The plan: the one named, else the one `In progress`. Several or none:
   ask.
2. The developer asked for the check, or the plan's last task has just
   passed in this session: run it. Otherwise propose it in a single line
   and wait for a yes.
3. Read the plan, its specification and `../../.rness/CONVENTIONS.md`.
4. Evidence first. For each task, what proves it: its command run now, or
   its result read in this session. Never mark a task done on belief. A
   check has no cache: run twice, it proves twice.
5. Every task proven:
   - the plan: `status: Completed`, `updated` today, the checkboxes of the
     proven tasks ticked, and a section `Verification (YYYY-MM-DD)` — what
     ran, what it showed, what could not run and why;
   - the specification: `Implemented` once every plan of it is
     `Completed`; `updated` today;
   - the plan and the specification: add `{ id: ${CLAUDE_SESSION_ID}, agent: <model> }` at the end of
  `sessions:` in the front matter, unless that id is already there;
  `<model>` is the model you run as, as Claude Code names it, after
  `Claude`: for example `Claude Opus 5.5`;
   - the smallest set of documents the work makes inaccurate: `../../.rness/docs/`,
     the READMEs of the repositories it changed.
6. A task not proven: nothing moves, the plan stays `In progress`. Say,
   task by task, what passed and what remains. A blocker the developer
   names is a move of its own: `Blocked`, the blocker written in the plan.
7. The rness hook checks every edit under `../../.rness/`: fix what it reports.

After writing: give the path and the list of tasks, or the statuses moved.
A new plan starts `Draft`, and becomes `Ready` once the developer agrees
with it or asks you to carry it out.

Move a status yourself when the work calls for it, and whenever the
developer says so: a plan `In progress` as you start its tasks,
`Completed` once its proofs pass under `check`; a specification
`Implemented` with its last plan; a document `Superseded` by the one that
replaces it. Accepting an ADR is the developer's; a specification is
`Approved` by `/rness:plan from NNNN`, which is their word for it.

Commit each file you changed, in its own repository, and only the files
you alone changed: add them by name, never `git add -A` nor `commit -a`.
A file that had uncommitted changes before your first edit (`git status`
tells you), or that someone else changed since, stays uncommitted: say
which. Never push.
