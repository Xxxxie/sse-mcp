const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js')
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js')
const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
const port = process.env.PORT || 3999

// 工具定义
const TOOLS = [
  {
    name: 'add',
    description: 'Add two numbers together',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'get_current_time',
    description: 'Get the current server time',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'reverse_string',
    description: 'Reverse a given string',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The string to reverse' },
      },
      required: ['text'],
    },
  },
]

// 为每个连接创建独立的 Server 实例
function createMcpServer() {
  const server = new Server(
    { name: 'CustomSSE', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      switch (name) {
        case 'add': {
          const a = Number(args.a)
          const b = Number(args.b)
          if (Number.isNaN(a) || Number.isNaN(b)) {
            throw new Error('Arguments must be valid numbers')
          }
          const result = a + b
          return {
            content: [{ type: 'text', text: String(result) }],
          }
        }

        case 'get_current_time': {
          const now = new Date()
          return {
            content: [{ type: 'text', text: now.toISOString() }],
          }
        }

        case 'reverse_string': {
          const text = String(args.text)
          const reversed = text.split('').reverse().join('')
          return {
            content: [{ type: 'text', text: reversed }],
          }
        }

        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      }
    }
  })

  return server
}

// 存储活跃的 SSE 传输连接和对应的 server 实例
const connections = new Map()

// SSE 连接端点
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res)
  const sessionId = transport.sessionId

  const server = createMcpServer()
  connections.set(sessionId, { transport, server })
  console.log(`[SSE] Client connected: ${sessionId}`)

  res.on('close', () => {
    connections.delete(sessionId)
    console.log(`[SSE] Client disconnected: ${sessionId}`)
  })

  await server.connect(transport)
})

// 接收客户端消息端点
app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Missing sessionId query parameter' })
    return
  }

  const conn = connections.get(sessionId)
  if (!conn) {
    res.status(404).json({ error: `Session not found: ${sessionId}` })
    return
  }

  await conn.transport.handlePostMessage(req, res)
})

app.listen(port, () => {
  console.log(`MCP SSE Server running on http://localhost:${port}`)
  console.log(`SSE endpoint: http://localhost:${port}/sse`)
  console.log(`Message endpoint: http://localhost:${port}/message`)
})
