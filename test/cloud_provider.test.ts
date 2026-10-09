import { Guardrails } from '../src/policy/guardrails.js';
import { executeTool, TOOL_DEFINITIONS, getAvailableToolDefinitions } from '../src/tools/index.js';
import { DevOpsMcpServer } from '../src/mcp/server.js';
import { AgentContext } from '../src/types.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\x1b[31mFAIL: ${message}\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${message}`);
  }
}

async function runCloudProviderTests() {
  console.log('\n--- Running Cloud Provider Toggle & Kubeconfig Grounding Unit Tests ---\n');

  const baseContext: AgentContext = {
    cwd: process.cwd(),
    installedTools: ['git', 'kubectl', 'docker'],
    environment: 'development',
    isProduction: false,
    kubeContext: 'docker-desktop',
  };

  // 1. Tool catalog dynamic filtering
  const allTools = getAvailableToolDefinitions({ ...baseContext, cloudProviders: { aws: true, azure: true, gcp: true } });
  assert(allTools.length === 108, `Full catalog returns all 108 tools when all providers enabled (${allTools.length})`);

  const noAws = getAvailableToolDefinitions({ ...baseContext, cloudProviders: { aws: false, azure: true, gcp: true } });
  assert(noAws.length === 106 && !noAws.some((t) => t.name.startsWith('aws_')), 'Disabling AWS excludes aws_* tools (106 tools remaining)');

  const noAzure = getAvailableToolDefinitions({ ...baseContext, cloudProviders: { aws: true, azure: false, gcp: true } });
  assert(noAzure.length === 106 && !noAzure.some((t) => t.name.startsWith('az_')), 'Disabling Azure excludes az_* tools (106 tools remaining)');

  const noGcp = getAvailableToolDefinitions({ ...baseContext, cloudProviders: { aws: true, azure: true, gcp: false } });
  assert(noGcp.length === 106 && !noGcp.some((t) => t.name.startsWith('gcp_')), 'Disabling GCP excludes gcp_* tools (106 tools remaining)');

  const k8sOnly = getAvailableToolDefinitions({ ...baseContext, cloudProviders: { aws: false, azure: false, gcp: false } });
  assert(k8sOnly.length === 102, `Disabling all cloud providers excludes all 6 cloud tools, leaving exactly 102 tools (${k8sOnly.length})`);

  // 2. Guardrails on disabled cloud tools
  const awsOffCtx: AgentContext = { ...baseContext, cloudProviders: { aws: false, azure: true, gcp: true } };
  const awsEval = Guardrails.evaluate('aws_resource_list', { service: 'ec2' }, awsOffCtx);
  assert(awsEval.tier === 'DANGEROUS' && awsEval.isBlocked, 'Guardrails block aws_resource_list when AWS disabled');

  const azOffCtx: AgentContext = { ...baseContext, cloudProviders: { aws: true, azure: false, gcp: true } };
  const azEval = Guardrails.evaluate('az_aks_status', { resourceGroup: 'rg', clusterName: 'aks' }, azOffCtx);
  assert(azEval.tier === 'DANGEROUS' && azEval.isBlocked, 'Guardrails block az_aks_status when Azure disabled');

  const gcpOffCtx: AgentContext = { ...baseContext, cloudProviders: { aws: true, azure: true, gcp: false } };
  const gcpEval = Guardrails.evaluate('gcp_gke_status', { clusterName: 'gke' }, gcpOffCtx);
  assert(gcpEval.tier === 'DANGEROUS' && gcpEval.isBlocked, 'Guardrails block gcp_gke_status when GCP disabled');

  const cloudDbAwsEval = Guardrails.evaluate('cloud_db_snapshot', { provider: 'aws', instanceIdentifier: 'db' }, awsOffCtx);
  assert(cloudDbAwsEval.tier === 'DANGEROUS' && cloudDbAwsEval.isBlocked, 'Guardrails block cloud_db_snapshot(aws) when AWS disabled');

  // 3. Shell CLI commands guardrail
  const awsCli = Guardrails.evaluate('shell_exec', { command: 'aws ec2 describe-instances' }, awsOffCtx);
  assert(awsCli.tier === 'DANGEROUS' && awsCli.isBlocked, 'Guardrails block "aws" shell commands when AWS disabled');

  const azCli = Guardrails.evaluate('shell_exec', { command: 'az vm list' }, azOffCtx);
  assert(azCli.tier === 'DANGEROUS' && azCli.isBlocked, 'Guardrails block "az" shell commands when Azure disabled');

  const gcpCli = Guardrails.evaluate('shell_exec', { command: 'gcloud compute instances list' }, gcpOffCtx);
  assert(gcpCli.tier === 'DANGEROUS' && gcpCli.isBlocked, 'Guardrails block "gcloud" shell commands when GCP disabled');

  // 4. Strict Kubernetes Grounding (stickToKubeConfig)
  const stickCtx: AgentContext = { ...baseContext, stickToKubeConfig: true };
  const eksAuth = Guardrails.evaluate('shell_exec', { command: 'aws eks update-kubeconfig --name prod' }, stickCtx);
  assert(eksAuth.tier === 'DANGEROUS' && eksAuth.isBlocked, 'stickToKubeConfig blocks "aws eks update-kubeconfig"');

  const aksAuth = Guardrails.evaluate('shell_exec', { command: 'az aks get-credentials --resource-group rg --name aks' }, stickCtx);
  assert(aksAuth.tier === 'DANGEROUS' && aksAuth.isBlocked, 'stickToKubeConfig blocks "az aks get-credentials"');

  const gkeAuth = Guardrails.evaluate('shell_exec', { command: 'gcloud container clusters get-credentials my-cluster' }, stickCtx);
  assert(gkeAuth.tier === 'DANGEROUS' && gkeAuth.isBlocked, 'stickToKubeConfig blocks "gcloud container clusters get-credentials"');

  const allowedK8s = Guardrails.evaluate('shell_exec', { command: 'kubectl get pods -A' }, stickCtx);
  assert(allowedK8s.tier === 'READ' && !allowedK8s.isBlocked, 'stickToKubeConfig permits standard kubectl commands');

  // 5. Runtime Tool Execution Enforcement
  let awsThrown = '';
  try {
    await executeTool('aws_eks_status', { clusterName: 'test' }, awsOffCtx);
  } catch (e: any) {
    awsThrown = e.message;
  }
  assert(awsThrown.includes('disabled') && awsThrown.includes('AWS'), 'executeTool throws when AWS tool is invoked while disabled');

  let azThrown = '';
  try {
    await executeTool('az_aks_status', { resourceGroup: 'rg', clusterName: 'test' }, azOffCtx);
  } catch (e: any) {
    azThrown = e.message;
  }
  assert(azThrown.includes('disabled') && azThrown.includes('Azure'), 'executeTool throws when Azure tool is invoked while disabled');

  let gcpThrown = '';
  try {
    await executeTool('gcp_gke_status', { clusterName: 'test' }, gcpOffCtx);
  } catch (e: any) {
    gcpThrown = e.message;
  }
  assert(gcpThrown.includes('disabled') && gcpThrown.includes('GCP'), 'executeTool throws when GCP tool is invoked while disabled');

  // 6. MCP Server Dynamic Tool List Filtering
  DevOpsMcpServer.setContext({
    ...baseContext,
    cloudProviders: { aws: false, azure: false, gcp: false },
    stickToKubeConfig: true,
  });
  const mcpRes = await DevOpsMcpServer.handleMessage({ jsonrpc: '2.0', id: 8888, method: 'tools/list' });
  assert(mcpRes.result.tools.length === 102, `MCP Server lists 102 tools in k8s-only mode (${mcpRes.result.tools.length})`);
  assert(!mcpRes.result.tools.some((t: any) => t.name.startsWith('aws_') || t.name.startsWith('az_') || t.name.startsWith('gcp_')), 'MCP tools/list contains no disabled cloud tools');

  console.log('\n\x1b[32mAll Cloud Provider & Kubeconfig Grounding Unit Tests Passed Successfully!\x1b[0m\n');
}

runCloudProviderTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
