import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { TOOL_DEFINITIONS, executeTool } from '../tools/index.js';
import { Guardrails } from '../policy/guardrails.js';
import { AuditLogger } from '../policy/audit.js';
import { SecretSanitizer } from '../policy/sanitizer.js';
import { AgentContext } from '../types.js';

export class DevOpsMcpServer {
  private static auditLogger = new AuditLogger();
  private static context: AgentContext = DevOpsMcpServer.detectContext();

  private static detectContext(): AgentContext {
    const rawEnv = (process.env.ENVIRONMENT || '').toLowerCase();
    const isProd = rawEnv.includes('prod') || rawEnv.includes('production');
    return {
      cwd: process.cwd(),
      installedTools: ['git', 'kubectl', 'helm', 'docker', 'az', 'aws', 'gcloud'],
      environment: isProd ? 'production' : 'development',
      isProduction: isProd,
    };
  }

  /**
   * Set context override (useful for testing or session initialization)
   */
  static setContext(ctx: AgentContext) {
    this.context = ctx;
  }

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

    console.error('[MCP Server] Junior DevOps MCP server running on stdio with strict Guardrail enforcement');
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

    // 3. tools/call with Guardrail, Audit, and Secret Sanitization Enforcement
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const startTime = Date.now();

      // Policy Evaluation
      const policy = Guardrails.evaluate(toolName, toolArgs, this.context);

      // Blocked Actions (Tier 3: DANGEROUS)
      if (policy.isBlocked) {
        const blockedMsg = `⛔ [SECURITY GUARDRAIL - BLOCKED]: Execution of "${toolName}" was strictly blocked by Tier 3 safety policy.\nAction: ${policy.actionSummary}\nReason: ${policy.reason}\nJunior DevOps agent is restricted from executing destructive actions.`;

        await this.auditLogger.record({
          sessionId: 'mcp-session',
          toolName: toolName || 'unknown',
          args: toolArgs,
          tier: policy.tier,
          isBlocked: true,
          requiresApproval: false,
          approved: false,
          durationMs: Date.now() - startTime,
          outputSummary: `BLOCKED: ${policy.actionSummary}`,
          error: policy.reason,
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: blockedMsg }],
            isError: true,
          },
        };
      }

      // Mutating Actions (Tier 2: MUTATE)
      if (policy.requiresApproval) {
        const isConfirmed = toolArgs.confirmed === true || toolArgs.approved === true;

        if (!isConfirmed) {
          const approvalId = randomUUID();
          let warnMsg = `⚠️ [APPROVAL REQUIRED - TIER: MUTATE]: Tool "${toolName}" modifies cluster or cloud state.\n` +
            `• Action: ${policy.actionSummary}\n` +
            `• Reason: ${policy.reason}\n` +
            `• Approval ID: ${approvalId}\n`;

          if (policy.isProductionWarning) {
            warnMsg += `• 🚨 CRITICAL WARNING: Active environment is PRODUCTION.\n`;
          }

          warnMsg += `\nTo confirm execution over MCP, either:\n` +
            `1. Re-invoke this tool with argument "confirmed": true after operator review.\n` +
            `2. Approve via Mission Control Web Console at http://localhost:3456/dashboard or POST /api/task/approval with {"approvalId":"${approvalId}","approved":true}`;

          await this.auditLogger.record({
            sessionId: 'mcp-session',
            toolName: toolName || 'unknown',
            args: toolArgs,
            tier: policy.tier,
            isBlocked: false,
            requiresApproval: true,
            approved: false,
            durationMs: Date.now() - startTime,
            outputSummary: `AWAITING APPROVAL: ${policy.actionSummary}`,
          });

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: warnMsg }],
              isError: true,
            },
          };
        }
      }

      // Execute Allowed / Confirmed Tool
      try {
        const rawOutput = await executeTool(toolName, toolArgs, this.context);
        const durationMs = Date.now() - startTime;
        const sanitizedOutput = SecretSanitizer.sanitize(rawOutput);

        await this.auditLogger.record({
          sessionId: 'mcp-session',
          toolName: toolName || 'unknown',
          args: toolArgs,
          tier: policy.tier,
          isBlocked: false,
          requiresApproval: policy.requiresApproval,
          approved: true,
          durationMs,
          outputSummary: sanitizedOutput.slice(0, 500),
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: sanitizedOutput,
              },
            ],
            isError: false,
          },
        };
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const sanitizedErr = SecretSanitizer.sanitize(err.message || String(err));

        await this.auditLogger.record({
          sessionId: 'mcp-session',
          toolName: toolName || 'unknown',
          args: toolArgs,
          tier: policy.tier,
          isBlocked: false,
          requiresApproval: policy.requiresApproval,
          approved: true,
          durationMs,
          outputSummary: 'Execution error',
          error: sanitizedErr,
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Tool execution failed: ${sanitizedErr}`,
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
