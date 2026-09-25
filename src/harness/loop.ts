import { randomUUID } from 'node:crypto';
import { Message, ToolCall, AgentContext } from '../types.js';
import { TOOL_DEFINITIONS, executeTool } from '../tools/index.js';
import { Guardrails } from '../policy/guardrails.js';
import { ApprovalHandler, CliApprovalHandler } from '../policy/approvals.js';
import { AuditLogger } from '../policy/audit.js';
import { LLMClient } from './llm.js';
import { getRunbookPrompt } from '../runbooks/index.js';
import { SeniorSreReviewer, SreReview } from './reviewer.js';

export interface AgentRunOptions {
  task: string;
  sessionId?: string;
  maxTurns?: number;
  approvalHandler?: ApprovalHandler;
  onTextChunk?: (text: string) => void;
  onToolStart?: (name: string, args: any) => void;
  onToolEnd?: (name: string, output: string) => void;
}

export class DevOpsAgentHarness {
  private llm: LLMClient;
  private context: AgentContext;
  private messages: Message[] = [];
  private defaultApprovalHandler: ApprovalHandler;
  private auditLogger: AuditLogger;
  private sreReviewer: SeniorSreReviewer;

  constructor(llm: LLMClient, context: AgentContext, auditLogger?: AuditLogger) {
    this.llm = llm;
    this.context = context;
    this.defaultApprovalHandler = new CliApprovalHandler();
    this.auditLogger = auditLogger || new AuditLogger(context.cwd);
    this.sreReviewer = new SeniorSreReviewer(llm);
    this.initSystemPrompt();
  }

  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  getContext(): AgentContext {
    return this.context;
  }

  getSreReviewer(): SeniorSreReviewer {
    return this.sreReviewer;
  }

  private initSystemPrompt() {
    const runbooks = getRunbookPrompt();
    const envWarning = this.context.isProduction
      ? `\n🚨 *** ACTIVE ENVIRONMENT IS PRODUCTION (${this.context.kubeContext || 'prod'}) *** 🚨
Strict safety rules apply. Do NOT attempt direct mutations without operator sign-off. Recommend GitOps PRs wherever possible.\n`
      : `\nEnvironment Tier: ${this.context.environment.toUpperCase()} (Safe for non-destructive operations)\n`;

    const systemPrompt = `You are an Autonomous Junior DevOps Engineer Assistant on the platform engineering team.
Your goal is to investigate, diagnose, and resolve infrastructure, Kubernetes, cloud, and CI/CD tasks methodically.

### Environment Context:
- Current Working Directory: ${this.context.cwd}
- Installed Tools: ${this.context.installedTools.join(', ')}
${this.context.kubeContext ? `- Current Kubernetes Context: ${this.context.kubeContext}` : ''}
${envWarning}

### Behavioral Guidelines (Junior DevOps Discipline):
1. **Evidence First (Never Guess):** Always run diagnostic queries (\`k8s_get_resources\`, \`k8s_describe_resource\`, \`k8s_get_logs\`, \`metrics_query\`, \`cert_expiry_check\`, \`finops_idle_resources_audit\`, \`az_*\`, \`file_read\`) to gather facts before jumping to conclusions or actions.
2. **Consult Incident History:** When encountering recurrent issues, use \`knowledge_base_search\` to check if past incidents had similar root causes and proven remediations.
3. **Security Audits:** Run \`security_scan\` on Kubernetes manifests and Dockerfiles before applying them to ensure no privileged containers, root users, or missing resource limits.
4. **Prefer GitOps over Direct Apply:** For configuration and manifest changes, use \`gitops_create_pr\` to branch and open a reviewable Pull Request instead of mutating clusters directly.
5. **Systematic Incident Reports & Postmortems:**
   - Summarize findings in standard RCA format: Symptom -> Root Cause -> Remediation -> Verification.
   - For major outages or completed fixes, call \`generate_postmortem_report\` to produce a formal postmortem and store it in organizational memory.
6. **Safety & Mutations:**
   - Diagnostic and read-only commands run autonomously.
   - Any mutating operations (restarts, applying manifests, scaling, deletes) will trigger a Senior SRE architectural critique and a human-in-the-loop approval gate.
   - Workload restarts are automatically monitored by the Rollout Watcher; if new pods crash, an automated rollback is triggered.
   - Destructive actions (like deleting entire namespaces or cluster-wide destruction) are blocked.

### Standard Operating Runbooks:
${runbooks}
`;

    this.messages = [{ role: 'system', content: systemPrompt }];
  }

  async run(options: AgentRunOptions): Promise<string> {
    const maxTurns = options.maxTurns ?? 15;
    const approvalHandler = options.approvalHandler || this.defaultApprovalHandler;
    const sessionId = options.sessionId || randomUUID();

    this.messages.push({ role: 'user', content: options.task });

    let currentTurn = 0;
    let finalAnswer = '';

    while (currentTurn < maxTurns) {
      currentTurn++;

      // 1. Query LLM
      const response = await this.llm.chat(this.messages, TOOL_DEFINITIONS);

      if (response.content) {
        if (options.onTextChunk) {
          options.onTextChunk(response.content);
        }
        finalAnswer = response.content;
      }

      // If no tool calls, the agent has finished its work
      if (!response.toolCalls || response.toolCalls.length === 0) {
        this.messages.push({ role: 'assistant', content: response.content || '' });
        break;
      }

      // Record assistant message with tool calls
      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls,
      });

      // 2. Process each tool call with Guardrails & Policy
      for (const tc of response.toolCalls) {
        if (options.onToolStart) {
          options.onToolStart(tc.name, tc.arguments);
        }

        const startTime = Date.now();

        // Evaluate safety policy with environment awareness
        const policy = Guardrails.evaluate(tc.name, tc.arguments, this.context);

        let toolOutput = '';
        let approved: boolean | undefined = undefined;

        if (policy.isBlocked) {
          toolOutput = `[BLOCKED BY POLICY]: ${policy.actionSummary}\nReason: ${policy.reason}\nJunior DevOps agent is restricted from performing this destructive action.`;
          console.log(`\n\x1b[31m⛔ ${toolOutput}\x1b[0m\n`);
          approved = false;
        } else if (policy.requiresApproval) {
          // Pre-flight Senior SRE Architectural Review
          const sreReview = await this.sreReviewer.review(policy, tc.name, tc.arguments, this.context);

          approved = await approvalHandler.requestApproval(policy, tc.name, tc.arguments, sreReview);
          if (!approved) {
            toolOutput = `[ACTION CANCELLED BY USER]: Operator declined approval for "${policy.actionSummary}". Please revise your plan or ask the operator for alternate instructions.`;
          } else {
            toolOutput = await executeTool(tc.name, tc.arguments);
          }
        } else {
          // Read-only autonomous execution
          approved = true;
          toolOutput = await executeTool(tc.name, tc.arguments);
        }

        const durationMs = Date.now() - startTime;

        // Record in immutable audit logger
        await this.auditLogger.record({
          sessionId,
          toolName: tc.name,
          args: tc.arguments,
          tier: policy.tier,
          isBlocked: policy.isBlocked,
          requiresApproval: policy.requiresApproval,
          approved,
          durationMs,
          outputSummary: toolOutput.slice(0, 500),
        });

        if (options.onToolEnd) {
          options.onToolEnd(tc.name, toolOutput);
        }

        // Feed tool result back into history
        this.messages.push({
          role: 'tool',
          name: tc.name,
          toolCallId: tc.id,
          content: toolOutput,
        });
      }
    }

    return finalAnswer;
  }
}
