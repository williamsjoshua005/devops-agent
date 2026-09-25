import * as readline from 'node:readline';
import { TOOL_DEFINITIONS, executeTool } from '../tools/index.js';

export class DevOpsMcpServer {
  /**
   * Start the MCP server over standard input/output (stdio JSON-RPC)
   */
  static startStdio() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line) => {
      if (!line.trim()) return;

      try {
        const request = JSON.parse(line);
        const response = await this.handleMessage(request);
        if (response) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (err: any) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: `Parse error: ${err.message}` },
          }) + '\n'
        );
      }
    });

    console.error('[MCP Server] Junior DevOps MCP server running on stdio');
  }

  static async handleMessage(request: any): Promise<any> {
    const { id, method, params } = request;

    // 1. Initialize
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'junior-devops-agent',
            version: '2.0.0',
          },
          capabilities: {
            tools: {},
          },
        },
      };
    }

    // 2. tools/list
    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOL_DEFINITIONS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters,
          })),
        },
      };
    }

    // 3. tools/call
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      try {
        const output = await executeTool(toolName, toolArgs);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: output,
              },
            ],
            isError: false,
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Tool execution failed: ${err.message}`,
              },
            ],
            isError: true,
          },
        };
      }
    }

    // Default error for unsupported methods
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
}
