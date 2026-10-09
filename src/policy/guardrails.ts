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
  /(terraform|tofu)\s+destroy\b/i,
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
  /(terraform|tofu)\s+(apply|init|taint|import|state)\b/i,
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

    const awsEnabled = context?.cloudProviders?.aws ?? (process.env.ENABLE_AWS !== 'false' && process.env.CLOUD_AWS !== 'false');
    const azureEnabled = context?.cloudProviders?.azure ?? (process.env.ENABLE_AZURE !== 'false' && process.env.CLOUD_AZURE !== 'false');
    const gcpEnabled = context?.cloudProviders?.gcp ?? (process.env.ENABLE_GCP !== 'false' && process.env.CLOUD_GCP !== 'false');
    const stickToKubeConfig = context?.stickToKubeConfig ?? (process.env.STICK_TO_KUBECONFIG !== 'false');

    // Cloud Provider Toggles & Grounding Policy
    if (!awsEnabled) {
      if (toolName === 'aws_resource_list' || toolName === 'aws_eks_status' || (toolName === 'cloud_db_snapshot' && args.provider === 'aws')) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED AWS Action: ${toolName}`,
          reason: `AWS cloud provider is turned off in configuration (ENABLE_AWS=false). When investigating Kubernetes tasks, stick strictly to the active kubeconfig context ("${context?.kubeContext || 'current'}").`,
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }
      if (toolName === 'shell_exec' && /^\s*aws\b/i.test(args.command || '')) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED AWS CLI command: "${args.command}"`,
          reason: `AWS cloud provider is turned off in configuration (ENABLE_AWS=false). When investigating Kubernetes tasks, stick strictly to the active kubeconfig context ("${context?.kubeContext || 'current'}").`,
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }
    }

    if (!azureEnabled) {
      if (toolName === 'az_resource_list' || toolName === 'az_aks_status' || (toolName === 'cloud_db_snapshot' && args.provider === 'azure')) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED Azure Action: ${toolName}`,
          reason: `Azure cloud provider is turned off in configuration (ENABLE_AZURE=false). When investigating Kubernetes tasks, stick strictly to the active kubeconfig context ("${context?.kubeContext || 'current'}").`,
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }
      if (toolName === 'shell_exec' && /^\s*az\b/i.test(args.command || '')) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED Azure CLI command: "${args.command}"`,
          reason: `Azure cloud provider is turned off in configuration (ENABLE_AZURE=false). When investigating Kubernetes tasks, stick strictly to the active kubeconfig context ("${context?.kubeContext || 'current'}").`,
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }
    }

    if (!gcpEnabled) {
      if (toolName === 'gcp_resource_list' || toolName === 'gcp_gke_status' || (toolName === 'cloud_db_snapshot' && args.provider === 'gcp')) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED GCP Action: ${toolName}`,
          reason: `GCP cloud provider is turned off in configuration (ENABLE_GCP=false). When investigating Kubernetes tasks, stick strictly to the active kubeconfig context ("${context?.kubeContext || 'current'}").`,
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }
      if (toolName === 'shell_exec' && /^\s*gcloud\b/i.test(args.command || '')) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED GCP CLI command: "${args.command}"`,
          reason: `GCP cloud provider is turned off in configuration (ENABLE_GCP=false). When investigating Kubernetes tasks, stick strictly to the active kubeconfig context ("${context?.kubeContext || 'current'}").`,
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }
    }

    // Stick to Kubeconfig Grounding Policy
    if (stickToKubeConfig && toolName === 'shell_exec') {
      const command = (args.command || '').trim();
      if (/^\s*(aws\s+eks\s+update-kubeconfig|az\s+aks\s+get-credentials|gcloud\s+container\s+clusters\s+get-credentials)\b/i.test(command)) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED Cloud Kubernetes credentials override: "${command}"`,
          reason: `Kubernetes investigation is configured to stick strictly to the active kubeconfig context ("${context?.kubeContext || 'current'}"). Bypassing or modifying kubeconfig credentials via cloud wrapper CLIs is forbidden.`,
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }
    }

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
      toolName === 'k8s_list_contexts' ||
      toolName === 'terraform_plan' ||
      toolName === 'terraform_drift_detect' ||
      toolName === 'helm_diff' ||
      toolName === 'helm_status' ||
      toolName === 'helm_history' ||
      toolName === 'argocd_app_status' ||
      toolName === 'argocd_diff_app' ||
      toolName === 'loki_log_query' ||
      toolName === 'trace_latency_query' ||
      toolName === 'pagerduty_manage' ||
      toolName === 'opsgenie_manage' ||
      toolName === 'velero_backup_check' ||
      toolName === 'ci_pipeline_logs' ||
      toolName === 'k8s_policy_audit' ||
      toolName === 'runbook_list' ||
      toolName === 'runbook_validate' ||
      toolName === 'vault_secret_inspect' ||
      toolName === 'sealed_secrets_check' ||
      toolName === 'external_secrets_check' ||
      toolName === 'service_mesh_diagnose' ||
      toolName === 'terraform_state_inspect' ||
      toolName === 'gitops_verify_pr_checks' ||
      toolName === 'flux_app_status' ||
      toolName === 'helm_template' ||
      toolName === 'helm_values_get' ||
      toolName === 'helm_lint' ||
      toolName === 'kustomize_build' ||
      toolName === 'kustomize_diff' ||
      toolName === 'k8s_event_timeline' ||
      toolName === 'k8s_workload_rightsize' ||
      toolName === 'k8s_hpa_audit' ||
      toolName === 'k8s_network_policy_audit' ||
      toolName === 'container_image_scan' ||
      toolName === 'k8s_diff_resource' ||
      toolName === 'k8s_service_endpoints' ||
      toolName === 'k8s_dns_diagnose' ||
      toolName === 'k8s_cronjob_status' ||
      toolName === 'k8s_node_status' ||
      toolName === 'k8s_pvc_analysis' ||
      toolName === 'k8s_resource_quota_audit' ||
      toolName === 'k8s_job_status' ||
      toolName === 'k8s_configmap_diff' ||
      toolName === 'k8s_env_injection_audit' ||
      toolName === 'k8s_ingress_check' ||
      toolName === 'k8s_multi_cluster_inventory' ||
      toolName === 'k8s_cluster_comparison' ||
      toolName === 'k8s_wait_for_condition' ||
      toolName === 'k8s_scheduling_analysis' ||
      toolName === 'k8s_vpa_recommendations' ||
      toolName === 'k8s_pdb_audit' ||
      toolName === 'k8s_disruption_budget_check' ||
      toolName === 'k8s_secret_rotate_check' ||
      toolName === 'k8s_git_sync_status' ||
      toolName === 'k8s_cost_by_namespace' ||
      toolName === 'k8s_carbon_footprint' ||
      (toolName === 'k8s_pv_cleanup' && args.dryRun !== false) ||
      (toolName === 'k8s_node_drain' && args.dryRun === true) ||
      (toolName === 'k8s_apply_manifest' && args.dryRun !== false && args.dryRun !== 'none') ||
      (toolName === 'terraform_workspace_manage' && (!args.action || args.action === 'list' || args.action === 'show')) ||
      (toolName === 'helm_upgrade_install' && args.dryRun !== false)
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

    if (toolName === 'helm_rollback') {
      return {
        tier: 'MUTATE',
        actionSummary: `Helm Rollback: Rollback release "${args.releaseName}" in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Rolling back a Helm release mutates live workloads.'
          : 'Rolling back Helm release alters cluster workloads and requires human confirmation.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'argocd_sync_app') {
      return {
        tier: 'MUTATE',
        actionSummary: `Argo CD Sync: Reconcile application "${args.appName}" with Git state`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Argo CD sync reconciles live manifests against Git.'
          : 'Triggering Argo CD sync modifies cluster workloads according to Git state. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_debug_pod') {
      return {
        tier: 'MUTATE',
        actionSummary: `Launch ephemeral debug pod attached to "${args.targetPod}" in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'WARNING: Target cluster is PRODUCTION. Spawning diagnostic container requires operator confirmation.'
          : 'Spawning ephemeral diagnostic container in cluster.',
        requiresApproval: isProd,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'velero_create_backup') {
      return {
        tier: 'MUTATE',
        actionSummary: `Velero Disaster Recovery: Create on-demand backup "${args.backupName || 'preflight'}"`,
        reason: 'Initiates a cluster-wide persistent volume and resource backup snapshot.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'cloud_db_snapshot') {
      return {
        tier: 'MUTATE',
        actionSummary: `Cloud Database Snapshot: Trigger point-in-time snapshot for ${String(args.provider || 'cloud').toUpperCase()} database "${args.databaseIdentifier}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target database is in PRODUCTION. Triggering snapshot requires operator confirmation.'
          : 'Triggering database backup snapshot.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'ci_rerun_failed') {
      return {
        tier: 'MUTATE',
        actionSummary: `CI/CD Re-run: Re-trigger failed workflow run #${args.runId}`,
        reason: 'Re-triggering failed CI/CD pipelines consumes build runners and triggers deployment workflows.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'runbook_execute') {
      return {
        tier: 'MUTATE',
        actionSummary: `Execute SRE Runbook "${args.runbookId}" on namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Executing automated runbook mutates live infrastructure.'
          : 'Executing automated SRE runbook steps mutates cluster workloads. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'terraform_apply') {
      return {
        tier: 'MUTATE',
        actionSummary: `Terraform Apply: Apply infrastructure changes in "${args.dirPath || '.'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cloud infrastructure is in PRODUCTION. Applying Terraform changes requires human confirmation.'
          : 'Applying Terraform plan mutates live cloud infrastructure. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'terraform_workspace_manage' && (args.action === 'select' || args.action === 'new')) {
      const requiresApproval = isProd || !isIntermediateOrSenior;
      return {
        tier: 'MUTATE',
        actionSummary: `Terraform Workspace: Switch/create workspace "${args.workspaceName}" in "${args.dirPath || '.'}"`,
        reason: isProd
          ? 'WARNING: Operating in PRODUCTION environment. Changing Terraform state workspace requires operator confirmation.'
          : 'Switching active Terraform workspace.',
        requiresApproval,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'argocd_app_rollback') {
      return {
        tier: 'MUTATE',
        actionSummary: `Argo CD Rollback: Rollback application "${args.appName}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Rolling back Argo CD application mutates cluster workloads.'
          : 'Rolling back Argo CD application mutates cluster workloads according to historical commit. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'flux_sync_reconcile') {
      return {
        tier: 'MUTATE',
        actionSummary: `Flux CD Reconcile: Trigger sync for ${args.kind || 'resource'}/"${args.name}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Flux CD reconciliation triggers immediate GitOps cluster convergence.'
          : 'Triggering Flux CD reconciliation modifies live cluster workloads. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'helm_upgrade_install' && args.dryRun === false) {
      return {
        tier: 'MUTATE',
        actionSummary: `Helm Release Deploy: Live install/upgrade "${args.releaseName}" in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Installing or upgrading Helm release mutates live workloads.'
          : 'Installing or upgrading Helm release alters cluster workloads and requires human confirmation.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_node_cordon') {
      const requiresApproval = isProd || !isIntermediateOrSenior;
      return {
        tier: 'MUTATE',
        actionSummary: `Cordon Kubernetes Node "${args.nodeName}" (Mark unschedulable)`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Cordoning a node halts pod scheduling.'
          : isIntermediateOrSenior
          ? 'Intermediate DevOps autonomy: Non-production node cordon executed autonomously.'
          : 'Cordoning a node prevents new workloads from scheduling. Operator approval required.',
        requiresApproval,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_node_uncordon') {
      const requiresApproval = isProd || !isIntermediateOrSenior;
      return {
        tier: 'MUTATE',
        actionSummary: `Uncordon Kubernetes Node "${args.nodeName}" (Mark schedulable)`,
        reason: isProd
          ? 'WARNING: Target cluster is PRODUCTION. Restoring node scheduling requires operator confirmation.'
          : 'Restoring node pod scheduling capacity.',
        requiresApproval,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_node_drain') {
      return {
        tier: 'MUTATE',
        actionSummary: `Drain Kubernetes Node "${args.nodeName}" (Evict workloads)`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Draining a node evicts live workloads and can breach HA capacity. Mandatory operator confirmation.'
          : 'Draining a node evicts running pods to other nodes. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_ephemeral_debug') {
      return {
        tier: 'MUTATE',
        actionSummary: `Attach ephemeral diagnostic container to "${args.targetPod}" in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'WARNING: Target cluster is PRODUCTION. Attaching diagnostic container to live pod requires operator confirmation.'
          : 'Attaching ephemeral diagnostic container to live pod.',
        requiresApproval: isProd,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_exec') {
      const command = (args.command || '').trim();
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          return {
            tier: 'DANGEROUS',
            actionSummary: `BLOCKED in-pod execution: "${command}" on pod "${args.podName}"`,
            reason: 'Matches high-risk/destructive policy pattern. In-pod execution permanently blocked.',
            requiresApproval: false,
            isBlocked: true,
            isProductionWarning: isProd,
          };
        }
      }

      const requiresApproval = isProd || !isIntermediateOrSenior;
      return {
        tier: 'MUTATE',
        actionSummary: `Execute in-pod command: "${command}" on "${args.namespace || 'default'}/${args.podName}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Executing commands inside production pods requires explicit operator confirmation.'
          : isIntermediateOrSenior
          ? 'Intermediate DevOps autonomy: Non-production container diagnostic command executed autonomously.'
          : 'Executing commands inside containers requires operator confirmation.',
        requiresApproval,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_apply_manifest' && (args.dryRun === false || args.dryRun === 'none')) {
      return {
        tier: 'MUTATE',
        actionSummary: `Live Manifest Apply: "${args.manifestPath || 'Inline Manifest'}" in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Applying live manifests mutates cluster workloads. Mandatory operator approval.'
          : 'Applying live manifests mutates cluster resources. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_delete_resource') {
      const kind = (args.resourceKind || '').toLowerCase();
      if (kind === 'namespace' || kind === 'ns' || kind === 'node' || kind === 'nodes') {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED deletion of cluster-critical resource: ${args.resourceKind}/${args.resourceName}`,
          reason: 'Deleting namespaces or cluster nodes is permanently forbidden across all roles by safety policy.',
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }

      return {
        tier: 'MUTATE',
        actionSummary: `Delete resource: ${args.resourceKind}/${args.resourceName} in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? `CRITICAL WARNING: Target cluster is PRODUCTION. Deleting ${args.resourceKind} "${args.resourceName}" requires operator approval.`
          : `Deleting cluster resource ${args.resourceKind}/${args.resourceName} requires operator confirmation.`,
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_trigger_cronjob') {
      return {
        tier: 'MUTATE',
        actionSummary: `Trigger manual batch Job from CronJob: "${args.cronJobName}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Triggering manual batch jobs consumes cluster worker node capacity.'
          : 'Triggering one-off batch job from CronJob requires operator confirmation.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_port_forward') {
      const port = Number(args.localPort || args.targetPort || 0);
      if (port > 0 && port < 1024) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED Port Forward: Privileged port ${port} on ${args.target || 'workload'}`,
          reason: 'Binding to privileged ports (< 1024) is strictly prohibited by safety policy.',
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }
      return {
        tier: 'MUTATE',
        actionSummary: `Establish Port Forward: localhost:${args.localPort} -> ${args.target}:${args.targetPort} in "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Opening network tunnel to production workload requires operator approval.'
          : 'Port-forwarding establishes an active network tunnel to cluster workloads. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_copy') {
      const src = String(args.source || '');
      const dst = String(args.destination || '');
      const isSensitive =
        src.includes('/etc/shadow') ||
        src.includes('/var/run/secrets') ||
        src.includes('..') ||
        dst.includes('..');

      if (isSensitive) {
        return {
          tier: 'DANGEROUS',
          actionSummary: `BLOCKED Pod File Copy: Sensitive credential access or directory traversal detected ("${src}" -> "${dst}")`,
          reason: 'Accessing service account tokens, shadow credentials, or directory traversal patterns (..) is strictly blocked by safety policy.',
          requiresApproval: false,
          isBlocked: true,
          isProductionWarning: isProd,
        };
      }

      return {
        tier: 'MUTATE',
        actionSummary: `Copy file: "${src}" -> "${dst}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Copying files to or from production containers requires explicit operator approval.'
          : 'Copying files to or from containers modifies local or remote state. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_volume_snapshot') {
      return {
        tier: 'MUTATE',
        actionSummary: `Trigger CSI VolumeSnapshot for PVC "${args.pvcName}" in namespace "${args.namespace || 'default'}"`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Triggering volume snapshots consumes storage I/O and cloud snapshot quotas.'
          : 'Triggering CSI VolumeSnapshot creates persistent storage snapshot resources. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
      };
    }

    if (toolName === 'k8s_pv_cleanup' && (args.dryRun === false || args.dryRun === 'false')) {
      return {
        tier: 'MUTATE',
        actionSummary: `Delete / Reclaim Released PersistentVolumes in cluster`,
        reason: isProd
          ? 'CRITICAL WARNING: Target cluster is PRODUCTION. Deleting PersistentVolumes permanently removes storage resources and associated cloud disks.'
          : 'Reclaiming PersistentVolumes deletes storage resources. Operator confirmation required.',
        requiresApproval: true,
        isBlocked: false,
        isProductionWarning: isProd,
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
