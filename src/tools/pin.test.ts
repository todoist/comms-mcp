import type { CommsApi } from '@todoist/comms-sdk'
import { vi } from 'vitest'
import {
    createMockComment,
    createMockConversationMessage,
    extractTextContent,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { pin } from './pin.js'

const PINNED = { pinnedDate: new Date('2026-11-26T15:00:00.000Z'), pinnedBy: 2 }

const mockCommsApi = vi.mocked(
    {
        comments: {
            pinComment: vi.fn(async () => createMockComment(PINNED)),
            unpinComment: vi.fn(async () => createMockComment()),
        },
        conversationMessages: {
            pinMessage: vi.fn(async () => createMockConversationMessage(PINNED)),
            unpinMessage: vi.fn(async () => createMockConversationMessage()),
        },
    } as unknown as CommsApi,
    true,
)

describe(`${ToolNames.PIN} tool`, () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it.each([
        ['comment', 'pin', TEST_IDS.COMMENT_1, () => mockCommsApi.comments.pinComment],
        ['comment', 'unpin', TEST_IDS.COMMENT_1, () => mockCommsApi.comments.unpinComment],
        ['message', 'pin', TEST_IDS.MESSAGE_1, () => mockCommsApi.conversationMessages.pinMessage],
        [
            'message',
            'unpin',
            TEST_IDS.MESSAGE_1,
            () => mockCommsApi.conversationMessages.unpinMessage,
        ],
    ] as const)(
        '%s %s calls the matching SDK method',
        async (targetType, operation, id, method) => {
            await pin.execute({ targetType, targetId: id, operation }, mockCommsApi)

            expect(method()).toHaveBeenCalledWith(id)
        },
    )

    it('reports who pinned it and when', async () => {
        const result = await pin.execute(
            { targetType: 'comment', targetId: TEST_IDS.COMMENT_1, operation: 'pin' },
            mockCommsApi,
        )

        expect(extractTextContent(result)).toContain(
            '**Pinned:** 2026-11-26T15:00:00.000Z by user 2',
        )
        expect(result.structuredContent).toEqual(
            expect.objectContaining({
                type: 'pin_result',
                operation: 'pin',
                targetType: 'comment',
                pinnedDate: '2026-11-26T15:00:00.000Z',
                pinnedBy: 2,
            }),
        )
    })

    it('leaves the pin fields out after an unpin', async () => {
        const result = await pin.execute(
            { targetType: 'message', targetId: TEST_IDS.MESSAGE_1, operation: 'unpin' },
            mockCommsApi,
        )

        expect(extractTextContent(result)).not.toContain('**Pinned:**')
        expect(result.structuredContent.pinnedDate).toBeUndefined()
        expect(result.structuredContent.pinnedBy).toBeUndefined()
    })
})
