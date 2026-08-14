/**
 * Shared vocabulary of the exploration panel: the wire projection, the
 * declaration tool argument types, and the SessionProjectionMap merge that
 * carries the `exploration` key through the whole chain (host unit, wire
 * block, client `useProjection('exploration')`).
 * @module dsh-exploration-panel/types
 */

// Pulls the projection type table into this program so the augmentation
// below resolves (the registry is a dependency of the host projection unit).
import type {} from '@deepseek-ai/dsh-session-projection/types'

/** One merged read interval of a file (1-based first line; `end` absent when the call gave no limit). */
export interface ReadRange {
  start: number
  end?: number
}

/** Lifecycle of one evidence item, mirroring tool/call → tool/result. */
export type EvidenceStatus = 'running' | 'done' | 'failed'

/** A `read` tool call aggregated per path. */
export interface ReadEvidence {
  path: string
  ranges: ReadRange[]
  firstSeq: number
  lastSeq: number
  status: EvidenceStatus
}

/** A `write` / `edit` tool call aggregated per path. */
export interface PathEvidence {
  path: string
  seq: number
  status: EvidenceStatus
}

/** A `grep` / `glob` tool call. */
export interface SearchEvidence {
  tool: 'grep' | 'glob'
  pattern: string
  seq: number
  status: EvidenceStatus
}

/** A `web_search` / `web_fetch` tool call. */
export interface WebEvidence {
  url: string
  seq: number
  status: EvidenceStatus
}

/** A `bash` / `pwsh` tool call. Command text is intentionally NOT parsed. */
export interface ShellEvidence {
  seq: number
  status: EvidenceStatus
}

/** One declared read target inside the active declaration. */
export interface DeclarationItem {
  target: string
  purpose?: string
  status: 'pending' | 'done' | 'failed'
  /** Seqs of the read results that satisfied this target (after the declaration). */
  readSeqs: number[]
}

/** The active declaration: the latest successful `exploration` tool call. */
export interface Declaration {
  /** Seq of the `tool/call` event that declared it. */
  seq: number
  note?: string
  items: DeclarationItem[]
}

/** A superseded or completed declaration, kept for expansion. */
export interface DeclarationHistoryEntry {
  seq: number
  status: 'superseded' | 'completed'
  items: DeclarationItem[]
}

/** A `read` whose path was outside the active declaration at the time it ran. */
export interface OffPlanEvidence {
  path: string
  seq: number
}

/**
 * The whole wire value of the `exploration` projection. Plain JSON, folded
 * deterministically from the session log; `version` and `lastSeq` let
 * clients gate cache invalidation and NEW-increment tracking.
 */
export interface ExplorationProjection {
  version: 1
  counts: {
    files: number
    modified: number
    searches: number
    web: number
    shell: number
    offPlan: number
  }
  files: ReadEvidence[]
  modified: PathEvidence[]
  searches: SearchEvidence[]
  web: WebEvidence[]
  shell: ShellEvidence[]
  declaration: Declaration | null
  history: DeclarationHistoryEntry[]
  offPlan: OffPlanEvidence[]
  /** The largest folded event seq; clients track NEW increments against it. */
  lastSeq: number
}

/** The `exploration` tool arguments, as declared in the tool schema. */
export interface ExplorationArgs {
  reads: Array<{ target: string; purpose?: string }>
  note?: string
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Folded evidence + declared-intent state of the exploration panel. */
    exploration: ExplorationProjection
  }
}
