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

      return {
        tier: 'MUTATE',
        actionSummary: `Write/modify file: ${filePath}`,
        reason: isProd
          ? 'CRITICAL WARNING: Target environment is PRODUCTION. Modifying files requires explicit operator approval.'
          : 'Modifying files requires user verification to prevent unintended configuration overwrites.',
        requiresApproval: true,
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
      toolName === 'metrics_query' ||
      toolName === 'knowledge_base_search' ||
      toolName === 'generate_postmortem_report'
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
    if (toolName === 'k8s_rollout_restart') {
      return {
        tier: 'MUTATE',
        actionSummary: `Restart Kubernetes workload: ${args.kind || 'deployment'}/${args.name} in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Running in PRODUCTION cluster. Workload restart may cause customer-facing latency or downtime.'
          : 'Restarting workloads can cause transient service disruption and requires user approval.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'gitops_create_pr') {
      return {
        tier: 'MUTATE',
        actionSummary: `GitOps: Create branch "${args.branchName}" and open Pull Request for fix`,
        reason: 'Creating branches and opening PRs is a safe GitOps practice, but requires operator approval before pushing.',
        requiresApproval: true,
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
            reason: 'Matches high-risk/destructive policy pattern. Junior agent is forbidden from running this action.',
            requiresApproval: false,
            isBlocked: true,
            isProductionWarning: isProd,
          };
        }
      }

      // Check mutating
      for (const pattern of MUTATING_PATTERNS) {
        if (pattern.test(command)) {
          return {
            tier: 'MUTATE',
            actionSummary: `Execute mutating command: "${command}"`,
            reason: isProd
              ? `CRITICAL WARNING: Executing mutating command against PRODUCTION cluster/environment: "${command}". Operator confirmation mandatory.`
              : 'Command alters infrastructure or cluster state. User confirmation required.',
            requiresApproval: true,
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
