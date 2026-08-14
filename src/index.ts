/**
 * Node-half entry of dsh-exploration-panel: the empty host plugin the
 * Loader accepts for the `ui-exploration` client roster row. The browser
 * half ships separately as lib/client.js (see src/client).
 * @module dsh-exploration-panel
 */

export const name = 'dsh-exploration-panel'

/** No host behavior; the client loader serves the browser bundle. */
export function apply(): void {}

export type * from './types.ts'
