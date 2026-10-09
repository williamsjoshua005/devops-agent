import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { K8sTool, resolveKubeConfigPath } from '../src/tools/k8s.js';
import { executeTool, TOOL_DEFINITIONS } from '../src/tools/index.js';
import { Guardrails } from '../src/policy/guardrails.js';
import { DevOpsAgentHarness } from '../src/harness/loop.js';
import { LLMClient } from '../src/harness/llm.js';
import { AuditLogger } from '../src/policy/audit.js';
import { AgentContext } from '../src/types.js';

console.log('=== Kubeconfig Specification & Targeting Test Suite ===\n');

async function runTests() {
  const originalKubeconfig = process.env.KUBECONFIG;
  const dummyConfigPath = path.resolve(process.cwd(), 'sb-config');

  // Create a mock sb-config for testing
  const mockConfigContent = `apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: sandbox-cluster
contexts:
- context:
    cluster: sandbox-cluster
    user: sandbox-admin
  name: sb-context
current-context: sb-context
kind: Config
preferences: {}
users:
- name: sandbox-admin
  user:
    token: fake-token
`;
  fs.writeFileSync(dummyConfigPath, mockConfigContent, 'utf-8');

  try {
    // Test 1: resolveKubeConfigPath
    console.log('Test 1: resolveKubeConfigPath resolves relative and custom paths');
    const resolved = resolveKubeConfigPath('sb-config');
    assert.strictEqual(resolved, dummyConfigPath, 'Should resolve local sb-config path');
    console.log('✔ PASS: resolveKubeConfigPath successfully resolved "sb-config"\n');

    // Test 2: K8sTool setKubeconfig and getKubeconfig
    console.log('Test 2: K8sTool.setKubeconfig sets process.env.KUBECONFIG');
    K8sTool.setKubeconfig('sb-config');
    assert.strictEqual(process.env.KUBECONFIG, dummyConfigPath);
    assert.strictEqual(K8sTool.getKubeconfig(), dummyConfigPath);
    console.log('✔ PASS: K8sTool.setKubeconfig sets process.env and internal tracker\n');

    // Test 3: k8s_set_kubeconfig tool exists in catalog
    console.log('Test 3: k8s_set_kubeconfig is registered in tool catalog');
    const setToolDef = TOOL_DEFINITIONS.find((t) => t.name === 'k8s_set_kubeconfig');
    assert.ok(setToolDef, 'k8s_set_kubeconfig should be registered');
    assert.strictEqual(setToolDef.parameters.required[0], 'kubeconfig');
    console.log('✔ PASS: k8s_set_kubeconfig is present in TOOL_DEFINITIONS\n');

    // Test 4: Guardrail policy for k8s_set_kubeconfig
    console.log('Test 4: Guardrail policy evaluates k8s_set_kubeconfig');
    const devContext: AgentContext = {
      cwd: process.cwd(),
      installedTools: ['kubectl'],
      environment: 'development',
      isProduction: false,
      roleLevel: 'intermediate',
    };
    const policyResultDev = Guardrails.evaluate('k8s_set_kubeconfig', { kubeconfig: 'sb-config' }, devContext);
    assert.strictEqual(policyResultDev.tier, 'MUTATE');
    assert.strictEqual(policyResultDev.requiresApproval, false, 'Non-production switch should not require human approval in dev');

    const prodContext: AgentContext = {
      ...devContext,
      environment: 'production',
      isProduction: true,
    };
    const policyResultProd = Guardrails.evaluate('k8s_set_kubeconfig', { kubeconfig: 'prod-cluster.conf' }, prodContext);
    assert.strictEqual(policyResultProd.requiresApproval, true, 'Prod-targeting switch requires operator approval');
    console.log('✔ PASS: Guardrails properly enforce environment safety on k8s_set_kubeconfig\n');

    // Test 5: executeTool executes k8s_set_kubeconfig
    console.log('Test 5: executeTool executes k8s_set_kubeconfig');
    const testContext: AgentContext = {
      cwd: process.cwd(),
      installedTools: ['kubectl'],
      environment: 'development',
      isProduction: false,
    };
    const output = await executeTool('k8s_set_kubeconfig', { kubeconfig: 'sb-config' }, testContext);
    assert.ok(output.includes('Kubeconfig successfully configured'), 'Output should indicate success');
    assert.strictEqual(testContext.kubeconfig, dummyConfigPath);
    console.log('✔ PASS: executeTool("k8s_set_kubeconfig") configures context and environment\n');

    // Test 6: k8s_list_contexts with custom kubeconfig
    console.log('Test 6: k8s_list_contexts accepts custom kubeconfig');
    const listOutput = await executeTool('k8s_list_contexts', { kubeconfig: 'sb-config' }, testContext);
    assert.ok(listOutput.includes('Kubeconfig File:'), 'Output should display active kubeconfig');
    console.log('✔ PASS: k8s_list_contexts includes active kubeconfig metadata\n');

    // Test 7: Harness setKubeconfig
    console.log('Test 7: DevOpsAgentHarness.setKubeconfig updates context and system prompt');
    const dummyLLM = new LLMClient({ provider: 'openai', model: 'mock', apiKey: 'mock' });
    const dummyAudit = new AuditLogger(process.cwd());
    const harness = new DevOpsAgentHarness(dummyLLM, testContext, dummyAudit);

    const harnessResult = await harness.setKubeconfig('sb-config');
    assert.strictEqual(harnessResult.success, true);
    assert.strictEqual(harness.getContext().kubeconfig, dummyConfigPath);
    console.log('✔ PASS: DevOpsAgentHarness.setKubeconfig updates context and prompt\n');

    // Test 8: REPL slash command /kubeconfig
    console.log('Test 8: /kubeconfig REPL slash command returns status and instructions');
    const statusReply = await harness.run({ task: '/kubeconfig' });
    assert.ok(statusReply?.includes('Active Kubeconfig File:'), 'Should report active kubeconfig');
    assert.ok(statusReply?.includes('Usage:'), 'Should provide slash command usage');
    console.log('✔ PASS: /kubeconfig renders active status and guidance\n');

    // Test 9: REPL slash command /kubeconfig <path>
    console.log('Test 9: /kubeconfig <path> switches active kubeconfig');
    const switchReply = await harness.run({ task: '/kubeconfig sb-config' });
    assert.ok(switchReply?.includes('Active Kubeconfig Switched:'), 'Should confirm switch');
    console.log('✔ PASS: /kubeconfig sb-config dynamically switches kubeconfig\n');

    // Test 10: REPL slash command /kubeconfig reset
    console.log('Test 10: /kubeconfig reset restores default kubeconfig');
    const resetReply = await harness.run({ task: '/kubeconfig reset' });
    assert.ok(resetReply?.includes('Reset to default kubeconfig'), 'Should confirm reset');
    assert.strictEqual(harness.getContext().kubeconfig, undefined);
    console.log('✔ PASS: /kubeconfig reset restores default environment\n');

    console.log('====================================================');
    console.log('✔ ALL KUBECONFIG TARGETING TESTS PASSED SUCCESSFULLY');
    console.log('====================================================\n');
  } finally {
    // Cleanup temporary file
    if (fs.existsSync(dummyConfigPath)) {
      fs.unlinkSync(dummyConfigPath);
    }
    if (originalKubeconfig) {
      process.env.KUBECONFIG = originalKubeconfig;
      K8sTool.setKubeconfig(originalKubeconfig);
    } else {
      delete process.env.KUBECONFIG;
      K8sTool.setKubeconfig(undefined);
    }
  }
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
