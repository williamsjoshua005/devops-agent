import { Guardrails } from '../src/policy/guardrails.js';
import { executeTool, TOOL_DEFINITIONS } from '../src/tools/index.js';
import { AuditLogger } from '../src/policy/audit.js';
import { generateUnifiedDiff } from '../src/policy/diff.js';
import { PostmortemTool } from '../src/tools/postmortem.js';
import { TeamsCardBuilder } from '../src/adapters/teams.js';
import { AlertWebhookServer } from '../src/server/webhook.js';
import { AgentContext } from '../src/types.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\x1b[31mFAIL: ${message}\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${message}`);
  }
}

async function runTests() {
  console.log('\n--- Running Complete Feature Test Suite for Junior DevOps Agent Engine ---\n');

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

  // Test 8: Teams Adaptive Card Builder
  const card = TeamsCardBuilder.buildApprovalCard(prodMutateEval, 'shell_exec', { command: 'kubectl scale --replicas=5 deploy/api' }, 'req_123');
  assert(card.type === 'AdaptiveCard' && card.version === '1.5' && card.actions!.length === 2, 'Microsoft Teams Adaptive Card built with approval actions');

  // Test 9: Tool Definitions
  assert(TOOL_DEFINITIONS.length >= 10, `Tool definitions registered (${TOOL_DEFINITIONS.length} tools)`);

  // Test 10: File Tool Execution
  const fileContent = await executeTool('file_read', { path: 'package.json' });
  assert(fileContent.includes('junior-devops-agent'), 'FileTool correctly reads package.json');

  console.log('\n\x1b[32mAll 10 feature tests passed successfully!\x1b[0m\n');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
