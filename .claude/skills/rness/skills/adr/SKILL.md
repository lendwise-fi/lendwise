---
name: adr
description: Record a decision of the rness workspace as an ADR in .rness/adr/ — a choice expensive to reverse or that creates a lasting constraint — or reopen one. Use when the developer asks for an ADR, or when the conversation reaches such a decision.
argument-hint: '[create <subject> | open NNNN]'
allowed-tools: Bash(node "${CLAUDE_PROJECT_DIR}/../../.rness/node_modules/@rness/cli/dist/bin/rness.js" status adr --cwd "${CLAUDE_PROJECT_DIR}"), Bash(node "../../.rness/node_modules/@rness/cli/dist/bin/rness.js" doc new adr)
---

!`node "${CLAUDE_PROJECT_DIR}/../../.rness/node_modules/@rness/cli/dist/bin/rness.js" status adr --cwd "${CLAUDE_PROJECT_DIR}"`

You keep the decisions of this workspace: the ADRs in `../../.rness/adr/`. The table
above lists the existing ones, newest first. Arguments: `$ARGUMENTS`.

The first word is the verb, when a reference (`0010`, or a path) follows
it; a bare reference is `open`; any other words are the subject of a
`create` (`open source licensing` is a subject):

- `create [subject]`, or nothing: a new ADR, numbered by rness.
- `open NNNN`: reopen ADR NNNN. An `Accepted` ADR is never edited: offer a
  new one that supersedes it. `Rejected` and `Superseded` are history too.

Creating:

1. If the developer did not ask for an ADR in so many words, propose one in
   a single line — its title, and why the choice is hard to reverse — and
   wait for a yes.
2. Read `../../.rness/CONVENTIONS.md` and `../../.rness/adr/0000-template.md`: they hold the
   rules and the sections; this skill is only the procedure.
3. The subject is the arguments, else the decision just discussed. Context,
   alternatives or consequences missing from the conversation: ask for
   them, one question at a time. Never invent them.
4. Allocate the file: run `node "../../.rness/node_modules/@rness/cli/dist/bin/rness.js" doc new adr` from the project directory, where
   Claude Code was opened (pre-approved above as typed; `CLAUDE_PROJECT_DIR`
   is not set in your shell, so the path is relative). It writes
   `adr/NNNN-untitled.md` with the next number, the front matter
   and the opening sections, and prints the path. Rename it to
   `NNNN-<slug>.md`, the slug a few lowercase words of the title joined by
   hyphens, and write the title as `# NNNN — <title>`. Never choose the
   number yourself.
5. Fill it: `repo` the repositories under `org/` it affects; the template's
   sections, their guidance lines removed; an ADR it replaces named in
   Context — that one becomes `Superseded`, with `superseded_by:`, only once
   the new ADR is `Accepted`. Add `{ id: ${CLAUDE_SESSION_ID}, agent: <model> }` at the end of
  `sessions:` in the front matter, unless that id is already there;
  `<model>` is the model you run as, as Claude Code names it, after
  `Claude`: for example `Claude Opus 5.5`.
6. The rness hook checks every edit under `../../.rness/`: fix what it reports.

Opening: read the ADR and amend what the developer asks, in place while it
is `Proposed`; add the session line above. Nothing of the file's history is
rewritten: a decision that changed is a new ADR.

After writing: give the path and the Decision section. A new ADR stays
`Proposed` until the developer accepts it.

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
