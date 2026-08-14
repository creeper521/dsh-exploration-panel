/**
 * Pure fold: session events → exploration projection state.
 *
 * THE single source of truth for the exploration panel. Both consumers run
 * this fold over the same durable log — the `exploration` tool uses it for
 * change-gating ("is this declaration already active?"), the projection unit
 * uses it to serve panel state — so the model-side declaration and the
 * panel-side declaration cannot diverge.
 *
 * Determinism rules (all load-bearing):
 * - Off-plan is judged at the time a read completes, against the declaration
 *   that was active then — a later declaration never reclassifies history.
 * - A declaration only counts reads that happened after it (its own
 *   tool/call seq); targets already read at declaration time are `done`.
 * - A completed declaration (all items done) folds into history and leaves
 *   `declaration: null`.
 * - An `exploration` call whose normalized arguments equal the active
 *   declaration returns the SAME state reference (no-op change gate).
 *
 * State is PLAIN JSON (the projection-registry rule): the fold state extends
 * the wire value with `_`-prefixed bookkeeping, all arrays/objects, so the
 * optional persisted projection cache can round-trip it. `explorationView`
 * strips the bookkeeping for the wire.
 *
 * @module dsh-exploration-panel/fold
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {
  Declaration,
  DeclarationHistoryEntry,
  DeclarationItem,
  ExplorationArgs,
  ExplorationProjection,
  ReadRange,
  ReadEvidence,
  PathEvidence,
  SearchEvidence,
  WebEvidence,
  ShellEvidence,
} from './types.ts'

/** Tools whose results count as reading evidence. */
export const EVIDENCE_TOOLS = new Set([
  'read', 'write', 'edit', 'grep', 'glob', 'web_search', 'web_fetch', 'bash', 'pwsh',
])

/** Tools whose completed calls are checked against the active declaration. */
export const READ_TOOLS = new Set(['read'])

/** The declaration tool name; its tool/call carries the declared plan. */
export const DECLARATION_TOOL = 'exploration'

/** Valid declaration cardinality (batching contract). */
export const DECLARATION_MIN_ITEMS = 2
export const DECLARATION_MAX_ITEMS = 5

/** Terminal status of a settled evidence entry. */
type Terminal = 'done' | 'failed'

/** Read/modified entry carrying the pending-call ids that still await results. */
type FileState = ReadEvidence & { _pendingIds: number[] }
type ModifiedState = PathEvidence & { _pendingIds: number[] }
type SearchState = SearchEvidence & { _id: number }
type WebState = WebEvidence & { _id: number }
type ShellState = ShellEvidence & { _id: number }

/** A tool call awaiting its result; carries the evidence entry it created. */
interface PendingCall {
  callId: string
  name: string
  turn: number
  step: number
  evidenceId: number
}

/**
 * Fold state: the wire value plus `_`-prefixed JSON-safe bookkeeping. Every
 * field is plain JSON; unrelated events return the SAME reference.
 */
export interface ExplorationFoldState extends ExplorationProjection {
  _pendingCalls: PendingCall[]
  _readPaths: string[]
  _nextId: number
  /** The wire declaration plus the raw normalized args used by the change gate. */
  declaration: (Declaration & { rawArgs: ExplorationArgs }) | null
  files: FileState[]
  modified: ModifiedState[]
  searches: SearchState[]
  web: WebState[]
  shell: ShellState[]
}

/** Create the empty fold state. */
export function createExplorationState(): ExplorationFoldState {
  return {
    version: 1,
    counts: { files: 0, modified: 0, searches: 0, web: 0, shell: 0, offPlan: 0 },
    files: [],
    modified: [],
    searches: [],
    web: [],
    shell: [],
    declaration: null,
    history: [],
    offPlan: [],
    lastSeq: -1,
    _pendingCalls: [],
    _readPaths: [],
    _nextId: 1,
  }
}

/** Recompute counts from the current collections (call on every changed state). */
function withCounts(state: ExplorationFoldState): ExplorationFoldState {
  return {
    ...state,
    counts: {
      files: state.files.length,
      modified: state.modified.length,
      searches: state.searches.length,
      web: state.web.length,
      shell: state.shell.length,
      offPlan: state.offPlan.length,
    },
  }
}

/** Parse a tool/call `arguments` JSON string defensively. */
function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw)
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** Normalize declaration arguments for identity comparison. */
export function normalizeDeclaration(args: ExplorationArgs): ExplorationArgs {
  const reads = args.reads.map(item => ({
    target: item.target.trim(),
    ...(item.purpose !== undefined && item.purpose.trim() !== '' ? { purpose: item.purpose.trim() } : {}),
  }))
  const note = args.note?.trim()
  return { reads, ...(note !== undefined && note !== '' ? { note } : {}) }
}

/** Validate declaration arguments; returns the normalized form or null. */
export function parseDeclarationArgs(raw: unknown): ExplorationArgs | null {
  if (typeof raw !== 'object' || raw === null) return null
  const args = raw as Record<string, unknown>
  if (!Array.isArray(args.reads)) return null
  if (args.reads.length < DECLARATION_MIN_ITEMS || args.reads.length > DECLARATION_MAX_ITEMS) return null
  if (args.note !== undefined && typeof args.note !== 'string') return null
  const reads: Array<{ target: string; purpose?: string }> = []
  const seen = new Set<string>()
  for (const item of args.reads) {
    if (typeof item !== 'object' || item === null) return null
    const row = item as Record<string, unknown>
    if (typeof row.target !== 'string' || row.target.trim() === '') return null
    if (row.purpose !== undefined && typeof row.purpose !== 'string') return null
    const target = row.target.trim()
    if (seen.has(target)) return null
    seen.add(target)
    reads.push({ target, ...(typeof row.purpose === 'string' && row.purpose.trim() !== '' ? { purpose: row.purpose.trim() } : {}) })
  }
  return normalizeDeclaration({ reads, ...(typeof args.note === 'string' && args.note.trim() !== '' ? { note: args.note.trim() } : {}) })
}

/** Whether a declaration call duplicates the currently active one. */
export function sameDeclaration(current: { rawArgs: ExplorationArgs }, args: ExplorationArgs): boolean {
  const a = normalizeDeclaration(current.rawArgs)
  const b = normalizeDeclaration(args)
  if (a.reads.length !== b.reads.length) return false
  for (let index = 0; index < a.reads.length; index++) {
    const left = a.reads[index]!
    const right = b.reads[index]!
    if (left.target !== right.target || (left.purpose ?? '') !== (right.purpose ?? '')) return false
  }
  return (a.note ?? '') === (b.note ?? '')
}

/** Merge one read interval into a range list (sorted, overlapping merged). */
export function mergeRanges(ranges: readonly ReadRange[], next: ReadRange): ReadRange[] {
  const merged = [...ranges, next].sort((left, right) => left.start - right.start)
  const out: ReadRange[] = []
  for (const range of merged) {
    const last = out.at(-1)
    if (last === undefined) {
      out.push({ ...range })
    } else if (range.end !== undefined && last.end !== undefined && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end)
    } else {
      out.push({ ...range })
    }
  }
  return out
}

/** The path/pattern/query of an evidence tool call, or null when the tool has no single target. */
function evidenceTarget(name: string, args: Record<string, unknown>): string | null {
  if (name === 'read' || name === 'write' || name === 'edit') {
    const path = args.file_path
    return typeof path === 'string' && path.trim() !== '' ? path.trim() : null
  }
  if (name === 'grep' || name === 'glob') {
    const pattern = args.pattern
    return typeof pattern === 'string' && pattern.trim() !== '' ? pattern.trim() : null
  }
  if (name === 'web_search') {
    const query = args.query
    return typeof query === 'string' && query.trim() !== '' ? query.trim() : null
  }
  if (name === 'web_fetch') {
    const url = args.url
    return typeof url === 'string' && url.trim() !== '' ? url.trim() : null
  }
  return null
}

/**
 * Register the running evidence entry for one tool call and return its
 * pairing id; null when the tool is unknown or the args are unparseable.
 */
function startEvidence(state: ExplorationFoldState, name: string, args: Record<string, unknown>, seq: number): number | null {
  const id = state._nextId
  const target = evidenceTarget(name, args)
  if (name === 'read') {
    if (target === null) return null
    const offset = typeof args.offset === 'number' ? args.offset : 1
    const limit = typeof args.limit === 'number' ? args.limit : undefined
    const range: ReadRange = { start: offset, ...(limit !== undefined && limit > 0 ? { end: offset + limit - 1 } : {}) }
    const existing = state.files.find(entry => entry.path === target)
    state.files = existing === undefined
      ? [...state.files, { path: target, ranges: [range], firstSeq: seq, lastSeq: seq, status: 'running' as const, _pendingIds: [id] }]
      : state.files.map(entry => entry.path === target
        ? { ...entry, ranges: mergeRanges(entry.ranges, range), lastSeq: seq, status: 'running' as const, _pendingIds: [...entry._pendingIds, id] }
        : entry)
    return id
  }
  if (name === 'write' || name === 'edit') {
    if (target === null) return null
    state.modified = [...state.modified, { path: target, seq, status: 'running' as const, _pendingIds: [id] }]
    return id
  }
  if (name === 'grep' || name === 'glob') {
    if (target === null) return null
    state.searches = [...state.searches, { tool: name, pattern: target, seq, status: 'running' as const, _id: id }]
    return id
  }
  if (name === 'web_search' || name === 'web_fetch') {
    if (target === null) return null
    state.web = [...state.web, { url: target, seq, status: 'running' as const, _id: id }]
    return id
  }
  if (name === 'bash' || name === 'pwsh') {
    state.shell = [...state.shell, { seq, status: 'running' as const, _id: id }]
    return id
  }
  return null
}

/** Settle the evidence entry created by `pending` to its terminal status. */
function settleEvidence(state: ExplorationFoldState, pending: PendingCall, status: Terminal): void {
  if (pending.name === 'read') {
    state.files = state.files.map(entry => {
      if (!entry._pendingIds.includes(pending.evidenceId)) return entry
      const pendingIds = entry._pendingIds.filter(id => id !== pending.evidenceId)
      return { ...entry, _pendingIds: pendingIds, status: pendingIds.length === 0 ? status : 'running' }
    })
    return
  }
  if (pending.name === 'write' || pending.name === 'edit') {
    state.modified = state.modified.map(entry => {
      if (!entry._pendingIds.includes(pending.evidenceId)) return entry
      const pendingIds = entry._pendingIds.filter(id => id !== pending.evidenceId)
      return { ...entry, _pendingIds: pendingIds, status: pendingIds.length === 0 ? status : 'running' }
    })
    return
  }
  if (pending.name === 'grep' || pending.name === 'glob') {
    state.searches = state.searches.map(entry => entry._id === pending.evidenceId ? { ...entry, status } : entry)
    return
  }
  if (pending.name === 'web_search' || pending.name === 'web_fetch') {
    state.web = state.web.map(entry => entry._id === pending.evidenceId ? { ...entry, status } : entry)
    return
  }
  if (pending.name === 'bash' || pending.name === 'pwsh') {
    state.shell = state.shell.map(entry => entry._id === pending.evidenceId ? { ...entry, status } : entry)
  }
}

/** The path of the read entry that owns the given pending evidence id, or undefined. */
function readPathById(state: ExplorationFoldState, evidenceId: number): string | undefined {
  const entry = state.files.find(candidate => candidate._pendingIds.includes(evidenceId))
  return entry?.path
}

/**
 * Apply one session event to the fold state.
 * @returns the SAME reference for events that do not concern the fold (the
 *   projection registry gates its change feed on `Object.is`), or a NEW
 *   reference when the state moved.
 */
export function applyExplorationEvent(state: ExplorationFoldState, event: SessionEvent): ExplorationFoldState {
  const seq = event.seq
  if (event.type === 'tool/call') {
    const name = event.data.name
    if (name === DECLARATION_TOOL) {
      const args = parseArgs(event.data.arguments)
      const declared = args === null ? null : parseDeclarationArgs(args)
      if (declared === null) return state
      if (state.declaration !== null && sameDeclaration(state.declaration, declared)) return state
      const items: DeclarationItem[] = declared.reads.map(item => {
        const prior = state.files.find(entry => entry.path === item.target)
        return {
          target: item.target,
          ...(item.purpose !== undefined ? { purpose: item.purpose } : {}),
          status: state._readPaths.includes(item.target) ? 'done' as const : 'pending' as const,
          readSeqs: prior === undefined ? [] : [prior.lastSeq],
        }
      })
      const history = state.declaration === null
        ? state.history
        : [...state.history, { seq: state.declaration.seq, status: 'superseded' as const, items: state.declaration.items }]
      return withCounts({
        ...state,
        declaration: { seq, ...(declared.note !== undefined ? { note: declared.note } : {}), items, rawArgs: declared },
        history,
        lastSeq: seq,
      })
    }
    if (!EVIDENCE_TOOLS.has(name)) return state
    const args = parseArgs(event.data.arguments)
    if (args === null) return state
    const evidenceId = startEvidence(state, name, args, seq)
    if (evidenceId === null) return state
    return withCounts({
      ...state,
      _pendingCalls: [...state._pendingCalls, { callId: event.data.callId, name, turn: event.data.turn, step: event.data.step, evidenceId }],
      _nextId: state._nextId + 1,
      lastSeq: seq,
    })
  }
  if (event.type === 'tool/result') {
    const index = state._pendingCalls.findIndex(call => call.turn === event.data.turn && call.step === event.data.step)
    if (index < 0) return state
    const pending = state._pendingCalls[index]!
    const failed = event.data.error !== undefined
    const readPath = READ_TOOLS.has(pending.name) ? readPathById(state, pending.evidenceId) : undefined
    const next: ExplorationFoldState = {
      ...state,
      _pendingCalls: state._pendingCalls.filter((_, i) => i !== index),
      lastSeq: seq,
    }
    settleEvidence(next, pending, failed ? 'failed' : 'done')
    // Off-plan judgement at completion time, against the THEN-active declaration.
    if (readPath !== undefined && !failed) {
      const declared = next.declaration !== null && next.declaration.items.some(item => item.target === readPath)
      if (!declared && !state._readPaths.includes(readPath)) {
        next.offPlan = [...next.offPlan, { path: readPath, seq }]
      }
    }
    // Declaration progress: a completed read may satisfy declared targets.
    if (readPath !== undefined && !failed && next.declaration !== null) {
      const items = next.declaration.items.map(item => {
        if (item.target !== readPath || item.status === 'done') return item
        return { ...item, status: 'done' as const, readSeqs: [...item.readSeqs, seq] }
      })
      if (items.every(item => item.status === 'done')) {
        next.history = [...next.history, { seq: next.declaration.seq, status: 'completed', items }]
        next.declaration = null
      } else {
        next.declaration = { ...next.declaration, items }
      }
    }
    if (readPath !== undefined) next._readPaths = [...next._readPaths, readPath]
    return withCounts(next)
  }
  return state
}

/**
 * Fold an event list into the projection value (init + apply all + view).
 * @param events - session events in log order.
 * @returns the projection reflecting the whole log.
 */
export function foldExploration(events: readonly SessionEvent[]): ExplorationProjection {
  let state = createExplorationState()
  for (const event of events) state = applyExplorationEvent(state, event)
  return explorationView(state)
}

/** Derive the wire value from fold state (strips `_`-prefixed bookkeeping). */
export function explorationView(state: ExplorationFoldState): ExplorationProjection {
  return {
    version: state.version,
    counts: state.counts,
    files: state.files.map(({ _pendingIds, ...entry }) => entry),
    modified: state.modified.map(({ _pendingIds, ...entry }) => entry),
    searches: state.searches.map(({ _id, ...entry }) => entry),
    web: state.web.map(({ _id, ...entry }) => entry),
    shell: state.shell.map(({ _id, ...entry }) => entry),
    declaration: state.declaration,
    history: state.history,
    offPlan: state.offPlan,
    lastSeq: state.lastSeq,
  }
}

/** The active declaration of a folded projection. */
export function activeDeclaration(projection: ExplorationProjection): Declaration | null {
  return projection.declaration
}

export type { Declaration, DeclarationHistoryEntry, DeclarationItem, ExplorationArgs, ExplorationProjection, ReadRange }
