/**
 * The exploration alignment panel: direction anchor, execution flow
 * (reading / to-read / done / off-plan), evidence buckets, and the status
 * legend — a pure projection view. Zero model calls, zero steering actions;
 * the only affordances are navigation (tooltips carry full paths) and NEW
 * increments tracked against the per-session last-seen ledger.
 *
 * Visual contract: scratch-exploration-panel/ui-design-light.md — DSW tokens
 * only, dual-channel status (color × glyph), numbers before words, and at
 * most four animated elements (reading spin, NEW pulse, dock blink, hover).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ExplorationProjection, ReadRange } from '../types.ts'
import type { ExplorationKey } from './locales.ts'
import { markSeen, readSeenSeq } from './seen.ts'
import css from './ExplorationPanel.module.css'

/** Narrow translate accepted by the panel (the framework `t` seat satisfies it). */
export type PanelTranslate = (key: ExplorationKey, params?: Record<string, unknown>) => string

/** One-line dock summary of a projection (FR-5). */
export interface ExplorationSummary {
  reading: number
  /** The first in-flight read's path; null while nothing runs. */
  readingPath: string | null
  pending: number
  read: number
  offPlan: number
}

/**
 * Dock-facing rollup of a projection.
 * @param projection - the folded exploration projection.
 * @returns counts for the one-line dock summary.
 */
export function summarize(projection: ExplorationProjection): ExplorationSummary {
  const running = projection.files.filter(f => f.status === 'running')
  return {
    reading: running.length,
    readingPath: running.length > 0 ? (running[0]?.path ?? null) : null,
    pending: projection.declaration === null
      ? 0
      : projection.declaration.items.filter(item => item.status !== 'done').length,
    read: projection.counts.files,
    offPlan: projection.counts.offPlan,
  }
}

/**
 * Extract the latest user message text from the conversation window (FR-1's
 * "last user message" anchor line).
 * @param nodes - the conversation snapshot's node list.
 * @returns the concatenated text blocks of the newest user message, or
 * undefined when none is in the window.
 */
export function lastUserMessage(nodes: readonly ConversationNode[]): string | undefined {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i]
    if (node !== undefined && node.kind === 'user') {
      const text = node.content
        .filter(block => block.type === 'text')
        .map(block => block.text.trim())
        .filter(Boolean)
        .join(' ')
        .trim()
      return text === '' ? undefined : text
    }
  }
  return undefined
}

const NEW_GROUP_CAP = 8
const BUCKET_WINDOW = 60

interface PanelProps {
  /** Session whose projection this panel renders (NEW ledger key). */
  sessionId: string
  projection: ExplorationProjection
  /** Active goal objective from the goal projection, when one is active. */
  goalObjective: string | undefined
  /** Last user message text, when any landed in the window. */
  lastUserText: string | undefined
  t: PanelTranslate
}

/**
 * Track the last-seen ledger across one panel mount: NEW badges render
 * against the seq captured at mount; unmount advances the ledger to the
 * latest projection seq (viewing means seen).
 * @param sessionId - the session whose ledger entry to track.
 * @param lastSeq - the projection's latest seq (kept current via ref).
 * @returns the last-seen seq captured at mount.
 */
function useSeenTracker(sessionId: string, lastSeq: number): number {
  const [seen] = useState(() => readSeenSeq(sessionId))
  const latest = useRef(lastSeq)
  useEffect(() => {
    latest.current = lastSeq
  }, [lastSeq])
  useEffect(() => () => { markSeen(sessionId, latest.current) }, [sessionId])
  return seen
}

/** The five dual-channel statuses (color in CSS, glyph here). */
type GlyphStatus = 'running' | 'done' | 'failed' | 'pending' | 'offplan'

const GLYPHS: Record<GlyphStatus, string> = {
  running: '◐', done: '✓', failed: '✕', pending: '○', offplan: '!',
}

function StatusGlyph({ status }: { status: GlyphStatus }): ReactNode {
  return (
    <span className={`${css.glyph} ${css[`glyph-${status}`] ?? ''}`} aria-hidden>
      {GLYPHS[status]}
    </span>
  )
}

function NewBadge({ t }: { t: PanelTranslate }): ReactNode {
  return <span className={css.newBadge}>{t('new.badge')}</span>
}

/** Merge formatted line ranges: `1-200, 340-360`. */
function fmtRanges(ranges: readonly ReadRange[]): string {
  return ranges
    .map(r => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`))
    .join(', ')
}

/** basename of a path, for the dock's one-line budget. */
export function baseName(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

interface RowProps {
  status: GlyphStatus
  main: string
  meta?: string | undefined
  purpose?: string | undefined
  seq: number
  isNew: boolean
  t: PanelTranslate
}

function FlowRow({ status, main, meta, purpose, seq, isNew, t }: RowProps): ReactNode {
  const off = status === 'offplan' ? ` ${css.rowOff}` : ''
  const fresh = isNew ? ` ${css.rowNew}` : ''
  return (
    <div className={`${css.row}${off}${fresh}`} data-status={status} title={main}>
      <StatusGlyph status={status} />
      <span className={css.rowPath}>{main}</span>
      {meta !== undefined && <span className={css.rowMeta}>{meta}</span>}
      {purpose !== undefined && <span className={css.rowPurpose}>{purpose}</span>}
      <span className={css.rowTail}>
        {isNew && <NewBadge t={t} />}
        <span className={css.seq}>seq {seq}</span>
      </span>
    </div>
  )
}

interface SectionProps {
  count: number
  label: string
  hint?: string | undefined
  tone?: 'reading' | 'done' | 'offplan' | undefined
  children: ReactNode
}

function Section({ count, label, hint, tone, children }: SectionProps): ReactNode {
  const toneClass = tone === undefined ? '' : ` ${css[`section-${tone}`] ?? ''}`
  return (
    <section className={css.section} aria-label={`${label} ${count}`}>
      <div className={css.sectionHead}>
        <span className={`${css.sectionNum}${count === 0 ? ` ${css.sectionZero}` : ''}${toneClass}`}>{count}</span>
        <span className={css.sectionLabel}>{label}</span>
        {hint !== undefined && <span className={css.sectionHint}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function EmptyLine({ children }: { children: ReactNode }): ReactNode {
  return <div className={css.empty}>{children}</div>
}

interface BucketProps {
  count: number
  label: string
  overview?: string | undefined
  children?: ReactNode
  more?: number
  t: PanelTranslate
}

function Bucket({ count, label, overview, children, more, t }: BucketProps): ReactNode {
  return (
    <div className={css.bucket}>
      <div className={css.bucketHead}>
        <span className={css.bucketNum}>{count}</span>
        <span className={css.bucketLabel}>{label}</span>
        {overview !== undefined && <span className={css.bucketOverview}>{overview}</span>}
      </div>
      {children !== undefined && <div className={css.bucketList}>{children}</div>}
      {more !== undefined && more > 0 && <div className={css.bucketMore}>{t('bucket.more', { n: more })}</div>}
    </div>
  )
}

interface BucketItemProps {
  status: GlyphStatus
  main: string
  meta?: string | undefined
  isNew: boolean
}

function BucketItem({ status, main, meta, isNew }: BucketItemProps): ReactNode {
  return (
    <div className={css.bucketItem} data-status={status} title={main}>
      <StatusGlyph status={status} />
      <span className={css.bucketItemMain}>{main}</span>
      {meta !== undefined && <span className={css.bucketItemMeta}>{meta}</span>}
      {isNew && <span className={css.newBadge}>NEW</span>}
    </div>
  )
}

function Legend({ t }: { t: PanelTranslate }): ReactNode {
  const items: Array<[GlyphStatus, ExplorationKey]> = [
    ['running', 'legend.inflight'],
    ['done', 'legend.done'],
    ['failed', 'legend.failed'],
    ['offplan', 'legend.offplan'],
    ['pending', 'legend.pending'],
  ]
  return (
    <div className={css.legend}>
      {items.map(([status, key]) => (
        <span key={status} className={css.legendItem}>
          <StatusGlyph status={status} />
          {t(key)}
        </span>
      ))}
    </div>
  )
}

/**
 * The exploration alignment panel body. All content derives from the
 * `exploration` projection plus the two anchor inputs; nothing here issues
 * requests or mutates session state.
 * @param props - projection, anchor inputs, session id, translate.
 * @returns the panel.
 */
export function ExplorationPanel({ sessionId, projection, goalObjective, lastUserText, t }: PanelProps): ReactNode {
  const seen = useSeenTracker(sessionId, projection.lastSeq)
  const isNew = (seq: number): boolean => seen > 0 && seq > seen

  const { declaration, history, files, modified, searches, web, shell, offPlan, counts } = projection

  const running = files.filter(f => f.status === 'running')
  const pendingItems = declaration === null ? [] : declaration.items.filter(item => item.status !== 'done')
  const doneItems = declaration === null ? [] : declaration.items.filter(item => item.status === 'done')
  const declarationAllDone = declaration !== null && declaration.items.length > 0
    && declaration.items.every(item => item.status === 'done')

  // NEW increment group (FR-4): everything that changed since the last view,
  // capped, ahead of the ordinary sections.
  const newRows: ReactNode[] = []
  const pushNew = (row: ReactNode): void => { newRows.push(row) }
  for (const file of running) {
    if (isNew(file.lastSeq)) {
      pushNew(<FlowRow key={`r-${file.path}`} status="running" main={file.path}
        meta={`:${fmtRanges(file.ranges)}`} seq={file.lastSeq} isNew t={t} />)
    }
  }
  if (declaration !== null && isNew(declaration.seq)) {
    for (const item of pendingItems) {
      pushNew(<FlowRow key={`p-${item.target}`} status={item.status === 'failed' ? 'failed' : 'pending'}
        main={item.target} purpose={item.purpose} seq={declaration.seq} isNew t={t} />)
    }
  }
  for (const file of files) {
    if (file.status !== 'running' && isNew(file.lastSeq)) {
      pushNew(<FlowRow key={`f-${file.path}`} status={file.status} main={file.path}
        meta={`:${fmtRanges(file.ranges)}`} seq={file.lastSeq} isNew t={t} />)
    }
  }
  for (const item of offPlan) {
    if (isNew(item.seq)) {
      pushNew(<FlowRow key={`o-${item.path}`} status="offplan" main={item.path} seq={item.seq} isNew t={t} />)
    }
  }

  const hasActivity = counts.files + counts.modified + counts.searches + counts.web + counts.shell + counts.offPlan > 0
    || declaration !== null

  return (
    <section className={css.panel} aria-label={t('aria.panel')} data-testid="exploration-panel">
      <header className={css.anchor}>
        <span className={css.anchorBar} aria-hidden />
        <div className={css.anchorBody}>
          <div className={css.anchorLabel}>{t('anchor.label')}</div>
          <div className={goalObjective === undefined ? css.anchorGoalEmpty : css.anchorGoal}>
            {goalObjective ?? t('anchor.goalEmpty')}
          </div>
          {lastUserText !== undefined && (
            <div className={css.anchorUser}>
              <span className={css.anchorWho}>{t('anchor.user')}</span>
              {lastUserText}
            </div>
          )}
          {declaration !== null && !declarationAllDone && (
            <div className={css.anchorPlan}>
              <span className={css.anchorPlanDot} aria-hidden />
              {t('flow.declPlan')} · {declaration.items.length} {t('flow.items')}
              <span className={css.seq}>seq {declaration.seq}</span>
            </div>
          )}
        </div>
      </header>

      <div className={css.body}>
        {newRows.length > 0 && (
          <div className={css.newGroup}>
            <div className={css.newGroupHead}>
              <NewBadge t={t} />
              {t('new.group')} · {newRows.length}
            </div>
            {newRows.slice(0, NEW_GROUP_CAP)}
          </div>
        )}

        <Section count={running.length} label={t('flow.reading')} hint={t('flow.readingHint')} tone="reading">
          {running.length > 0
            ? running.map(file => (
              <FlowRow key={file.path} status="running" main={file.path} meta={`:${fmtRanges(file.ranges)}`}
                seq={file.lastSeq} isNew={isNew(file.lastSeq)} t={t} />
            ))
            : <EmptyLine>{t('flow.emptyReading')}</EmptyLine>}
        </Section>

        <Section count={pendingItems.length} label={t('flow.pending')}
          hint={declaration === null ? t('flow.emptyPending') : t('flow.pendingHint')}>
          {declaration === null
            ? <EmptyLine>{t('flow.emptyPending')}</EmptyLine>
            : pendingItems.map(item => (
              <FlowRow key={item.target} status={item.status === 'failed' ? 'failed' : 'pending'}
                main={item.target} purpose={item.purpose}
                meta={item.status === 'failed' ? t('flow.failed') : undefined}
                seq={declaration.seq} isNew={false} t={t} />
            ))}
        </Section>

        <Section count={doneItems.length} label={t('flow.done')} tone="done">
          {declarationAllDone && declaration !== null
            ? (
              <div className={css.declSummary} data-testid="decl-summary">
                <StatusGlyph status="done" />
                <span>{t('flow.allDone')} · {declaration.items.length} {t('flow.items')}</span>
                <span className={css.seq}>seq {declaration.seq}</span>
              </div>
            )
            : doneItems.length > 0
              ? doneItems.map(item => (
                <FlowRow key={item.target} status="done" main={item.target} purpose={item.purpose}
                  seq={declaration?.seq ?? 0} isNew={false} t={t} />
              ))
              : <EmptyLine>{t('flow.emptyDone')}</EmptyLine>}
        </Section>

        <Section count={offPlan.length} label={t('flow.offplan')} hint={t('flow.offplanHint')} tone="offplan">
          {offPlan.length > 0
            ? offPlan.map(item => (
              <FlowRow key={item.path} status="offplan" main={item.path} seq={item.seq} isNew={isNew(item.seq)} t={t} />
            ))
            : <EmptyLine>{t('flow.emptyOffplan')}</EmptyLine>}
        </Section>

        {history.length > 0 && (
          <details className={css.history}>
            <summary className={css.historySummary}>{t('flow.history')} ({history.length})</summary>
            {history.map(entry => (
              <div key={entry.seq} className={css.historyCard}>
                <div className={css.historyTag}>
                  {entry.status === 'superseded' ? t('flow.superseded') : t('flow.completed')} · seq {entry.seq}
                </div>
                <div className={css.historyItems}>
                  {entry.items.map(item => (
                    <span key={item.target} className={item.status === 'done' ? css.historyOk : css.historyNo}>
                      {item.target}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </details>
        )}

        <div className={css.buckets}>
          {counts.files > 0 && (
            <Bucket count={counts.files} label={t('bucket.files')} t={t}
              overview={t('bucket.lines', {
                n: files.reduce((sum, f) => sum + f.ranges.reduce(
                  (a, r) => a + (r.end === undefined ? 1 : r.end - r.start + 1),
                  0,
                ), 0),
              })}>
              {files.slice(-BUCKET_WINDOW).map(file => (
                <BucketItem key={file.path} status={file.status} main={file.path}
                  meta={`:${fmtRanges(file.ranges)}`} isNew={isNew(file.lastSeq)} />
              ))}
            </Bucket>
          )}
          {counts.modified > 0 && (
            <Bucket count={counts.modified} label={t('bucket.modified')} t={t}>
              {modified.slice(-BUCKET_WINDOW).map(entry => (
                <BucketItem key={entry.path} status={entry.status} main={entry.path} isNew={isNew(entry.seq)} />
              ))}
            </Bucket>
          )}
          {counts.searches > 0 && (
            <Bucket count={counts.searches} label={t('bucket.search')} t={t}
              overview={t('bucket.queries', { n: counts.searches })}>
              {searches.slice(-BUCKET_WINDOW).map(entry => (
                <BucketItem key={entry.seq} status={entry.status} main={`${entry.tool} "${entry.pattern}"`}
                  isNew={isNew(entry.seq)} />
              ))}
            </Bucket>
          )}
          {counts.web > 0 && (
            <Bucket count={counts.web} label={t('bucket.web')} t={t}>
              {web.slice(-BUCKET_WINDOW).map(entry => (
                <BucketItem key={entry.seq} status={entry.status} main={entry.url} isNew={isNew(entry.seq)} />
              ))}
            </Bucket>
          )}
          {counts.shell > 0 && (
            <Bucket count={counts.shell} label={t('bucket.shell')} t={t} overview={t('bucket.cmds', { n: counts.shell })}>
              {shell.slice(-BUCKET_WINDOW).map(entry => (
                <BucketItem key={entry.seq} status={entry.status} main={t('bucket.shellItem')}
                  meta={`seq ${entry.seq}`} isNew={isNew(entry.seq)} />
              ))}
            </Bucket>
          )}
        </div>

        {!hasActivity && <div className={css.emptyHero}>{t('empty.noEvents')}</div>}
      </div>

      <Legend t={t} />
    </section>
  )
}
