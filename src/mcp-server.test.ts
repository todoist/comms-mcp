import { readFileSync } from 'node:fs'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { ThreadsClient } from '@todoist/comms-sdk'
import { afterEach, vi } from 'vitest'
import { getMcpServer } from './mcp-server.js'
import { createMockThread, TEST_IDS } from './utils/test-helpers.js'

const packageVersion = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
        version: string
    }
).version

describe('getMcpServer', () => {
    it('reports the package version to clients', async () => {
        const server = getMcpServer({ token: 'test-token' })
        const client = new Client({ name: 'test-client', version: '1.0.0' })
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

        try {
            expect(client.getServerVersion()).toMatchObject({
                name: 'comms-mcp-server',
                version: packageVersion,
            })
        } finally {
            await client.close()
            await server.close()
        }
    })
})

// A client that can show a form gets asked before a delete, through the same usage tracking every
// Comms tool call goes through; one that cannot deletes as it did before.
describe('confirming a delete over MCP', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function deleteThreadAnswering(answer: 'confirm' | 'decline' | 'cannot ask') {
        const getThread = vi
            .spyOn(ThreadsClient.prototype, 'getThread')
            .mockResolvedValue(createMockThread({ title: 'Q3 planning' }))
        const deleteThread = vi
            .spyOn(ThreadsClient.prototype, 'deleteThread')
            .mockResolvedValue(undefined as never)
        const questions: string[] = []

        const server = getMcpServer({ token: 'test-token' })
        const client = new Client(
            { name: 'test-client', version: '1.0.0' },
            answer === 'cannot ask' ? {} : { capabilities: { elicitation: {} } },
        )
        if (answer !== 'cannot ask') {
            client.setRequestHandler('elicitation/create', async (request) => {
                questions.push(request.params.message)
                return answer === 'confirm'
                    ? { action: 'accept', content: { confirm: true } }
                    : { action: 'decline' }
            })
        }
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
        try {
            const result = await client.callTool({
                name: 'delete-object',
                arguments: { targetType: 'thread', targetId: TEST_IDS.THREAD_1 },
            })
            return {
                questions,
                getThread,
                deleteThread,
                structuredContent: result.structuredContent,
            }
        } finally {
            await client.close()
            await server.close()
        }
    }

    it('should delete the thread once the user confirms', async () => {
        const { questions, deleteThread, structuredContent } =
            await deleteThreadAnswering('confirm')

        expect(questions).toEqual([
            'Delete the thread "Q3 planning" and all its comments? This can\'t be undone.',
        ])
        expect(deleteThread).toHaveBeenCalledTimes(1)
        expect(deleteThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
        expect(structuredContent).toEqual({
            type: 'delete_thread_result',
            success: true,
            targetType: 'thread',
            threadId: TEST_IDS.THREAD_1,
        })
    })

    it('should delete nothing when the user declines', async () => {
        const { deleteThread, structuredContent } = await deleteThreadAnswering('decline')

        expect(deleteThread).not.toHaveBeenCalled()
        expect(structuredContent).toEqual({
            type: 'delete_thread_result',
            success: false,
            targetType: 'thread',
            threadId: TEST_IDS.THREAD_1,
        })
    })

    it('should delete without asking when the client cannot ask', async () => {
        const { questions, getThread, deleteThread } = await deleteThreadAnswering('cannot ask')

        expect(questions).toEqual([])
        // Nothing is looked up for a question that cannot be asked.
        expect(getThread).not.toHaveBeenCalled()
        expect(deleteThread).toHaveBeenCalledTimes(1)
        expect(deleteThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
    })
})
