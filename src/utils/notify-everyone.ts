import type { CommsApi } from '@todoist/comms-sdk'
import type { Confirmation, ToolRequest } from '@todoist/mcp-core'

/** The web app asks before "Everyone in channel" notifies this many people or more. */
const MIN_PEOPLE_BEFORE_ASKING = 10

/**
 * Asks the user before a post notifies everyone in a channel of 10 or more people, as the web
 * app does. Resolves to `undefined` when the channel is too small to ask about.
 *
 * The channel is looked up on every such call, to count who would be notified: whether to ask
 * depends on it. `describePost` finishes the sentence "This …", such as `posts the thread "X"`.
 */
export async function confirmNotifyingEveryone(
    client: CommsApi,
    request: ToolRequest,
    { channelId, describePost }: { channelId: string; describePost: () => Promise<string> },
): Promise<Confirmation | undefined> {
    const channel = await client.channels.getChannel(channelId)
    // Like the web app, count the members less the poster, who is not notified.
    const people = Math.max((channel.userIds?.length ?? 0) - 1, 0)
    if (people < MIN_PEOPLE_BEFORE_ASKING) return undefined

    return request.confirm({
        key: 'notify-everyone',
        message: async () =>
            `Notify ${people} people? This ${await describePost()} and notifies everyone in the channel "${channel.name}".`,
    })
}

/**
 * The error a declined post ends in. Nothing was created, so the tool's result schema has
 * nothing to describe; an error result says so and points at a smaller audience.
 */
export function declinedNotifyingEveryone(): Error {
    return new Error(
        "Not posted: the user declined to notify everyone in the channel. Don't try again unless they ask; to reach fewer people, pass recipients or groups instead of notifyAudience: 'channel'.",
    )
}
