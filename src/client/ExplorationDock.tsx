/**
 * The exploration dock: one line above the composer card — "reading X ·
 * to-read N · read N · off-plan N" — with a NEW pulse while the projection
 * is ahead of the session's last-seen seq. Clicking toggles an inline
 * expansion of the full panel (the TodoPanel dock pattern); the persistent
 * full surface is the conversation.view tab registered by this plugin.
 */
import { useState } from 'react'
// Type-only: the 'conversation.input.dock' SlotMap row (declared by ui-conversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the `goal` SessionProjectionMap key merge (single source, the domain's pure outlet).
import type { GoalProjection } from '@deepseek-ai/dsh-goal/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { baseName, ExplorationPanel, lastUserMessage, summarize } from './ExplorationPanel.tsx'
import { readSeenSeq } from './seen.ts'
import css from './ExplorationDock.module.css'

/** Full dock props: InputZone owner share + session standard kit + the locale seat. */
export type ExplorationDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'exploration'>

/**
 * Active goal objective from the goal projection, when the capability is
 * composed and a non-complete goal exists.
 * @param goal - the projected goal value (undefined = capability absent).
 * @returns the objective, or undefined.
 */
function activeGoalObjective(goal: GoalProjection | null | undefined): string | undefined {
  if (goal === undefined || goal === null) return undefined
  if (goal.goal === null || goal.goal.phase === 'complete') return undefined
  return goal.goal.objective
}

/**
 * The dock adapter: reads the host-computed `exploration` projection (whole
 * value; absent renders nothing, matching the GoalBar posture) and the
 * conversation window's last user message straight off the owner share.
 * @param props - dock slot props.
 * @returns the dock line, optionally with the inline-expanded panel.
 */
export function ExplorationDock({ session, sessionId, useProjection, t }: ExplorationDockProps) {
  const projection = useProjection('exploration')
  const goal = useProjection('goal')
  const [expanded, setExpanded] = useState(false)
  if (projection === undefined) return null

  const summary = summarize(projection)
  const activity = summary.reading + summary.pending + summary.read + summary.offPlan
  const seen = readSeenSeq(sessionId as string)
  const hasNew = seen > 0 && projection.lastSeq > seen

  const segment = (value: number, label: string, emphasize = false): React.ReactNode =>
    value > 0 || !emphasize
      ? (
        <span className={css.seg}>
          <b className={emphasize ? css.numEmph : css.num}>{value}</b>
          {label}
        </span>
      )
      : null

  return (
    <div className={css.dock}>
      <button
        type="button"
        className={css.line}
        aria-expanded={expanded}
        aria-label={t('view.exploration')}
        onClick={() => { setExpanded(v => !v) }}
      >
        <span className={`${css.dot}${summary.reading > 0 ? ` ${css.dotLive}` : ''}`} aria-hidden />
        {activity > 0
          ? (
            <>
              {summary.reading > 0 && summary.readingPath !== null && (
                <span className={css.seg}>
                  {t('dock.reading')}
                  <b className={css.num}>{baseName(summary.readingPath)}</b>
                </span>
              )}
              {segment(summary.pending, t('dock.pending'))}
              {segment(summary.read, t('dock.read'))}
              {segment(summary.offPlan, t('dock.offplan'), true)}
            </>
          )
          : <span className={css.idle}>{t('dock.idle')}</span>}
        {hasNew && <span className={css.newPill}>{t('new.badge')}</span>}
        <span className={css.open}>{expanded ? t('dock.collapse') : t('dock.expand')}</span>
      </button>
      {expanded && (
        <div className={css.expanded}>
          <ExplorationPanel
            sessionId={sessionId as string}
            projection={projection}
            goalObjective={activeGoalObjective(goal)}
            lastUserText={lastUserMessage(session.nodes)}
            t={t}
          />
        </div>
      )}
    </div>
  )
}
