---
name: spec
description: Write a specification of the rness workspace in .rness/specs/ — the outcome wanted and its scope, before any plan — or reopen one. Use when the developer asks for a spec, or when agreed work is too large to start without one.
argument-hint: '[create <subject> | open NNNN]'
allowed-tools: Bash(node "${CLAUDE_PROJECT_DIR}/../../.rness/node_modules/@rness/cli/dist/bin/rness.js" status specs --cwd "${CLAUDE_PROJECT_DIR}"), Bash(node "../../.rness/node_modules/@rness/cli/dist/bin/rness.js" doc new specs)
---

!`node "${CLAUDE_PROJECT_DIR}/../../.rness/node_modules/@rness/cli/dist/bin/rness.js" status specs --cwd "${CLAUDE_PROJECT_DIR}"`

You keep the specifications of this workspace, in `../../.rness/specs/`. The table
above lists the existing ones, newest first. Arguments: `$ARGUMENTS`.

The first word is the verb, when a reference (`0028`, or a path) follows
it; a bare reference is `open`; any other words are the subject of a
`create`:

- `create [subject]`, or nothing: a new specification, numbered by rness.
- `open NNNN`: reopen specification NNNN. One that is `Implemented`,
  `Superseded` or `Rejected` is not edited: offer a new one.

Creating:

1. If the developer did not ask for a specification in so many words,
   propose one in a single line and wait for a yes.
2. Read `../../.rness/CONVENTIONS.md`, then the most recent specification above: match
   its front matter, sections and tone.
3. The subject is the arguments, else the work just discussed. The problem,
   what is in and out of scope, the ADRs it rests on: ask what the
   conversation does not say, one question at a time.
4. Allocate the file: run `node "../../.rness/node_modules/@rness/cli/dist/bin/rness.js" doc new specs` from the project directory, where
   Claude Code was opened (pre-approved above as typed; `CLAUDE_PROJECT_DIR`
   is not set in your shell, so the path is relative). It writes
   `specs/NNNN-untitled.md` with the next number, the front matter
   and the opening sections, and prints the path. Rename it to
   `NNNN-<slug>.md`, the slug a few lowercase words of the title joined by
   hyphens, and write the title as `# NNNN — <title>`. Never choose the
   number yourself.
5. Fill it: `repo`, and `adr:` linking the decisions it rests on — or the
   rationale in the body when none does; the sections it opened with
   (Summary, Scope, Out of scope, Alternatives considered, To verify,
   Tests), or the most recent specification's when the team's differ. What
   was checked in this session (a document read, a command run) is written
   as verified, with the date; everything else as a proposal or an open
   question. Add `{ id: ${CLAUDE_SESSION_ID}, agent: <model> }` at the end of
  `sessions:` in the front matter, unless that id is already there;
  `<model>` is the model you run as, as Claude Code names it, after
  `Claude`: for example `Claude Opus 5.5`.
6. The rness hook checks every edit under `../../.rness/`: fix what it reports.

Opening: read the specification and amend what the developer asks — a
section, a scope, an open question answered — `updated` today, the session
line added. A status moves only as the developer says, or by
`/rness:plan from`.

After writing: give the path and the summary. A new specification starts
`Draft`: `Proposed` for review; `/rness:plan from NNNN` approves it and
plans it.

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
