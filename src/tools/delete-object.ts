import type { CommsApi } from '@todoist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { logConfirmation } from '../utils/confirmation-log.js'
import { degradeWithLog } from '../utils/degrade.js'
import { DeleteObjectOutputSchema, type DeleteObjectStructured } from '../utils/output-schemas.js'
import { DeleteTargetTypeSchema } from '../utils/target-types.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    targetType: DeleteTargetTypeSchema.describe(
        'The type of object to delete: thread, comment, or message.',
    ),
    targetId: z
        .string()
        .describe('The ID of the thread, comment, or conversation message to delete.'),
}

type Args = z.infer<z.ZodObject<typeof ArgsSchema>>
type Branch = { textContent: string; structuredContent: DeleteObjectStructured }

/** The structured result of a delete, whether it happened (`success`) or the user declined. */
function deleteResult({ targetType, targetId }: Args, success: boolean): DeleteObjectStructured {
    switch (targetType) {
        case 'thread':
            return { type: 'delete_thread_result', success, targetType, threadId: targetId }
        case 'comment':
            return { type: 'delete_comment_result', success, targetType, commentId: targetId }
        case 'message':
            return { type: 'delete_message_result', success, targetType, messageId: targetId }
    }
}

async function deleteThreadBranch(args: Args, client: CommsApi): Promise<Branch> {
    await client.threads.deleteThread(args.targetId)

    const lines: string[] = [
        `# Thread Deleted`,
        '',
        `**Thread ID:** ${args.targetId}`,
        '',
        'The thread has been permanently deleted.',
    ]

    return { textContent: lines.join('\n'), structuredContent: deleteResult(args, true) }
}

async function deleteCommentBranch(args: Args, client: CommsApi): Promise<Branch> {
    await client.comments.deleteComment(args.targetId)

    const lines: string[] = [
        `# Comment Deleted`,
        '',
        `**Comment ID:** ${args.targetId}`,
        '',
        'The comment has been permanently deleted.',
    ]

    return { textContent: lines.join('\n'), structuredContent: deleteResult(args, true) }
}

async function deleteMessageBranch(args: Args, client: CommsApi): Promise<Branch> {
    await client.conversationMessages.deleteMessage(args.targetId)

    const lines: string[] = [
        `# Message Deleted`,
        '',
        `**Message ID:** ${args.targetId}`,
        '',
        'The conversation message has been permanently deleted.',
    ]

    return { textContent: lines.join('\n'), structuredContent: deleteResult(args, true) }
}

const CANNOT_UNDO = "This can't be undone."
const QUOTE_LIMIT = 80

/** A title or message short enough to quote in a question. */
function quote(text: string): string {
    return text.length > QUOTE_LIMIT ? `${text.slice(0, QUOTE_LIMIT - 1)}…` : text
}

/**
 * The question put to the user before a delete, naming what would go. Looked up only to ask.
 * The name only makes the question clearer, so a lookup that fails names the object by its ID
 * instead of stopping a delete the user may well confirm.
 */
async function describeDeletion(client: CommsApi, args: Args): Promise<string> {
    const { targetType, targetId } = args
    const degrade = degradeWithLog(
        ToolNames.DELETE_OBJECT,
        `failed to look up the ${targetType} for the delete question`,
        { targetType, targetId },
        undefined,
    )
    switch (targetType) {
        case 'thread': {
            const thread = await client.threads.getThread(targetId).catch(degrade)
            const named = thread
                ? `the thread "${quote(thread.title)}"`
                : `this thread (id=${targetId})`
            return `Delete ${named} and all its comments? ${CANNOT_UNDO}`
        }
        case 'comment': {
            const comment = await client.comments.getComment(targetId).catch(degrade)
            const named = comment
                ? `the comment "${quote(comment.content)}"`
                : `this comment (id=${targetId})`
            return `Delete ${named}? ${CANNOT_UNDO}`
        }
        case 'message': {
            const message = await client.conversationMessages.getMessage(targetId).catch(degrade)
            const named = message
                ? `the message "${quote(message.content)}"`
                : `this message (id=${targetId})`
            return `Delete ${named}? ${CANNOT_UNDO}`
        }
    }
}

const deleteObject = {
    name: ToolNames.DELETE_OBJECT,
    description:
        'Permanently delete a Comms object. `targetType: "thread"` deletes a thread (and all of its comments); `"comment"` deletes a single thread comment; `"message"` deletes a direct/group conversation message. Always pass `targetId`. Deletion is irreversible — confirm with the user before invoking. Note: the Comms API only allows deletion by the object\'s creator or a workspace admin; the call will be rejected otherwise.',
    parameters: ArgsSchema,
    outputSchema: DeleteObjectOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async execute(args, client, request?) {
        const { targetType, targetId } = args

        const confirmation = (await request?.confirm({
            key: 'delete',
            message: () => describeDeletion(client, args),
        })) ?? { status: 'unavailable' }
        if (confirmation.status === 'asking') return confirmation.result
        logConfirmation(ToolNames.DELETE_OBJECT, confirmation.status, { targetType, targetId })

        // Delete only on a yes, or for a client that cannot ask: anything else deletes nothing.
        if (confirmation.status !== 'confirmed' && confirmation.status !== 'unavailable') {
            return {
                textContent: `Not deleted: the user declined to delete the ${targetType} (id=${targetId}). Don't try again unless they ask.`,
                structuredContent: deleteResult(args, false),
            }
        }

        const branch =
            targetType === 'thread'
                ? await deleteThreadBranch(args, client)
                : targetType === 'comment'
                  ? await deleteCommentBranch(args, client)
                  : await deleteMessageBranch(args, client)

        return {
            textContent: branch.textContent,
            structuredContent: branch.structuredContent,
        }
    },
} satisfies CommsTool<typeof ArgsSchema, typeof DeleteObjectOutputSchema.shape>

export { deleteObject }
