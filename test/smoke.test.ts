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
import { AgentContext } from '../src/types.js';
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

  console.log('\n\x1b[32mAll 18 enterprise v4.0 feature tests passed successfully!\x1b[0m\n');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
