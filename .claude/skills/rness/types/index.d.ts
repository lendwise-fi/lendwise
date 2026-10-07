// The values the rness mod keeps in `$.state` (spec 0029 §3.2). The
// snapshot is what `rness status --json` prints: `StatusSnapshot` in
// `src/commands/snapshot.ts`, read here as data.

export type RnessRow = {
  id: string
  title: string
  status: string | null
  path: string
  /** The colour of its status on Agent Pulse, by the board's name (`yellow`). */
  color: string
  /** Its item on Agent Pulse; null while the workspace declares no pulse. */
  link: string | null
}

export type RnessTab = { name: string; label: string; rows: RnessRow[] }

export type RnessSnapshot = {
  version: string
  workspace: string
  scope: string | null
  banner: string
  statusLine: string
  inProgress: string[]
  notes: string[]
  /** Agent Pulse, the board; null while none is declared. */
  pulse: string | null
  tabs: RnessTab[]
}

/** The document the pane shows in place of the list: its path, and its text, or null when it could not be read. */
export type RnessOpen = { path: string; text: string | null }

declare module 'claude-code' {
  interface PluginState {
    rness: {
      /** The last snapshot; null while none could be read. */
      snapshot: RnessSnapshot | null
      /** The pane's tab, by its index in the snapshot. */
      tab: number
      /** The selected row of that tab, by its index: ↑/↓ move it, Enter opens it. */
      selected: number
      /** Whether someone watches the session: no pane for `claude -p`. */
      interactive: boolean
      /** The document open in the pane; null while the list shows. */
      open: RnessOpen | null
    }
  }
}
