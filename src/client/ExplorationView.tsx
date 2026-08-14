/**
 * View-tab adapter: the persistent full panel behind the「探索对齐」tab in
 * the conversation view ring. Projection-mode — anchor inputs come from the
 * goal projection and the conversation window; renders nothing while the
 * exploration projection's first frame is in flight.
 */
// Type-only: the `goal` SessionProjectionMap key merge (single source, the domain's pure outlet).
import type { GoalProjection } from '@deepseek-ai/dsh-goal/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ExplorationPanel, lastUserMessage } from './ExplorationPanel.tsx'
import css from './Panel.module.css'

/** Full view-tab props: view runtime share + the locale seat. */
export type ExplorationViewProps = ConvViewProps & PropsLocale<'exploration'>

/**
 * The exploration conversation view.
 * @param props - view runtime share + locale seat.
 * @returns the panel, or null while the projection loads.
 */
export function ExplorationView({ sessionId, useSession, useProjection, t }: ExplorationViewProps) {
  const nodes = useSession(s => s.nodes)
  const projection = useProjection('exploration')
  const goal = useProjection('goal')
  if (projection === undefined) return null
  const goalValue: GoalProjection['goal'] | undefined
    = goal === undefined || goal === null ? undefined : goal.goal
  const goalObjective = goalValue !== null && goalValue !== undefined && goalValue.phase !== 'complete'
    ? goalValue.objective
    : undefined
  return (
    <div className={css.view}>
      <ExplorationPanel
        sessionId={sessionId as string}
        projection={projection}
        goalObjective={goalObjective}
        lastUserText={lastUserMessage(nodes)}
        t={t}
      />
    </div>
  )
}
