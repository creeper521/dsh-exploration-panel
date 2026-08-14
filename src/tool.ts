/**
 * The `exploration` declaration tool and its guidance section.
 *
 * Model-facing contract: before a multi-step exploration, the model declares
 * the next 2–5 read targets and why; the declaration surfaces in the user's
 * exploration panel, creating a window in which the human can steer before
 * the agent reads in the wrong direction. Each call replaces the previous
 * declaration; a call identical to the active one is a no-op (change gate).
 *
 * The declaration needs NO custom session event: the tool/call + tool/result
 * pair is already durable and model-visible ("model-visible ⟺ logged"), and
 * the projection folds it from the log. The fold in `fold.ts` is the single
 * source of truth shared by this tool and the projection unit.
 *
 * @module dsh-exploration-panel/tool
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.systemPrompt service merge into this program.
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ExplorationArgs } from './types.ts'
import {
  DECLARATION_MAX_ITEMS,
  DECLARATION_MIN_ITEMS,
  foldExploration,
  normalizeDeclaration,
  parseDeclarationArgs,
} from './fold.ts'

export const name = 'exploration'
export const inject = ['tools']

const GUIDANCE_SECTION_NAME = 'exploration:guidance'
const GUIDANCE_SECTION_ORDER = 150

const GUIDANCE = `Use the \`exploration\` tool before starting a multi-step exploration: declare the next ${DECLARATION_MIN_ITEMS}–${DECLARATION_MAX_ITEMS} files you will read and why. The declaration is displayed in the user's exploration panel so they can see your direction and interrupt before you read the wrong thing. Re-declare when your plan changes; each call replaces the previous declaration. One declaration covers several steps; you do not need to declare every single read.`

const DESCRIPTION =
  'Declare the next batch of files you are about to read and why. The declaration is shown to the user '
  + 'in an exploration panel so they can see where you are heading and steer you before you read in the '
  + `wrong direction. Call it when starting a multi-step exploration (${DECLARATION_MIN_ITEMS}–${DECLARATION_MAX_ITEMS} targets) `
  + 'and whenever your next reads change direction; each call REPLACES the previous declaration. '
  + 'One declaration covers your next several steps; you do not need to declare every single read.'

/** The canonical tool result: whether the declaration moved, and its size. */
export interface ExplorationToolResult {
  updated: boolean
  items: number
  message: string
}

/** Validate the constraints the parameter schema cannot express; throws with a model-actionable message. */
export function validateExplorationArgs(args: unknown): ExplorationArgs {
  const declared = parseDeclarationArgs(args)
  if (declared === null) {
    throw new Error(
      `invalid exploration: \`reads\` must contain ${DECLARATION_MIN_ITEMS}–${DECLARATION_MAX_ITEMS} distinct non-empty targets `
      + '(duplicate targets are rejected; a batch declares what you will read next)',
    )
  }
  return declared
}

/** Rebuild comparable declaration arguments from a projection declaration (wire shape has no raw args). */
function argsOf(declaration: { note?: string; items: Array<{ target: string; purpose?: string }> }): ExplorationArgs {
  return {
    reads: declaration.items.map(item => ({ target: item.target, ...(item.purpose !== undefined ? { purpose: item.purpose } : {}) })),
    ...(declaration.note !== undefined ? { note: declaration.note } : {}),
  }
}

/** Whether a proposed declaration equals the active one (normalized comparison). */
export function equalsActiveDeclaration(
  active: { note?: string; items: Array<{ target: string; purpose?: string }> } | null,
  proposed: ExplorationArgs,
): boolean {
  if (active === null) return false
  const a = normalizeDeclaration(argsOf(active))
  const b = normalizeDeclaration(proposed)
  if (a.reads.length !== b.reads.length) return false
  for (let index = 0; index < a.reads.length; index++) {
    const left = a.reads[index]!
    const right = b.reads[index]!
    if (left.target !== right.target || (left.purpose ?? '') !== (right.purpose ?? '')) return false
  }
  return (a.note ?? '') === (b.note ?? '')
}

/**
 * Plugin body: register the guidance section (when a prompt assembler is
 * composed) and the `exploration` tool.
 * @param ctx - registrant context carrying the tool registry.
 */
export function apply(ctx: Context): void {
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: GUIDANCE_SECTION_NAME,
      order: GUIDANCE_SECTION_ORDER,
      text: GUIDANCE,
    })
  })
  ctx.tools.register(defineTool({
    name: 'exploration',
    description: DESCRIPTION,
    parameters: {
      reads: {
        type: 'array',
        required: true,
        description: `The next ${DECLARATION_MIN_ITEMS}–${DECLARATION_MAX_ITEMS} read targets, in the order you will read them.`,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            target: { type: 'string', required: true, description: 'The file path you will read next.' },
            purpose: { type: 'string', description: 'One line on why this read matters for the current task.' },
          },
        },
      },
      note: {
        type: 'string',
        description: 'Optional one-line note about this exploration direction.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          updated: { type: 'boolean', required: true },
          items: { type: 'integer', required: true },
          message: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.message,
      }],
    },
    async execute(args, exec) {
      if (!exec.agent) {
        throw new Error('exploration requires an owning agent session')
      }
      const declared = validateExplorationArgs(args)
      const events: readonly SessionEvent[] = exec.agent.session.events
      const projection = foldExploration(events)
      if (equalsActiveDeclaration(projection.declaration, declared)) {
        return {
          updated: false,
          items: declared.reads.length,
          message: `Exploration declaration unchanged: ${declared.reads.length} target(s) already active.`,
        }
      }
      return {
        updated: true,
        items: declared.reads.length,
        message: `Exploration declaration recorded: ${declared.reads.length} target(s) — `
          + declared.reads.map(item => item.target).join(', ')
          + '.',
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: 'Exploration declaration',
      kind: 'other',
      rawInput: args.reads,
    }),
  }))
}
