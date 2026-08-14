// @vitest-environment jsdom
/**
 * Component tests for the exploration panel and dock: section rendering,
 * dual-channel status glyphs, bucket hiding, NEW increments against the
 * last-seen ledger, the dock line/expand flow, and locale switching.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExplorationDock } from '../src/client/ExplorationDock.tsx'
import { ExplorationPanel, lastUserMessage, summarize } from '../src/client/ExplorationPanel.tsx'
import { en, zh, type ExplorationKey } from '../src/client/locales.ts'
import type { ExplorationProjection } from '../src/types.ts'

function makeT(dict: Record<ExplorationKey, string>) {
  return (key: string, params?: Record<string, unknown>): string => {
    let text: string = dict[key as ExplorationKey] ?? key
    for (const [name, value] of Object.entries(params ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }
}

const tZh = makeT(zh)
const tEn = makeT(en)

/** A projection covering every section: one running read, a mixed plan, one off-plan read, all buckets. */
function fixtureProjection(): ExplorationProjection {
  return {
    version: 1,
    counts: { files: 3, modified: 1, searches: 1, web: 1, shell: 1, offPlan: 1 },
    files: [
      { path: 'docs/architecture.md', ranges: [{ start: 1, end: 200 }, { start: 340, end: 360 }], firstSeq: 4, lastSeq: 8, status: 'done' },
      { path: 'packages/session/src/projection.ts', ranges: [{ start: 1, end: 120 }], firstSeq: 5, lastSeq: 6, status: 'failed' },
      { path: 'packages/interaction/src/ask.ts', ranges: [{ start: 1, end: 60 }], firstSeq: 15, lastSeq: 15, status: 'running' },
    ],
    modified: [{ path: 'packages/compaction/src/exploration-panel.ts', seq: 12, status: 'done' }],
    searches: [{ tool: 'grep', pattern: 'exploration', seq: 13, status: 'done' }],
    web: [{ url: 'https://example.com/observability', seq: 14, status: 'done' }],
    shell: [{ seq: 9, status: 'done' }],
    declaration: {
      seq: 3,
      items: [
        { target: 'docs/architecture.md', purpose: '确认挂载点', status: 'done', readSeqs: [4, 8] },
        { target: 'packages/session/src/projection.ts', purpose: '复用投影机制', status: 'failed', readSeqs: [5] },
        { target: 'packages/core/src/agent-loop.ts', purpose: '确认排序键', status: 'pending', readSeqs: [] },
      ],
    },
    history: [{ seq: 2, status: 'superseded', items: [{ target: 'README.md', status: 'done', readSeqs: [1] }] }],
    offPlan: [{ path: 'README.md', seq: 7 }],
    lastSeq: 15,
  }
}

function renderPanel(
  projection: ExplorationProjection,
  t = tZh,
  goalObjective: string | undefined = undefined,
  lastUserText = '让我能实时看到 agent 在读什么',
): ReturnType<typeof render> {
  return render(
    <ExplorationPanel
      sessionId="s1"
      projection={projection}
      goalObjective={goalObjective}
      lastUserText={lastUserText}
      t={t}
    />,
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('ExplorationPanel', () => {
  it('renders the anchor: goal, last user message, and the active plan', () => {
    renderPanel(fixtureProjection(), tZh, '为 harness 增加探索对齐面板')
    expect(screen.getByText('方向锚 · 当前目标')).toBeDefined()
    expect(screen.getByText('为 harness 增加探索对齐面板')).toBeDefined()
    expect(screen.getByText(/让我能实时看到 agent 在读什么/)).toBeDefined()
    expect(screen.getByText(/已声明读取计划 · 3 项/)).toBeDefined()
  })

  it('renders the four flow sections with dual-channel glyphs', () => {
    renderPanel(fixtureProjection())
    // The one running read shows the spinning glyph and its path (the path
    // also appears in the Files bucket — both surfaces are by design).
    expect(screen.getAllByText('◐').length).toBeGreaterThan(0)
    expect(screen.getAllByText('packages/interaction/src/ask.ts').length).toBeGreaterThan(0)
    // Pending declaration items keep ○; the failed one carries ✕ and the label.
    expect(screen.getByText('packages/core/src/agent-loop.ts')).toBeDefined()
    expect(screen.getByText('读取失败')).toBeDefined()
    // Off-plan reads carry the square "!" glyph (single source with the contracts).
    expect(screen.getAllByText('!').length).toBeGreaterThan(0)
    expect(screen.getAllByText('README.md').length).toBeGreaterThan(0)
    // Ranges merge display.
    expect(screen.getByText(':1-200, 340-360')).toBeDefined()
  })

  it('collapses an all-done declaration into the summary card', () => {
    const projection = fixtureProjection()
    projection.declaration = {
      seq: 20,
      items: [
        { target: 'a.ts', status: 'done', readSeqs: [21] },
        { target: 'b.ts', status: 'done', readSeqs: [22] },
      ],
    }
    renderPanel(projection)
    expect(screen.getByTestId('decl-summary').textContent).toContain('声明已完成(全部读取)')
  })

  it('hides empty buckets entirely (FR-3.3)', () => {
    const projection = fixtureProjection()
    projection.counts.web = 0
    projection.web = []
    renderPanel(projection)
    expect(screen.queryByText('Web')).toBeNull()
    expect(screen.getByText('Files')).toBeDefined()
    expect(screen.getByText('Shell')).toBeDefined()
  })

  it('marks items newer than the last-seen seq with NEW and groups them (FR-4)', () => {
    localStorage.setItem('dsh.exploration.seen', JSON.stringify({ s1: 10 }))
    renderPanel(fixtureProjection())
    // The running read (lastSeq 15 > 10) lands in the NEW group.
    expect(screen.getByText(/自上次查看以来 · 1/)).toBeDefined()
    expect(screen.getAllByText('NEW').length).toBeGreaterThan(0)
  })

  it('shows no NEW while the projection is caught up with the ledger', () => {
    localStorage.setItem('dsh.exploration.seen', JSON.stringify({ s1: 15 }))
    renderPanel(fixtureProjection())
    expect(screen.queryByText('NEW')).toBeNull()
  })

  it('switches every label with the locale (NFR-6)', () => {
    renderPanel(fixtureProjection(), tEn)
    expect(screen.getByText('Reading now')).toBeDefined()
    expect(screen.getByText('To read')).toBeDefined()
    expect(screen.getByText('Off-plan')).toBeDefined()
    expect(screen.queryByText('正在读')).toBeNull()
  })

  it('renders the empty-state guidance when nothing happened yet (FR-7)', () => {
    const empty: ExplorationProjection = {
      version: 1,
      counts: { files: 0, modified: 0, searches: 0, web: 0, shell: 0, offPlan: 0 },
      files: [], modified: [], searches: [], web: [], shell: [],
      declaration: null, history: [], offPlan: [], lastSeq: 0,
    }
    renderPanel(empty, tZh, undefined)
    expect(screen.getByText(/暂无会话事件/)).toBeDefined()
    expect(screen.getByText('(尚无活跃目标)')).toBeDefined()
  })

  it('advances the last-seen ledger on unmount', () => {
    const { unmount } = renderPanel(fixtureProjection())
    unmount()
    expect(JSON.parse(localStorage.getItem('dsh.exploration.seen') ?? '{}')).toEqual({ s1: 15 })
  })
})

describe('summarize / lastUserMessage', () => {
  it('rolls up the dock numbers from a projection', () => {
    const summary = summarize(fixtureProjection())
    expect(summary).toEqual({
      reading: 1,
      readingPath: 'packages/interaction/src/ask.ts',
      pending: 2,
      read: 3,
      offPlan: 1,
    })
  })

  it('extracts the newest user message text from the window', () => {
    const nodes = [
      { kind: 'user', seq: 1, time: 0, content: [{ type: 'text', text: 'older' }], source: null },
      { kind: 'assistant', seq: 2, time: 0, content: [], model: 'x', timing: { total: 0 } },
      { kind: 'user', seq: 3, time: 0, content: [{ type: 'text', text: 'newest ' }, { type: 'text', text: 'ask' }], source: null },
    ]
    expect(lastUserMessage(nodes as never[])).toBe('newest ask')
  })
})

describe('ExplorationDock', () => {
  function renderDock(projection: ExplorationProjection | undefined, t = tZh): void {
    const useProjection = vi.fn((key: string) =>
      key === 'exploration' ? projection : undefined)
    render(
      <ExplorationDock
        session={{ nodes: [] } as never}
        input={{} as never}
        sessionId={'s1' as never}
        useSession={vi.fn() as never}
        useProjection={useProjection as never}
        useSessions={vi.fn() as never}
        useWorkspaces={vi.fn() as never}
        useInput={vi.fn() as never}
        inputActions={{} as never}
        t={t}
      />,
    )
  }

  it('renders nothing while the projection is in flight', () => {
    renderDock(undefined)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the one-line summary and pulses NEW when behind the ledger (FR-5)', () => {
    localStorage.setItem('dsh.exploration.seen', JSON.stringify({ s1: 10 }))
    renderDock(fixtureProjection())
    const line = screen.getByRole('button')
    expect(line.textContent).toContain('ask.ts')
    expect(line.textContent).toContain('正在读')
    expect(line.textContent).toContain('脱轨')
    expect(screen.getByText('NEW')).toBeDefined()
  })

  it('expands the full panel inline on click and advances the ledger on collapse', () => {
    renderDock(fixtureProjection())
    expect(screen.queryByTestId('exploration-panel')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('exploration-panel')).toBeDefined()
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByTestId('exploration-panel')).toBeNull()
    expect(JSON.parse(localStorage.getItem('dsh.exploration.seen') ?? '{}')).toEqual({ s1: 15 })
  })

  it('stays quiet (idle line, no NEW) with an empty projection', () => {
    const empty: ExplorationProjection = {
      version: 1,
      counts: { files: 0, modified: 0, searches: 0, web: 0, shell: 0, offPlan: 0 },
      files: [], modified: [], searches: [], web: [], shell: [],
      declaration: null, history: [], offPlan: [], lastSeq: 0,
    }
    renderDock(empty)
    const line = screen.getByRole('button')
    expect(line.textContent).toContain('空闲')
    expect(screen.queryByText('NEW')).toBeNull()
  })
})
