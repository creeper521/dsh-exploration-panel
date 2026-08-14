import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  applyExplorationEvent,
  createExplorationState,
  foldExploration,
  pathTargetsMatch,
} from '../src/fold.ts'
import type { ExplorationProjection } from '../src/types.ts'

/** Sequential event fixture builder. */
function makeEvents(): { call(name: string, args: unknown, turn?: number, step?: number): SessionEvent; result(turn?: number, step?: number, error?: { name: string; code: string }): SessionEvent; user(text: string): SessionEvent; log: SessionEvent[] } {
  const log: SessionEvent[] = []
  let seq = 0
  const nextSeq = (): number => seq++
  return {
    call(name, args, turn = 0, step = 0) {
      const event: SessionEvent = {
        type: 'tool/call',
        seq: nextSeq(),
        time: 0,
        data: { turn, step, callId: `call-${seq}` as never, name, arguments: JSON.stringify(args) },
      }
      log.push(event)
      return event
    },
    result(turn = 0, step = 0, error) {
      const event: SessionEvent = {
        type: 'tool/result',
        seq: nextSeq(),
        time: 0,
        data: { turn, step, message: { content: [] } as never, ...(error !== undefined ? { error } : {}) },
      }
      log.push(event)
      return event
    },
    user(text) {
      const event: SessionEvent = { type: 'user/message', seq: nextSeq(), time: 0, data: { turn: 0, step: 0, message: { content: [{ type: 'text', text }] } } as never }
      log.push(event)
      return event
    },
    log,
  }
}

const declare = (reads: Array<{ target: string; purpose?: string }>, note?: string) => ({ reads, ...(note !== undefined ? { note } : {}) })
const read = (path: string, offset = 1, limit?: number) => ({ file_path: path, ...(offset !== 1 ? { offset } : {}), ...(limit !== undefined ? { limit } : {}) })

function fold(log: SessionEvent[]): ExplorationProjection {
  return foldExploration(log)
}

describe('exploration fold: empty and unrelated events', () => {
  it('empty log yields an empty projection', () => {
    const projection = fold([])
    expect(projection.version).toBe(1)
    expect(projection.counts).toEqual({ files: 0, modified: 0, searches: 0, web: 0, shell: 0, offPlan: 0 })
    expect(projection.declaration).toBeNull()
    expect(projection.history).toEqual([])
    expect(projection.lastSeq).toBe(-1)
  })

  it('unrelated events return the same state reference', () => {
    const state = createExplorationState()
    const fx = makeEvents()
    fx.user('hello')
    const next = applyExplorationEvent(state, fx.log[0]!)
    expect(next).toBe(state)
  })
})

describe('exploration fold: declarations', () => {
  it('a declaration call activates pending items', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts', purpose: 'entry' }, { target: 'src/b.ts' }]))
    const projection = fold(fx.log)
    expect(projection.declaration?.items.map(item => [item.target, item.status])).toEqual([
      ['src/a.ts', 'pending'],
      ['src/b.ts', 'pending'],
    ])
    expect(projection.declaration?.items[0]?.purpose).toBe('entry')
  })

  it('an identical declaration call is a no-op (same state reference)', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    fx.call('exploration', declare([{ target: ' src/a.ts ' }, { target: 'src/b.ts' }]))
    let state = createExplorationState()
    for (const event of fx.log) state = applyExplorationEvent(state, event)
    // The second declaration (seq 1) must NOT have replaced the first (seq 0).
    expect(fold(fx.log).declaration?.seq).toBe(0)
    expect(fold(fx.log).history).toEqual([])
  })

  it('an invalid declaration (single item) is ignored', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }]))
    const projection = fold(fx.log)
    expect(projection.declaration).toBeNull()
  })

  it('a declaration with duplicate targets is ignored', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/a.ts' }]))
    expect(fold(fx.log).declaration).toBeNull()
  })

  it('a new declaration supersedes the old one into history', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    fx.call('exploration', declare([{ target: 'src/x.ts' }, { target: 'src/y.ts' }]))
    const projection = fold(fx.log)
    expect(projection.declaration?.seq).toBe(1)
    expect(projection.history).toHaveLength(1)
    expect(projection.history[0]).toMatchObject({ seq: 0, status: 'superseded' })
    expect(projection.history[0]?.items.map(item => item.target)).toEqual(['src/a.ts', 'src/b.ts'])
  })
})

describe('exploration fold: reads and declaration progress', () => {
  it('a declared read completes its item and lands in files', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    fx.call('read', read('src/a.ts', 1, 200))
    fx.result()
    const projection = fold(fx.log)
    expect(projection.declaration?.items[0]).toMatchObject({ target: 'src/a.ts', status: 'done', readSeqs: [2] })
    expect(projection.declaration?.items[1]?.status).toBe('pending')
    expect(projection.files).toEqual([
      { path: 'src/a.ts', ranges: [{ start: 1, end: 200 }], firstSeq: 1, lastSeq: 1, status: 'done' },
    ])
  })

  it('completing every item folds the declaration into history', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    fx.call('read', read('src/a.ts'))
    fx.result()
    fx.call('read', read('src/b.ts'))
    fx.result()
    const projection = fold(fx.log)
    expect(projection.declaration).toBeNull()
    expect(projection.history).toHaveLength(1)
    expect(projection.history[0]).toMatchObject({ seq: 0, status: 'completed' })
    expect(projection.history[0]?.items.every(item => item.status === 'done')).toBe(true)
  })

  it('a target already read before the declaration is done at declaration time', () => {
    const fx = makeEvents()
    fx.call('read', read('src/a.ts'))
    fx.result()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    const projection = fold(fx.log)
    expect(projection.declaration?.items[0]).toMatchObject({ target: 'src/a.ts', status: 'done' })
    expect(projection.declaration?.items[1]?.status).toBe('pending')
  })

  it('a failed read marks the entry failed and does not advance the declaration', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    fx.call('read', read('src/a.ts'))
    fx.result(0, 0, { name: 'LlmError', code: 'READ_FAILED' })
    const projection = fold(fx.log)
    expect(projection.files[0]?.status).toBe('failed')
    expect(projection.declaration?.items[0]?.status).toBe('pending')
    expect(projection.offPlan).toEqual([])
  })

  it('an in-flight read shows as running until its result lands', () => {
    const fx = makeEvents()
    fx.call('read', read('src/a.ts', 10, 50))
    const projection = fold(fx.log)
    expect(projection.files).toEqual([
      { path: 'src/a.ts', ranges: [{ start: 10, end: 59 }], firstSeq: 0, lastSeq: 0, status: 'running' },
    ])
  })
})

describe('exploration fold: off-plan', () => {
  it('an undeclared read is off-plan at completion time', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    fx.call('read', read('src/other.ts'))
    fx.result()
    const projection = fold(fx.log)
    expect(projection.offPlan).toEqual([{ path: 'src/other.ts', seq: 2 }])
    expect(projection.counts.offPlan).toBe(1)
  })

  it('a second read of the same off-plan path is not re-flagged', () => {
    const fx = makeEvents()
    fx.call('read', read('src/other.ts'))
    fx.result()
    fx.call('read', read('src/other.ts'))
    fx.result()
    expect(fold(fx.log).offPlan).toEqual([{ path: 'src/other.ts', seq: 1 }])
  })

  it('a later declaration never reclassifies earlier off-plan reads', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    fx.call('read', read('src/other.ts'))
    fx.result()
    fx.call('exploration', declare([{ target: 'src/other.ts' }, { target: 'src/c.ts' }]))
    const projection = fold(fx.log)
    expect(projection.offPlan).toEqual([{ path: 'src/other.ts', seq: 2 }])
  })
})

describe('exploration fold: evidence buckets', () => {
  it('repeated reads merge ranges into one entry', () => {
    const fx = makeEvents()
    fx.call('read', read('src/a.ts', 1, 100))
    fx.result()
    fx.call('read', read('src/a.ts', 300, 50))
    fx.result()
    const projection = fold(fx.log)
    expect(projection.files).toHaveLength(1)
    expect(projection.files[0]?.ranges).toEqual([{ start: 1, end: 100 }, { start: 300, end: 349 }])
    expect(projection.files[0]?.firstSeq).toBe(0)
    expect(projection.files[0]?.lastSeq).toBe(2)
    expect(projection.counts.files).toBe(1)
  })

  it('parallel reads of one path stay running until both settle', () => {
    const fx = makeEvents()
    fx.call('read', read('src/a.ts', 1, 100), 0, 0)
    fx.call('read', read('src/a.ts', 200, 50), 0, 1)
    fx.result(0, 0)
    let projection = fold(fx.log)
    expect(projection.files[0]?.status).toBe('running')
    fx.result(0, 1)
    projection = fold(fx.log)
    expect(projection.files[0]?.status).toBe('done')
    expect(projection.files[0]?.ranges).toEqual([{ start: 1, end: 100 }, { start: 200, end: 249 }])
  })

  it('write/edit land in modified', () => {
    const fx = makeEvents()
    fx.call('write', { file_path: 'src/new.ts', content: 'x' })
    fx.result()
    fx.call('edit', { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' })
    fx.result()
    const projection = fold(fx.log)
    expect(projection.modified.map(entry => entry.path)).toEqual(['src/new.ts', 'src/a.ts'])
  })

  it('grep and glob land in searches', () => {
    const fx = makeEvents()
    fx.call('grep', { pattern: 'TODO' })
    fx.result()
    fx.call('glob', { pattern: '**/*.ts' })
    fx.result()
    const projection = fold(fx.log)
    expect(projection.searches).toEqual([
      { tool: 'grep', pattern: 'TODO', seq: 0, status: 'done' },
      { tool: 'glob', pattern: '**/*.ts', seq: 2, status: 'done' },
    ])
  })

  it('bash lands in shell without parsing the command', () => {
    const fx = makeEvents()
    fx.call('bash', { command: 'cat src/a.ts' })
    fx.result()
    const projection = fold(fx.log)
    expect(projection.shell).toEqual([{ seq: 0, status: 'done' }])
    expect(projection.counts.shell).toBe(1)
  })

  it('web_search and web_fetch land in web', () => {
    const fx = makeEvents()
    fx.call('web_search', { query: 'deepseek harness' })
    fx.result()
    fx.call('web_fetch', { url: 'https://example.com' })
    fx.result()
    expect(fold(fx.log).web.map(entry => entry.url)).toEqual(['deepseek harness', 'https://example.com'])
  })

  it('unknown tools are ignored', () => {
    const fx = makeEvents()
    fx.call('future_tool', {})
    fx.result()
    expect(fold(fx.log).counts).toEqual({ files: 0, modified: 0, searches: 0, web: 0, shell: 0, offPlan: 0 })
  })
})

describe('exploration fold: declaration lifecycle over a long session', () => {
  it('declaration survives unrelated events and turn boundaries', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'src/a.ts' }, { target: 'src/b.ts' }]))
    fx.user('keep going')
    expect(fold(fx.log).declaration?.items.map(item => item.status)).toEqual(['pending', 'pending'])
  })
})

describe('pathTargetsMatch (relative declaration vs absolute read)', () => {
  it('matches exact paths', () => {
    expect(pathTargetsMatch('src/a.ts', 'src/a.ts')).toBe(true)
    expect(pathTargetsMatch('src/a.ts', 'src/b.ts')).toBe(false)
  })

  it('matches a relative target against an absolute read on a separator boundary', () => {
    expect(pathTargetsMatch('README.md', 'D:\\code\\proj\\README.md')).toBe(true)
    expect(pathTargetsMatch('docs/architecture.md', 'D:/code/proj/docs/architecture.md')).toBe(true)
    // Basename fallback also covers a sibling directory with the same file name.
    expect(pathTargetsMatch('docs/architecture.md', 'D:/code/proj/docs2/architecture.md')).toBe(true)
    // The suffix tier rejects a non-boundary tail: `a.ts` inside `xa.ts`.
    expect(pathTargetsMatch('a.ts', 'D:/code/proj/xa.ts')).toBe(false)
  })

  it('matches by basename when directories differ', () => {
    expect(pathTargetsMatch('README.md', 'D:/code/other/README.md')).toBe(true)
    expect(pathTargetsMatch('docs/AGENTS.md', 'D:/code/other/docs/AGENTS.md')).toBe(true)
  })

  it('rejects empty inputs', () => {
    expect(pathTargetsMatch('', 'README.md')).toBe(false)
    expect(pathTargetsMatch('README.md', '')).toBe(false)
  })
})

describe('exploration fold: relative declaration with absolute reads (real-model shape)', () => {
  it('satisfies the declaration, completes it, and reports zero off-plan', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'README.md' }, { target: 'docs/architecture.md' }]))
    fx.call('read', { file_path: 'D:/code/proj/README.md' })
    fx.result()
    fx.call('read', { file_path: 'D:/code/proj/docs/architecture.md' })
    fx.result()
    const projection = fold(fx.log)
    expect(projection.offPlan).toEqual([])
    expect(projection.declaration).toBeNull()
    expect(projection.history).toHaveLength(1)
    expect(projection.history[0]).toMatchObject({ status: 'completed' })
    expect(projection.history[0]?.items.every(item => item.status === 'done')).toBe(true)
  })

  it('still flags an undeclared absolute read as off-plan', () => {
    const fx = makeEvents()
    fx.call('exploration', declare([{ target: 'README.md' }, { target: 'docs/architecture.md' }]))
    fx.call('read', { file_path: 'D:/code/proj/src/unrelated.ts' })
    fx.result()
    expect(fold(fx.log).offPlan).toEqual([{ path: 'D:/code/proj/src/unrelated.ts', seq: 2 }])
  })

  it('marks a declaration item done when the target was already read with an absolute path', () => {
    const fx = makeEvents()
    fx.call('read', { file_path: 'D:/code/proj/README.md' })
    fx.result()
    fx.call('exploration', declare([{ target: 'README.md' }, { target: 'package.json' }]))
    const projection = fold(fx.log)
    expect(projection.declaration?.items[0]?.status).toBe('done')
    expect(projection.declaration?.items[1]?.status).toBe('pending')
  })
})
