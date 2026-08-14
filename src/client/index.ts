/**
 * Browser half of dsh-exploration-panel: the Exploration tab in the
 * conversation view ring and the exploration dock line above the composer.
 * Projection-mode surfaces — everything renders from the host-computed
 * `exploration` projection (plus the goal projection and the conversation
 * window for the anchor), so this plugin owns no store and no event
 * listener, and issues no model calls.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: the 'conversation.view' / 'conversation.input.dock' SlotMap rows.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ExplorationDock } from './ExplorationDock.tsx'
import { ExplorationPanel } from './ExplorationPanel.tsx'
import { ExplorationView } from './ExplorationView.tsx'
import { NS, en, zh } from './locales.ts'

/** Required services: the slot service and the locale service. */
export const inject = ['slots', 'locale']

export { ExplorationPanel } from './ExplorationPanel.tsx'
export { ExplorationDock } from './ExplorationDock.tsx'
export { ExplorationView } from './ExplorationView.tsx'

/**
 * Client plugin body: register the dictionaries, the view tab (after chat
 * and trajectory), and the dock entry (after todo/goal, before queue). Both
 * registrations ride the slot service's effect wrapper, so plugin unload
 * removes them.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-exploration-panel: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'exploration',
    order: 15,
    locale: NS,
    label: () => t('view.exploration'),
  }, ExplorationView))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'exploration',
    order: 12,
    locale: NS,
  }, ExplorationDock))
}
