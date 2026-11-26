import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { PinOutputSchema } from '../utils/output-schemas.js'
import { PinTargetTypeSchema } from '../utils/target-types.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    targetType: PinTargetTypeSchema.describe(
        'What to pin: a thread comment, or a conversation message.',
    ),
    targetId: z.string().describe('The ID of the comment or message.'),
    operation: z.enum(['pin', 'unpin']).default('pin').describe('Whether to pin or unpin it.'),
}

const pin = {
    name: ToolNames.PIN,
    description:
        'Pin a thread comment or a conversation message, so it shows at the top for everyone in the thread or conversation, or unpin it.',
    parameters: ArgsSchema,
    outputSchema: PinOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { targetType, targetId, operation } = args

        const target =
            targetType === 'comment'
                ? operation === 'pin'
                    ? await client.comments.pinComment(targetId)
                    : await client.comments.unpinComment(targetId)
                : operation === 'pin'
                  ? await client.conversationMessages.pinMessage(targetId)
                  : await client.conversationMessages.unpinMessage(targetId)

        const pinnedDate = target.pinnedDate?.toISOString()
        const lines: string[] = [
            `# ${operation === 'pin' ? 'Pinned' : 'Unpinned'}`,
            '',
            `**Target:** ${targetType} ${targetId}`,
            ...(pinnedDate ? [`**Pinned:** ${pinnedDate} by user ${target.pinnedBy}`] : []),
            `**URL:** ${target.url}`,
        ]

        return {
            textContent: lines.join('\n'),
            structuredContent: {
                type: 'pin_result' as const,
                success: true,
                operation,
                targetType,
                targetId,
                pinnedDate,
                pinnedBy: target.pinnedBy ?? undefined,
                targetUrl: target.url,
            },
        }
    },
} satisfies CommsTool<typeof ArgsSchema, typeof PinOutputSchema.shape>

export { pin }
