import {
    type CommsApi,
    CommsRequestError,
    getFullCommsURL,
    NOTIFY_AUDIENCES,
    type NotifyAudience,
    THREAD_ACTIONS,
    type ThreadAction,
} from '@todoist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { confirmNotifyingEveryone, declinedNotifyingEveryone } from '../utils/notify-everyone.js'
import { type ReplyOutput, ReplyOutputSchema } from '../utils/output-schemas.js'
import { quote } from '../utils/quote.js'
import { ReplyTargetTypeSchema } from '../utils/target-types.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    targetType: ReplyTargetTypeSchema.describe(
        'The type of object to reply to: thread (posts a comment) or conversation (posts a message).',
    ),
    targetId: z.string().describe('The ID of the thread or conversation to reply to.'),
    content: z
        .string()
        .min(1)
        .describe(
            'The content of the reply. Markdown. Mention people with the link syntax [Name](comms-mention://USER_ID) — e.g. [Afzal](comms-mention://29367677) — never @Name or [[Name|id]], which post as literal text. Do not put "@" in the label; the client adds it. Groups use [Name](comms-group-mention://GROUP_ID), channels [#name](comms-channel://CHANNEL_ID), threads [Title](comms-thread://THREAD_ID). Resolve IDs with get-users/get-groups/list-channels first. Mentioning inline does not notify anyone. For thread replies, also pass mentioned user IDs in recipients and group IDs in groups; conversation replies notify all participants automatically and take no notification parameters.',
        ),
    recipients: z
        .array(z.number())
        .optional()
        .describe(
            'Optional array of user IDs to notify (thread replies only; ignored for conversation replies, which notify all participants automatically). If omitted with no groups and no notifyAudience, thread replies default to notifying everyone who has interacted with the thread.',
        ),
    groups: z
        .array(z.string())
        .optional()
        .describe(
            'Optional array of group IDs to notify (only for thread replies). Use get-groups to discover group IDs before passing them here.',
        ),
    notifyAudience: z
        .enum(NOTIFY_AUDIENCES)
        .optional()
        .describe(
            "Optional broader audience to notify in addition to recipients and groups (only for thread replies). 'channel' notifies everyone in the channel; 'thread' notifies everyone who has interacted with the thread.",
        ),
    threadAction: z
        .enum(THREAD_ACTIONS)
        .optional()
        .describe(
            "Thread replies only. 'close' closes the thread for everyone with this reply; it then accepts no new comments until reopened. 'reopen' reopens it. Unlike mark-done, which only archives the thread in your own inbox.",
        ),
}

/**
 * The SDK call behind each thread action, the state the reply reports, and
 * whether the action leaves the thread closed. Keyed by the SDK's
 * ThreadAction, so an action the SDK adds fails to compile here instead of
 * being posted as a plain comment.
 */
const THREAD_ACTION_STEPS = {
    close: { method: 'closeThread', result: 'Closed', leavesThreadClosed: true },
    reopen: { method: 'reopenThread', result: 'Reopened', leavesThreadClosed: false },
} as const satisfies Record<
    ThreadAction,
    { method: keyof CommsApi['threads']; result: string; leavesThreadClosed: boolean }
>

/**
 * Why Comms refused a thread reply, given whether the thread is closed:
 * a comment on a closed thread, or an action on a thread already in the state
 * the action leaves it in. Undefined when the thread's state does not explain
 * the refusal.
 */
function describeRefusal(
    threadId: string,
    threadAction: ThreadAction | undefined,
    isClosed: boolean,
): string | undefined {
    if (threadAction === undefined) {
        return isClosed
            ? `Thread ${threadId} is closed, so it does not accept new comments and the reply was not posted. Posting it means reopening the thread for everyone: only if the user wants that, send it again with threadAction: "reopen", which reopens the thread and posts the comment in one step.`
            : undefined
    }
    if (THREAD_ACTION_STEPS[threadAction].leavesThreadClosed !== isClosed) {
        return undefined
    }
    return isClosed
        ? `Thread ${threadId} is already closed, so the reply was not posted.`
        : `Thread ${threadId} is already open, so the reply was not posted. To post it, send it again without threadAction.`
}

/**
 * Comms refuses a comment on a closed thread, closing a closed thread and
 * reopening an open one with a 403 and its generic forbidden error code, the
 * same answer it gives when the channel limits who can comment. So on a 403
 * this reads the thread to say which it was. Any other error, a refusal the
 * thread's state does not explain, or a failed lookup keeps the original error.
 */
async function explainRefusedReply(
    client: CommsApi,
    threadId: string,
    threadAction: ThreadAction | undefined,
    error: unknown,
): Promise<unknown> {
    if (!(error instanceof CommsRequestError) || error.httpStatusCode !== 403) {
        return error
    }
    const thread = await client.threads.getThread(threadId).catch(() => undefined)
    const isClosed = thread?.closed
    const message =
        typeof isClosed === 'boolean'
            ? describeRefusal(threadId, threadAction, isClosed)
            : undefined
    // Assigned rather than passed to the constructor: the es2021 lib has no `cause` option.
    return message ? Object.assign(new Error(message), { cause: error }) : error
}

const reply = {
    name: ToolNames.REPLY,
    description:
        'Post a reply to a thread (as a comment) or conversation (as a message). Thread replies notify everyone who has interacted with the thread by default unless specific user recipients, groups, or a notifyAudience are provided. Pass threadAction to close or reopen the thread with the reply.',
    parameters: ArgsSchema,
    outputSchema: ReplyOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async execute(args, client, request?) {
        const { targetType, targetId, content, recipients, groups, notifyAudience, threadAction } =
            args

        if (targetType === 'conversation' && groups !== undefined) {
            throw new Error('groups can only be used when replying to a thread.')
        }
        if (targetType === 'conversation' && notifyAudience !== undefined) {
            throw new Error('notifyAudience can only be used when replying to a thread.')
        }
        if (targetType === 'conversation' && threadAction !== undefined) {
            throw new Error(
                'threadAction can only be used when replying to a thread; conversations cannot be closed.',
            )
        }

        // Called directly, with no MCP request, the tool cannot ask, so it looks nothing up.
        if (request && targetType === 'thread' && notifyAudience === 'channel') {
            const thread = await client.threads.getThread(targetId)
            const confirmation = await confirmNotifyingEveryone(client, request, {
                channelId: thread.channelId,
                describePost: async () => `replies to the thread "${quote(thread.title)}"`,
            })
            if (confirmation?.status === 'asking') return confirmation.result
            if (confirmation?.status === 'declined') throw declinedNotifyingEveryone()
        }

        const groupsToNotify =
            targetType === 'thread' && groups && groups.length > 0 ? groups : undefined
        const appliedAudience: NotifyAudience | undefined =
            targetType === 'thread'
                ? (notifyAudience ??
                  (recipients === undefined && !groupsToNotify ? 'thread' : undefined))
                : undefined

        let replyId: string
        let created: Date
        let replyUrl: string

        if (targetType === 'thread') {
            const notification = {
                content,
                recipients,
                groups: groupsToNotify,
                notifyAudience: appliedAudience,
            }
            const comment = await (
                threadAction
                    ? client.threads[THREAD_ACTION_STEPS[threadAction].method]({
                          id: targetId,
                          ...notification,
                      })
                    : client.comments.createComment({ threadId: targetId, ...notification })
            ).catch(async (error: unknown) => {
                throw await explainRefusedReply(client, targetId, threadAction, error)
            })
            replyId = comment.id
            replyUrl =
                comment.url ??
                getFullCommsURL({
                    workspaceId: comment.workspaceId,
                    channelId: comment.channelId,
                    threadId: comment.threadId,
                    commentId: comment.id,
                })
            const postedValue = comment.posted
            created = postedValue
                ? typeof postedValue === 'string'
                    ? new Date(postedValue)
                    : postedValue
                : new Date()
        } else {
            const message = await client.conversationMessages.createMessage({
                conversationId: targetId,
                content,
            })
            replyId = message.id
            replyUrl =
                message.url ??
                getFullCommsURL({
                    workspaceId: message.workspaceId,
                    conversationId: message.conversationId,
                    messageId: message.id,
                })
            const postedValue = message.posted
            created = postedValue
                ? typeof postedValue === 'string'
                    ? new Date(postedValue)
                    : postedValue
                : new Date()
        }

        const lines: string[] = [
            `# Reply Posted`,
            '',
            `**Target:** ${targetType === 'thread' ? `Thread ${targetId}` : `Conversation ${targetId}`}`,
            `**Reply ID:** ${replyId}`,
            `**Created:** ${created.toISOString()}`,
            ...(threadAction
                ? [`**Thread state:** ${THREAD_ACTION_STEPS[threadAction].result}`]
                : []),
            '',
            '## Content',
            '',
            content,
        ]

        const structuredContent: ReplyStructured = {
            type: 'reply_result',
            success: true,
            targetType,
            targetId,
            replyId,
            content,
            created: created.toISOString(),
            replyUrl,
            ...(targetType === 'thread' && recipients ? { recipients } : {}),
            ...(groupsToNotify ? { groups: groupsToNotify } : {}),
            ...(appliedAudience ? { notifyAudience: appliedAudience } : {}),
            ...(threadAction ? { threadAction } : {}),
        }

        return {
            textContent: lines.join('\n'),
            structuredContent,
        }
    },
} satisfies CommsTool<typeof ArgsSchema, typeof ReplyOutputSchema.shape>

type ReplyStructured = ReplyOutput

export { reply, type ReplyStructured }
