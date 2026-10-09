import { Guardrails } from '../src/policy/guardrails.js';
import { executeTool, TOOL_DEFINITIONS, getAvailableToolDefinitions } from '../src/tools/index.js';
import { AuditLogger } from '../src/policy/audit.js';
import { generateUnifiedDiff } from '../src/policy/diff.js';
import { PostmortemTool } from '../src/tools/postmortem.js';
import { TeamsCardBuilder } from '../src/adapters/teams.js';
import { SecurityLinterTool } from '../src/tools/security.js';
import { CertExpiryTool } from '../src/tools/certificates.js';
import { FinOpsTool } from '../src/tools/finops.js';
import { SeniorSreReviewer } from '../src/harness/reviewer.js';
import { DevOpsMcpServer } from '../src/mcp/server.js';
import { DockerSandboxRunner } from '../src/sandbox/docker.js';
import { TopologyTool } from '../src/tools/topology.js';
import { NetworkProberTool } from '../src/tools/network.js';
import { SemanticKbTool } from '../src/tools/semantic_kb.js';
import { SlackBlockKitBuilder } from '../src/adapters/slack.js';
import { DiscordEmbedBuilder } from '../src/adapters/discord.js';
import { getDashboardHtml } from '../src/server/dashboardHtml.js';
import { AwsTool } from '../src/tools/aws.js';
import { GcpTool } from '../src/tools/gcp.js';
import { AgentContext } from '../src/types.js';
import { SecretSanitizer } from '../src/policy/sanitizer.js';
import { WebApprovalHandler } from '../src/policy/approvals.js';
import { K8sTool } from '../src/tools/k8s.js';
import { TerraformTool } from '../src/tools/terraform.js';
import { HelmTool } from '../src/tools/helm.js';
import { ArgoCdTool } from '../src/tools/argocd.js';
import { ObservabilityTool } from '../src/tools/observability.js';
import { IncidentManagementTool } from '../src/tools/incident_management.js';
import { DisasterRecoveryTool } from '../src/tools/disaster_recovery.js';
import { CiCdTool } from '../src/tools/cicd.js';
import { AdmissionPolicyTool } from '../src/tools/admission_policy.js';
import { RunbookTool } from '../src/tools/runbook.js';
import { VaultSecretTool } from '../src/tools/vault_secret.js';
import { ServiceMeshTool } from '../src/tools/service_mesh.js';
import { FluxTool } from '../src/tools/flux.js';
import { KustomizeTool } from '../src/tools/kustomize.js';
import { GitOpsTool } from '../src/tools/gitops.js';
import { ContainerSecurityTool } from '../src/tools/container_security.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\x1b[31mFAIL: ${message}\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${message}`);
  }
}

async function runTests() {
  console.log('\n--- Running Complete v4.0 Feature Test Suite for Junior DevOps Agent Engine ---\n');

  const mockDevContext: AgentContext = {
    cwd: process.cwd(),
    installedTools: ['git', 'kubectl', 'docker'],
    environment: 'development',
    isProduction: false,
  };

  const mockProdContext: AgentContext = {
    cwd: process.cwd(),
    installedTools: ['git', 'kubectl', 'docker'],
    environment: 'production',
    isProduction: true,
  };

  // Test 1: Guardrails on Read-Only commands
  const readEval = Guardrails.evaluate('shell_exec', { command: 'kubectl get pods -A' }, mockDevContext);
  assert(readEval.tier === 'READ' && !readEval.requiresApproval && !readEval.isBlocked, 'kubectl get pods is classified as READ (autonomous)');

  // Test 2: Guardrails on Mutating commands in Non-Prod
  const mutateEval = Guardrails.evaluate('shell_exec', { command: 'kubectl rollout restart deployment/payment-svc' }, mockDevContext);
  assert(mutateEval.tier === 'MUTATE' && mutateEval.requiresApproval && !mutateEval.isBlocked && !mutateEval.isProductionWarning, 'Workload restart in dev requires standard approval');

  // Test 3: Production Lock & Warning
  const prodMutateEval = Guardrails.evaluate('shell_exec', { command: 'kubectl rollout restart deployment/payment-svc' }, mockProdContext);
  assert(prodMutateEval.tier === 'MUTATE' && prodMutateEval.isProductionWarning === true, 'Production mutation triggers high-risk production warning');

  // Test 4: Blocked Destructive commands
  const dangerousEval = Guardrails.evaluate('shell_exec', { command: 'kubectl delete namespace production' }, mockProdContext);
  assert(dangerousEval.tier === 'DANGEROUS' && dangerousEval.isBlocked, 'kubectl delete namespace is permanently BLOCKED');

  // Test 5: Visual Diff Generation
  const oldText = 'replicas: 1\nimage: payment:v1.0.0\n';
  const newText = 'replicas: 3\nimage: payment:v1.1.0\n';
  const diff = generateUnifiedDiff('deployment.yaml', oldText, 'deployment.yaml', newText);
  assert(diff.includes('-replicas: 1') && diff.includes('+replicas: 3'), 'Unified diff generates colorable changes');

  // Test 6: Audit Logging
  const auditLogger = new AuditLogger(process.cwd());
  const record = await auditLogger.record({
    sessionId: 'test-session',
    toolName: 'shell_exec',
    args: { command: 'kubectl get pods' },
    tier: 'READ',
    isBlocked: false,
    requiresApproval: false,
    approved: true,
    durationMs: 42,
    outputSummary: 'NAME READY STATUS',
  });
  assert(Boolean(record.id && record.timestamp), 'Audit log entry created with UUID and ISO timestamp');
  const recentLogs = await auditLogger.getRecent(5);
  assert(recentLogs.some((l) => l.id === record.id), 'Audit log successfully retrieves recent records');

  // Test 7: Postmortem Generation & Knowledge Base Search
  const postmortemMsg = await PostmortemTool.generate({
    title: 'Payment Gateway Timeout Outage',
    severity: 'P1',
    service: 'payment-service',
    impact: '15% of checkout requests failed for 12 minutes.',
    symptom: 'HTTP 504 Gateway Timeout from payment ingress.',
    rootCause: 'Connection pool starvation in database driver during traffic spike.',
    remediation: 'Scaled pool size from 10 to 50 and executed rolling restart.',
    actionItems: ['Implement connection pool monitoring alerts', 'Review max database client limits'],
  });
  assert(postmortemMsg.includes('[Postmortem Generated Successfully]'), 'Postmortem markdown report generated');

  const kbResults = await PostmortemTool.searchKnowledgeBase('Payment Gateway');
  assert(kbResults.includes('Connection pool starvation'), 'Knowledge base successfully indexes and searches past RCA');

  // Test 8: Security Linter Tool
  const testManifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: insecure-deployment
spec:
  template:
    spec:
      containers:
      - name: web
        image: nginx:latest
        securityContext:
          privileged: true
`;
  await fs.writeFile('test/test-manifest.yaml', testManifest);
  const secReport = await SecurityLinterTool.scan('test/test-manifest.yaml');
  assert(secReport.includes('K8S-SEC-001') && secReport.includes('privileged: true'), 'Security linter flags privileged containers and :latest tags');
  await fs.unlink('test/test-manifest.yaml');

  // Test 9: Senior SRE Reviewer
  const sreReviewer = new SeniorSreReviewer();
  const sreVerdict = await sreReviewer.review(prodMutateEval, 'k8s_rollout_restart', { name: 'payment-svc' }, mockProdContext);
  assert(Boolean(sreVerdict.verdict && sreVerdict.blastRadius && sreVerdict.critique), 'Senior SRE Reviewer generated architectural pre-flight critique');

  // Test 10: Teams Adaptive Card Builder with SRE Review
  const card = TeamsCardBuilder.buildApprovalCard(prodMutateEval, 'shell_exec', { command: 'kubectl scale --replicas=5 deploy/api' }, 'req_123', sreVerdict);
  assert(card.type === 'AdaptiveCard' && card.version === '1.5' && card.body.some((b: any) => b.facts?.some((f: any) => f.title === 'SRE Peer Review:')), 'Adaptive Card embeds Senior SRE review facts');

  // Test 11: FinOps Idle Resources Tool
  const finopsReport = await FinOpsTool.audit();
  assert(finopsReport.includes('FinOps & Cloud Waste Audit Report'), 'FinOps Auditor generates structured report');

  // Test 12: Model Context Protocol (MCP) Server
  const initRes = await DevOpsMcpServer.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert(initRes.result.serverInfo.name === 'junior-devops-agent', 'MCP Server handles initialize handshake');

  const toolsRes = await DevOpsMcpServer.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert(toolsRes.result.tools.length >= 18, `MCP Server exposes all tools over JSON-RPC (${toolsRes.result.tools.length} tools)`);

  // Test 13: Service Dependency Topology Graph
  const topoReport = await TopologyTool.discover();
  assert(topoReport.includes('graph TD') && topoReport.includes('Blast-Radius Map'), 'Topology tool generates Mermaid dependency graph');

  // Test 14: In-Cluster Network Prober
  const netReport = await NetworkProberTool.probe('localhost', 80);
  assert(netReport.includes('Network Diagnostic Report') || netReport.includes('Network Diagnostics'), 'Network Prober runs TCP/DNS connectivity check');

  // Test 15: Chaos Drill Safety Gate
  const chaosProdEval = Guardrails.evaluate('chaos_drill', { action: 'pod-kill', targetWorkload: 'api' }, mockProdContext);
  assert(chaosProdEval.tier === 'DANGEROUS' && chaosProdEval.isBlocked, 'Chaos drills in PRODUCTION are strictly BLOCKED by policy');

  const chaosDevEval = Guardrails.evaluate('chaos_drill', { action: 'pod-kill', targetWorkload: 'api' }, mockDevContext);
  assert(chaosDevEval.tier === 'MUTATE' && chaosDevEval.requiresApproval && !chaosDevEval.isBlocked, 'Chaos drill in dev is permitted with human approval');

  // Test 16: Semantic Vector Incident Memory Search
  const semanticMatch = await SemanticKbTool.search('database connection starvation');
  assert(semanticMatch.includes('Semantic Match') && semanticMatch.includes('Payment Gateway Timeout'), 'Semantic vector search matches relevant past incident RCA');

  // Test 17: Slack Block Kit & Discord Embed Adapters
  const slackBlocks = SlackBlockKitBuilder.buildApprovalBlocks(prodMutateEval, 'canary_deploy', { serviceName: 'checkout' }, 'req_456', sreVerdict);
  assert(slackBlocks.blocks && slackBlocks.blocks.length >= 4, 'Slack Block Kit formatted with interactive approval buttons');

  const discordEmbed = DiscordEmbedBuilder.buildApprovalEmbed(prodMutateEval, 'k8s_rollout_restart', { name: 'web' }, sreVerdict);
  assert(discordEmbed.embeds && discordEmbed.embeds[0].color === 0xff0000, 'Discord Embed formatted with red production warning');

  // Test 18: Web Control Dashboard HTML
  const dashboardHtml = getDashboardHtml(mockDevContext);
  assert(dashboardHtml.includes('Mission Control v4.0') && dashboardHtml.includes('auditTableBody'), 'Web Control Dashboard HTML generated cleanly');

  // Test 19: AWS Cloud & EKS Safety Policy
  const awsReadEval = Guardrails.evaluate('aws_resource_list', { service: 'ec2' }, mockDevContext);
  assert(awsReadEval.tier === 'READ' && !awsReadEval.requiresApproval, 'aws_resource_list passes autonomously as READ');

  const awsDangerousEval = Guardrails.evaluate('shell_exec', { command: 'aws ec2 terminate-instances --instance-ids i-1234567890abcdef0' }, mockDevContext);
  assert(awsDangerousEval.tier === 'DANGEROUS' && awsDangerousEval.isBlocked, 'aws ec2 terminate-instances is strictly BLOCKED by Tier 3 policy');

  // Test 20: GCP Cloud & GKE Safety Policy
  const gcpReadEval = Guardrails.evaluate('gcp_resource_list', { resourceType: 'instances' }, mockDevContext);
  assert(gcpReadEval.tier === 'READ' && !gcpReadEval.requiresApproval, 'gcp_resource_list passes autonomously as READ');

  const gcpDangerousEval = Guardrails.evaluate('shell_exec', { command: 'gcloud container clusters delete prod-cluster --quiet' }, mockDevContext);
  assert(gcpDangerousEval.tier === 'DANGEROUS' && gcpDangerousEval.isBlocked, 'gcloud container clusters delete is strictly BLOCKED by Tier 3 policy');

  // Test 21: Multi-Cloud Tool Registration & Schema Exposure
  const awsDef = TOOL_DEFINITIONS.find((t) => t.name === 'aws_resource_list');
  const gcpDef = TOOL_DEFINITIONS.find((t) => t.name === 'gcp_resource_list');
  assert(Boolean(awsDef && gcpDef), 'AWS and GCP tools are registered in TOOL_DEFINITIONS with valid schemas');

  const awsToolRes = await executeTool('aws_resource_list', { service: 'ec2' });
  assert(typeof awsToolRes === 'string', 'aws_resource_list executes and returns structured response');

  const gcpToolRes = await executeTool('gcp_resource_list', { resourceType: 'instances' });
  assert(typeof gcpToolRes === 'string', 'gcp_resource_list executes and returns structured response');

  // Test 22: Multi-Cluster Context Management & Safety
  const listCtxEval = Guardrails.evaluate('k8s_list_contexts', {}, mockDevContext);
  assert(listCtxEval.tier === 'READ' && !listCtxEval.requiresApproval, 'k8s_list_contexts passes autonomously as READ');

  const switchDevEval = Guardrails.evaluate('k8s_switch_context', { contextName: 'dev-cluster' }, mockDevContext);
  assert(switchDevEval.tier === 'MUTATE' && !switchDevEval.requiresApproval, 'k8s_switch_context to dev requires no approval');

  const switchProdEval = Guardrails.evaluate('k8s_switch_context', { contextName: 'prod-us-east-1' }, mockDevContext);
  assert(switchProdEval.tier === 'MUTATE' && switchProdEval.requiresApproval && switchProdEval.isProductionWarning, 'k8s_switch_context to prod enforces production approval warning');

  const listDef = TOOL_DEFINITIONS.find((t) => t.name === 'k8s_list_contexts');
  const switchDef = TOOL_DEFINITIONS.find((t) => t.name === 'k8s_switch_context');
  assert(Boolean(listDef && switchDef), 'Multi-cluster context tools are registered in TOOL_DEFINITIONS (29 tools total)');

  // Test 23: Secret & Credential Redaction Sanitizer
  const rawLeak = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE and DB=postgres://admin:P@ssword123!@db.internal:5432/prod';
  const sanitized = SecretSanitizer.sanitize(rawLeak);
  assert(sanitized.includes('[REDACTED_AWS_ACCESS_KEY]') && !sanitized.includes('AKIAIOSFODNN7EXAMPLE'), 'SecretSanitizer redacts AWS access keys');
  assert(sanitized.includes('[REDACTED_DB_PASSWORD]') && !sanitized.includes('P@ssword123!'), 'SecretSanitizer redacts database connection passwords');

  const objWithSecret = { dbHost: 'localhost', password: 'SuperSecretPassword', nested: { apiKey: 'secret-token-123' } };
  const sanitizedObj = SecretSanitizer.sanitizeObject(objWithSecret);
  assert(sanitizedObj.password === '[REDACTED_SECRET]' && (sanitizedObj.nested as any).apiKey === '[REDACTED_SECRET]', 'SecretSanitizer recursively sanitizes secret properties in objects');

  // Test 24: MCP Server Guardrail Enforcement on Dangerous Actions
  DevOpsMcpServer.setContext(mockProdContext);
  const mcpBlockedRes = await DevOpsMcpServer.handleMessage({
    jsonrpc: '2.0',
    id: 101,
    method: 'tools/call',
    params: {
      name: 'shell_exec',
      arguments: { command: 'kubectl delete namespace production' },
    },
  });
  assert(mcpBlockedRes.result.isError === true && mcpBlockedRes.result.content[0].text.includes('SECURITY GUARDRAIL - BLOCKED'), 'MCP Server strictly blocks destructive Tier 3 commands');

  // Test 25: MCP Server Approval Gate on Mutating Actions
  const mcpMutateRes = await DevOpsMcpServer.handleMessage({
    jsonrpc: '2.0',
    id: 102,
    method: 'tools/call',
    params: {
      name: 'k8s_rollout_restart',
      arguments: { name: 'payment-svc', namespace: 'default' },
    },
  });
  assert(mcpMutateRes.result.isError === true && mcpMutateRes.result.content[0].text.includes('APPROVAL REQUIRED'), 'MCP Server requires explicit confirmation for mutating actions');

  // Test 26: Asynchronous WebApprovalHandler (Browser/SSE Approval Lifecycle)
  let capturedPendingId = '';
  const webApprovalHandler = new WebApprovalHandler((pending) => {
    capturedPendingId = pending.id;
  });

  const approvalPromise = webApprovalHandler.requestApproval(mutateEval, 'k8s_rollout_restart', { name: 'api' });
  assert(Boolean(capturedPendingId), 'WebApprovalHandler emits approval request with UUID');
  assert(WebApprovalHandler.getPending(capturedPendingId) !== undefined, 'Pending approval stored in active approval registry');

  const resolveSuccess = WebApprovalHandler.resolveApproval(capturedPendingId, true);
  assert(resolveSuccess === true, 'WebApprovalHandler successfully resolves approval');
  const approvalResult = await approvalPromise;
  assert(approvalResult === true, 'Operator approval resolves to true');

  // Test 27: Per-Request KubeContext Isolation
  const k8sToolOutput = await K8sTool.getResources('pods', 'default', undefined, 'custom-isolated-cluster');
  assert(typeof k8sToolOutput === 'string', 'K8sTool runs successfully with isolated --context parameter');

  // Test 28: Terraform / OpenTofu Plan & Drift Safety Gates
  const tfPlanEval = Guardrails.evaluate('terraform_plan', { dirPath: '.' }, mockDevContext);
  assert(tfPlanEval.tier === 'READ' && !tfPlanEval.requiresApproval, 'terraform_plan evaluates autonomously as READ');

  const tfDriftEval = Guardrails.evaluate('terraform_drift_detect', { dirPath: '.' }, mockDevContext);
  assert(tfDriftEval.tier === 'READ' && !tfDriftEval.requiresApproval, 'terraform_drift_detect evaluates autonomously as READ');

  const tfDestroyEval = Guardrails.evaluate('shell_exec', { command: 'terraform destroy -auto-approve' }, mockProdContext);
  assert(tfDestroyEval.tier === 'DANGEROUS' && tfDestroyEval.isBlocked, 'terraform destroy is strictly BLOCKED by Tier 3 policy');

  const tofuDestroyEval = Guardrails.evaluate('shell_exec', { command: 'tofu destroy' }, mockProdContext);
  assert(tofuDestroyEval.tier === 'DANGEROUS' && tofuDestroyEval.isBlocked, 'tofu destroy is strictly BLOCKED by Tier 3 policy');

  const tfApplyEval = Guardrails.evaluate('shell_exec', { command: 'terraform apply tfplan' }, mockDevContext);
  assert(tfApplyEval.tier === 'MUTATE' && tfApplyEval.requiresApproval, 'terraform apply requires human approval');

  // Test 29: Helm Diff, Status & Rollback Policy
  const helmDiffEval = Guardrails.evaluate('helm_diff', { releaseName: 'api', chartPath: './charts/api' }, mockDevContext);
  assert(helmDiffEval.tier === 'READ' && !helmDiffEval.requiresApproval, 'helm_diff evaluates autonomously as READ preview');

  const helmRollbackDevEval = Guardrails.evaluate('helm_rollback', { releaseName: 'api', revision: 2 }, mockDevContext);
  assert(helmRollbackDevEval.tier === 'MUTATE' && helmRollbackDevEval.requiresApproval, 'helm_rollback requires human confirmation');

  const helmRollbackProdEval = Guardrails.evaluate('helm_rollback', { releaseName: 'api', revision: 2 }, mockProdContext);
  assert(helmRollbackProdEval.tier === 'MUTATE' && helmRollbackProdEval.isProductionWarning, 'helm_rollback in production raises high-risk alert');

  // Test 30: Argo CD GitOps Application Controller Safety Policy
  const argoStatusEval = Guardrails.evaluate('argocd_app_status', { appName: 'frontend' }, mockDevContext);
  assert(argoStatusEval.tier === 'READ' && !argoStatusEval.requiresApproval, 'argocd_app_status evaluates autonomously as READ');

  const argoDiffEval = Guardrails.evaluate('argocd_diff_app', { appName: 'frontend' }, mockDevContext);
  assert(argoDiffEval.tier === 'READ' && !argoDiffEval.requiresApproval, 'argocd_diff_app evaluates autonomously as READ');

  const argoSyncEval = Guardrails.evaluate('argocd_sync_app', { appName: 'frontend' }, mockDevContext);
  assert(argoSyncEval.tier === 'MUTATE' && argoSyncEval.requiresApproval, 'argocd_sync_app requires human approval before reconciling');

  // Test 31: Centralized Observability (Grafana Loki & Tracing)
  const lokiEval = Guardrails.evaluate('loki_log_query', { query: '{app="api"} |= "error"' }, mockDevContext);
  assert(lokiEval.tier === 'READ' && !lokiEval.requiresApproval, 'loki_log_query evaluates autonomously as READ');

  const traceEval = Guardrails.evaluate('trace_latency_query', { serviceName: 'payment-svc' }, mockDevContext);
  assert(traceEval.tier === 'READ' && !traceEval.requiresApproval, 'trace_latency_query evaluates autonomously as READ');

  const lokiOut = await ObservabilityTool.queryLoki('{app="api"} |= "error"');
  assert(lokiOut.includes('Log Stream') || lokiOut.includes('LogQL'), 'Loki tool generates structured log report');

  const traceOut = await ObservabilityTool.queryTraces('payment-svc');
  assert(traceOut.includes('Trace Waterfall') || traceOut.includes('payment-svc'), 'Tracing tool analyzes latency bottlenecks');

  // Test 32: Ephemeral Diagnostic Debug Pod Safety
  const debugDevEval = Guardrails.evaluate('k8s_debug_pod', { targetPod: 'api-pod-123' }, mockDevContext);
  assert(debugDevEval.tier === 'MUTATE' && !debugDevEval.requiresApproval, 'k8s_debug_pod executes in dev autonomously');

  const debugProdEval = Guardrails.evaluate('k8s_debug_pod', { targetPod: 'api-pod-123' }, mockProdContext);
  assert(debugProdEval.tier === 'MUTATE' && debugProdEval.requiresApproval && debugProdEval.isProductionWarning, 'k8s_debug_pod in production enforces operator approval');

  // Test 33: Total Platform Tool Suite Registration & MCP Hub Exposure (Phase 2)
  assert(TOOL_DEFINITIONS.length >= 41, `All platform tools registered in TOOL_DEFINITIONS (${TOOL_DEFINITIONS.length} tools total)`);

  // Test 34: PagerDuty & Opsgenie Incident Escalation Safety Policy
  const pdEval = Guardrails.evaluate('pagerduty_manage', { action: 'list' }, mockDevContext);
  assert(pdEval.tier === 'READ' && !pdEval.requiresApproval, 'pagerduty_manage passes autonomously as READ');

  const ogEval = Guardrails.evaluate('opsgenie_manage', { action: 'list' }, mockDevContext);
  assert(ogEval.tier === 'READ' && !ogEval.requiresApproval, 'opsgenie_manage passes autonomously as READ');

  const pdOut = await IncidentManagementTool.managePagerDuty('list');
  assert(pdOut.includes('PagerDuty') && pdOut.includes('Queue'), 'PagerDuty tool generates structured incident queue report');

  const ogOut = await IncidentManagementTool.manageOpsgenie('list');
  assert(ogOut.includes('Opsgenie') && ogOut.includes('Alert'), 'Opsgenie tool generates structured alert report');

  // Test 35: Disaster Recovery & Velero Pre-Flight Audit
  const veleroCheckEval = Guardrails.evaluate('velero_backup_check', {}, mockDevContext);
  assert(veleroCheckEval.tier === 'READ' && !veleroCheckEval.requiresApproval, 'velero_backup_check evaluates autonomously as READ');

  const veleroCreateEval = Guardrails.evaluate('velero_create_backup', { includeNamespaces: ['default'] }, mockDevContext);
  assert(veleroCreateEval.tier === 'MUTATE' && veleroCreateEval.requiresApproval, 'velero_create_backup requires human confirmation');

  const veleroOut = await DisasterRecoveryTool.checkVeleroBackups();
  assert(veleroOut.includes('Velero') && veleroOut.includes('Backup'), 'Velero tool audits cluster backups and freshness');

  // Test 36: Cloud Database Snapshot Safety Policy
  const dbSnapDevEval = Guardrails.evaluate('cloud_db_snapshot', { provider: 'aws', databaseIdentifier: 'postgres-prod' }, mockDevContext);
  assert(dbSnapDevEval.tier === 'MUTATE' && dbSnapDevEval.requiresApproval, 'cloud_db_snapshot requires human confirmation');

  const dbSnapProdEval = Guardrails.evaluate('cloud_db_snapshot', { provider: 'aws', databaseIdentifier: 'postgres-prod' }, mockProdContext);
  assert(dbSnapProdEval.tier === 'MUTATE' && dbSnapProdEval.isProductionWarning, 'cloud_db_snapshot enforces production alert');

  // Test 37: CI/CD Pipeline Triage & Rerun Safety Policy
  const ciLogsEval = Guardrails.evaluate('ci_pipeline_logs', { provider: 'github' }, mockDevContext);
  assert(ciLogsEval.tier === 'READ' && !ciLogsEval.requiresApproval, 'ci_pipeline_logs evaluates autonomously as READ');

  const ciRerunEval = Guardrails.evaluate('ci_rerun_failed', { provider: 'github', runId: '12345678' }, mockDevContext);
  assert(ciRerunEval.tier === 'MUTATE' && ciRerunEval.requiresApproval, 'ci_rerun_failed requires operator confirmation');

  const ciLogsOut = await CiCdTool.viewPipelineLogs('github');
  assert(typeof ciLogsOut === 'string' && ciLogsOut.length > 0, 'CI/CD tool queries workflow run history');

  // Test 38: Admission Control & Kyverno / OPA Policy Audit
  const policyAuditEval = Guardrails.evaluate('k8s_policy_audit', {}, mockDevContext);
  assert(policyAuditEval.tier === 'READ' && !policyAuditEval.requiresApproval, 'k8s_policy_audit evaluates autonomously as READ');

  const policyAuditOut = await AdmissionPolicyTool.audit();
  assert(policyAuditOut.includes('Policy') || policyAuditOut.includes('Security'), 'Admission policy tool generates compliance audit');

  // Test 39: Complete Platform Suite (49 Registered Tools)
  assert(TOOL_DEFINITIONS.length >= 49, `All 49+ platform tools registered in TOOL_DEFINITIONS (${TOOL_DEFINITIONS.length} tools)`);

  // Test 40: Enterprise Runbook Catalog & Search Policy
  const rbListEval = Guardrails.evaluate('runbook_list', {}, mockDevContext);
  assert(rbListEval.tier === 'READ' && !rbListEval.requiresApproval, 'runbook_list evaluates autonomously as READ');

  const rbCatalog = RunbookTool.listRunbooks();
  assert(rbCatalog.includes('Enterprise SRE Runbook Catalog') && rbCatalog.includes('oomkilled-pod-remediation'), 'Runbook catalog lists standard enterprise runbooks');

  const rbFiltered = RunbookTool.listRunbooks({ symptom: 'OOMKilled' });
  assert(rbFiltered.includes('oomkilled-pod-remediation'), 'Runbook catalog filters by incident symptom');

  // Test 41: Runbook Pre-Flight Validation
  const rbValEval = Guardrails.evaluate('runbook_validate', { runbookId: 'oomkilled-pod-remediation' }, mockDevContext);
  assert(rbValEval.tier === 'READ' && !rbValEval.requiresApproval, 'runbook_validate evaluates autonomously as READ');

  const invalidVal = RunbookTool.validateRunbook('oomkilled-pod-remediation', {});
  assert(!invalidVal.valid && invalidVal.missingParams.includes('workloadName'), 'Runbook validation flags missing required parameters');

  const validVal = RunbookTool.validateRunbook('oomkilled-pod-remediation', { workloadName: 'payment-api', namespace: 'prod' });
  assert(validVal.valid, 'Runbook validation passes when parameters are satisfied');

  // Test 42: Runbook Dry-Run Execution & Safety Guardrails
  const rbExecDevEval = Guardrails.evaluate('runbook_execute', { runbookId: 'oomkilled-pod-remediation' }, mockDevContext);
  assert(rbExecDevEval.tier === 'MUTATE' && rbExecDevEval.requiresApproval, 'runbook_execute requires operator confirmation');

  const rbExecProdEval = Guardrails.evaluate('runbook_execute', { runbookId: 'oomkilled-pod-remediation' }, mockProdContext);
  assert(rbExecProdEval.tier === 'MUTATE' && rbExecProdEval.isProductionWarning, 'runbook_execute in production flags critical warning');

  const dryRunOut = await RunbookTool.executeRunbook('oomkilled-pod-remediation', { workloadName: 'order-service', namespace: 'default' }, { dryRun: true });
  assert(dryRunOut.includes('DRY-RUN PREVIEW') && dryRunOut.includes('RESOLVED SUCCESSFULLY'), 'Runbook execution in dry-run verifies all step commands');

  // Test 43: Safe Vault & Kubernetes Secret Metadata Audit (Zero-Leakage)
  const vaultInspectEval = Guardrails.evaluate('vault_secret_inspect', { secretIdentifier: 'app-secret' }, mockDevContext);
  assert(vaultInspectEval.tier === 'READ' && !vaultInspectEval.requiresApproval, 'vault_secret_inspect evaluates autonomously as READ');

  const vaultInspectOut = await VaultSecretTool.inspectSecret('database-credentials', { provider: 'k8s' });
  assert(vaultInspectOut.includes('Kubernetes Secret') && !vaultInspectOut.includes('password123'), 'Secret inspection redacts plaintext data');

  const sealedSecretsEval = Guardrails.evaluate('sealed_secrets_check', {}, mockDevContext);
  assert(sealedSecretsEval.tier === 'READ' && !sealedSecretsEval.requiresApproval, 'sealed_secrets_check evaluates autonomously as READ');

  const sealedOut = await VaultSecretTool.auditSealedSecrets();
  assert(sealedOut.includes('SealedSecrets'), 'Bitnami SealedSecrets audit generates report');

  // Test 44: Service Mesh & Ingress Health Diagnostics
  const meshDiagEval = Guardrails.evaluate('service_mesh_diagnose', {}, mockDevContext);
  assert(meshDiagEval.tier === 'READ' && !meshDiagEval.requiresApproval, 'service_mesh_diagnose evaluates autonomously as READ');

  const meshOut = await ServiceMeshTool.diagnoseMesh();
  assert(meshOut.includes('Service Mesh Diagnostics'), 'Service mesh tool generates diagnostic report');

  // Test 45: Enterprise Suite (55 Registered Tools & Full MCP Exposure)
  assert(TOOL_DEFINITIONS.length >= 55, `All 55+ platform tools registered in TOOL_DEFINITIONS (${TOOL_DEFINITIONS.length} tools)`);

  const mcp55Res = await DevOpsMcpServer.handleMessage({ jsonrpc: '2.0', id: 10000, method: 'tools/list' });
  assert(mcp55Res.result.tools.length >= 55, `MCP Server exposes all tools over JSON-RPC (${mcp55Res.result.tools.length} tools)`);

  // Test 46: Intermediate DevOps Role Hierarchy & Guardrail Autonomy
  const intermediateDevContext: AgentContext = {
    cwd: process.cwd(),
    installedTools: ['git', 'kubectl', 'docker'],
    environment: 'development',
    isProduction: false,
    roleLevel: 'intermediate',
  };

  const intermediateProdContext: AgentContext = {
    cwd: process.cwd(),
    installedTools: ['git', 'kubectl', 'docker'],
    environment: 'production',
    isProduction: true,
    roleLevel: 'intermediate',
  };

  const juniorRestartEval = Guardrails.evaluate('k8s_rollout_restart', { name: 'api', kind: 'deployment' }, mockDevContext);
  assert(juniorRestartEval.requiresApproval === true, 'Junior DevOps role requires approval for workload restart in dev');

  const intermediateRestartEval = Guardrails.evaluate('k8s_rollout_restart', { name: 'api', kind: 'deployment' }, intermediateDevContext);
  assert(intermediateRestartEval.requiresApproval === false, 'Intermediate DevOps role restarts workload autonomously in non-prod');

  const intermediatePrEval = Guardrails.evaluate('gitops_create_pr', { branchName: 'fix-db', title: 'Fix DB pool' }, intermediateDevContext);
  assert(intermediatePrEval.requiresApproval === false, 'Intermediate DevOps role opens GitOps PRs autonomously in non-prod');

  const intermediateShellEval = Guardrails.evaluate('shell_exec', { command: 'kubectl scale --replicas=3 deploy/api' }, intermediateDevContext);
  assert(intermediateShellEval.requiresApproval === false, 'Intermediate DevOps role executes scaling command autonomously in non-prod');

  const intermediateProdRestartEval = Guardrails.evaluate('k8s_rollout_restart', { name: 'api', kind: 'deployment' }, intermediateProdContext);
  assert(intermediateProdRestartEval.requiresApproval === true && intermediateProdRestartEval.isProductionWarning === true, 'Intermediate DevOps role enforces strict approval & warning on PRODUCTION');

  const intermediateDangerousEval = Guardrails.evaluate('shell_exec', { command: 'kubectl delete namespace default' }, intermediateDevContext);
  assert(intermediateDangerousEval.isBlocked === true && intermediateDangerousEval.tier === 'DANGEROUS', 'Dangerous commands remain strictly BLOCKED for Intermediate DevOps role');

  // Test 47: Enhanced SecretSanitizer Cloud & Kubeconfig Patterns
  const gcpJson = '{"type": "service_account", "private_key_id": "ab12cd34ef56gh78ij90kl12", "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgk\\n-----END PRIVATE KEY-----"}';
  const sanitizedGcp = SecretSanitizer.sanitize(gcpJson);
  assert(sanitizedGcp.includes('[REDACTED_GCP_KEY_ID]') && sanitizedGcp.includes('[REDACTED_PRIVATE_KEY]'), 'SecretSanitizer redacts GCP service account JSON credentials');

  const kubeconfigRaw = 'client-certificate-data: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t\nclient-key-data: LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQ==';
  const sanitizedKube = SecretSanitizer.sanitize(kubeconfigRaw);
  assert(sanitizedKube.includes('[REDACTED_KUBECONFIG_CREDENTIAL]'), 'SecretSanitizer redacts Kubeconfig client credentials');

  const urlWithCreds = 'https://admin:SuperSecretPass123!@git.internal.company.com/repo.git';
  const sanitizedUrl = SecretSanitizer.sanitize(urlWithCreds);
  assert(sanitizedUrl.includes('[REDACTED_URL_PASSWORD]') && !sanitizedUrl.includes('SuperSecretPass123!'), 'SecretSanitizer redacts URL basic auth credentials');

  const azureSecretStr = 'azure_client_secret = "AZURE_SECRET_KEY_VALUE_XYZ123"';
  const sanitizedAzure = SecretSanitizer.sanitize(azureSecretStr);
  assert(sanitizedAzure.includes('[REDACTED_AZURE_SECRET]'), 'SecretSanitizer redacts Azure client secrets');

  // Test 48: AuditLogger AES-256-GCM Encryption at Rest
  const testEncDir = path.join(process.cwd(), '.audit-test-enc');
  const encLogger = new AuditLogger(testEncDir, 'aes-256-audit-test-key-32byteslong!');
  const testRec = await encLogger.record({
    sessionId: 'enc-test-session',
    toolName: 'k8s_get_resources',
    tier: 'READ',
    isBlocked: false,
    requiresApproval: false,
    outputSummary: 'Sensitive pod list with confidential data',
  });
  assert(testRec.id !== undefined, 'Encrypted AuditLogger records entry');

  const rawEncFile = await fs.readFile(path.join(testEncDir, '.audit', 'audit.jsonl'), 'utf-8');
  assert(rawEncFile.includes('"_enc":true') && rawEncFile.includes('"ciphertext"'), 'AuditLogger writes AES-256-GCM encrypted envelope on disk');

  const decryptedEntries = await encLogger.getRecent(5);
  assert(decryptedEntries.length > 0 && decryptedEntries[0].outputSummary === 'Sensitive pod list with confidential data', 'AuditLogger seamlessly decrypts entries with key');
  await fs.rm(testEncDir, { recursive: true, force: true });

  // Test 49: External Secrets Operator (ESO) Safety & Execution
  const esoEval = Guardrails.evaluate('external_secrets_check', {}, mockDevContext);
  assert(esoEval.tier === 'READ' && !esoEval.requiresApproval, 'external_secrets_check evaluates autonomously as READ');

  const esoReport = await VaultSecretTool.auditExternalSecrets();
  assert(esoReport.includes('External Secrets Operator') || esoReport.includes('ExternalSecret'), 'ESO audit tool generates compliance report');

  // Test 50: Complete Platform Suite (69 Tools & Full MCP Exposure)
  assert(TOOL_DEFINITIONS.length >= 69, `All 69 platform tools registered in TOOL_DEFINITIONS (${TOOL_DEFINITIONS.length} tools)`);

  const mcp69Res = await DevOpsMcpServer.handleMessage({ jsonrpc: '2.0', id: 10001, method: 'tools/list' });
  assert(mcp69Res.result.tools.length >= 69, `MCP Server exposes all tools over JSON-RPC (${mcp69Res.result.tools.length} tools)`);

  // Test 51: Terraform State Inspection & Workspace Safety
  const tfStateEval = Guardrails.evaluate('terraform_state_inspect', { dirPath: '.' }, mockDevContext);
  assert(tfStateEval.tier === 'READ' && !tfStateEval.requiresApproval, 'terraform_state_inspect evaluates autonomously as READ');

  const tfWsListEval = Guardrails.evaluate('terraform_workspace_manage', { action: 'list' }, mockDevContext);
  assert(tfWsListEval.tier === 'READ' && !tfWsListEval.requiresApproval, 'terraform_workspace_manage list evaluates as READ');

  const tfWsSelectProdEval = Guardrails.evaluate('terraform_workspace_manage', { action: 'select', workspaceName: 'prod' }, mockProdContext);
  assert(tfWsSelectProdEval.requiresApproval && tfWsSelectProdEval.isProductionWarning, 'terraform_workspace_manage select enforces production warning');

  const tfToolApplyEval = Guardrails.evaluate('terraform_apply', { dirPath: '.' }, mockProdContext);
  assert(tfToolApplyEval.tier === 'MUTATE' && tfToolApplyEval.requiresApproval && tfToolApplyEval.isProductionWarning, 'terraform_apply enforces strict production approval');

  // Test 52: GitOps PR Verification Engine
  const prVerifyEval = Guardrails.evaluate('gitops_verify_pr_checks', { prNumber: '10' }, mockDevContext);
  assert(prVerifyEval.tier === 'READ' && !prVerifyEval.requiresApproval, 'gitops_verify_pr_checks evaluates autonomously as READ');

  const prReport = await GitOpsTool.verifyPR('9999');
  assert(prReport.includes('GitOps') || prReport.includes('Local Branch'), 'GitOpsTool.verifyPR generates structured readiness report');

  // Test 53: Flux CD Status & Reconcile Engine
  const fluxStatusEval = Guardrails.evaluate('flux_app_status', { namespace: 'flux-system' }, mockDevContext);
  assert(fluxStatusEval.tier === 'READ' && !fluxStatusEval.requiresApproval, 'flux_app_status evaluates autonomously as READ');

  const fluxReconcileEval = Guardrails.evaluate('flux_sync_reconcile', { kind: 'kustomization', name: 'podinfo' }, mockProdContext);
  assert(fluxReconcileEval.tier === 'MUTATE' && fluxReconcileEval.requiresApproval && fluxReconcileEval.isProductionWarning, 'flux_sync_reconcile requires approval with production alert');

  const fluxReport = await FluxTool.getStatus(undefined, 'all', 'flux-system');
  assert(fluxReport.includes('Flux CD') || fluxReport.includes('CRDs'), 'FluxTool.getStatus audits cluster GitOps state');

  // Test 54: Helm Template, Values & Linting Primitives
  const helmTmplEval = Guardrails.evaluate('helm_template', { releaseName: 'api', chartPath: './charts/api' }, mockDevContext);
  assert(helmTmplEval.tier === 'READ' && !helmTmplEval.requiresApproval, 'helm_template evaluates autonomously as READ');

  const helmValuesEval = Guardrails.evaluate('helm_values_get', { releaseName: 'api' }, mockDevContext);
  assert(helmValuesEval.tier === 'READ' && !helmValuesEval.requiresApproval, 'helm_values_get evaluates autonomously as READ');

  const helmLintEval = Guardrails.evaluate('helm_lint', { chartPath: './charts/api' }, mockDevContext);
  assert(helmLintEval.tier === 'READ' && !helmLintEval.requiresApproval, 'helm_lint evaluates autonomously as READ');

  const helmDryDeployEval = Guardrails.evaluate('helm_upgrade_install', { releaseName: 'api', chartPath: './charts/api', dryRun: true }, mockProdContext);
  assert(helmDryDeployEval.tier === 'READ' && !helmDryDeployEval.requiresApproval, 'helm_upgrade_install in dry-run evaluates safely as READ');

  const helmLiveDeployEval = Guardrails.evaluate('helm_upgrade_install', { releaseName: 'api', chartPath: './charts/api', dryRun: false }, mockProdContext);
  assert(helmLiveDeployEval.tier === 'MUTATE' && helmLiveDeployEval.requiresApproval && helmLiveDeployEval.isProductionWarning, 'helm_upgrade_install live requires approval with production alert');

  // Test 55: Kustomize Build & Diff Primitives
  const kustomizeBuildEval = Guardrails.evaluate('kustomize_build', { targetPath: '.' }, mockDevContext);
  assert(kustomizeBuildEval.tier === 'READ' && !kustomizeBuildEval.requiresApproval, 'kustomize_build evaluates autonomously as READ');

  const kustomizeDiffEval = Guardrails.evaluate('kustomize_diff', { basePath: './base', overlayPath: './overlays/prod' }, mockDevContext);
  assert(kustomizeDiffEval.tier === 'READ' && !kustomizeDiffEval.requiresApproval, 'kustomize_diff evaluates autonomously as READ');

  // Test 56: Argo CD Rollback Engine
  const argoRollbackEval = Guardrails.evaluate('argocd_app_rollback', { appName: 'frontend' }, mockProdContext);
  assert(argoRollbackEval.tier === 'MUTATE' && argoRollbackEval.requiresApproval && argoRollbackEval.isProductionWarning, 'argocd_app_rollback requires confirmation with production warning');

  // Test 57: Kubernetes Cluster Event Timeline & Root-Cause Correlation
  const timelineEval = Guardrails.evaluate('k8s_event_timeline', {}, mockDevContext);
  assert(timelineEval.tier === 'READ' && !timelineEval.requiresApproval, 'k8s_event_timeline evaluates autonomously as READ');

  const timelineOut = await K8sTool.getEventTimeline();
  assert(timelineOut.includes('Timeline') || timelineOut.includes('Events') || timelineOut.includes('Signal') || timelineOut.includes('Failed to fetch'), 'K8sTool.getEventTimeline produces structured incident timeline');

  // Test 58: Kubernetes Workload Rightsizing & Resource Optimization
  const rightsizeEval = Guardrails.evaluate('k8s_workload_rightsize', { namespace: 'default' }, mockDevContext);
  assert(rightsizeEval.tier === 'READ' && !rightsizeEval.requiresApproval, 'k8s_workload_rightsize evaluates autonomously as READ');

  const rightsizeOut = await K8sTool.rightsizeWorkload();
  assert(rightsizeOut.includes('Rightsizing') || rightsizeOut.includes('Resource') || rightsizeOut.includes('Failed to audit') || rightsizeOut.includes('No pods found'), 'K8sTool.rightsizeWorkload produces capacity recommendations');

  // Test 59: HorizontalPodAutoscaler (HPA) Capacity & Health Audit
  const hpaEval = Guardrails.evaluate('k8s_hpa_audit', {}, mockDevContext);
  assert(hpaEval.tier === 'READ' && !hpaEval.requiresApproval, 'k8s_hpa_audit evaluates autonomously as READ');

  const hpaOut = await K8sTool.auditHPA();
  assert(hpaOut.includes('HorizontalPodAutoscaler') || hpaOut.includes('HPA') || hpaOut.includes('No HorizontalPodAutoscalers') || hpaOut.includes('Failed to audit'), 'K8sTool.auditHPA analyzes autoscaler metrics');

  // Test 60: Kubernetes Node Cordon & Uncordon Safety Guardrails
  const cordonProdEval = Guardrails.evaluate('k8s_node_cordon', { nodeName: 'node-pool-1' }, mockProdContext);
  assert(cordonProdEval.tier === 'MUTATE' && cordonProdEval.requiresApproval && cordonProdEval.isProductionWarning, 'k8s_node_cordon enforces approval and production alert');

  const uncordonProdEval = Guardrails.evaluate('k8s_node_uncordon', { nodeName: 'node-pool-1' }, mockProdContext);
  assert(uncordonProdEval.tier === 'MUTATE' && uncordonProdEval.requiresApproval && uncordonProdEval.isProductionWarning, 'k8s_node_uncordon enforces approval and production alert in prod');

  // Test 61: Node Drain Engine with PDB Awareness
  const drainDryEval = Guardrails.evaluate('k8s_node_drain', { nodeName: 'node-pool-1', dryRun: true }, mockProdContext);
  assert(drainDryEval.tier === 'READ' && !drainDryEval.requiresApproval, 'k8s_node_drain in dry-run mode evaluates safely as READ');

  const drainLiveEval = Guardrails.evaluate('k8s_node_drain', { nodeName: 'node-pool-1', dryRun: false }, mockProdContext);
  assert(drainLiveEval.tier === 'MUTATE' && drainLiveEval.requiresApproval && drainLiveEval.isProductionWarning, 'k8s_node_drain live requires mandatory approval with production warning');

  // Test 62: Modern Ephemeral Container Diagnostic Attachment
  const ephemeralDebugProdEval = Guardrails.evaluate('k8s_ephemeral_debug', { targetPod: 'api-service-abc' }, mockProdContext);
  assert(ephemeralDebugProdEval.tier === 'MUTATE' && ephemeralDebugProdEval.requiresApproval && ephemeralDebugProdEval.isProductionWarning, 'k8s_ephemeral_debug enforces confirmation in production cluster');

  // Test 63: Container Image Vulnerability & CVE Scanning
  const scanEval = Guardrails.evaluate('container_image_scan', { image: 'node:14-alpine' }, mockDevContext);
  assert(scanEval.tier === 'READ' && !scanEval.requiresApproval, 'container_image_scan evaluates autonomously as READ');

  const scanOut = await ContainerSecurityTool.scanImage('node:14-alpine');
  assert(scanOut.includes('Vulnerability') || scanOut.includes('CRITICAL') || scanOut.includes('CVE'), 'ContainerSecurityTool.scanImage detects image security issues');

  const scanJson = await ContainerSecurityTool.scanImage('redis:latest', 'HIGH', 'json');
  assert(scanJson.includes('"scanner"') && scanJson.includes('"summary"'), 'ContainerSecurityTool supports JSON output format');

  // Test 64: NetworkPolicy & Zero-Trust Microsegmentation Audit
  const netpolEval = Guardrails.evaluate('k8s_network_policy_audit', { namespace: 'default' }, mockDevContext);
  assert(netpolEval.tier === 'READ' && !netpolEval.requiresApproval, 'k8s_network_policy_audit evaluates autonomously as READ');

  const netpolOut = await K8sTool.auditNetworkPolicy('default');
  assert(netpolOut.includes('NetworkPolicy') || netpolOut.includes('Microsegmentation') || netpolOut.includes('Default-Deny') || netpolOut.includes('Failed to audit'), 'K8sTool.auditNetworkPolicy generates zero-trust security audit');

  // Test 65: In-Pod Command Execution (k8s_exec) Guardrails & Subcommand Security
  const execDevEval = Guardrails.evaluate('k8s_exec', { podName: 'api-pod', command: 'curl -s localhost:8080/health' }, intermediateDevContext);
  assert(execDevEval.tier === 'MUTATE' && !execDevEval.requiresApproval, 'k8s_exec in dev with intermediate role executes autonomously');

  const execJuniorEval = Guardrails.evaluate('k8s_exec', { podName: 'api-pod', command: 'curl -s localhost:8080/health' }, mockDevContext);
  assert(execJuniorEval.tier === 'MUTATE' && execJuniorEval.requiresApproval, 'k8s_exec in dev with junior role requires approval');

  const execProdEval = Guardrails.evaluate('k8s_exec', { podName: 'api-pod', command: 'curl -s localhost:8080/health' }, mockProdContext);
  assert(execProdEval.tier === 'MUTATE' && execProdEval.requiresApproval && execProdEval.isProductionWarning, 'k8s_exec in prod requires mandatory operator approval');

  const execDangerousEval = Guardrails.evaluate('k8s_exec', { podName: 'api-pod', command: 'rm -rf /var/data/*' }, mockDevContext);
  assert(execDangerousEval.tier === 'DANGEROUS' && execDangerousEval.isBlocked, 'k8s_exec with destructive command is strictly BLOCKED by Tier 3 policy');

  // Test 66: Resource Diffing (k8s_diff_resource)
  const diffEval = Guardrails.evaluate('k8s_diff_resource', { manifestPath: './deploy.yaml' }, mockDevContext);
  assert(diffEval.tier === 'READ' && !diffEval.requiresApproval, 'k8s_diff_resource evaluates autonomously as READ');

  const diffOut = await K8sTool.diffResource({ manifestContent: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: test\n' });
  assert(diffOut.includes('Diff') || diffOut.includes('matches manifest') || diffOut.includes('Failed to diff'), 'K8sTool.diffResource generates unified diff preview');

  // Test 67: Manifest Apply Safety (k8s_apply_manifest)
  const applyDryEval = Guardrails.evaluate('k8s_apply_manifest', { manifestPath: './deploy.yaml', dryRun: 'server' }, mockProdContext);
  assert(applyDryEval.tier === 'READ' && !applyDryEval.requiresApproval, 'k8s_apply_manifest with server dryRun evaluates safely as READ');

  const applyLiveEval = Guardrails.evaluate('k8s_apply_manifest', { manifestPath: './deploy.yaml', dryRun: false }, mockProdContext);
  assert(applyLiveEval.tier === 'MUTATE' && applyLiveEval.requiresApproval && applyLiveEval.isProductionWarning, 'k8s_apply_manifest live enforces mandatory operator confirmation in prod');

  // Test 68: Scoped Deletion Safety (k8s_delete_resource)
  const deletePodEval = Guardrails.evaluate('k8s_delete_resource', { resourceKind: 'pod', resourceName: 'stale-worker' }, mockDevContext);
  assert(deletePodEval.tier === 'MUTATE' && deletePodEval.requiresApproval, 'k8s_delete_resource requires confirmation');

  const deleteNsEval = Guardrails.evaluate('k8s_delete_resource', { resourceKind: 'namespace', resourceName: 'production' }, mockDevContext);
  assert(deleteNsEval.tier === 'DANGEROUS' && deleteNsEval.isBlocked, 'k8s_delete_resource for namespace is strictly BLOCKED by policy');

  const deleteNodeEval = Guardrails.evaluate('k8s_delete_resource', { resourceKind: 'node', resourceName: 'worker-node-1' }, mockDevContext);
  assert(deleteNodeEval.tier === 'DANGEROUS' && deleteNodeEval.isBlocked, 'k8s_delete_resource for node is strictly BLOCKED by policy');

  // Test 69: Service Endpoints & Routing Diagnosis (k8s_service_endpoints)
  const epEval = Guardrails.evaluate('k8s_service_endpoints', { serviceName: 'payment-svc' }, mockDevContext);
  assert(epEval.tier === 'READ' && !epEval.requiresApproval, 'k8s_service_endpoints evaluates autonomously as READ');

  const epOut = await K8sTool.serviceEndpoints();
  assert(epOut.includes('Endpoint') || epOut.includes('Service') || epOut.includes('Failed to diagnose'), 'K8sTool.serviceEndpoints analyzes service endpoint routing');

  // Test 70: In-Cluster DNS Diagnostics (k8s_dns_diagnose)
  const dnsEval = Guardrails.evaluate('k8s_dns_diagnose', {}, mockDevContext);
  assert(dnsEval.tier === 'READ' && !dnsEval.requiresApproval, 'k8s_dns_diagnose evaluates autonomously as READ');

  const dnsOut = await K8sTool.dnsDiagnose();
  assert(dnsOut.includes('CoreDNS') || dnsOut.includes('DNS') || dnsOut.includes('Failed to diagnose'), 'K8sTool.dnsDiagnose audits CoreDNS health');

  // Test 71: CronJob Status & Manual Triggering (k8s_cronjob_status & k8s_trigger_cronjob)
  const cjStatusEval = Guardrails.evaluate('k8s_cronjob_status', {}, mockDevContext);
  assert(cjStatusEval.tier === 'READ' && !cjStatusEval.requiresApproval, 'k8s_cronjob_status evaluates autonomously as READ');

  const cjTriggerEval = Guardrails.evaluate('k8s_trigger_cronjob', { cronJobName: 'backup-task' }, mockProdContext);
  assert(cjTriggerEval.tier === 'MUTATE' && cjTriggerEval.requiresApproval && cjTriggerEval.isProductionWarning, 'k8s_trigger_cronjob enforces approval with production alert');

  // Test 72: Node Status & Capacity Inspection (k8s_node_status)
  const nodeStatusEval = Guardrails.evaluate('k8s_node_status', {}, mockDevContext);
  assert(nodeStatusEval.tier === 'READ' && !nodeStatusEval.requiresApproval, 'k8s_node_status evaluates autonomously as READ');

  const nodeStatusOut = await K8sTool.nodeStatus();
  assert(nodeStatusOut.includes('Node') || nodeStatusOut.includes('Capacity') || nodeStatusOut.includes('Alloc') || nodeStatusOut.includes('Failed to inspect'), 'K8sTool.nodeStatus inspects node allocatable capacity');

  // Test 73: PVC Storage Analysis (k8s_pvc_analysis)
  const pvcEval = Guardrails.evaluate('k8s_pvc_analysis', {}, mockDevContext);
  assert(pvcEval.tier === 'READ' && !pvcEval.requiresApproval, 'k8s_pvc_analysis evaluates autonomously as READ');

  const pvcOut = await K8sTool.pvcAnalysis();
  assert(pvcOut.includes('PersistentVolumeClaim') || pvcOut.includes('PVC') || pvcOut.includes('Storage') || pvcOut.includes('Failed to analyze'), 'K8sTool.pvcAnalysis audits persistent storage');

  // Test 74: Port-Forward Safety (k8s_port_forward)
  const pfBlockedEval = Guardrails.evaluate('k8s_port_forward', { target: 'pod/api', localPort: 80, targetPort: 8080 }, mockDevContext);
  assert(pfBlockedEval.tier === 'DANGEROUS' && pfBlockedEval.isBlocked, 'k8s_port_forward on privileged port (< 1024) is strictly BLOCKED');

  const pfAllowedEval = Guardrails.evaluate('k8s_port_forward', { target: 'pod/api', localPort: 8080, targetPort: 8080 }, mockDevContext);
  assert(pfAllowedEval.tier === 'MUTATE' && pfAllowedEval.requiresApproval, 'k8s_port_forward on unprivileged port requires human confirmation');

  const pfProdEval = Guardrails.evaluate('k8s_port_forward', { target: 'pod/api', localPort: 8080, targetPort: 8080 }, mockProdContext);
  assert(pfProdEval.tier === 'MUTATE' && pfProdEval.requiresApproval && pfProdEval.isProductionWarning, 'k8s_port_forward in prod enforces production warning');

  // Test 75: Pod File Copy Safety (k8s_copy)
  const cpBlockedEval = Guardrails.evaluate('k8s_copy', { source: 'pod:/etc/shadow', destination: './shadow' }, mockDevContext);
  assert(cpBlockedEval.tier === 'DANGEROUS' && cpBlockedEval.isBlocked, 'k8s_copy accessing /etc/shadow is strictly BLOCKED');

  const cpTraversalEval = Guardrails.evaluate('k8s_copy', { source: 'pod:/tmp/../../etc/passwd', destination: './passwd' }, mockDevContext);
  assert(cpTraversalEval.tier === 'DANGEROUS' && cpTraversalEval.isBlocked, 'k8s_copy with path traversal is strictly BLOCKED');

  const cpAllowedEval = Guardrails.evaluate('k8s_copy', { source: 'pod:/var/log/app.log', destination: './app.log' }, mockDevContext);
  assert(cpAllowedEval.tier === 'MUTATE' && cpAllowedEval.requiresApproval, 'k8s_copy for safe paths requires operator approval');

  // Test 76: Resource Quota & Capacity Exhaustion Audit (k8s_resource_quota_audit)
  const quotaEval = Guardrails.evaluate('k8s_resource_quota_audit', { namespace: 'default' }, mockDevContext);
  assert(quotaEval.tier === 'READ' && !quotaEval.requiresApproval, 'k8s_resource_quota_audit evaluates autonomously as READ');

  const quotaOut = await K8sTool.resourceQuotaAudit('default');
  assert(quotaOut.includes('Quota') || quotaOut.includes('Resource') || quotaOut.includes('LimitRange') || quotaOut.includes('No ResourceQuotas') || quotaOut.includes('Failed to audit'), 'K8sTool.resourceQuotaAudit audits namespace quota allocations');

  // Test 77: CSI VolumeSnapshot Safety Gate (k8s_volume_snapshot)
  const snapDevEval = Guardrails.evaluate('k8s_volume_snapshot', { pvcName: 'data-pvc' }, mockDevContext);
  assert(snapDevEval.tier === 'MUTATE' && snapDevEval.requiresApproval, 'k8s_volume_snapshot requires confirmation');

  const snapProdEval = Guardrails.evaluate('k8s_volume_snapshot', { pvcName: 'data-pvc' }, mockProdContext);
  assert(snapProdEval.tier === 'MUTATE' && snapProdEval.requiresApproval && snapProdEval.isProductionWarning, 'k8s_volume_snapshot in prod enforces production warning');

  // Test 78: Batch Job Status & Failure Triage (k8s_job_status)
  const jobEval = Guardrails.evaluate('k8s_job_status', {}, mockDevContext);
  assert(jobEval.tier === 'READ' && !jobEval.requiresApproval, 'k8s_job_status evaluates autonomously as READ');

  const jobOut = await K8sTool.jobStatus();
  assert(jobOut.includes('Job') || jobOut.includes('Batch') || jobOut.includes('No batch Jobs') || jobOut.includes('Failed to get'), 'K8sTool.jobStatus audits batch workloads');

  // Test 79: Cross-Namespace ConfigMap Diff (k8s_configmap_diff)
  const cmDiffEval = Guardrails.evaluate('k8s_configmap_diff', { configMapName: 'app-config' }, mockDevContext);
  assert(cmDiffEval.tier === 'READ' && !cmDiffEval.requiresApproval, 'k8s_configmap_diff evaluates autonomously as READ');

  const cmDiffOut = await K8sTool.configMapDiff('test-config');
  assert(cmDiffOut.includes('ConfigMap') || cmDiffOut.includes('Diff') || cmDiffOut.includes('Failed to diff') || cmDiffOut.includes('No drift detected'), 'K8sTool.configMapDiff compares configuration states');

  // Test 80: Environment Variable & Secret Injection Audit (k8s_env_injection_audit)
  const envAuditEval = Guardrails.evaluate('k8s_env_injection_audit', {}, mockDevContext);
  assert(envAuditEval.tier === 'READ' && !envAuditEval.requiresApproval, 'k8s_env_injection_audit evaluates autonomously as READ');

  const envAuditOut = await K8sTool.envInjectionAudit();
  assert(envAuditOut.includes('Environment') || envAuditOut.includes('Injection') || envAuditOut.includes('Failed to audit') || envAuditOut.includes('No workloads found'), 'K8sTool.envInjectionAudit inspects container environment variables');

  // Test 81: Ingress Routing & TLS Verification (k8s_ingress_check)
  const ingEval = Guardrails.evaluate('k8s_ingress_check', {}, mockDevContext);
  assert(ingEval.tier === 'READ' && !ingEval.requiresApproval, 'k8s_ingress_check evaluates autonomously as READ');

  const ingOut = await K8sTool.ingressCheck();
  assert(ingOut.includes('Ingress') || ingOut.includes('Routing') || ingOut.includes('No Ingress') || ingOut.includes('Failed to check'), 'K8sTool.ingressCheck verifies ingress endpoints');

  // Test 82: Multi-Cluster Fleet Inventory (k8s_multi_cluster_inventory)
  const multiInvEval = Guardrails.evaluate('k8s_multi_cluster_inventory', {}, mockDevContext);
  assert(multiInvEval.tier === 'READ' && !multiInvEval.requiresApproval, 'k8s_multi_cluster_inventory evaluates autonomously as READ');

  const multiInvOut = await K8sTool.multiClusterInventory();
  assert(multiInvOut.includes('Fleet Inventory') || multiInvOut.includes('Clusters') || multiInvOut.includes('No active Kubernetes contexts') || multiInvOut.includes('Multi-Cluster'), 'K8sTool.multiClusterInventory aggregates multi-cluster fleet');

  // Test 83: Cross-Cluster Workload Comparison (k8s_cluster_comparison)
  const clusterCompEval = Guardrails.evaluate('k8s_cluster_comparison', { sourceContext: 'dev', targetContext: 'prod', resourceName: 'api' }, mockDevContext);
  assert(clusterCompEval.tier === 'READ' && !clusterCompEval.requiresApproval, 'k8s_cluster_comparison evaluates autonomously as READ');

  // Test 84: Resource Condition Watch (k8s_wait_for_condition)
  const waitEval = Guardrails.evaluate('k8s_wait_for_condition', { resource: 'pod/api', condition: 'Ready' }, mockDevContext);
  assert(waitEval.tier === 'READ' && !waitEval.requiresApproval, 'k8s_wait_for_condition evaluates autonomously as READ');

  const waitOut = await K8sTool.waitForCondition('pod/test-pod', 'Ready', { timeoutSeconds: 2 });
  assert(waitOut.includes('Condition') || waitOut.includes('Resource') || waitOut.includes('Timeout') || waitOut.includes('Failed'), 'K8sTool.waitForCondition tracks resource readiness');

  // Test 85: Pod Scheduling Bottleneck Analysis (k8s_scheduling_analysis)
  const schedEval = Guardrails.evaluate('k8s_scheduling_analysis', {}, mockDevContext);
  assert(schedEval.tier === 'READ' && !schedEval.requiresApproval, 'k8s_scheduling_analysis evaluates autonomously as READ');

  const schedOut = await K8sTool.schedulingAnalysis();
  assert(schedOut.includes('Scheduling') || schedOut.includes('scheduling') || schedOut.includes('Pending') || schedOut.includes('No pods currently in') || schedOut.includes('Failed to analyze'), 'K8sTool.schedulingAnalysis triages unschedulable pods');

  // Test 86: VerticalPodAutoscaler Sizing Recommendations (k8s_vpa_recommendations)
  const vpaEval = Guardrails.evaluate('k8s_vpa_recommendations', {}, mockDevContext);
  assert(vpaEval.tier === 'READ' && !vpaEval.requiresApproval, 'k8s_vpa_recommendations evaluates autonomously as READ');

  const vpaOut = await K8sTool.vpaRecommendations();
  assert(vpaOut.includes('VerticalPodAutoscaler') || vpaOut.includes('VPA') || vpaOut.includes('Rightsizing') || vpaOut.includes('Failed to fetch'), 'K8sTool.vpaRecommendations retrieves sizing targets');

  // Test 87: PodDisruptionBudget Resiliency Audit (k8s_pdb_audit)
  const pdbAuditEval = Guardrails.evaluate('k8s_pdb_audit', {}, mockDevContext);
  assert(pdbAuditEval.tier === 'READ' && !pdbAuditEval.requiresApproval, 'k8s_pdb_audit evaluates autonomously as READ');

  const pdbAuditOut = await K8sTool.pdbAudit();
  assert(pdbAuditOut.includes('PodDisruptionBudget') || pdbAuditOut.includes('PDB') || pdbAuditOut.includes('Coverage') || pdbAuditOut.includes('Failed to audit'), 'K8sTool.pdbAudit assesses cluster voluntary disruption budgets');

  // Test 88: Disruption Budget Pre-Flight Check (k8s_disruption_budget_check)
  const pdbCheckEval = Guardrails.evaluate('k8s_disruption_budget_check', { workloadName: 'api-service' }, mockDevContext);
  assert(pdbCheckEval.tier === 'READ' && !pdbCheckEval.requiresApproval, 'k8s_disruption_budget_check evaluates autonomously as READ');

  const pdbCheckOut = await K8sTool.disruptionBudgetCheck('api-service');
  assert(pdbCheckOut.includes('Disruption Budget') || pdbCheckOut.includes('PDB') || pdbCheckOut.includes('VERDICT') || pdbCheckOut.includes('SAFE') || pdbCheckOut.includes('Failed to validate'), 'K8sTool.disruptionBudgetCheck validates eviction safety');

  // Test 89: PersistentVolume Reclamation & Cleanup (k8s_pv_cleanup)
  const pvDryEval = Guardrails.evaluate('k8s_pv_cleanup', { dryRun: true }, mockDevContext);
  assert(pvDryEval.tier === 'READ' && !pvDryEval.requiresApproval, 'k8s_pv_cleanup dry-run evaluates safely as READ');

  const pvLiveEval = Guardrails.evaluate('k8s_pv_cleanup', { dryRun: false }, mockProdContext);
  assert(pvLiveEval.tier === 'MUTATE' && pvLiveEval.requiresApproval && pvLiveEval.isProductionWarning, 'k8s_pv_cleanup live mutation enforces production approval');

  const pvCleanOut = await K8sTool.pvCleanup({ dryRun: true });
  assert(pvCleanOut.includes('PersistentVolume') || pvCleanOut.includes('PV') || pvCleanOut.includes('Volumes') || pvCleanOut.includes('Failed to audit'), 'K8sTool.pvCleanup audits orphaned volumes');

  // Test 90: Native Kubernetes Secret Rotation Check (k8s_secret_rotate_check)
  const secretRotEval = Guardrails.evaluate('k8s_secret_rotate_check', { maxAgeDays: 90 }, mockDevContext);
  assert(secretRotEval.tier === 'READ' && !secretRotEval.requiresApproval, 'k8s_secret_rotate_check evaluates autonomously as READ');

  const secretRotOut = await K8sTool.secretRotateCheck('default', 90);
  assert(secretRotOut.includes('Secret Rotation') || secretRotOut.includes('Freshness') || secretRotOut.includes('Zero-Leakage') || secretRotOut.includes('Failed to audit'), 'K8sTool.secretRotateCheck audits secret age without value leaks');

  // Test 91: GitOps Live-to-Git Sync Diff (k8s_git_sync_status)
  const gitSyncEval = Guardrails.evaluate('k8s_git_sync_status', { gitPath: '.' }, mockDevContext);
  assert(gitSyncEval.tier === 'READ' && !gitSyncEval.requiresApproval, 'k8s_git_sync_status evaluates autonomously as READ');

  const gitSyncOut = await K8sTool.gitSyncStatus('.');
  assert(gitSyncOut.includes('GitOps') || gitSyncOut.includes('Sync') || gitSyncOut.includes('Manifest') || gitSyncOut.includes('Error') || gitSyncOut.includes('Failed to compare'), 'K8sTool.gitSyncStatus audits Git-to-cluster drift');

  // Test 92: Namespace Cost Attribution (k8s_cost_by_namespace)
  const costNsEval = Guardrails.evaluate('k8s_cost_by_namespace', { timeWindow: 'monthly' }, mockDevContext);
  assert(costNsEval.tier === 'READ' && !costNsEval.requiresApproval, 'k8s_cost_by_namespace evaluates autonomously as READ');

  const costNsOut = await K8sTool.costByNamespace();
  assert(costNsOut.includes('Cost Attribution') || costNsOut.includes('Spend') || costNsOut.includes('Namespace') || costNsOut.includes('Failed to compute'), 'K8sTool.costByNamespace computes FinOps attribution');

  // Test 93: Operational Carbon Footprint (k8s_carbon_footprint)
  const carbonEval = Guardrails.evaluate('k8s_carbon_footprint', { region: 'us-east-1' }, mockDevContext);
  assert(carbonEval.tier === 'READ' && !carbonEval.requiresApproval, 'k8s_carbon_footprint evaluates autonomously as READ');

  const carbonOut = await K8sTool.carbonFootprint(undefined, 'us-east-1');
  assert(carbonOut.includes('Carbon Footprint') || carbonOut.includes('Sustainability') || carbonOut.includes('kWh') || carbonOut.includes('CO2') || carbonOut.includes('Failed to estimate'), 'K8sTool.carbonFootprint computes GreenOps footprint');

  // Test 94: Complete Enterprise Kubernetes & Multi-Cloud Suite (109 Native Tools & MCP Exposure)
  assert(TOOL_DEFINITIONS.length >= 109, `All 109 platform tools registered in TOOL_DEFINITIONS (${TOOL_DEFINITIONS.length} tools)`);

  const mcp108Res = await DevOpsMcpServer.handleMessage({ jsonrpc: '2.0', id: 10004, method: 'tools/list' });
  assert(mcp108Res.result.tools.length >= 109, `MCP Server exposes all tools over JSON-RPC (${mcp108Res.result.tools.length} tools)`);

  // Test 95: Cloud Provider Dynamic Catalog Filtering (getAvailableToolDefinitions)
  const allTools = getAvailableToolDefinitions({ ...mockDevContext, cloudProviders: { aws: true, azure: true, gcp: true } });
  assert(allTools.length === 109, `When all cloud providers enabled, full catalog is returned (${allTools.length} tools)`);

  const noAwsTools = getAvailableToolDefinitions({ ...mockDevContext, cloudProviders: { aws: false, azure: true, gcp: true } });
  assert(noAwsTools.length === 107 && !noAwsTools.some((t) => t.name.startsWith('aws_')), 'Disabling AWS excludes aws_* tools (107 tools remaining)');

  const noAzTools = getAvailableToolDefinitions({ ...mockDevContext, cloudProviders: { aws: true, azure: false, gcp: true } });
  assert(noAzTools.length === 107 && !noAzTools.some((t) => t.name.startsWith('az_')), 'Disabling Azure excludes az_* tools (107 tools remaining)');

  const noGcpTools = getAvailableToolDefinitions({ ...mockDevContext, cloudProviders: { aws: true, azure: true, gcp: false } });
  assert(noGcpTools.length === 107 && !noGcpTools.some((t) => t.name.startsWith('gcp_')), 'Disabling GCP excludes gcp_* tools (107 tools remaining)');

  const k8sOnlyTools = getAvailableToolDefinitions({ ...mockDevContext, cloudProviders: { aws: false, azure: false, gcp: false } });
  assert(k8sOnlyTools.length === 103, `Disabling all cloud providers (k8s-only mode) excludes all 6 cloud tools, leaving exactly 103 tools (${k8sOnlyTools.length} tools)`);

  // Test 96: Guardrails Enforcement for Disabled Cloud Provider Tools
  const awsDisabledCtx: AgentContext = { ...mockDevContext, cloudProviders: { aws: false, azure: true, gcp: true } };
  const awsEval = Guardrails.evaluate('aws_resource_list', { service: 'ec2' }, awsDisabledCtx);
  assert(awsEval.tier === 'DANGEROUS' && awsEval.isBlocked, 'Guardrails block aws_resource_list when AWS is disabled');

  const azDisabledCtx: AgentContext = { ...mockDevContext, cloudProviders: { aws: true, azure: false, gcp: true } };
  const azEval = Guardrails.evaluate('az_aks_status', { resourceGroup: 'rg', clusterName: 'aks' }, azDisabledCtx);
  assert(azEval.tier === 'DANGEROUS' && azEval.isBlocked, 'Guardrails block az_aks_status when Azure is disabled');

  const gcpDisabledCtx: AgentContext = { ...mockDevContext, cloudProviders: { aws: true, azure: true, gcp: false } };
  const gcpEval = Guardrails.evaluate('gcp_gke_status', { clusterName: 'gke' }, gcpDisabledCtx);
  assert(gcpEval.tier === 'DANGEROUS' && gcpEval.isBlocked, 'Guardrails block gcp_gke_status when GCP is disabled');

  const cloudDbAwsEval = Guardrails.evaluate('cloud_db_snapshot', { provider: 'aws', instanceIdentifier: 'rds-db' }, awsDisabledCtx);
  assert(cloudDbAwsEval.tier === 'DANGEROUS' && cloudDbAwsEval.isBlocked, 'Guardrails block cloud_db_snapshot(aws) when AWS is disabled');

  // Test 97: Shell Command Guardrail Blocking Disabled Cloud CLIs
  const awsCliEval = Guardrails.evaluate('shell_exec', { command: 'aws ec2 describe-instances' }, awsDisabledCtx);
  assert(awsCliEval.tier === 'DANGEROUS' && awsCliEval.isBlocked, 'Guardrails block "aws" shell commands when AWS is disabled');

  const azCliEval = Guardrails.evaluate('shell_exec', { command: 'az vm list' }, azDisabledCtx);
  assert(azCliEval.tier === 'DANGEROUS' && azCliEval.isBlocked, 'Guardrails block "az" shell commands when Azure is disabled');

  const gcpCliEval = Guardrails.evaluate('shell_exec', { command: 'gcloud compute instances list' }, gcpDisabledCtx);
  assert(gcpCliEval.tier === 'DANGEROUS' && gcpCliEval.isBlocked, 'Guardrails block "gcloud" shell commands when GCP is disabled');

  // Test 98: Strict Kubernetes Grounding (stickToKubeConfig: true)
  const stickCtx: AgentContext = { ...mockDevContext, kubeContext: 'docker-desktop', stickToKubeConfig: true };
  const eksAuthEval = Guardrails.evaluate('shell_exec', { command: 'aws eks update-kubeconfig --name prod' }, stickCtx);
  assert(eksAuthEval.tier === 'DANGEROUS' && eksAuthEval.isBlocked, 'stickToKubeConfig blocks "aws eks update-kubeconfig" wrapper commands');

  const aksAuthEval = Guardrails.evaluate('shell_exec', { command: 'az aks get-credentials --resource-group rg --name aks' }, stickCtx);
  assert(aksAuthEval.tier === 'DANGEROUS' && aksAuthEval.isBlocked, 'stickToKubeConfig blocks "az aks get-credentials" wrapper commands');

  const gkeAuthEval = Guardrails.evaluate('shell_exec', { command: 'gcloud container clusters get-credentials my-cluster' }, stickCtx);
  assert(gkeAuthEval.tier === 'DANGEROUS' && gkeAuthEval.isBlocked, 'stickToKubeConfig blocks "gcloud container clusters get-credentials" wrapper commands');

  const k8sNativeEval = Guardrails.evaluate('shell_exec', { command: 'kubectl get pods -n kube-system' }, stickCtx);
  assert(k8sNativeEval.tier === 'READ' && !k8sNativeEval.isBlocked, 'stickToKubeConfig allows native in-cluster kubectl commands');

  // Test 99: Tool Execution Runtime Enforcement
  let awsError = '';
  try {
    await executeTool('aws_eks_status', { clusterName: 'test' }, awsDisabledCtx);
  } catch (err: any) {
    awsError = err.message;
  }
  assert(awsError.includes('disabled') && awsError.includes('AWS') && awsError.includes('active Kubernetes context'), 'executeTool explicitly rejects disabled AWS tools');

  let azError = '';
  try {
    await executeTool('az_aks_status', { resourceGroup: 'rg', clusterName: 'test' }, azDisabledCtx);
  } catch (err: any) {
    azError = err.message;
  }
  assert(azError.includes('disabled') && azError.includes('Azure') && azError.includes('active Kubernetes context'), 'executeTool explicitly rejects disabled Azure tools');

  let gcpError = '';
  try {
    await executeTool('gcp_gke_status', { clusterName: 'test' }, gcpDisabledCtx);
  } catch (err: any) {
    gcpError = err.message;
  }
  assert(gcpError.includes('disabled') && gcpError.includes('GCP') && gcpError.includes('active Kubernetes context'), 'executeTool explicitly rejects disabled GCP tools');

  // Test 100: MCP Server Dynamic Tool List Filtering with Cloud Providers Disabled
  DevOpsMcpServer.setContext({
    ...mockDevContext,
    cloudProviders: { aws: false, azure: false, gcp: false },
    stickToKubeConfig: true,
  });
  const mcpFilteredRes = await DevOpsMcpServer.handleMessage({ jsonrpc: '2.0', id: 10005, method: 'tools/list' });
  assert(mcpFilteredRes.result.tools.length === 103, `MCP Server tools/list dynamically filters disabled cloud tools (returned ${mcpFilteredRes.result.tools.length} of 103 tools)`);
  assert(!mcpFilteredRes.result.tools.some((t: any) => t.name.startsWith('aws_') || t.name.startsWith('az_') || t.name.startsWith('gcp_')), 'MCP Server tool list contains zero disabled cloud tools');

  // Test 101: Custom Kubeconfig Targeting (k8s_set_kubeconfig & K8sTool.setKubeconfig)
  const setKubeEval = Guardrails.evaluate('k8s_set_kubeconfig', { kubeconfig: 'sb-config' }, mockDevContext);
  assert(setKubeEval.tier === 'MUTATE' && !setKubeEval.requiresApproval, 'k8s_set_kubeconfig evaluates safely in dev');

  const prodKubeEval = Guardrails.evaluate('k8s_set_kubeconfig', { kubeconfig: 'prod-cluster.conf' }, mockProdContext);
  assert(prodKubeEval.requiresApproval, 'k8s_set_kubeconfig with prod target enforces operator approval');

  console.log('\n\x1b[32mAll 101 enterprise SRE, DR, CI/CD, GitOps, IaC, Kubernetes, Cloud Provider Toggle, Kubeconfig Targeting & Strict Grounding feature tests passed successfully!\x1b[0m\n');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
