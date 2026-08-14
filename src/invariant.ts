/**
 * Lightweight consistency companion: every referenced seq in the folded
 * projection must exist in the session log, and the active declaration's seq
 * must be an `exploration` tool/call. Runs once over the existing log on
 * session touch, then incrementally per committed event. Violations are
 * reported on stderr — the panel data itself stays driven by the fold.
 *
 * @module dsh-exploration-panel/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { applyExplorationEvent, createExplorationState, explorationView, type ExplorationFoldState } from './fold.ts'

export const name = 'exploration-invariant'

/** One violated relationship, reported with the session id. */
function report(sessionId: string, detail: string): void {
  console.error(`[exploration-invariant] session ${sessionId}: ${detail}`)
}

/** Assert every seq referenced by the view exists in the log. */
function assertReferences(state: ExplorationFoldState, session: Session): void {
  const view = explorationView(state)
  const seqs = new Set(session.events.map(event => event.seq))
  const missing = (seq: number, what: string): void => {
    if (!seqs.has(seq)) report(session.id, `${what} references missing seq ${seq}`)
  }
  for (const entry of view.files) {
    missing(entry.firstSeq, `files[${entry.path}]`)
    missing(entry.lastSeq, `files[${entry.path}]`)
  }
  for (const entry of view.offPlan) missing(entry.seq, `offPlan[${entry.path}]`)
  if (view.declaration !== null) missing(view.declaration.seq, 'declaration')
  for (const entry of view.history) missing(entry.seq, 'history')
  // The declaration seq must actually be an exploration tool/call.
  if (view.declaration !== null) {
    const event = session.events.find(candidate => candidate.seq === view.declaration!.seq)
    if (event === undefined || event.type !== 'tool/call' || event.data.name !== 'exploration') {
      report(session.id, `declaration seq ${view.declaration.seq} is not an exploration tool/call`)
    }
  }
}

/**
 * Plugin body: subscribe to the session event stream and validate the fold.
 * @param ctx - registrant context.
 */
export function apply(ctx: Context): void {
  const states = new WeakMap<Session, ExplorationFoldState>()
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    let state = states.get(session)
    if (state === undefined) {
      state = createExplorationState()
      for (const prior of session.events) state = applyExplorationEvent(state, prior)
      states.set(session, state)
    }
    state = applyExplorationEvent(state, event)
    states.set(session, state)
    assertReferences(state, session)
  })
}
