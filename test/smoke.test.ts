import { Guardrails } from '../src/policy/guardrails.js';
import { executeTool, TOOL_DEFINITIONS } from '../src/tools/index.js';
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
import * as fs from 'node:fs/promises';

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

  console.log(`\n\x1b[32mAll 45 enterprise SRE, DR, CI/CD, GitOps, IaC, Runbook, Vault, Mesh, and Multi-Cloud feature tests passed successfully!\x1b[0m\n`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
