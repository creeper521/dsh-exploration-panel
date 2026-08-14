/**
 * Host-plane projection unit: folds the session log into the `exploration`
 * projection served to client carriers and the change feed.
 *
 * Registered under `ctx.inject(['sessionProjections'], …)` so assemblies
 * without the projection registry (headless without the seam) stay
 * unaffected. The unit is pure mathematics over the log — the fold in
 * `fold.ts` is the single source of truth shared with the `exploration`
 * tool.
 *
 * @module dsh-exploration-panel/projection
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.sessionProjections service merge into this program.
import type {} from '@deepseek-ai/dsh-session-projection'
import { z, type ZodType } from 'zod'
import { applyExplorationEvent, createExplorationState, explorationView, type ExplorationFoldState } from './fold.ts'
import type { ExplorationProjection } from './types.ts'

export const name = 'exploration-projection'

const statusSchema = z.enum(['running', 'done', 'failed'])

const rangeSchema = z.object({
  start: z.number(),
  end: z.number().optional(),
})

const readEvidenceSchema = z.object({
  path: z.string(),
  ranges: z.array(rangeSchema),
  firstSeq: z.number(),
  lastSeq: z.number(),
  status: statusSchema,
})

const pathEvidenceSchema = z.object({
  path: z.string(),
  seq: z.number(),
  status: statusSchema,
})

const searchEvidenceSchema = z.object({
  tool: z.enum(['grep', 'glob']),
  pattern: z.string(),
  seq: z.number(),
  status: statusSchema,
})

const webEvidenceSchema = z.object({
  url: z.string(),
  seq: z.number(),
  status: statusSchema,
})

const shellEvidenceSchema = z.object({
  seq: z.number(),
  status: statusSchema,
})

const declarationItemSchema = z.object({
  target: z.string(),
  purpose: z.string().optional(),
  status: z.enum(['pending', 'done', 'failed']),
  readSeqs: z.array(z.number()),
})

const declarationSchema = z.object({
  seq: z.number(),
  note: z.string().optional(),
  items: z.array(declarationItemSchema),
})

const historyEntrySchema = z.object({
  seq: z.number(),
  status: z.enum(['superseded', 'completed']),
  items: z.array(declarationItemSchema),
})

const offPlanSchema = z.object({
  path: z.string(),
  seq: z.number(),
})

/** The wire schema of the `exploration` projection (boundary validation). */
export const explorationProjectionSchema: ZodType<ExplorationProjection> = z.object({
  version: z.literal(1),
  counts: z.object({
    files: z.number(),
    modified: z.number(),
    searches: z.number(),
    web: z.number(),
    shell: z.number(),
    offPlan: z.number(),
  }),
  files: z.array(readEvidenceSchema),
  modified: z.array(pathEvidenceSchema),
  searches: z.array(searchEvidenceSchema),
  web: z.array(webEvidenceSchema),
  shell: z.array(shellEvidenceSchema),
  declaration: declarationSchema.nullable(),
  history: z.array(historyEntrySchema),
  offPlan: z.array(offPlanSchema),
  lastSeq: z.number(),
})

/**
 * Plugin body: register the `exploration` projection unit when a projection
 * registry is composed.
 * @param ctx - registrant context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'exploration', ExplorationFoldState>({
      key: 'exploration',
      schema: explorationProjectionSchema,
      init: () => createExplorationState(),
      apply: (state, event) => applyExplorationEvent(state, event),
      view: state => explorationView(state),
      stateVersion: 1,
    })
  })
}
