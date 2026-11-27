import type { CommsApi } from '@todoist/comms-sdk'
import { afterEach, type Mock, vi } from 'vitest'
import {
    createMockComment,
    createMockConversationMessage,
    createMockThread,
    createMockToolRequest,
    extractTextContent,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { deleteObject } from './delete-object.js'

const mockCommsApi = vi.mocked(
    {
        threads: {
            getThread: vi.fn(),
            deleteThread: vi.fn(),
        },
        comments: {
            getComment: vi.fn(),
            deleteComment: vi.fn(),
        },
        conversationMessages: {
            getMessage: vi.fn(),
            deleteMessage: vi.fn(),
        },
    } as unknown as CommsApi,
    true,
)

const { DELETE_OBJECT } = ToolNames

describe(`${DELETE_OBJECT} tool`, () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('targetType: thread', () => {
        it('should delete a thread by ID', async () => {
            ;(mockCommsApi.threads.deleteThread as Mock).mockResolvedValue(undefined as never)

            const result = await deleteObject.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.deleteThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual({
                type: 'delete_thread_result',
                success: true,
                targetType: 'thread',
                threadId: TEST_IDS.THREAD_1,
            })
        })

        it('should propagate API errors when deleting a thread', async () => {
            ;(mockCommsApi.threads.deleteThread as Mock).mockRejectedValue(
                new Error('Thread not found') as never,
            )

            await expect(
                deleteObject.execute(
                    {
                        targetType: 'thread',
                        targetId: TEST_IDS.THREAD_1,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Thread not found')
        })
    })

    describe('targetType: comment', () => {
        it('should delete a comment by ID', async () => {
            ;(mockCommsApi.comments.deleteComment as Mock).mockResolvedValue(undefined as never)

            const result = await deleteObject.execute(
                {
                    targetType: 'comment',
                    targetId: TEST_IDS.COMMENT_1,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.deleteComment).toHaveBeenCalledWith(TEST_IDS.COMMENT_1)
            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual({
                type: 'delete_comment_result',
                success: true,
                targetType: 'comment',
                commentId: TEST_IDS.COMMENT_1,
            })
        })

        it('should propagate API errors when deleting a comment', async () => {
            ;(mockCommsApi.comments.deleteComment as Mock).mockRejectedValue(
                new Error('Comment not found') as never,
            )

            await expect(
                deleteObject.execute(
                    {
                        targetType: 'comment',
                        targetId: TEST_IDS.COMMENT_1,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Comment not found')
        })
    })

    describe('targetType: message', () => {
        it('should delete a conversation message by ID', async () => {
            ;(mockCommsApi.conversationMessages.deleteMessage as Mock).mockResolvedValue(
                undefined as never,
            )

            const result = await deleteObject.execute(
                {
                    targetType: 'message',
                    targetId: TEST_IDS.MESSAGE_1,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversationMessages.deleteMessage).toHaveBeenCalledWith(
                TEST_IDS.MESSAGE_1,
            )
            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual({
                type: 'delete_message_result',
                success: true,
                targetType: 'message',
                messageId: TEST_IDS.MESSAGE_1,
            })
        })

        it('should propagate API errors when deleting a message', async () => {
            ;(mockCommsApi.conversationMessages.deleteMessage as Mock).mockRejectedValue(
                new Error('Message not found') as never,
            )

            await expect(
                deleteObject.execute(
                    {
                        targetType: 'message',
                        targetId: TEST_IDS.MESSAGE_1,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Message not found')
        })
    })

    describe('routing', () => {
        const routingCases = [
            {
                targetType: 'thread' as const,
                targetId: TEST_IDS.THREAD_1,
                expectedMethod: 'threads.deleteThread',
            },
            {
                targetType: 'comment' as const,
                targetId: TEST_IDS.COMMENT_1,
                expectedMethod: 'comments.deleteComment',
            },
            {
                targetType: 'message' as const,
                targetId: TEST_IDS.MESSAGE_1,
                expectedMethod: 'conversationMessages.deleteMessage',
            },
        ]

        it.each(routingCases)(
            'should only call $expectedMethod when targetType is $targetType',
            async ({ targetType, targetId }) => {
                ;(mockCommsApi.threads.deleteThread as Mock).mockResolvedValue(undefined as never)
                ;(mockCommsApi.comments.deleteComment as Mock).mockResolvedValue(undefined as never)
                ;(mockCommsApi.conversationMessages.deleteMessage as Mock).mockResolvedValue(
                    undefined as never,
                )

                await deleteObject.execute({ targetType, targetId }, mockCommsApi)

                expect(mockCommsApi.threads.deleteThread).toHaveBeenCalledTimes(
                    targetType === 'thread' ? 1 : 0,
                )
                expect(mockCommsApi.comments.deleteComment).toHaveBeenCalledTimes(
                    targetType === 'comment' ? 1 : 0,
                )
                expect(mockCommsApi.conversationMessages.deleteMessage).toHaveBeenCalledTimes(
                    targetType === 'message' ? 1 : 0,
                )
            },
        )
    })

    // Deleting is permanent, so a client that can ask the user does, naming what would go.
    describe('asking the user first', () => {
        it('should ask before deleting a thread, naming it, and delete nothing yet', async () => {
            ;(mockCommsApi.threads.getThread as Mock).mockResolvedValue(
                createMockThread({ title: 'Q3 planning' }),
            )
            const request = createMockToolRequest('asking')

            const result = await deleteObject.execute(
                { targetType: 'thread', targetId: TEST_IDS.THREAD_1 },
                mockCommsApi,
                request,
            )

            expect(request.questions).toEqual([
                {
                    key: 'delete',
                    message:
                        'Delete the thread "Q3 planning" and all its comments? This can\'t be undone.',
                },
            ])
            expect(result).toEqual({
                inputRequired: expect.objectContaining({ resultType: 'input_required' }),
            })
            expect(mockCommsApi.threads.deleteThread).not.toHaveBeenCalled()
        })

        it.each([
            {
                targetType: 'comment' as const,
                setUp: () =>
                    (mockCommsApi.comments.getComment as Mock).mockResolvedValue(
                        createMockComment({ content: 'Shipping on Friday' }),
                    ),
                message: 'Delete the comment "Shipping on Friday"? This can\'t be undone.',
            },
            {
                targetType: 'message' as const,
                setUp: () =>
                    (mockCommsApi.conversationMessages.getMessage as Mock).mockResolvedValue(
                        createMockConversationMessage({ content: 'See you at 3' }),
                    ),
                message: 'Delete the message "See you at 3"? This can\'t be undone.',
            },
        ])(
            'should name the $targetType it would delete',
            async ({ targetType, setUp, message }) => {
                setUp()
                const request = createMockToolRequest('asking')

                await deleteObject.execute({ targetType, targetId: 'id-1' }, mockCommsApi, request)

                expect(request.questions).toEqual([{ key: 'delete', message }])
            },
        )

        it('should shorten a long comment in the question', async () => {
            ;(mockCommsApi.comments.getComment as Mock).mockResolvedValue(
                createMockComment({ content: 'a'.repeat(200) }),
            )
            const request = createMockToolRequest('asking')

            await deleteObject.execute(
                { targetType: 'comment', targetId: 'c1' },
                mockCommsApi,
                request,
            )

            expect(request.questions[0]?.message).toBe(
                `Delete the comment "${'a'.repeat(79)}…"? This can't be undone.`,
            )
        })

        it('should delete once the user confirms, without looking anything up again', async () => {
            ;(mockCommsApi.threads.deleteThread as Mock).mockResolvedValue(undefined as never)

            const result = await deleteObject.execute(
                { targetType: 'thread', targetId: TEST_IDS.THREAD_1 },
                mockCommsApi,
                createMockToolRequest('confirmed'),
            )

            expect(mockCommsApi.threads.deleteThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
            expect(mockCommsApi.threads.getThread).not.toHaveBeenCalled()
            expect(result.structuredContent).toEqual({
                type: 'delete_thread_result',
                success: true,
                targetType: 'thread',
                threadId: TEST_IDS.THREAD_1,
            })
        })

        it.each([
            {
                targetType: 'thread' as const,
                structuredContent: {
                    type: 'delete_thread_result',
                    success: false,
                    targetType: 'thread',
                    threadId: 'id-1',
                },
            },
            {
                targetType: 'comment' as const,
                structuredContent: {
                    type: 'delete_comment_result',
                    success: false,
                    targetType: 'comment',
                    commentId: 'id-1',
                },
            },
            {
                targetType: 'message' as const,
                structuredContent: {
                    type: 'delete_message_result',
                    success: false,
                    targetType: 'message',
                    messageId: 'id-1',
                },
            },
        ])(
            'should delete no $targetType when the user declines, and say not to retry',
            async ({ targetType, structuredContent }) => {
                const result = await deleteObject.execute(
                    { targetType, targetId: 'id-1' },
                    mockCommsApi,
                    createMockToolRequest('declined'),
                )

                expect(mockCommsApi.threads.deleteThread).not.toHaveBeenCalled()
                expect(mockCommsApi.comments.deleteComment).not.toHaveBeenCalled()
                expect(mockCommsApi.conversationMessages.deleteMessage).not.toHaveBeenCalled()
                expect(result.structuredContent).toEqual(structuredContent)
                expect(result.textContent).toBe(
                    `Not deleted: the user declined to delete the ${targetType} (id=id-1). Don't try again unless they ask.`,
                )
            },
        )
    })

    describe('degrading and recording the confirmation', () => {
        let consoleError: ReturnType<typeof vi.spyOn>

        beforeEach(() => {
            consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        })

        afterEach(() => {
            consoleError.mockRestore()
        })

        // The name only makes the question clearer: a failed lookup must not stop the delete.
        it('should name the thread by its ID when it cannot be looked up, and log why', async () => {
            ;(mockCommsApi.threads.getThread as Mock).mockRejectedValue(new Error('Forbidden'))
            const request = createMockToolRequest('asking')

            await deleteObject.execute(
                { targetType: 'thread', targetId: TEST_IDS.THREAD_1 },
                mockCommsApi,
                request,
            )

            expect(request.questions).toEqual([
                {
                    key: 'delete',
                    message: `Delete this thread (id=${TEST_IDS.THREAD_1}) and all its comments? This can't be undone.`,
                },
            ])
            expect(consoleError).toHaveBeenCalledWith(
                'delete-object: failed to look up the thread for the delete question',
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                    error: { name: 'Error', message: 'Forbidden' },
                },
            )
        })

        it.each([
            { status: 'declined' as const, request: createMockToolRequest('declined') },
            { status: 'confirmed' as const, request: createMockToolRequest('confirmed') },
            { status: 'unavailable' as const, request: undefined },
        ])('should record a $status confirmation, with IDs only', async ({ status, request }) => {
            ;(mockCommsApi.threads.deleteThread as Mock).mockResolvedValue(undefined as never)

            await deleteObject.execute(
                { targetType: 'thread', targetId: TEST_IDS.THREAD_1 },
                mockCommsApi,
                request,
            )

            expect(consoleError).toHaveBeenCalledWith(`delete-object: confirmation ${status}`, {
                targetType: 'thread',
                targetId: TEST_IDS.THREAD_1,
            })
        })
    })
})
