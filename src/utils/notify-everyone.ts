import type { Channel, CommsApi } from '@todoist/comms-sdk'
import type { Confirmation, InputRequiredToolResult, ToolRequest } from '@todoist/mcp-core'
import { logConfirmation } from './confirmation-log.js'

/** The web app asks before "Everyone in channel" notifies this many people or more. */
const MIN_PEOPLE_BEFORE_ASKING = 10

const QUESTION_KEY = 'notify-everyone'

/**
 * Whether a new thread that names no audience of its own reaches everyone in the channel. As
 * in the web app's composer, it does unless the channel picks default recipients, and even then
 * when those defaults include everyone.
 */
function channelDefaultsToEveryone(channel: Channel): boolean {
    return !channel.useDefaultRecipients || Boolean(channel.defaultGroups?.includes('EVERYONE'))
}

type NotifyEveryoneQuestion = {
    toolName: string
    channelId: string
    /**
     * `always` for `notifyAudience: 'channel'`; `if-channel-default` for a new thread that names
     * no audience, which reaches everyone only when the channel's defaults do.
     */
    audience: 'always' | 'if-channel-default'
    /** Finishes the sentence "This …", such as `posts the thread "X"`. */
    describePost: () => Promise<string>
}

/**
 * Asks the user before a post notifies everyone in a channel of 10 or more people, as the web
 * app does, and records how that was settled (`logConfirmation`).
 *
 * Resolves to the result to return while the question is open, or to `undefined` when the post
 * can go ahead: the user confirmed, the client cannot ask, or the post reaches fewer people.
 * Throws when the user declines.
 *
 * A call that carries the user's answer acts on it without looking anything up, so a decline
 * stands even if the channel has since dropped below 10 people. Any other call looks the channel
 * up, since whether to ask depends on who would be notified; unlike a lookup that only names
 * something, a failure fails the call (the post would most likely fail too). A channel whose
 * members are not listed is asked about anyway.
 */
export async function confirmNotifyingEveryone(
    client: CommsApi,
    request: ToolRequest,
    { toolName, channelId, audience, describePost }: NotifyEveryoneQuestion,
): Promise<InputRequiredToolResult | undefined> {
    const given = request.answer(QUESTION_KEY)
    if (given) {
        logConfirmation(toolName, given, { channelId })
        return settle(given)
    }

    const channel = await client.channels.getChannel(channelId)
    if (audience === 'if-channel-default' && !channelDefaultsToEveryone(channel)) return undefined

    // Like the web app, count the members less the poster, who is not notified.
    const people = channel.userIds ? Math.max(channel.userIds.length - 1, 0) : undefined
    if (people !== undefined && people < MIN_PEOPLE_BEFORE_ASKING) return undefined

    const confirmation = await request.confirm({
        key: QUESTION_KEY,
        message: async () =>
            `${people === undefined ? 'Notify everyone in the channel?' : `Notify ${people} people?`} This ${await describePost()} and notifies everyone in the channel "${channel.name}".`,
    })
    logConfirmation(toolName, confirmation.status, { channelId, people })
    return confirmation.status === 'asking' ? confirmation.result : settle(confirmation.status)
}

/** Lets the post go ahead (`undefined`), or throws when the user declined. */
function settle(status: Exclude<Confirmation['status'], 'asking'>): undefined {
    switch (status) {
        case 'confirmed':
        case 'unavailable':
            return undefined
        default:
            // Declined, or any status added later: post nothing.
            throw new Error(
                "Not posted: the user declined to notify everyone in the channel. Don't try again unless they ask; to reach fewer people, pass recipients or groups instead of notifyAudience: 'channel'.",
            )
    }
}
