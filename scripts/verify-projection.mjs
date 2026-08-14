/**
 * Verification driver: locate the session that contains `exploration` tool
 * calls, decompress its zstd JSONL log, fold it with the panel's own fold,
 * and print the projection exactly as the panel would render it.
 *
 * Run from the repository root:
 *   node --import tsx/esm D:/code/dsh-exploration-panel/scripts/verify-projection.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
// The repo's own zstd source (runs under tsx); relative to this workspace
// copy's scripts/ directory (two levels up from the harness repo root).
import { decompressZstdFrame, scanZstdFrames } from '../../packages/session/session-persistence-jsonl/src/zstd.ts'
import { foldExploration } from '../src/fold.ts'

const SESSION_ROOT = 'C:/Users/WIN10/.dsh/sessions/--D-code-deepseek-harness--'

/** Decompress one zstd log (header + event frames concatenated). */
async function decompressLog(buffer) {
  const { frames } = scanZstdFrames(buffer)
  const parts = []
  for (const frame of frames) {
    parts.push(await decompressZstdFrame(buffer.subarray(frame.start, frame.end)))
  }
  return Buffer.concat(parts).toString('utf8')
}

function eventsOf(text) {
  const events = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const value = JSON.parse(trimmed)
      if (value !== null && typeof value === 'object' && typeof value.type === 'string' && typeof value.seq === 'number') {
        events.push(value)
      }
    } catch {
      // header/metadata lines and torn tails are skipped
    }
  }
  return events
}

const candidates = readdirSync(SESSION_ROOT, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(SESSION_ROOT, entry.name, 'session.jsonl.zstd'))
  .filter(path => { try { return readFileSync(path).length > 0 } catch { return false } })

let found = null
for (const path of candidates) {
  try {
    const events = eventsOf(await decompressLog(readFileSync(path)))
    // Event-level detection: a real tool/call named `exploration` (raw text
    // matching would false-positive on the tool schema inside the prompt).
    if (events.some(event => event.type === 'tool/call' && event.data.name === 'exploration')) {
      console.log(`SESSION: ${path}`)
      found = { path, events }
      break
    }
  } catch (error) {
    console.log(`skip ${path}: ${String(error).slice(0, 100)}`)
  }
}

if (found === null) {
  console.log('NO SESSION CONTAINS exploration CALLS')
  process.exit(1)
}

const events = found.events
const projection = foldExploration(events)

console.log('\n=== PANEL PROJECTION (what the Exploration tab renders) ===')
console.log(JSON.stringify(projection, null, 2))

console.log('\n=== evidence tool calls in log order ===')
for (const event of events) {
  if (event.type === 'tool/call' && ['exploration', 'read', 'write', 'edit', 'grep', 'glob', 'web_search', 'web_fetch', 'bash', 'pwsh'].includes(event.data.name)) {
    const args = JSON.parse(event.data.arguments)
    console.log(`seq ${event.seq}  ${event.data.name}  ${JSON.stringify(args).slice(0, 160)}`)
  }
}
