import type { Confirmation } from '@todoist/mcp-core'

/**
 * Records how a confirmation was settled, so declines, and calls from clients that cannot ask,
 * can be counted against confirmations. Only identifiers go in, never content. The question
 * being asked is not recorded: every one ends in another call that is.
 */
export function logConfirmation(
    toolName: string,
    status: Confirmation['status'],
    context: Record<string, unknown>,
): void {
    if (status === 'asking') return
    console.error(`${toolName}: confirmation ${status}`, context)
}
