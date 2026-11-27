import type { Channel, CommsApi } from '@todoist/comms-sdk'
import { vi } from 'vitest'
import {
    createMockChannel,
    createMockThread,
    createMockToolRequest,
    extractStructuredContent,
    extractTextContent,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { createThread } from './create-thread.js'

const mockCommsApi = vi.mocked(
    {
        threads: {
            createThread: vi.fn(),
        },
        channels: {
            getChannel: vi.fn(),
        },
        inbox: {
            unarchiveThread: vi.fn(),
        },
    } as unknown as CommsApi,
    true,
)

const { CREATE_THREAD } = ToolNames

describe(`${CREATE_THREAD} tool`, () => {
    beforeEach(() => {
        vi.clearAllMocks()
        delete process.env.COMMS_CREATE_THREAD_DISPLAY_IN_INBOX
    })

    describe('creating threads', () => {
        it('should create a thread in a channel', async () => {
            const mockThread = createMockThread({
                title: 'New Discussion',
                content: 'Let us discuss this topic',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'New Discussion',
                    content: 'Let us discuss this topic',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'New Discussion',
                content: 'Let us discuss this topic',
                recipients: undefined,
                groups: undefined,
            })
            expect(mockCommsApi.inbox.unarchiveThread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'create_thread_result',
                    success: true,
                    threadId: mockThread.id,
                    title: 'New Discussion',
                    channelId: TEST_IDS.CHANNEL_1,
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    content: 'Let us discuss this topic',
                    threadUrl: expect.stringContaining('comms.todoist.com'),
                }),
            )
        })

        it('should create a thread with recipients', async () => {
            const mockThread = createMockThread({
                title: 'Notify Users',
                content: 'Important update',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Notify Users',
                    content: 'Important update',
                    recipients: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Notify Users',
                content: 'Important update',
                recipients: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                groups: undefined,
            })
            expect(mockCommsApi.inbox.unarchiveThread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1, TEST_IDS.USER_2])
            expect(structuredContent).not.toHaveProperty('groups')
        })

        it('should create a thread with groups', async () => {
            const mockThread = createMockThread({
                title: 'Notify Groups',
                content: 'Important group update',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Notify Groups',
                    content: 'Important group update',
                    groups: [100, 200],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Notify Groups',
                content: 'Important group update',
                recipients: undefined,
                groups: [100, 200],
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups).toEqual([100, 200])
            expect(structuredContent).not.toHaveProperty('recipients')
        })

        it('should preserve empty groups when creating a thread', async () => {
            const mockThread = createMockThread({
                title: 'Empty Groups',
                content: 'No group recipients',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Empty Groups',
                    content: 'No group recipients',
                    groups: [],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Empty Groups',
                content: 'No group recipients',
                recipients: undefined,
                groups: [],
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups).toEqual([])
            expect(structuredContent).not.toHaveProperty('recipients')
        })

        it('should create a thread with recipients and groups', async () => {
            const mockThread = createMockThread({
                title: 'Notify Users and Groups',
                content: 'Important broad update',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Notify Users and Groups',
                    content: 'Important broad update',
                    recipients: [TEST_IDS.USER_1],
                    groups: [100],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Notify Users and Groups',
                content: 'Important broad update',
                recipients: [TEST_IDS.USER_1],
                groups: [100],
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1])
            expect(structuredContent.groups).toEqual([100])
        })

        it('should forward notifyAudience: channel to notify everyone in the channel', async () => {
            const mockThread = createMockThread({
                title: 'Everyone',
                content: 'For the whole channel',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Everyone',
                    content: 'For the whole channel',
                    notifyAudience: 'channel',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Everyone',
                content: 'For the whole channel',
                recipients: undefined,
                groups: undefined,
                notifyAudience: 'channel',
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.notifyAudience).toBe('channel')
            expect(extractTextContent(result)).toContain('Everyone in channel')
        })

        it('should forward notifyAudience alongside explicit recipients', async () => {
            const mockThread = createMockThread({
                title: 'Everyone plus one',
                content: 'Channel and a guest',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Everyone plus one',
                    content: 'Channel and a guest',
                    recipients: [TEST_IDS.USER_1],
                    notifyAudience: 'channel',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith(
                expect.objectContaining({
                    recipients: [TEST_IDS.USER_1],
                    notifyAudience: 'channel',
                }),
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1])
            expect(structuredContent.notifyAudience).toBe('channel')
        })

        it('should forward notifyAudience: thread but report it as not applied at creation', async () => {
            const mockThread = createMockThread({
                title: 'Interacted only',
                content: 'No effect at creation',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Interacted only',
                    content: 'No effect at creation',
                    notifyAudience: 'thread',
                },
                mockCommsApi,
            )

            // The request is still forwarded to the SDK verbatim...
            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith(
                expect.objectContaining({ notifyAudience: 'thread' }),
            )

            // ...but 'thread' is discarded at thread creation, so it is not
            // reported as an applied audience in the structured output.
            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).not.toHaveProperty('notifyAudience')
            expect(extractTextContent(result)).toContain('no effect at thread creation')
        })

        it('should omit notifyAudience from output when not provided', async () => {
            const mockThread = createMockThread({
                title: 'No audience',
                content: 'Defaults apply',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'No audience',
                    content: 'Defaults apply',
                },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).not.toHaveProperty('notifyAudience')
        })

        it('should unarchive the thread when displayInInbox is true', async () => {
            const mockThread = createMockThread({
                title: 'Inbox Thread',
                content: 'Should appear in Inbox',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)
            mockCommsApi.inbox.unarchiveThread.mockResolvedValue(undefined as never)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Inbox Thread',
                    content: 'Should appear in Inbox',
                    displayInInbox: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.unarchiveThread).toHaveBeenCalledWith(mockThread.id)
            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should unarchive the thread when COMMS_CREATE_THREAD_DISPLAY_IN_INBOX env var is set', async () => {
            process.env.COMMS_CREATE_THREAD_DISPLAY_IN_INBOX = 'true'

            const mockThread = createMockThread({
                title: 'Env Var Thread',
                content: 'Should appear in Inbox via env var',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)
            mockCommsApi.inbox.unarchiveThread.mockResolvedValue(undefined as never)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Env Var Thread',
                    content: 'Should appear in Inbox via env var',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.unarchiveThread).toHaveBeenCalledWith(mockThread.id)
            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should not unarchive when displayInInbox is false even if env var is set', async () => {
            process.env.COMMS_CREATE_THREAD_DISPLAY_IN_INBOX = 'true'

            const mockThread = createMockThread({
                title: 'Explicit False Thread',
                content: 'Should not unarchive',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Explicit False Thread',
                    content: 'Should not unarchive',
                    displayInInbox: false,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.unarchiveThread).not.toHaveBeenCalled()
        })

        it('should still return a successful result when unarchiveThread fails', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            const mockThread = createMockThread({
                title: 'Unarchive Fails',
                content: 'Thread created but unarchive failed',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)
            mockCommsApi.inbox.unarchiveThread.mockRejectedValue(new Error('Unarchive failed'))

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Unarchive Fails',
                    content: 'Thread created but unarchive failed',
                    displayInInbox: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.unarchiveThread).toHaveBeenCalledWith(mockThread.id)
            expect(consoleErrorSpy).toHaveBeenCalled()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.success).toBe(true)
            expect(structuredContent.threadId).toBe(mockThread.id)
            // Note must not falsely claim the thread is in the Inbox when unarchive failed.
            expect(extractTextContent(result)).toContain('do not appear in your own Inbox')
            expect(extractTextContent(result)).not.toContain('Thread is in your Inbox')

            consoleErrorSpy.mockRestore()
        })
    })

    describe('error handling', () => {
        it('should propagate API errors', async () => {
            const apiError = new Error('Channel not found')
            mockCommsApi.threads.createThread.mockRejectedValue(apiError)

            await expect(
                createThread.execute(
                    {
                        channelId: TEST_IDS.CHANNEL_1,
                        title: 'Test Thread',
                        content: 'Test content',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Channel not found')
        })
    })

    // The web app asks before "Everyone in channel" notifies 10 people or more, and so does this.
    describe('asking before notifying everyone in the channel', () => {
        /** A channel of `members` people, one of whom is the poster. */
        function channelOf(members: number, defaults: Partial<Channel> = {}) {
            mockCommsApi.channels.getChannel.mockResolvedValue(
                createMockChannel({
                    name: 'Design',
                    userIds: Array.from({ length: members }, (_, index) => index + 1),
                    ...defaults,
                }),
            )
        }

        const everyone = {
            channelId: TEST_IDS.CHANNEL_1,
            title: 'Q3 kickoff',
            content: 'Agenda inside',
            notifyAudience: 'channel' as const,
        }

        it('should ask before notifying 10 or more people, and post nothing yet', async () => {
            channelOf(11)
            const request = createMockToolRequest('asking')

            const result = await createThread.execute(everyone, mockCommsApi, request)

            expect(request.questions).toEqual([
                {
                    key: 'notify-everyone',
                    message:
                        'Notify 10 people? This posts the thread "Q3 kickoff" and notifies everyone in the channel "Design".',
                },
            ])
            expect(result).toEqual({
                inputRequired: expect.objectContaining({ resultType: 'input_required' }),
            })
            expect(mockCommsApi.threads.createThread).not.toHaveBeenCalled()
        })

        it('should post without asking when fewer than 10 people would be notified', async () => {
            channelOf(10)
            mockCommsApi.threads.createThread.mockResolvedValue(createMockThread())
            const request = createMockToolRequest('asking')

            await createThread.execute(everyone, mockCommsApi, request)

            expect(request.questions).toEqual([])
            expect(mockCommsApi.threads.createThread).toHaveBeenCalledTimes(1)
        })

        it('should not look the channel up when the post names its own recipients', async () => {
            mockCommsApi.threads.createThread.mockResolvedValue(createMockThread())
            const request = createMockToolRequest('asking')

            await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Q3 kickoff',
                    content: 'Agenda inside',
                    recipients: [TEST_IDS.USER_2],
                },
                mockCommsApi,
                request,
            )

            expect(mockCommsApi.channels.getChannel).not.toHaveBeenCalled()
            expect(request.checked).toEqual([])
            expect(mockCommsApi.threads.createThread).toHaveBeenCalledTimes(1)
        })

        // A thread that names no audience gets the channel's defaults, which can be everyone.
        it.each([
            { defaults: {}, asks: true, why: 'the channel uses no default recipients' },
            {
                defaults: { useDefaultRecipients: true, defaultGroups: ['EVERYONE'] },
                asks: true,
                why: 'the defaults include everyone',
            },
            {
                defaults: { useDefaultRecipients: true, defaultGroups: ['group-1'] },
                asks: false,
                why: 'the defaults pick a group',
            },
        ])('should ask $asks for a post with no audience when $why', async ({ defaults, asks }) => {
            channelOf(11, defaults)
            mockCommsApi.threads.createThread.mockResolvedValue(createMockThread())
            const request = createMockToolRequest('asking')

            await createThread.execute(
                { channelId: TEST_IDS.CHANNEL_1, title: 'Q3 kickoff', content: 'Agenda inside' },
                mockCommsApi,
                request,
            )

            expect(request.questions).toEqual(
                asks
                    ? [
                          {
                              key: 'notify-everyone',
                              message:
                                  'Notify 10 people? This posts the thread "Q3 kickoff" and notifies everyone in the channel "Design".',
                          },
                      ]
                    : [],
            )
            expect(mockCommsApi.threads.createThread).toHaveBeenCalledTimes(asks ? 0 : 1)
        })

        // Not knowing who would be notified is no reason to skip the question.
        it('should ask without a count when the channel lists no members', async () => {
            mockCommsApi.channels.getChannel.mockResolvedValue(
                createMockChannel({ name: 'Design', userIds: null }),
            )
            const request = createMockToolRequest('asking')

            await createThread.execute(everyone, mockCommsApi, request)

            expect(request.questions).toEqual([
                {
                    key: 'notify-everyone',
                    message:
                        'Notify everyone in the channel? This posts the thread "Q3 kickoff" and notifies everyone in the channel "Design".',
                },
            ])
            expect(mockCommsApi.threads.createThread).not.toHaveBeenCalled()
        })

        it('should post once the user confirms', async () => {
            channelOf(11)
            mockCommsApi.threads.createThread.mockResolvedValue(createMockThread())

            const request = createMockToolRequest('confirmed')

            await createThread.execute(everyone, mockCommsApi, request)

            expect(request.checked).toEqual(['notify-everyone'])
            expect(mockCommsApi.channels.getChannel).not.toHaveBeenCalled()
            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith(
                expect.objectContaining({ notifyAudience: 'channel' }),
            )
        })

        it('should record the outcome, with IDs and the head count only', async () => {
            channelOf(11)
            mockCommsApi.threads.createThread.mockResolvedValue(createMockThread())
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

            await createThread.execute(everyone, mockCommsApi, createMockToolRequest('unavailable'))

            expect(consoleError).toHaveBeenCalledWith('create-thread: confirmation unavailable', {
                channelId: TEST_IDS.CHANNEL_1,
                people: 10,
            })
            consoleError.mockRestore()
        })

        // The user answered about the channel as it was when asked. A member leaving before the
        // call that carries the answer must not turn a decline into a post.
        it('should stand by a decline when the channel has since dropped below 10 people', async () => {
            channelOf(10)
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

            await expect(
                createThread.execute(everyone, mockCommsApi, createMockToolRequest('declined')),
            ).rejects.toThrow('Not posted: the user declined to notify everyone in the channel.')

            expect(mockCommsApi.threads.createThread).not.toHaveBeenCalled()
            expect(mockCommsApi.channels.getChannel).not.toHaveBeenCalled()
            expect(consoleError).toHaveBeenCalledWith('create-thread: confirmation declined', {
                channelId: TEST_IDS.CHANNEL_1,
            })
            consoleError.mockRestore()
        })

        it('should post nothing when the user declines, and say how to reach fewer people', async () => {
            channelOf(11)

            await expect(
                createThread.execute(everyone, mockCommsApi, createMockToolRequest('declined')),
            ).rejects.toThrow(
                "Not posted: the user declined to notify everyone in the channel. Don't try again unless they ask; to reach fewer people, pass recipients or groups instead of notifyAudience: 'channel'.",
            )
            expect(mockCommsApi.threads.createThread).not.toHaveBeenCalled()
        })
    })
})
