import type { CommsApi } from '@todoist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import {
    type DeleteCommentOutput,
    type DeleteMessageOutput,
    DeleteObjectOutputSchema,
    type DeleteObjectStructured,
    type DeleteThreadOutput,
} from '../utils/output-schemas.js'
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

async function deleteThreadBranch(args: Args, client: CommsApi): Promise<Branch> {
    const { targetId } = args

    await client.threads.deleteThread(targetId)

    const lines: string[] = [
        `# Thread Deleted`,
        '',
        `**Thread ID:** ${targetId}`,
        '',
        'The thread has been permanently deleted.',
    ]

    const structuredContent: DeleteThreadOutput = {
        type: 'delete_thread_result',
        success: true,
        targetType: 'thread',
        threadId: targetId,
    }

    return { textContent: lines.join('\n'), structuredContent }
}

async function deleteCommentBranch(args: Args, client: CommsApi): Promise<Branch> {
    const { targetId } = args

    await client.comments.deleteComment(targetId)

    const lines: string[] = [
        `# Comment Deleted`,
        '',
        `**Comment ID:** ${targetId}`,
        '',
        'The comment has been permanently deleted.',
    ]

    const structuredContent: DeleteCommentOutput = {
        type: 'delete_comment_result',
        success: true,
        targetType: 'comment',
        commentId: targetId,
    }

    return { textContent: lines.join('\n'), structuredContent }
}

async function deleteMessageBranch(args: Args, client: CommsApi): Promise<Branch> {
    const { targetId } = args

    await client.conversationMessages.deleteMessage(targetId)

    const lines: string[] = [
        `# Message Deleted`,
        '',
        `**Message ID:** ${targetId}`,
        '',
        'The conversation message has been permanently deleted.',
    ]

    const structuredContent: DeleteMessageOutput = {
        type: 'delete_message_result',
        success: true,
        targetType: 'message',
        messageId: targetId,
    }

    return { textContent: lines.join('\n'), structuredContent }
}

const CANNOT_UNDO = "This can't be undone."
const QUOTE_LIMIT = 80

/** A title or message short enough to quote in a question. */
function quote(text: string): string {
    return text.length > QUOTE_LIMIT ? `${text.slice(0, QUOTE_LIMIT - 1)}…` : text
}

/** The question put to the user before a delete, naming what would go. Looked up only to ask. */
async function describeDeletion(client: CommsApi, { targetType, targetId }: Args): Promise<string> {
    switch (targetType) {
        case 'thread': {
            const thread = await client.threads.getThread(targetId)
            return `Delete the thread "${quote(thread.title)}" and all its comments? ${CANNOT_UNDO}`
        }
        case 'comment': {
            const comment = await client.comments.getComment(targetId)
            return `Delete the comment "${quote(comment.content)}"? ${CANNOT_UNDO}`
        }
        case 'message': {
            const message = await client.conversationMessages.getMessage(targetId)
            return `Delete the message "${quote(message.content)}"? ${CANNOT_UNDO}`
        }
    }
}

/** What a declined delete reports: nothing was deleted, and the model should not ask again. */
function declinedBranch({ targetType, targetId }: Args): Branch {
    const textContent = `Not deleted: the user declined to delete the ${targetType} (id=${targetId}). Don't try again unless they ask.`
    switch (targetType) {
        case 'thread':
            return {
                textContent,
                structuredContent: {
                    type: 'delete_thread_result',
                    success: false,
                    targetType,
                    threadId: targetId,
                },
            }
        case 'comment':
            return {
                textContent,
                structuredContent: {
                    type: 'delete_comment_result',
                    success: false,
                    targetType,
                    commentId: targetId,
                },
            }
        case 'message':
            return {
                textContent,
                structuredContent: {
                    type: 'delete_message_result',
                    success: false,
                    targetType,
                    messageId: targetId,
                },
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
        const { targetType } = args

        const confirmation = (await request?.confirm({
            key: 'delete',
            message: () => describeDeletion(client, args),
        })) ?? { status: 'unavailable' }
        if (confirmation.status === 'asking') return confirmation.result

        const branch =
            confirmation.status === 'declined'
                ? declinedBranch(args)
                : targetType === 'thread'
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
