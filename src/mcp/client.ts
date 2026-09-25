import { spawn, ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { ToolDefinition } from '../types.js';

export class DevOpsMcpClient {
  private process?: ChildProcess;
  private pendingRequests = new Map<number | string, { resolve: Function; reject: Function }>();
  private requestId = 0;
  private tools: ToolDefinition[] = [];

  async connect(command: string, args: string[] = []): Promise<ToolDefinition[]> {
    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const rl = readline.createInterface({
      input: this.process.stdout!,
      terminal: false,
    });

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const { resolve, reject } = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message));
          } else {
            resolve(msg.result);
          }
        }
      } catch {}
    });

    // 1. Initialize handshake
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'junior-devops-agent', version: '2.0.0' },
      capabilities: {},
    });

    // 2. Fetch tools
    const res = await this.sendRequest('tools/list', {});
    const rawTools = res?.tools || [];

    this.tools = rawTools.map((t: any) => ({
      name: t.name,
      description: t.description || '',
      parameters: t.inputSchema || { type: 'object', properties: {} },
    }));

    return this.tools;
  }

  async callTool(name: string, argumentsObj: Record<string, any>): Promise<string> {
    const res = await this.sendRequest('tools/call', {
      name,
      arguments: argumentsObj,
    });

    const content = res?.content || [];
    const textPart = content.find((c: any) => c.type === 'text');
    return textPart ? textPart.text : JSON.stringify(res);
  }

  private sendRequest(method: string, params: any): Promise<any> {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process!.stdin!.write(msg);
    });
  }

  close() {
    if (this.process) {
      this.process.kill();
    }
  }
}
