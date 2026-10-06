import * as fs from 'node:fs';
import * as path from 'node:path';
import { PolicyEvaluation, AgentContext } from '../types.js';
import { generateUnifiedDiff } from './diff.js';

// Patterns that are considered catastrophic or forbidden for an automated junior agent
const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force)\s+(\/|\.\.|\*|~)/i,
  /kubectl\s+delete\s+(namespace|ns)\b/i,
  /kubectl\s+delete\s+all\b/i,
  /kubectl\s+delete\s+nodes?\b/i,
  /terraform\s+destroy\b/i,
  /az\s+group\s+delete\b/i,
  /az\s+aks\s+delete\b/i,
  /aws\s+ec2\s+terminate-instances\b/i,
  /aws\s+s3\s+rb\s+--force\b/i,
  /aws\s+eks\s+delete-cluster\b/i,
  /aws\s+rds\s+delete-db-instance\b/i,
  /gcloud\s+container\s+clusters\s+delete\b/i,
  /gcloud\s+compute\s+instances\s+delete\b/i,
  /gcloud\s+projects\s+delete\b/i,
  /gcloud\s+sql\s+instances\s+delete\b/i,
  /mkfs\b/i,
  /dd\s+if=/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
  />\s*\/dev\/sd[a-z]/i,
  /DROP\s+(DATABASE|TABLE)\b/i,
];

// Patterns that mutate state (requiring human confirmation)
const MUTATING_PATTERNS = [
  /kubectl\s+(apply|create|delete|scale|rollout\s+restart|patch|edit|replace|label|annotate)\b/i,
  /helm\s+(install|upgrade|rollback|uninstall)\b/i,
  /docker\s+(run|stop|restart|rm|rmi|kill|build|compose\s+(up|down|restart))\b/i,
  /az\s+[a-z0-9-]+\s+(create|update|delete|restart|start|stop)\b/i,
  /aws\s+[a-z0-9-]+\s+(create|delete|terminate|modify|reboot|update|stop)\b/i,
  /gcloud\s+[a-z0-9-]+\s+(create|delete|update|restart|start|stop)\b/i,
  /git\s+(commit|push|merge|rebase|reset|checkout\s+-b)\b/i,
  /sed\s+-i\b/i,
  /echo\s+.*>\s+[^>]/, // file redirection overwrite
];

export class Guardrails {
  /**
   * Evaluates a tool call and determines its risk tier.
   */
  static evaluate(
    toolName: string,
    args: Record<string, any>,
    context?: AgentContext
  ): PolicyEvaluation {
    const isProd = context?.isProduction ?? false;
    const role = context?.roleLevel || 'junior';
    const isIntermediateOrSenior = role === 'intermediate' || role === 'senior';

    // 1. Filesystem write tools
    if (toolName === 'file_write') {
      const filePath = args.path || 'unknown';
      let existingText = '';
      try {
        const resolved = path.resolve(context?.cwd || process.cwd(), filePath);
        if (fs.existsSync(resolved)) {
          existingText = fs.readFileSync(resolved, 'utf-8');
        }
      } catch {}

      const diff = generateUnifiedDiff(filePath, existingText, filePath, args.content || '');
      const requiresApproval = isProd || !isIntermediateOrSenior;

      return {
        tier: 'MUTATE',
        actionSummary: `Write/modify file: ${filePath}`,
        reason: isProd
          ? 'CRITICAL WARNING: Target environment is PRODUCTION. Modifying files requires explicit operator approval.'
          : isIntermediateOrSenior
          ? 'Intermediate DevOps autonomy: Modifying non-production configuration executed autonomously.'
          : 'Modifying files requires user verification to prevent unintended configuration overwrites.',
        requiresApproval,
        isBlocked: false,
        diff,
        isProductionWarning: isProd,
      };
    }

    // 2. Read-only built-in tools
    if (
      toolName === 'file_read' ||
      toolName === 'file_list' ||
      toolName === 'k8s_get_resources' ||
      toolName === 'k8s_get_logs' ||
      toolName === 'k8s_describe_resource' ||
      toolName === 'az_resource_list' ||
      toolName === 'az_aks_status' ||
      toolName === 'aws_resource_list' ||
      toolName === 'aws_eks_status' ||
      toolName === 'gcp_resource_list' ||
      toolName === 'gcp_gke_status' ||
      toolName === 'metrics_query' ||
      toolName === 'knowledge_base_search' ||
      toolName === 'generate_postmortem_report' ||
      toolName === 'security_scan' ||
      toolName === 'cert_expiry_check' ||
      toolName === 'finops_idle_resources_audit' ||
      toolName === 'k8s_watch_rollout' ||
      toolName === 'topology_graph' ||
      toolName === 'diagnose_connectivity' ||
      toolName === 'semantic_kb_search' ||
      toolName === 'k8s_list_contexts'
    ) {
      return {
        tier: 'READ',
        actionSummary: `Read-only diagnostic query: ${toolName}`,
        reason: 'Safe read-only operation. Executing autonomously.',
        requiresApproval: false,
        isBlocked: false,
        isProductionWarning: false,
      };
    }

    // 3. Mutating built-in tools
    if (toolName === 'k8s_switch_context') {
      const targetCtx = String(args.contextName || '');
      const isTargetProd =
        targetCtx.toLowerCase().includes('prod') ||
        targetCtx.toLowerCase().includes('dr') ||
        targetCtx.toLowerCase().includes('live');

      return {
        tier: 'MUTATE',
        actionSummary: `Switch active Kubernetes context to "${targetCtx}"`,
        reason: isTargetProd
          ? 'WARNING: Target cluster is PRODUCTION. Switching context requires human confirmation.'
          : 'Switching active Kubernetes cluster context.',
        requiresApproval: isTargetProd,
        isBlocked: false,
        isProductionWarning: isTargetProd,
      };
    }

    if (toolName === 'k8s_rollout_restart') {
      const requiresApproval = isProd || !isIntermediateOrSenior;
      return {
        tier: 'MUTATE',
        actionSummary: `Restart Kubernetes workload: ${args.kind || 'deployment'}/${args.name} in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Running in PRODUCTION cluster. Workload restart may cause customer-facing latency or downtime.'
          : isIntermediateOrSenior
          ? 'Intermediate DevOps autonomy: Non-production workload restart executed autonomously.'
          : 'Restarting workloads can cause transient service disruption and requires user approval.',
        requiresApproval,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'canary_deploy') {
      const requiresApproval = isProd || !isIntermediateOrSenior;
      return {
        tier: 'MUTATE',
        actionSummary: `Canary Deployment: Deploy canary for "${args.serviceName}" with image "${args.newImage}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Canary deployment in PRODUCTION shifts live traffic. SRE review and human approval required.'
          : isIntermediateOrSenior
          ? 'Intermediate DevOps autonomy: Non-production canary deployment executed autonomously.'
          : 'Deploying a canary workload mutates cluster state and shifts live traffic.',
        requiresApproval,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'chaos_drill') {
      if (isProd) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED Chaos Drill: ${args.action} on "${args.targetWorkload}" in PRODUCTION`,
          reason: 'Chaos engineering drills are strictly prohibited in production clusters by safety policy.',
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: true,
        };
      }
      return {
        tier: 'MUTATE',
        actionSummary: `Chaos Drill: Execute ${args.action} drill on "${args.targetWorkload}" in namespace "${args.namespace || 'default'}"`,
        reason: 'Chaos drill terminates active replicas to evaluate self-healing. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: false,
      };
    }

    if (toolName === 'gitops_create_pr') {
      return {
        tier: 'MUTATE',
        actionSummary: `GitOps: Create branch "${args.branchName}" and open Pull Request for fix`,
        reason: isIntermediateOrSenior
          ? 'Intermediate DevOps autonomy: Creating branches and opening GitOps PRs is permitted autonomously.'
          : 'Creating branches and opening PRs is a safe GitOps practice, but requires operator approval before pushing.',
        requiresApproval: !isIntermediateOrSenior,
        isBlocked: false,
        isProductionWarning: false,
      };
    }

    // 4. Shell command evaluation
    if (toolName === 'shell_exec') {
      const command = (args.command || '').trim();

      // Check dangerous
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          return {
            tier: 'DANGEROUS',
            actionSummary: `BLOCKED command: "${command}"`,
            reason: 'Matches high-risk/destructive policy pattern. Forbidden across all roles.',
            requiresApproval: false,
            isBlocked: true,
            isProductionWarning: isProd,
          };
        }
      }

      // Check mutating
      for (const pattern of MUTATING_PATTERNS) {
        if (pattern.test(command)) {
          const requiresApproval = isProd || !isIntermediateOrSenior;
          return {
            tier: 'MUTATE',
            actionSummary: `Execute mutating command: "${command}"`,
            reason: isProd
              ? `CRITICAL WARNING: Executing mutating command against PRODUCTION cluster/environment: "${command}". Operator confirmation mandatory.`
              : isIntermediateOrSenior
              ? `Intermediate DevOps autonomy: Standard mutating command in non-production executed autonomously: "${command}".`
              : 'Command alters infrastructure or cluster state. User confirmation required.',
            requiresApproval,
            isBlocked: false,
            isProductionWarning: isProd,
          };
        }
      }

      // Default safe shell commands (get, cat, ls, grep, etc.)
      return {
        tier: 'READ',
        actionSummary: `Execute shell command: "${command}"`,
        reason: 'Diagnostic/informational command. Safe to execute autonomously.',
        requiresApproval: false,
        isBlocked: false,
        isProductionWarning: false,
      };
    }

    // Fallback for unknown tools: require approval for safety
    return {
      tier: 'MUTATE',
      actionSummary: `Execute unknown tool: ${toolName}`,
      reason: 'Unknown tool call. Defaults to human approval gate.',
      requiresApproval: true,
      isBlocked: false,
      isProductionWarning: isProd,
    };
  }
}
