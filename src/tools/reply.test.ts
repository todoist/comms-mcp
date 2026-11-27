import { CommsRequestError, type CommsApi } from '@todoist/comms-sdk'
import { vi } from 'vitest'
import {
    createMockChannel,
    createMockComment,
    createMockConversationMessage,
    createMockThread,
    createMockToolRequest,
    extractStructuredContent,
    extractTextContent,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { reply } from './reply.js'

// Mock the Comms API
const mockCommsApi = vi.mocked(
    {
        comments: {
            createComment: vi.fn(),
        },
        conversationMessages: {
            createMessage: vi.fn(),
        },
        threads: {
            closeThread: vi.fn(),
            reopenThread: vi.fn(),
            getThread: vi.fn(),
        },
        channels: {
            getChannel: vi.fn(),
        },
    } as unknown as CommsApi,
    true,
)

const { REPLY } = ToolNames

describe(`${REPLY} tool`, () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('replying to threads', () => {
        it('should post a comment to a thread', async () => {
            const mockComment = createMockComment()
            mockCommsApi.comments.createComment.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'This is my reply',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                content: 'This is my reply',
                recipients: undefined,
                groups: undefined,
                notifyAudience: 'thread',
            })

            expect(extractTextContent(result)).toMatchSnapshot()

            // Verify structured content
            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'reply_result',
                    success: true,
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'This is my reply',
                    replyUrl: expect.stringContaining('comms.todoist.com'),
                }),
            )
            expect(structuredContent?.replyId).toBe(mockComment.id)
            expect(structuredContent?.created).toBe('2024-01-01T00:00:00.000Z')
            expect(structuredContent?.notifyAudience).toBe('thread')
        })

        it('should post a comment with recipients', async () => {
            const mockComment = createMockComment()
            mockCommsApi.comments.createComment.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Notifying users',
                    recipients: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                content: 'Notifying users',
                recipients: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                groups: undefined,
                notifyAudience: undefined,
            })

            expect(extractTextContent(result)).toMatchSnapshot()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1, TEST_IDS.USER_2])
            expect(structuredContent).not.toHaveProperty('groups')
            expect(structuredContent).not.toHaveProperty('notifyAudience')
        })

        it('should post a comment with groups', async () => {
            const mockComment = createMockComment()
            mockCommsApi.comments.createComment.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Notifying groups',
                    groups: [100, 200],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                content: 'Notifying groups',
                recipients: undefined,
                groups: [100, 200],
                notifyAudience: undefined,
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups).toEqual([100, 200])
            expect(structuredContent).not.toHaveProperty('recipients')
            expect(structuredContent).not.toHaveProperty('notifyAudience')
        })

        it('should default to notifyAudience: thread when groups are empty', async () => {
            const mockComment = createMockComment()
            mockCommsApi.comments.createComment.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Notifying default recipients',
                    groups: [],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                content: 'Notifying default recipients',
                recipients: undefined,
                groups: undefined,
                notifyAudience: 'thread',
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.notifyAudience).toBe('thread')
            expect(structuredContent).not.toHaveProperty('groups')
        })

        it('should post a comment with recipients and groups', async () => {
            const mockComment = createMockComment()
            mockCommsApi.comments.createComment.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Notifying users and groups',
                    recipients: [TEST_IDS.USER_1],
                    groups: [100],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                content: 'Notifying users and groups',
                recipients: [TEST_IDS.USER_1],
                groups: [100],
                notifyAudience: undefined,
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1])
            expect(structuredContent.groups).toEqual([100])
            expect(structuredContent).not.toHaveProperty('notifyAudience')
        })

        it('should pass through an explicit notifyAudience', async () => {
            const mockComment = createMockComment()
            mockCommsApi.comments.createComment.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Notifying the whole channel',
                    notifyAudience: 'channel',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                content: 'Notifying the whole channel',
                recipients: undefined,
                groups: undefined,
                notifyAudience: 'channel',
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.notifyAudience).toBe('channel')
        })

        it('should combine an explicit notifyAudience with recipients and groups', async () => {
            const mockComment = createMockComment()
            mockCommsApi.comments.createComment.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Notifying users, groups, and the whole channel',
                    recipients: [TEST_IDS.USER_1],
                    groups: [100],
                    notifyAudience: 'channel',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                content: 'Notifying users, groups, and the whole channel',
                recipients: [TEST_IDS.USER_1],
                groups: [100],
                notifyAudience: 'channel',
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1])
            expect(structuredContent.groups).toEqual([100])
            expect(structuredContent.notifyAudience).toBe('channel')
        })

        it('should treat an explicit empty recipients array as user-provided and skip the default audience', async () => {
            const mockComment = createMockComment()
            mockCommsApi.comments.createComment.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'No one to notify explicitly',
                    recipients: [],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                content: 'No one to notify explicitly',
                recipients: [],
                groups: undefined,
                notifyAudience: undefined,
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([])
            expect(structuredContent).not.toHaveProperty('groups')
            expect(structuredContent).not.toHaveProperty('notifyAudience')
        })
    })

    describe('replying to conversations', () => {
        it('should post a message to a conversation', async () => {
            const mockMessage = createMockConversationMessage()
            mockCommsApi.conversationMessages.createMessage.mockResolvedValue(mockMessage)

            const result = await reply.execute(
                {
                    targetType: 'conversation',
                    targetId: TEST_IDS.CONVERSATION_1,
                    content: 'This is my message',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversationMessages.createMessage).toHaveBeenCalledWith({
                conversationId: TEST_IDS.CONVERSATION_1,
                content: 'This is my message',
            })

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should reject groups for conversation messages', async () => {
            await expect(
                reply.execute(
                    {
                        targetType: 'conversation',
                        targetId: TEST_IDS.CONVERSATION_1,
                        content: 'This is my message',
                        groups: [100],
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('groups can only be used when replying to a thread.')

            expect(mockCommsApi.conversationMessages.createMessage).not.toHaveBeenCalled()
        })

        it('should reject notifyAudience for conversation messages', async () => {
            await expect(
                reply.execute(
                    {
                        targetType: 'conversation',
                        targetId: TEST_IDS.CONVERSATION_1,
                        content: 'This is my message',
                        notifyAudience: 'channel',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('notifyAudience can only be used when replying to a thread.')

            expect(mockCommsApi.conversationMessages.createMessage).not.toHaveBeenCalled()
        })

        it('should reject empty groups for conversation messages', async () => {
            await expect(
                reply.execute(
                    {
                        targetType: 'conversation',
                        targetId: TEST_IDS.CONVERSATION_1,
                        content: 'This is my message',
                        groups: [],
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('groups can only be used when replying to a thread.')

            expect(mockCommsApi.conversationMessages.createMessage).not.toHaveBeenCalled()
        })

        it('should ignore recipients for conversation messages', async () => {
            const mockMessage = createMockConversationMessage()
            mockCommsApi.conversationMessages.createMessage.mockResolvedValue(mockMessage)

            const result = await reply.execute(
                {
                    targetType: 'conversation',
                    targetId: TEST_IDS.CONVERSATION_1,
                    content: 'This is my message',
                    recipients: [TEST_IDS.USER_1],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversationMessages.createMessage).toHaveBeenCalledWith({
                conversationId: TEST_IDS.CONVERSATION_1,
                content: 'This is my message',
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).not.toHaveProperty('groups')
        })
    })

    describe('closing and reopening threads', () => {
        it('should close a thread with the reply when threadAction is close', async () => {
            const mockComment = createMockComment()
            mockCommsApi.threads.closeThread.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Shipped, closing this.',
                    threadAction: 'close',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.closeThread).toHaveBeenCalledWith({
                id: TEST_IDS.THREAD_1,
                content: 'Shipped, closing this.',
                recipients: undefined,
                groups: undefined,
                notifyAudience: 'thread',
            })
            expect(mockCommsApi.comments.createComment).not.toHaveBeenCalled()
            expect(mockCommsApi.threads.reopenThread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.threadAction).toBe('close')
            expect(structuredContent.replyId).toBe(mockComment.id)
            expect(structuredContent.notifyAudience).toBe('thread')
        })

        it('should reopen a thread with the reply when threadAction is reopen', async () => {
            const mockComment = createMockComment()
            mockCommsApi.threads.reopenThread.mockResolvedValue(mockComment)

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Reopening, the fix regressed.',
                    recipients: [TEST_IDS.USER_1],
                    threadAction: 'reopen',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.reopenThread).toHaveBeenCalledWith({
                id: TEST_IDS.THREAD_1,
                content: 'Reopening, the fix regressed.',
                recipients: [TEST_IDS.USER_1],
                groups: undefined,
                notifyAudience: undefined,
            })
            expect(mockCommsApi.comments.createComment).not.toHaveBeenCalled()
            expect(mockCommsApi.threads.closeThread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.threadAction).toBe('reopen')
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1])
        })

        it('should leave threadAction out of a plain thread reply', async () => {
            mockCommsApi.comments.createComment.mockResolvedValue(createMockComment())

            const result = await reply.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    content: 'Just a reply',
                },
                mockCommsApi,
            )

            expect(extractStructuredContent(result)).not.toHaveProperty('threadAction')
        })

        it('should reject threadAction for conversation replies', async () => {
            await expect(
                reply.execute(
                    {
                        targetType: 'conversation',
                        targetId: TEST_IDS.CONVERSATION_1,
                        content: 'This is my message',
                        threadAction: 'close',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow(
                'threadAction can only be used when replying to a thread; conversations cannot be closed.',
            )

            expect(mockCommsApi.conversationMessages.createMessage).not.toHaveBeenCalled()
        })
    })

    describe('error handling', () => {
        it('should suggest reopening when the thread is closed, leaving it to the user', async () => {
            const apiError = new CommsRequestError('Request failed with status 403', 403)
            mockCommsApi.comments.createComment.mockRejectedValue(apiError)
            mockCommsApi.threads.getThread.mockResolvedValue(createMockThread({ closed: true }))

            await expect(
                reply.execute(
                    {
                        targetType: 'thread',
                        targetId: TEST_IDS.THREAD_1,
                        content: 'Late reply',
                    },
                    mockCommsApi,
                ),
            ).rejects.toMatchObject({
                message: `Thread ${TEST_IDS.THREAD_1} is closed, so it does not accept new comments and the reply was not posted. Posting it means reopening the thread for everyone: only if the user wants that, send it again with threadAction: "reopen", which reopens the thread and posts the comment in one step.`,
                cause: apiError,
            })

            expect(mockCommsApi.threads.getThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
        })

        it.each([
            {
                threadAction: 'close',
                closed: true,
                message: `Thread ${TEST_IDS.THREAD_1} is already closed, so the reply was not posted.`,
            },
            {
                threadAction: 'reopen',
                closed: false,
                message: `Thread ${TEST_IDS.THREAD_1} is already open, so the reply was not posted. To post it, send it again without threadAction.`,
            },
        ] as const)(
            'should explain a refused $threadAction when the thread is already in that state',
            async ({ threadAction, closed, message }) => {
                const apiError = new CommsRequestError('Request failed with status 403', 403)
                mockCommsApi.threads.closeThread.mockRejectedValue(apiError)
                mockCommsApi.threads.reopenThread.mockRejectedValue(apiError)
                mockCommsApi.threads.getThread.mockResolvedValue(createMockThread({ closed }))

                await expect(
                    reply.execute(
                        {
                            targetType: 'thread',
                            targetId: TEST_IDS.THREAD_1,
                            content: 'Reply content',
                            threadAction,
                        },
                        mockCommsApi,
                    ),
                ).rejects.toMatchObject({ message, cause: apiError })

                expect(mockCommsApi.threads.getThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
            },
        )

        it.each([
            { threadAction: undefined, closed: false },
            { threadAction: 'close', closed: false },
            { threadAction: 'reopen', closed: true },
            { threadAction: 'reopen', closed: null },
        ] as const)(
            'should keep the API error for a refused reply with threadAction $threadAction when closed is $closed',
            async ({ threadAction, closed }) => {
                const apiError = new CommsRequestError('Request failed with status 403', 403)
                mockCommsApi.comments.createComment.mockRejectedValue(apiError)
                mockCommsApi.threads.closeThread.mockRejectedValue(apiError)
                mockCommsApi.threads.reopenThread.mockRejectedValue(apiError)
                mockCommsApi.threads.getThread.mockResolvedValue(createMockThread({ closed }))

                await expect(
                    reply.execute(
                        {
                            targetType: 'thread',
                            targetId: TEST_IDS.THREAD_1,
                            content: 'Reply content',
                            threadAction,
                        },
                        mockCommsApi,
                    ),
                ).rejects.toBe(apiError)

                expect(mockCommsApi.threads.getThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
            },
        )

        it('should keep the API error when the thread state cannot be read', async () => {
            const apiError = new CommsRequestError('Request failed with status 403', 403)
            mockCommsApi.comments.createComment.mockRejectedValue(apiError)
            mockCommsApi.threads.getThread.mockRejectedValue(new Error('Network down'))

            await expect(
                reply.execute(
                    {
                        targetType: 'thread',
                        targetId: TEST_IDS.THREAD_1,
                        content: 'Reply content',
                    },
                    mockCommsApi,
                ),
            ).rejects.toBe(apiError)

            expect(mockCommsApi.threads.getThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
        })

        it.each([400, 404, 429, 503])(
            'should not look up the thread after a %i',
            async (status) => {
                const apiError = new CommsRequestError(
                    `Request failed with status ${status}`,
                    status,
                )
                mockCommsApi.comments.createComment.mockRejectedValue(apiError)

                await expect(
                    reply.execute(
                        {
                            targetType: 'thread',
                            targetId: TEST_IDS.THREAD_1,
                            content: 'Reply content',
                        },
                        mockCommsApi,
                    ),
                ).rejects.toBe(apiError)

                expect(mockCommsApi.threads.getThread).not.toHaveBeenCalled()
            },
        )

        it('should propagate thread reply errors', async () => {
            const apiError = new Error('Thread not found')
            mockCommsApi.comments.createComment.mockRejectedValue(apiError)

            await expect(
                reply.execute(
                    {
                        targetType: 'thread',
                        targetId: TEST_IDS.THREAD_1,
                        content: 'Reply content',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Thread not found')
        })

        it('should propagate conversation reply errors', async () => {
            const apiError = new Error('Conversation not found')
            mockCommsApi.conversationMessages.createMessage.mockRejectedValue(apiError)

            await expect(
                reply.execute(
                    {
                        targetType: 'conversation',
                        targetId: TEST_IDS.CONVERSATION_1,
                        content: 'Message content',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Conversation not found')
        })
    })

    // The web app asks before "Everyone in channel" notifies 10 people or more, and so does this.
    describe('asking before notifying everyone in the channel', () => {
        beforeEach(() => {
            mockCommsApi.threads.getThread.mockResolvedValue(
                createMockThread({ title: 'Q3 kickoff', channelId: TEST_IDS.CHANNEL_1 }),
            )
            mockCommsApi.channels.getChannel.mockResolvedValue(
                createMockChannel({
                    name: 'Design',
                    userIds: Array.from({ length: 13 }, (_, index) => index + 1),
                }),
            )
        })

        const everyone = {
            targetType: 'thread' as const,
            targetId: TEST_IDS.THREAD_1,
            content: 'Moved to Thursday',
            notifyAudience: 'channel' as const,
        }

        it('should ask before notifying 10 or more people, and reply nothing yet', async () => {
            const request = createMockToolRequest('asking')

            const result = await reply.execute(everyone, mockCommsApi, request)

            expect(request.questions).toEqual([
                {
                    key: 'notify-everyone',
                    message:
                        'Notify 12 people? This replies to the thread "Q3 kickoff" and notifies everyone in the channel "Design".',
                },
            ])
            expect(result).toEqual({
                inputRequired: expect.objectContaining({ resultType: 'input_required' }),
            })
            expect(mockCommsApi.comments.createComment).not.toHaveBeenCalled()
        })

        it('should reply nothing when the user declines', async () => {
            await expect(
                reply.execute(everyone, mockCommsApi, createMockToolRequest('declined')),
            ).rejects.toThrow('Not posted: the user declined to notify everyone in the channel.')
            expect(mockCommsApi.comments.createComment).not.toHaveBeenCalled()
        })

        it('should reply once the user confirms', async () => {
            mockCommsApi.comments.createComment.mockResolvedValue(createMockComment())
            const request = createMockToolRequest('confirmed')

            await reply.execute(everyone, mockCommsApi, request)

            expect(request.checked).toEqual(['notify-everyone'])
            expect(mockCommsApi.comments.createComment).toHaveBeenCalledWith(
                expect.objectContaining({ notifyAudience: 'channel' }),
            )
        })

        it('should not ask when the reply notifies only the thread', async () => {
            mockCommsApi.comments.createComment.mockResolvedValue(createMockComment())
            const request = createMockToolRequest('asking')

            await reply.execute(
                { targetType: 'thread', targetId: TEST_IDS.THREAD_1, content: 'Moved to Thursday' },
                mockCommsApi,
                request,
            )

            expect(request.questions).toEqual([])
            expect(mockCommsApi.channels.getChannel).not.toHaveBeenCalled()
        })

        // Asking about a reply the thread would refuse only for the post to fail afterwards
        // would waste the user's answer.
        it('should refuse a reply to a closed thread before asking anything', async () => {
            mockCommsApi.threads.getThread.mockResolvedValue(
                createMockThread({
                    title: 'Q3 kickoff',
                    channelId: TEST_IDS.CHANNEL_1,
                    closed: true,
                }),
            )
            const request = createMockToolRequest('asking')

            await expect(reply.execute(everyone, mockCommsApi, request)).rejects.toThrow(
                `Thread ${TEST_IDS.THREAD_1} is closed, so it does not accept new comments`,
            )
            expect(request.checked).toEqual([])
            expect(mockCommsApi.comments.createComment).not.toHaveBeenCalled()
        })
    })
})
