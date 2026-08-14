import { describe, expect, it } from 'vitest'
import { DECLARATION_MAX_ITEMS, DECLARATION_MIN_ITEMS, normalizeDeclaration, parseDeclarationArgs } from '../src/fold.ts'
import { equalsActiveDeclaration, validateExplorationArgs } from '../src/tool.ts'
import type { ExplorationArgs } from '../src/types.ts'

const two = (a = 'src/a.ts', b = 'src/b.ts'): ExplorationArgs => ({ reads: [{ target: a }, { target: b }] })

describe('validateExplorationArgs', () => {
  it('accepts a valid 2–5 item batch and trims it', () => {
    const declared = validateExplorationArgs({ reads: [{ target: ' src/a.ts ' }, { target: 'src/b.ts', purpose: ' why ' }], note: ' n ' })
    expect(declared).toEqual({ reads: [{ target: 'src/a.ts' }, { target: 'src/b.ts', purpose: 'why' }], note: 'n' })
  })

  it('rejects fewer than the minimum', () => {
    expect(() => validateExplorationArgs({ reads: [{ target: 'src/a.ts' }] })).toThrow(/2–5/)
  })

  it('rejects more than the maximum', () => {
    const reads = Array.from({ length: DECLARATION_MAX_ITEMS + 1 }, (_, i) => ({ target: `src/f${i}.ts` }))
    expect(() => validateExplorationArgs({ reads })).toThrow(/2–5/)
  })

  it('rejects duplicate targets', () => {
    expect(() => validateExplorationArgs({ reads: [{ target: 'src/a.ts' }, { target: 'src/a.ts' }] })).toThrow(/distinct/)
  })

  it('rejects empty targets and non-object rows', () => {
    expect(() => validateExplorationArgs({ reads: [{ target: '  ' }, { target: 'src/b.ts' }] })).toThrow()
    expect(() => validateExplorationArgs({ reads: [{ target: 'src/a.ts' }, 'bogus'] })).toThrow()
  })
})

describe('normalizeDeclaration / parseDeclarationArgs', () => {
  it('normalizes whitespace and drops empty purpose/note', () => {
    expect(normalizeDeclaration({ reads: [{ target: ' a ', purpose: '  ' }], note: '  ' }))
      .toEqual({ reads: [{ target: 'a' }] })
  })

  it('parseDeclarationArgs returns null for malformed input', () => {
    expect(parseDeclarationArgs(null)).toBeNull()
    expect(parseDeclarationArgs({})).toBeNull()
    expect(parseDeclarationArgs({ reads: 'nope' })).toBeNull()
    expect(parseDeclarationArgs({ reads: [{ target: 'a' }, { target: 'b' }], note: 42 })).toBeNull()
  })
})

describe('equalsActiveDeclaration', () => {
  it('treats trimmed duplicates as equal', () => {
    const active = { seq: 0, items: [{ target: 'src/a.ts', status: 'pending' as const, readSeqs: [] }, { target: 'src/b.ts', status: 'pending' as const, readSeqs: [] }] }
    expect(equalsActiveDeclaration(active, { reads: [{ target: 'src/a.ts' }, { target: ' src/b.ts ' }] })).toBe(true)
    expect(equalsActiveDeclaration(active, two('src/a.ts', 'src/c.ts'))).toBe(false)
    expect(equalsActiveDeclaration(active, { reads: [{ target: 'src/a.ts', purpose: 'x' }, { target: 'src/b.ts' }] })).toBe(false)
  })

  it('is false against no active declaration', () => {
    expect(equalsActiveDeclaration(null, two())).toBe(false)
  })
})
