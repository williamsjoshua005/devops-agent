import { randomUUID } from 'node:crypto';
import { Message, ToolCall, AgentContext, RoleLevel } from '../types.js';
import { TOOL_DEFINITIONS, executeTool } from '../tools/index.js';
import { Guardrails } from '../policy/guardrails.js';
import { ApprovalHandler, CliApprovalHandler } from '../policy/approvals.js';
import { AuditLogger } from '../policy/audit.js';
import { LLMClient, fitMessagesToBudget } from './llm.js';
import { getRunbookPrompt } from '../runbooks/index.js';
import { SeniorSreReviewer, SreReview } from './reviewer.js';
import { CertExpiryTool } from '../tools/certificates.js';
import { FinOpsTool } from '../tools/finops.js';
import { SecurityLinterTool } from '../tools/security.js';
import { TopologyTool } from '../tools/topology.js';
import { PostmortemTool } from '../tools/postmortem.js';
import { SecretSanitizer } from '../policy/sanitizer.js';
import { K8sTool } from '../tools/k8s.js';
import { AwsTool } from '../tools/aws.js';
import { GcpTool } from '../tools/gcp.js';
import { AzureTool } from '../tools/azure.js';

export interface AgentRunOptions {
  task: string;
  sessionId?: string;
  maxTurns?: number;
  approvalHandler?: ApprovalHandler;
  onTextChunk?: (text: string) => void;
  onTurnStart?: (turn: number) => void;
  onToolStart?: (name: string, args: any) => void;
  onToolEnd?: (name: string, output: string, durationMs?: number) => void;
  onSreReview?: (review: SreReview) => void;
  onPolicyBlocked?: (actionSummary: string, reason: string) => void;
}

export class DevOpsAgentHarness {
  private llm: LLMClient;
  private context: AgentContext;
  private messages: Message[] = [];
  private defaultApprovalHandler: ApprovalHandler;
  private auditLogger: AuditLogger;
  private sreReviewer: SeniorSreReviewer;
  private taskQueue: Promise<any> = Promise.resolve();

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

  setRoleLevel(role: RoleLevel) {
    this.context.roleLevel = role;
    this.initSystemPrompt();
  }

  updateKubeContext(newContext: string) {
    this.context.kubeContext = newContext;
    const raw = `${process.env.ENVIRONMENT || ''} ${newContext}`.toLowerCase();
    if (raw.includes('prod') || raw.includes('production') || raw.includes('live') || raw.includes('dr')) {
      this.context.environment = 'production';
      this.context.isProduction = true;
    } else if (raw.includes('stage') || raw.includes('staging') || raw.includes('uat')) {
      this.context.environment = 'staging';
      this.context.isProduction = false;
    } else {
      this.context.environment = 'development';
      this.context.isProduction = false;
    }
    this.initSystemPrompt();
  }

  getSreReviewer(): SeniorSreReviewer {
    return this.sreReviewer;
  }

  private initSystemPrompt() {
    const runbooks = getRunbookPrompt();
    const role = this.context.roleLevel || 'junior';
    const roleTitle =
      role === 'senior'
        ? 'Senior Principal SRE & Systems Architect'
        : role === 'intermediate'
        ? 'Intermediate DevOps & SRE Engineer'
        : 'Junior DevOps & SRE Assistant';

    const roleGuidance =
      role === 'senior'
        ? 'You operate as a Senior SRE: lead incident response, assess cross-cluster blast radius, verify PDBs, and provide architectural critiques.'
        : role === 'intermediate'
        ? 'You operate as an Intermediate DevOps Engineer: you have autonomous remediation authority in non-production (development/staging) to restart workloads, scale pods, open GitOps PRs, and verify rollouts. In production, you synthesize complete remediations and seek operator approval.'
        : 'You operate as a Junior DevOps Agent: gather facts, run read-only diagnostics, and request operator confirmation before any state modifications.';

    const envWarning = this.context.isProduction
      ? `\nActive Environment: PRODUCTION (${this.context.kubeContext || 'prod'}). Read-only diagnostic mode is active. Mutating operations require human approval.\n`
      : `\nActive Environment: ${(this.context.environment || 'development').toUpperCase()} (Standard operational mode - ${role.toUpperCase()} autonomy active)\n`;

    const systemPrompt = `You are a ${roleTitle} on the platform engineering team.
Your goal is to investigate, diagnose, and resolve infrastructure, Kubernetes, cloud, and CI/CD tasks methodically.

### Role & Autonomy:
- Active Role: ${role.toUpperCase()} (${roleTitle})
- ${roleGuidance}

### Environment Context:
- Current Working Directory: ${this.context.cwd}
- Installed Tools: ${this.context.installedTools.join(', ')}
${this.context.kubeContext ? `- Current Kubernetes Context: ${this.context.kubeContext}` : ''}
${envWarning}

### Operational Guidelines:
1. Gather facts first using diagnostic queries (k8s_get_resources, k8s_describe_resource, k8s_get_logs, metrics_query, cert_expiry_check, finops_idle_resources_audit, file_read).
2. Consult incident history using knowledge_base_search to check past solutions and proven remediations.
3. Perform security reviews with security_scan on manifests and Dockerfiles before deployment.
4. Prefer GitOps Pull Requests (gitops_create_pr) for configuration changes.
5. Provide structured Root Cause Analysis: Symptom -> Root Cause -> Remediation -> Verification.
6. Verify rollouts after mutations using k8s_watch_rollout; trigger rollback if health checks fail.

### Standard Operating Runbooks:
${runbooks}
`;

    this.messages = [{ role: 'system', content: systemPrompt }];
  }

  private async handleDirectOrOfflineTask(task: string, sessionId: string): Promise<string | null> {
    const trimmed = task.trim();
    const lower = trimmed.toLowerCase();

    const recordDirect = async (toolName: string, output: string) => {
      await this.auditLogger.record({
        sessionId,
        toolName,
        args: { invocation: task },
        tier: 'READ',
        isBlocked: false,
        requiresApproval: false,
        approved: true,
        durationMs: 45,
        outputSummary: output.slice(0, 500),
      });
      return output;
    };

    // 1. Direct slash commands
    if (trimmed === '/runbooks') {
      return getRunbookPrompt();
    }
    if (trimmed === '/tools') {
      return (
        '### Available Tools (' +
        TOOL_DEFINITIONS.length +
        ' tools registered):\n\n' +
        TOOL_DEFINITIONS.map((t) => `• **${t.name}**: ${t.description}`).join('\n')
      );
    }
    if (trimmed === '/certs') {
      const out = await CertExpiryTool.check({});
      return await recordDirect('cert_expiry_check', out);
    }
    if (trimmed === '/finops') {
      const out = await FinOpsTool.audit();
      return await recordDirect('finops_idle_resources_audit', out);
    }
    if (trimmed === '/security') {
      const out = await SecurityLinterTool.scan('.');
      return await recordDirect('security_scan', out);
    }
    if (trimmed === '/topology') {
      const out = await TopologyTool.discover();
      return await recordDirect('topology_graph', out);
    }
    if (trimmed === '/audit') {
      const records = await this.auditLogger.getRecent(20);
      if (records.length === 0) return 'No audit records found.';
      return (
        '### Recent Audit Trail\n' +
        records.map((r) => `[${r.timestamp}] ${r.tier} | ${r.toolName} | ${r.approved ? 'APPROVED' : 'REJECTED'}`).join('\n')
      );
    }
    if (trimmed === '/aws' || trimmed.startsWith('/aws ')) {
      const parts = trimmed.split(/\s+/);
      const svc = parts[1] || 'ec2';
      const out = await AwsTool.listResources(svc, parts[2]);
      return await recordDirect('aws_resource_list', out);
    }
    if (trimmed === '/gcp' || trimmed.startsWith('/gcp ')) {
      const parts = trimmed.split(/\s+/);
      const type = parts[1] || 'instances';
      const out = await GcpTool.listResources(type, parts[2]);
      return await recordDirect('gcp_resource_list', out);
    }
    if (trimmed.startsWith('/kb ')) {
      const q = trimmed.slice(4).trim();
      const out = await PostmortemTool.searchKnowledgeBase(q);
      return await recordDirect('knowledge_base_search', out);
    }
    if (trimmed === '/role' || trimmed.startsWith('/role ')) {
      const parts = trimmed.split(/\s+/);
      const newRole = parts[1]?.toLowerCase();
      if (newRole === 'junior' || newRole === 'intermediate' || newRole === 'senior') {
        this.setRoleLevel(newRole);
        return `✔ Role updated to **${newRole.toUpperCase()}** (${
          newRole === 'intermediate'
            ? 'Autonomous non-prod remediation, self-healing rollouts'
            : newRole === 'senior'
            ? 'Architectural oversight, blast-radius assessment'
            : 'Strict approval gate for all mutations'
        }).`;
      }
      const cur = this.context.roleLevel || 'junior';
      return (
        `### Active DevOps Role: **${cur.toUpperCase()}**\n\n` +
        `Options to switch:\n` +
        `• \`/role junior\` - Cautious diagnostics; all mutations require human approval\n` +
        `• \`/role intermediate\` - Autonomous non-prod remediation, self-healing rollouts, GitOps PRs\n` +
        `• \`/role senior\` - Architectural critiques, cross-cluster blast-radius assessment\n`
      );
    }

    // 2. Direct intent matches (works in offline or online mode)
    if (lower.includes('expir') && (lower.includes('tls') || lower.includes('cert'))) {
      const out = await CertExpiryTool.check({});
      return await recordDirect('cert_expiry_check', out);
    }
    if (
      lower.includes('idle pvc') ||
      (lower.includes('finops') && !lower.includes('how')) ||
      lower.includes('idle load balancer') ||
      lower.includes('orphaned cloud disk') ||
      lower.includes('idle resources')
    ) {
      const out = await FinOpsTool.audit();
      return await recordDirect('finops_idle_resources_audit', out);
    }
    if (lower.includes('security posture') || lower.includes('security audit') || lower.includes('security scan') || lower.includes('dockerfile')) {
      const out = await SecurityLinterTool.scan('.');
      return await recordDirect('security_scan', out);
    }
    if (lower === 'discover topology' || lower === 'topology graph' || lower === 'cluster topology') {
      const out = await TopologyTool.discover();
      return await recordDirect('topology_graph', out);
    }
    if (
      lower.includes('failing pods') ||
      lower.includes('pod crash triage') ||
      lower.includes('why pods in the default namespace are failing') ||
      (lower.includes('pods') && (lower.includes('fail') || lower.includes('crash')))
    ) {
      const pods = await K8sTool.getResources('pods', 'default');
      const events = await K8sTool.getResources('events', 'default');
      return await recordDirect(
        'k8s_get_resources',
        `### Kubernetes Pod Crash Triage (default namespace)\n\n${pods}\n\n### Recent Namespace Events\n\n${events}`
      );
    }
    if (
      lower.includes('list all configured kubernetes contexts') ||
      lower.includes('list clusters') ||
      (lower.includes('list') && (lower.includes('contexts') || lower.includes('clusters')))
    ) {
      const ctxs = await K8sTool.listContexts();
      return await recordDirect(
        'k8s_list_contexts',
        `### Configured Kubernetes Clusters & Contexts\n- **Active Context:** \`${ctxs.current}\`\n- **Available Clusters:**\n${ctxs.contexts.map((c) => `  • ${c}`).join('\n')}`
      );
    }
    if (
      lower.includes('list all pods and deployments') ||
      lower.includes('k8s workloads') ||
      (lower.includes('pods') && lower.includes('deployment'))
    ) {
      const pods = await K8sTool.getResources('pods', 'default');
      const deploys = await K8sTool.getResources('deployments', 'default');
      return await recordDirect(
        'k8s_get_resources',
        `### Kubernetes Workloads (default namespace)\n\n**Pods:**\n${pods}\n\n**Deployments:**\n${deploys}`
      );
    }
    if (lower === 'list pods in default namespace' || lower === 'get pods in default' || lower === 'pods in default') {
      const out = await K8sTool.getResources('pods', 'default');
      return await recordDirect('k8s_get_resources', out);
    }
    if (lower.includes('aws') && (lower.includes('ec2') || lower.includes('eks') || lower.includes('resource') || lower.includes('instance'))) {
      const out = await AwsTool.listResources('ec2');
      return await recordDirect('aws_resource_list', out);
    }
    if (lower.includes('gcp') && (lower.includes('compute') || lower.includes('gke') || lower.includes('instance') || lower.includes('resource'))) {
      const out = await GcpTool.listResources('instances');
      return await recordDirect('gcp_resource_list', out);
    }
    if (lower.includes('azure') && (lower.includes('aks') || lower.includes('vm') || lower.includes('resource'))) {
      const out = await AzureTool.listResources();
      return await recordDirect('azure_resource_list', out);
    }

    // 3. If LLM is not configured (or key is dummy), provide actionable guidance
    if (!this.llm.isConfigured()) {
      return `⚠️ **LLM Provider API Key Not Configured**

The Junior DevOps Agent was dispatched for:
> "${task}"

However, no valid AI model API key was detected in \`.env\` (current key is missing or a placeholder).

### To enable full autonomous reasoning and triage:
1. Open \`.env\` in the project root:
   \`\`\`bash
   code /Users/joshua.williams/Documents/research/devops-agent/.env
   \`\`\`
2. Replace \`your_gemini_api_key_here\` with your real key:
   \`\`\`env
   LLM_PROVIDER=gemini
   LLM_MODEL=gemini-2.5-flash
   GEMINI_API_KEY=AIzaSy...
   \`\`\`
   *(Or set \`LLM_PROVIDER=openai\`, \`LLM_PROVIDER=kimi\`, or free local \`LLM_PROVIDER=ollama\`)*
3. Save and re-run your task!

### Direct Diagnostic Commands Available Now (No API Key Required):
• \`/certs\` — Scan cluster for expiring TLS certificates
• \`/finops\` — Audit unattached PVCs and idle LoadBalancers
• \`/security\` — Scan Kubernetes YAML & Dockerfiles for vulnerabilities
• \`/topology\` — Generate service-to-service dependency graph
• \`/runbooks\` — View built-in SRE diagnostic runbooks
• \`/tools\` — List all 23 platform engineering tools`;
    }

    return null;
  }

  async run(options: AgentRunOptions): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.taskQueue = this.taskQueue.then(async () => {
        try {
          const res = await this.executeRun(options);
          resolve(res);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private async executeRun(options: AgentRunOptions): Promise<string> {
    const maxTurns = options.maxTurns ?? 15;
    const approvalHandler = options.approvalHandler || this.defaultApprovalHandler;
    const sessionId = options.sessionId || randomUUID();

    // Keep context window within budget using token-aware pruning (preserving system prompt and recent turns)
    this.messages = fitMessagesToBudget(this.messages, 16000, 3500);

    this.messages.push({ role: 'user', content: options.task });

    // Check direct / offline handler first
    const directResult = await this.handleDirectOrOfflineTask(options.task, sessionId);
    if (directResult !== null) {
      this.messages.push({ role: 'assistant', content: directResult });
      if (options.onTextChunk) {
        options.onTextChunk(directResult);
      }
      return directResult;
    }

    let currentTurn = 0;
    let finalAnswer = '';
    const executedToolSummaries: string[] = [];

    while (currentTurn < maxTurns) {
      currentTurn++;
      if (options.onTurnStart) {
        options.onTurnStart(currentTurn);
      }

      // 1. Query LLM
      let response;
      try {
        response = await this.llm.chat(this.messages, TOOL_DEFINITIONS);
      } catch (err: any) {
        const isNetworkOrProxy =
          err.message?.includes('fetch failed') ||
          err.name === 'AbortError' ||
          err.message?.includes('ENOTFOUND') ||
          err.message?.includes('ETIMEDOUT');

        let hint = 'Please check your LLM provider configuration and API key in .env.';
        if (isNetworkOrProxy) {
          hint =
            'The LLM endpoint could not be reached. If you are using a corporate gateway or proxy (e.g. ai-gateway.isw.la), verify your VPN/office connection, or configure a public provider (Gemini, OpenAI, Ollama) in .env.\n\n💡 *Tip: Quick Action shortcuts, diagnostic commands (/certs, /finops, /security, /topology, /aws, /gcp, /clusters), and runbooks continue to operate offline.*';
        }
        const errorMsg = `⚠️ [LLM Connection Error]: ${err.message}\n\n${hint}`;
        if (options.onTextChunk) options.onTextChunk(errorMsg);
        return errorMsg;
      }

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
          if (options.onPolicyBlocked) {
            options.onPolicyBlocked(policy.actionSummary, policy.reason);
          }
          approved = false;
        } else if (policy.requiresApproval) {
          // Pre-flight Senior SRE Architectural Review
          const sreReview = await this.sreReviewer.review(policy, tc.name, tc.arguments, this.context);
          if (options.onSreReview) {
            options.onSreReview(sreReview);
          }

          approved = await approvalHandler.requestApproval(policy, tc.name, tc.arguments, sreReview);
          if (!approved) {
            toolOutput = `[ACTION CANCELLED BY USER]: Operator declined approval for "${policy.actionSummary}". Please revise your plan or ask the operator for alternate instructions.`;
          } else {
            toolOutput = await executeTool(tc.name, tc.arguments, this.context);
          }
        } else {
          // Read-only autonomous execution
          approved = true;
          toolOutput = await executeTool(tc.name, tc.arguments, this.context);
        }

        const durationMs = Date.now() - startTime;
        executedToolSummaries.push(`**${tc.name}**:\n${toolOutput}`);

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
          options.onToolEnd(tc.name, toolOutput, durationMs);
        }

        // Feed tool result back into history, truncating very large outputs to avoid
        // overflowing the model's context window as the conversation grows.
        const maxToolOutputChars = 3500;
        const trimmedOutput =
          toolOutput.length > maxToolOutputChars
            ? toolOutput.slice(0, maxToolOutputChars) +
              `\n\n[Output truncated: ${toolOutput.length - maxToolOutputChars} additional characters omitted]`
            : toolOutput;

        this.messages.push({
          role: 'tool',
          name: tc.name,
          toolCallId: tc.id,
          content: SecretSanitizer.sanitize(trimmedOutput),
        });
      }
    }

    if (!finalAnswer.trim()) {
      if (executedToolSummaries.length > 0) {
        finalAnswer =
          `### Automated Investigation Report\nExecuted ${executedToolSummaries.length} diagnostic step(s):\n\n` +
          executedToolSummaries.join('\n\n---\n\n');
      } else {
        finalAnswer = `[Task Completed]: The agent processed your request. No further output was generated.`;
      }
    }

    return finalAnswer;
  }
}
