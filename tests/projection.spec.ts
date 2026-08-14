import { describe, expect, it } from 'vitest'
import { foldExploration } from '../src/fold.ts'
import { explorationProjectionSchema } from '../src/projection.ts'

describe('exploration projection schema', () => {
  it('validates the folded wire value', () => {
    const events = [
      {
        type: 'tool/call',
        seq: 0,
        time: 0,
        data: { turn: 0, step: 0, callId: 'c0', name: 'exploration', arguments: JSON.stringify({ reads: [{ target: 'src/a.ts' }, { target: 'src/b.ts' }] }) },
      },
      {
        type: 'tool/call',
        seq: 1,
        time: 0,
        data: { turn: 0, step: 0, callId: 'c1', name: 'read', arguments: JSON.stringify({ file_path: 'src/a.ts', offset: 1, limit: 100 }) },
      },
      {
        type: 'tool/result',
        seq: 2,
        time: 0,
        data: { turn: 0, step: 0, message: { content: [] } },
      },
    ] as const

    const projection = foldExploration(events as never)
    expect(() => explorationProjectionSchema.parse(projection)).not.toThrow()
  })

  it('rejects an invalid shape at the boundary', () => {
    expect(() => explorationProjectionSchema.parse({ version: 2 })).toThrow()
  })
})
