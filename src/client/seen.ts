/**
 * Per-session last-seen ledger backing the NEW increment (FR-4): the largest
 * event seq the user has actually viewed in the panel, persisted
 * browser-locally per session id. The panel advances it on unmount — viewing
 * the panel marks everything up to its latest projection seq as seen — and
 * the dock pulses NEW while the projection is ahead of it.
 * @module dsh-exploration-panel/client/seen
 */

const STORE_KEY = 'dsh.exploration.seen'

type Ledger = Record<string, number>

function readLedger(): Ledger {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Ledger = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number') out[key] = value
    }
    return out
  } catch {
    // Only a corrupted JSON payload reaches here (localStorage itself is
    // always available in the browser/jsdom); a fresh ledger is a safe NEW
    // baseline, so degradation is silent by design.
    return {}
  }
}

/**
 * Read the largest seq the user has viewed for one session.
 * @param sessionId - the session whose ledger entry to read.
 * @returns the last-seen seq; 0 when the panel was never viewed (and NEW is
 * therefore undefined rather than "everything").
 */
export function readSeenSeq(sessionId: string): number {
  return readLedger()[sessionId] ?? 0
}

/**
 * Advance the last-seen seq for one session (monotonic; never moves back).
 * @param sessionId - the session whose ledger entry to advance.
 * @param seq - the largest seq the user has just viewed.
 */
export function markSeen(sessionId: string, seq: number): void {
  try {
    const ledger = readLedger()
    ledger[sessionId] = Math.max(seq, ledger[sessionId] ?? 0)
    localStorage.setItem(STORE_KEY, JSON.stringify(ledger))
  } catch {
    // Only an unavailable or quota-exhausted localStorage reaches here
    // (readLedger already validated the payload); losing persistence costs
    // NEW-increment memory across reloads, nothing else.
  }
}
