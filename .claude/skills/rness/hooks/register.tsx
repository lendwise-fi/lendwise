import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RnessRow, RnessSnapshot } from '../types'

// The rness plugin's mod (spec 0029 §3): the workspace on screen, drawn from
// what the pinned CLI prints (`rness status --json`). Nothing is computed
// here: the CLI words every line, the module only draws and refreshes.
//
// `sync` writes this file whole into `.claude/skills/rness/hooks/`, at the
// workspace root and at the root of each clone, with `RNESS` set to the path
// of `.rness` from that place, as the settings hooks have it. One path, never
// a guess: a clone runs the workspace's pinned copy, never one its own tree
// could hold.

const snapshot = atom({ plugin: 'rness', key: 'snapshot' } as const, null)
const tab = atom({ plugin: 'rness', key: 'tab' } as const, 0)
const selected = atom({ plugin: 'rness', key: 'selected' } as const, 0)
const interactive = atom(
  { plugin: 'rness', key: 'interactive' } as const,
  false
)
const open = atom({ plugin: 'rness', key: 'open' } as const, null)

const PANE = 'rness'
const BIN = 'node_modules/@rness/cli/dist/bin/rness.js'
/** `.rness` from the project directory; `sync` writes `../../.rness` in a clone. */
const RNESS = '../../.rness'
const STATE = /[\\/]\.rness[\\/]/

/**
 * Agent Pulse's option colours, which the CLI names for each row (spec 0017
 * §3), as the surface names them: the board's purple and pink are the
 * terminal's magenta, its orange the terminal's yellow.
 */
const COLORS: Readonly<Record<string, string>> = {
  gray: 'gray',
  blue: 'blue',
  green: 'green',
  yellow: 'yellow',
  orange: 'yellow',
  red: 'red',
  pink: 'magenta',
  purple: 'magenta',
}

/** What one `Markdown` draws at most (10000 on Claude Code 2.1.289), with room. */
const PIECE = 9000

/** The project directory: the plugin lives in its `.claude/skills/rness`. */
const projectOf = (root: string): string =>
  root.replace(/[\\/]\.claude[\\/]skills[\\/]rness[\\/]?$/, '')

const clamp = (n: number, low: number, high: number): number =>
  Math.min(Math.max(n, low), high)

/**
 * Blank lines under the rows, so that the body is always taller than the
 * pane: in a pane ↑/↓ are scroll keys (`pane:scrollUp`/`Down` on 2.1.289),
 * which raise `ui.scroll` — the selection's keys here — only while there is
 * something to scroll; otherwise they walk the buttons.
 */
const padOf = (bodyRows: number, rows: number): number =>
  Math.max(0, bodyRows + 1 - (1 + rows))

// The values as the state holds them now, read outside a drawing: each
// reference a literal, so that the engine can list what the module reads.
const SNAPSHOT = { plugin: 'rness', key: 'snapshot' } as const
const TAB = { plugin: 'rness', key: 'tab' } as const
const SELECTED = { plugin: 'rness', key: 'selected' } as const
const OPEN = { plugin: 'rness', key: 'open' } as const
const INTERACTIVE = { plugin: 'rness', key: 'interactive' } as const
const snapshotNow = async ($: EngineInterface) =>
  (await $.state.get(SNAPSHOT)).value ?? null
const tabNow = async ($: EngineInterface) => (await $.state.get(TAB)).value ?? 0
const selectedNow = async ($: EngineInterface) =>
  (await $.state.get(SELECTED)).value ?? 0
const openNow = async ($: EngineInterface) =>
  (await $.state.get(OPEN)).value ?? null

/**
 * Reads the snapshot from the pinned CLI and keeps it; the footer's label
 * follows, and so does the document open in the pane, read again. No
 * pinned copy, or a run that fails: no snapshot, nothing drawn.
 */
async function refresh($: EngineInterface): Promise<RnessSnapshot | null> {
  let next: RnessSnapshot | null = null
  try {
    const project = projectOf($.plugin.root)
    const bin = `${project}/${RNESS}/${BIN}`
    if (await $.fs.exists(bin)) {
      // `RNESS_NO_DELEGATE`: a pin that drifts is reported (a note, in the
      // band), never installed from inside the session, as the settings
      // hooks have it (spec 0015 §3). `status` is not among the commands
      // catch-up spares, and its install would replace a local copy.
      const ran = await $.process.run(
        ['node', bin, 'status', '--json', '--cwd', project],
        { cwd: project, timeoutMs: 20_000, env: { RNESS_NO_DELEGATE: '1' } }
      )
      if (ran.exitCode === 0) next = JSON.parse(ran.stdout) as RnessSnapshot
    }
  } catch {
    next = null
  }
  await update($, snapshot, () => next)
  const opened = await openNow($)
  if (opened !== null) await show($, opened.path)
  return next
}

/** A refresh off the dispatch that asked for it: a turn never waits for node. */
const later = ($: EngineInterface): void => {
  $.clock.after(0, () => void refresh($))
}

/** The document at `path` in `.rness/`, read and shown in place of the list. */
async function show($: EngineInterface, path: string): Promise<void> {
  let text: string | null
  try {
    text = await $.fs.read(`${projectOf($.plugin.root)}/${RNESS}/${path}`)
  } catch {
    text = null
  }
  await update($, open, () => ({ path, text }))
}

/** The ring onto the row at `path`; a site without the keys refuses, and that is fine. */
const ringOn = ($: EngineInterface, path: string): void => {
  void $.ui.focus({ requestId: PANE, key: `open-${path}` }).catch(() => {})
}

/**
 * Shows tab `i`: its newest row selected, the pane at its top, the ring on
 * that row — from a digit, a click, or Tab and Shift+Tab (`cycleTab`).
 */
async function showTab($: EngineInterface, i: number): Promise<void> {
  const shown = await snapshotNow($)
  await update($, tab, () => i)
  await update($, selected, () => 0)
  void $.ui.scroll({ in: PANE, to: 'start' }).catch(() => {})
  const first = shown?.tabs[i]?.rows[0]
  if (first !== undefined) ringOn($, first.path)
}

/** The next tab (`+1`) or the previous (`-1`), wrapping. */
async function cycleTab($: EngineInterface, by: 1 | -1): Promise<void> {
  const shown = await snapshotNow($)
  const n = shown?.tabs.length ?? 0
  if (n === 0) return
  const at = await tabNow($)
  await showTab($, (at + by + n) % n)
}

/** The row of the document at `path`, whichever tab lists it. */
const rowOf = (shown: RnessSnapshot, path: string): RnessRow | undefined =>
  shown.tabs.flatMap((t) => t.rows).find((row) => row.path === path)

/** `text` cut to `max` cells with an ellipsis, as the full-screen view cuts a title. */
const cut = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`

/**
 * The document without its front matter, as its issue's body starts (spec
 * 0018 §3): the CLI's `stripFrontMatter`, the blank lines after it included.
 */
const bodyOf = (text: string): string =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/, '')
    .replace(/^(?:[ \t]*\r?\n)+/, '')

/** A line opening or closing a code fence, in a paragraph. */
const FENCES = /^(`{3,}|~{3,})/gm

/**
 * `text` in pieces a `Markdown` can draw: cut at a blank line, a fenced block
 * kept whole; a paragraph or a block longer than a piece is cut as it is. A
 * control character other than tab and newline is dropped: a `Markdown`
 * refuses it.
 */
function pieces(text: string): string[] {
  const out: string[] = []
  let piece = ''
  const put = (unit: string): void => {
    if (piece !== '' && piece.length + 2 + unit.length > PIECE) {
      out.push(piece)
      piece = ''
    }
    piece = piece === '' ? unit : `${piece}\n\n${unit}`
    while (piece.length > PIECE) {
      out.push(piece.slice(0, PIECE))
      piece = piece.slice(PIECE)
    }
  }
  let block: string | null = null
  for (const para of text.replace(/[^\P{Cc}\t\n]/gu, '').split('\n\n')) {
    const opensOrCloses = (para.match(FENCES) ?? []).length % 2 === 1
    if (block !== null) {
      block = `${block}\n\n${para}`
      if (opensOrCloses) {
        put(block)
        block = null
      }
    } else if (opensOrCloses) block = para
    else put(para)
  }
  if (block !== null) put(block)
  if (piece !== '') out.push(piece)
  return out
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await update($, interactive, () => e.isInteractive)
    later($)
    return next(e)
  })

  // An edit of `.rness/` changes what the band and the pane show.
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (STATE.test(e.file_path)) later($)
    return ran
  })
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (STATE.test(e.file_path)) later($)
    return ran
  })

  // What no tool shows: a `git pull`, a file written through Bash.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) later($)
    return next(e)
  })

  // The notes to act on, whenever there are some (plan 0042). The banner is
  // the session-start line's, said once in the transcript: drawn here too,
  // it said the same thing twice.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, snapshot)
    if (e.props.hasSurvey || shown === null || shown.notes.length === 0)
      return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {shown.notes.map((note, i) => (
          <Box key={`note-${i}`}>
            <Text color="yellow" wrap="truncate-end">
              {note}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })

  // The workspace's label among the session modes at the right of the
  // prompt footer (plan 0044): `rness · <scope> · <n> in progress`, worded
  // by the CLI, after the engine's own (`focus`). A mode is dim and carries
  // no sign; `$.ui.status` would draw it as a warning. No snapshot: the
  // footer as the engine has it.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const shown = await read($, snapshot)
    if (shown === null) return next(e)
    return next({
      ...e,
      props: { modes: [...e.props.modes, shown.statusLine] },
    })
  })

  // `/rness:status` is the skill's name: answered here with the pane, it
  // runs no model turn; with no snapshot, or no one to see a pane, the
  // skill's tables answer it.
  on('command.run', { command: 'rness:status' }, async ($, e, next) => {
    // Nobody to see a pane (`claude -p`): the tables are the answer.
    if (!(await $.state.get(INTERACTIVE)).value) return next(e)
    const shown = (await snapshotNow($)) ?? (await refresh($))
    if (shown === null) return next(e)
    const wanted = e.args.trim().toLowerCase()
    const index = shown.tabs.findIndex(
      (t) => t.name.toLowerCase() === wanted || t.label.toLowerCase() === wanted
    )
    if (index !== -1) await update($, tab, () => index)
    // The command asks for the list, from its first row, whatever the pane
    // showed before.
    await update($, selected, () => 0)
    await update($, open, () => null)
    // The pane takes the keys (plans 0042, 0043): ↑/↓ select a row, Enter
    // opens it, Tab and Shift+Tab change the tab, a digit too, Esc and `q`
    // close. A pane binds no ←/→ (Claude Code 2.1.289).
    const opened = await $.ui.open({
      id: PANE,
      title: `${shown.workspace} · status`,
      focus: true,
      closeOnEscape: true,
    })
    // A surface that places no pane (an older desktop): the tables instead.
    if (!opened.isPlaced) return next(e)
    return {
      text: 'The status of the workspace is open beside the conversation.',
    }
  })

  // ↑/↓, PgUp/PgDn, Home/End are the pane's scroll keys (2.1.289): here they
  // move the selection, and the window follows it, the selected row kept
  // near the middle. A document open scrolls as the engine scrolls.
  on(
    'ui.scroll',
    { component: 'Pane', requestId: PANE },
    async ($, e, next) => {
      if (e.origin.kind !== 'person' || e.by === 0) return next(e)
      const shown = await snapshotNow($)
      if (shown === null || (await openNow($)) !== null) return next(e)
      const rows = shown.tabs[await tabNow($)]?.rows ?? []
      if (rows.length === 0) return next(e)
      const last = rows.length - 1
      const was = clamp(await selectedNow($), 0, last)
      // An arrow is a row, Home and End are `contentRows`, a page key `bodyRows`.
      const step =
        Math.abs(e.by) <= 1
          ? e.by
          : Math.abs(e.by) >= e.contentRows
            ? Math.sign(e.by) * rows.length
            : Math.sign(e.by) * Math.max(1, e.bodyRows - 1)
      const to = clamp(was + step, 0, last)
      await update($, selected, () => to)
      ringOn($, rows[to]!.path)
      const header =
        e.contentRows - rows.length - padOf(e.bodyRows, rows.length)
      const half = Math.floor((e.bodyRows - 1) / 2)
      const offset = clamp(
        header + to - half,
        0,
        Math.max(0, e.contentRows - e.bodyRows)
      )
      return next({ ...e, offset })
    }
  )

  // Tab and Shift+Tab walk the ring: from the selected row they land on the
  // `›` and `‹` beside it, drawn for that. The ring stays on the row and the
  // tab changes, as Tab does in the full-screen `rness status`. A click on
  // another row makes it the selection; the press that follows opens it.
  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person' || e.element === undefined) return next(e)
    if (e.element === 'tab-next' || e.element === 'tab-prev') {
      await cycleTab($, e.element === 'tab-next' ? 1 : -1)
      return {}
    }
    if (e.element.startsWith('open-')) {
      const path = e.element.slice('open-'.length)
      const shown = await snapshotNow($)
      const rows = shown?.tabs[await tabNow($)]?.rows ?? []
      const i = rows.findIndex((row) => row.path === path)
      if (i !== -1) await update($, selected, () => i)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Markdown, Text } = $.ui.resolve(e)
    const shown = await read($, snapshot)
    if (shown === null)
      return <Text dimColor>rness: the workspace status cannot be read.</Text>
    const opened = await read($, open)

    // One document, in place of the list: `q` brings the list back, Esc
    // still closes the pane. Its item on Agent Pulse is a link.
    if (opened !== null) {
      const row = rowOf(shown, opened.path)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            {[
              <Button
                key="back"
                label="Back"
                plain
                hotkey="q"
                autoFocus
                onPress={() => update($, open, () => null)}
              />,
              ...(row?.link != null
                ? [<Link key="pulse" href={row.link} label="Agent Pulse" />]
                : []),
            ]}
          </Box>
          <Box key="head">
            {row === undefined ? (
              <Text bold wrap="truncate-end">
                {opened.path}
              </Text>
            ) : (
              <Text wrap="truncate-end">
                <Text bold>
                  {row.id} {row.title}
                </Text>{' '}
                <Text color={COLORS[row.color]}>{row.status ?? '?'}</Text>
              </Text>
            )}
          </Box>
          {opened.text === null ? (
            <Box key="unread">
              <Text dimColor>rness: {opened.path} cannot be read.</Text>
            </Box>
          ) : (
            pieces(bodyOf(opened.text)).map((piece, i) => (
              <Markdown key={`doc-${i}`} text={piece} />
            ))
          )}
        </Box>
      )
    }

    const at = clamp(await read($, tab), 0, Math.max(0, shown.tabs.length - 1))
    const current = shown.tabs[at]
    const rows = current?.rows ?? []
    const sel = clamp(await read($, selected), 0, Math.max(0, rows.length - 1))
    const width = e.props.bodyColumns ?? 80
    const pad = padOf(e.props.scroll?.bodyRows ?? 0, rows.length)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {[
            ...shown.tabs.map((t, i) => (
              <Button
                key={`tab-${t.name}`}
                label={`${i < 9 ? `${i + 1} ` : ''}${t.label} (${t.rows.length})`}
                {...(i < 9 ? { hotkey: String(i + 1) } : {})}
                variant={i === at ? 'primary' : 'secondary'}
                // The ring starts here only when the tab has no row.
                {...(i === at && rows.length === 0
                  ? { autoFocus: true as const }
                  : {})}
                onPress={() => void showTab($, i)}
              />
            )),
            <Button
              key="close"
              label="Close"
              plain
              hotkey="q"
              role="dismiss"
              onPress={() => $.ui.close({ id: PANE })}
            />,
            ...(shown.pulse != null
              ? [<Link key="pulse" href={shown.pulse} label="Agent Pulse" />]
              : []),
            <Text key="keys" dimColor>
              ⇥ tab · ↑↓ row · ⏎ open
            </Text>,
          ]}
        </Box>
        {rows.length === 0 ? (
          <Box key="empty">
            <Text dimColor>Nothing here yet.</Text>
          </Box>
        ) : (
          // Every row, keyed by path (two documents of one date share an
          // id): Enter or a click opens it. The selected row carries the
          // ring and, beside it, `‹` and `›`: where Shift+Tab and Tab land.
          rows.map((row, i) => {
            const status = row.status ?? '?'
            const isSel = i === sel
            const label = cut(
              `${row.id} ${row.title}`,
              width - status.length - (isSel ? 5 : 3)
            )
            return (
              <Box key={`row-${row.path}`} flexDirection="row" gap={1}>
                {[
                  isSel ? (
                    <Button
                      key="tab-prev"
                      plain
                      dimColor
                      label="‹"
                      onPress={() => void cycleTab($, -1)}
                    />
                  ) : (
                    <Text> </Text>
                  ),
                  <Button
                    key={`open-${row.path}`}
                    plain
                    label={label}
                    {...(isSel ? { autoFocus: true as const } : {})}
                    onPress={() => void show($, row.path)}
                  />,
                  <Text color={COLORS[row.color]}>{status}</Text>,
                  ...(isSel
                    ? [
                        <Button
                          key="tab-next"
                          plain
                          dimColor
                          label="›"
                          onPress={() => void cycleTab($, 1)}
                        />,
                      ]
                    : []),
                ]}
              </Box>
            )
          })
        )}
        {Array.from({ length: pad }, (_, i) => (
          <Box key={`pad-${i}`}>
            <Text> </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
