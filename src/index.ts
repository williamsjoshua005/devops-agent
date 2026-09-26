#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { execSync } from 'node:child_process';
import { LLMClient } from './harness/llm.js';
import { DevOpsAgentHarness } from './harness/loop.js';
import { AgentContext, EnvironmentLevel, LLMConfig } from './types.js';
import { TOOL_DEFINITIONS, executeTool } from './tools/index.js';
import { RUNBOOKS } from './runbooks/index.js';
import { AuditLogger } from './policy/audit.js';
import { AlertWebhookServer } from './server/webhook.js';
import { TeamsCardBuilder } from './adapters/teams.js';
import { PostmortemTool } from './tools/postmortem.js';
import { DevOpsMcpServer } from './mcp/server.js';
import { SecurityLinterTool } from './tools/security.js';
import { CertExpiryTool } from './tools/certificates.js';
import { FinOpsTool } from './tools/finops.js';
import { AwsTool } from './tools/aws.js';
import { GcpTool } from './tools/gcp.js';

dotenv.config();

// Ensure proxy environment variables have http:// prefix for undici/node
for (const key of ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY']) {
  if (process.env[key] && !process.env[key]!.startsWith('http://') && !process.env[key]!.startsWith('https://')) {
    process.env[key] = `http://${process.env[key]}`;
  }
}

// Check if --mcp flag is passed to start as an MCP Server over stdio
if (process.argv.includes('--mcp')) {
  DevOpsMcpServer.startStdio();
} else {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

function detectTools(): string[] {
  const tools = ['git', 'kubectl', 'helm', 'docker', 'az', 'aws', 'gcloud', 'terraform', 'gh'];
  const available: string[] = [];
  for (const tool of tools) {
    try {
      execSync(`which ${tool}`, { stdio: 'ignore' });
      available.push(tool);
    } catch {}
  }
  return available;
}

function detectKubeContext(): string | undefined {
  try {
    const ctx = execSync('kubectl config current-context 2>/dev/null', { encoding: 'utf-8' }).trim();
    return ctx || undefined;
  } catch {
    return undefined;
  }
}

function detectEnvironment(kubeContext?: string): { environment: EnvironmentLevel; isProduction: boolean } {
  const envOverride = process.env.ENVIRONMENT?.toLowerCase();
  const raw = `${envOverride || ''} ${kubeContext || ''}`.toLowerCase();

  if (raw.includes('prod') || raw.includes('production') || raw.includes('live')) {
    return { environment: 'production', isProduction: true };
  }
  if (raw.includes('stage') || raw.includes('staging') || raw.includes('uat')) {
    return { environment: 'staging', isProduction: false };
  }
  return { environment: 'development', isProduction: false };
}

function getLLMConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER as any) || (process.env.GEMINI_API_KEY ? 'gemini' : process.env.MOONSHOT_API_KEY ? 'kimi' : 'openai');
  const model = process.env.LLM_MODEL || (provider === 'gemini' ? 'gemini-2.5-flash' : provider === 'kimi' ? 'moonshot-v1-auto' : 'gpt-4o');
  const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;

  return {
    provider,
    model,
    apiKey,
    baseUrl,
  };
}

async function main() {
  const installedTools = detectTools();
  const kubeContext = detectKubeContext();
  const { environment, isProduction } = detectEnvironment(kubeContext);

  const context: AgentContext = {
    cwd: process.cwd(),
    kubeContext,
    installedTools,
    environment,
    isProduction,
  };

  const auditLogger = new AuditLogger(context.cwd);
  const llmConfig = getLLMConfig();
  const llmClient = new LLMClient(llmConfig);
  const harness = new DevOpsAgentHarness(llmClient, context, auditLogger);

  const envBadge = isProduction
    ? '\x1b[41m\x1b[37m\x1b[1m 🔴 PRODUCTION ENVIRONMENT (STRICT GUARDRAILS) \x1b[0m'
    : `\x1b[42m\x1b[30m\x1b[1m 🟢 ${environment.toUpperCase()} \x1b[0m`;

  console.log('\x1b[36m');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║             JUNIOR DEVOPS AGENT ENGINE (v3.0)                  ║');
  console.log('║   Autonomous • Dual-Agent SRE • Rollback Watcher • MCP Hub     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');
  console.log(`\x1b[1mEnvironment:\x1b[0m         ${envBadge}`);
  console.log(`\x1b[1mModel Provider:\x1b[0m      ${llmConfig.provider} (${llmConfig.model})`);
  console.log(`\x1b[1mDetected Tools:\x1b[0m      ${installedTools.join(', ') || 'none'}`);
  console.log(`\x1b[1mKubernetes Context:\x1b[0m  ${kubeContext || 'none'}`);
  console.log(`\x1b[1mAudit Logging:\x1b[0m       .audit/audit.jsonl (Active)`);
  console.log('\x1b[90mCommands: /runbooks, /tools, /audit, /kb, /security, /certs, /finops, /aws, /gcp, /mcp, /teams, /exit\x1b[0m\n');

  // Check if --server flag passed
  const args = process.argv.slice(2);
  let webhookServer: AlertWebhookServer | undefined;

  if (args.includes('--server') || process.env.ENABLE_WEBHOOK_SERVER === 'true') {
    const port = Number(process.env.WEBHOOK_PORT) || 3456;
    webhookServer = new AlertWebhookServer({ port, harness, auditLogger });
    await webhookServer.start();
  }

  // Check if one-shot task passed
  const taskArgs = args.filter((a) => !a.startsWith('--'));
  if (taskArgs.length > 0) {
    const task = taskArgs.join(' ');
    console.log(`\x1b[35mOne-Shot Task:\x1b[0m ${task}\n`);
    await runTask(harness, task);
    if (webhookServer) await webhookServer.stop();
    return;
  }

  // Interactive REPL
  const rl = readline.createInterface({ input, output });

  while (true) {
    const prompt = await rl.question('\x1b[1m\x1b[32mdevops-agent>\x1b[0m ');
    const trimmed = prompt.trim();

    if (!trimmed) continue;
    if (trimmed === '/exit' || trimmed === 'exit' || trimmed === 'quit') {
      console.log('Shutting down DevOps Agent. Goodbye!');
      if (webhookServer) await webhookServer.stop();
      rl.close();
      process.exit(0);
    }

    if (trimmed === '/tools') {
      console.log('\n\x1b[1mRegistered DevOps Tools:\x1b[0m');
      for (const t of TOOL_DEFINITIONS) {
        console.log(`  \x1b[33m• ${t.name}\x1b[0m: ${t.description}`);
      }
      console.log('');
      continue;
    }

    if (trimmed === '/runbooks') {
      console.log('\n\x1b[1mConfigured Junior Incident Runbooks:\x1b[0m');
      for (const rb of Object.values(RUNBOOKS)) {
        console.log(`  \x1b[34m[${rb.id}]\x1b[0m \x1b[1m${rb.name}\x1b[0m: ${rb.description}`);
      }
      console.log('');
      continue;
    }

    if (trimmed === '/audit') {
      const records = await auditLogger.getRecent(10);
      console.log(`\n\x1b[1mRecent Audit Records (${records.length}):\x1b[0m`);
      if (records.length === 0) {
        console.log('  (No audit records logged yet)');
      }
      for (const r of records) {
        const status = r.isBlocked ? '⛔ BLOCKED' : r.approved ? '✔ APPROVED' : '✖ REJECTED';
        console.log(`  \x1b[90m${r.timestamp.slice(11, 19)}\x1b[0m \x1b[1m${r.toolName}\x1b[0m [${r.tier}] ${status} (${r.durationMs}ms)`);
      }
      console.log('');
      continue;
    }

    if (trimmed.startsWith('/kb')) {
      const query = trimmed.replace('/kb', '').trim();
      const results = await PostmortemTool.searchKnowledgeBase(query);
      console.log(`\n\x1b[1mIncident Knowledge Base:\x1b[0m\n${results}\n`);
      continue;
    }

    if (trimmed.startsWith('/security')) {
      const targetPath = trimmed.replace('/security', '').trim() || 'Dockerfile';
      console.log(`\n\x1b[34mRunning security audit on ${targetPath}...\x1b[0m`);
      const report = await SecurityLinterTool.scan(targetPath);
      console.log(`\n${report}\n`);
      continue;
    }

    if (trimmed === '/certs') {
      console.log('\n\x1b[34mScanning TLS certificates for expiration...\x1b[0m');
      const report = await CertExpiryTool.check({});
      console.log(`\n${report}\n`);
      continue;
    }

    if (trimmed === '/finops') {
      console.log('\n\x1b[34mScanning for idle storage and orphaned cloud resources...\x1b[0m');
      const report = await FinOpsTool.audit();
      console.log(`\n${report}\n`);
      continue;
    }

    if (trimmed === '/aws' || trimmed.startsWith('/aws ')) {
      const parts = trimmed.split(/\s+/);
      const svc = parts[1] || 'ec2';
      const region = parts[2];
      console.log(`\n\x1b[34mQuerying AWS resources (service: ${svc})...\x1b[0m`);
      const output = await AwsTool.listResources(svc, region);
      console.log(`\n${output}\n`);
      continue;
    }

    if (trimmed === '/gcp' || trimmed.startsWith('/gcp ')) {
      const parts = trimmed.split(/\s+/);
      const type = parts[1] || 'instances';
      const project = parts[2];
      console.log(`\n\x1b[34mQuerying GCP resources (type: ${type})...\x1b[0m`);
      const output = await GcpTool.listResources(type, project);
      console.log(`\n${output}\n`);
      continue;
    }

    if (trimmed === '/mcp') {
      console.log('\n\x1b[1mModel Context Protocol (MCP) Configuration:\x1b[0m');
      console.log('To expose this DevOps agent to Claude Desktop, Cursor, or Antigravity, add to your MCP config:');
      console.log(
        JSON.stringify(
          {
            mcpServers: {
              devopsAgent: {
                command: 'node',
                args: ['/Users/joshua.williams/Documents/research/devops-agent/dist/index.js', '--mcp'],
              },
            },
          },
          null,
          2
        )
      );
      console.log('');
      continue;
    }

    if (trimmed === '/server') {
      if (!webhookServer) {
        const port = Number(process.env.WEBHOOK_PORT) || 3456;
        webhookServer = new AlertWebhookServer({ port, harness, auditLogger });
        await webhookServer.start();
      } else {
        console.log('Webhook server is already active.');
      }
      continue;
    }

    if (trimmed === '/teams') {
      const sampleCard = TeamsCardBuilder.buildApprovalCard(
        {
          tier: 'MUTATE',
          actionSummary: 'Restart payment-service deployment',
          reason: 'Pod memory consumption exceeded limit.',
          requiresApproval: true,
          isBlocked: false,
          isProductionWarning: isProduction,
        },
        'k8s_rollout_restart',
        { name: 'payment-service', namespace: 'default' },
        'sample-req-123',
        {
          approved: true,
          verdict: 'CAUTION',
          blastRadius: 'MEDIUM',
          critique: 'Rolling restart in production. Ensure PodDisruptionBudget is respected.',
          suggestedSafeguards: ['Monitor 5xx error rate on ingress during rollout'],
        }
      );
      console.log('\n\x1b[1mSample Microsoft Teams Adaptive Card Payload:\x1b[0m');
      console.log(JSON.stringify(sampleCard, null, 2));
      console.log('');
      continue;
    }

    await runTask(harness, trimmed);
  }
}

async function runTask(harness: DevOpsAgentHarness, task: string) {
  try {
    console.log('\x1b[90m[Agent thinking...]\x1b[0m');
    const result = await harness.run({
      task,
      onToolStart: (name, args) => {
        console.log(`\n\x1b[34m▶ Running tool: \x1b[1m${name}\x1b[0m \x1b[90m(${JSON.stringify(args)})\x1b[0m`);
      },
      onToolEnd: (name, output) => {
        const preview = output.slice(0, 180).replace(/\n/g, ' ');
        console.log(`\x1b[90m◀ Tool finished. (${output.length} bytes): ${preview}...\x1b[0m\n`);
      },
      onTextChunk: (text) => {
        console.log(`\n\x1b[1mDevOps Agent:\x1b[0m\n${text}\n`);
      },
    });

    if (!result) {
      console.log('\x1b[90m(Task completed with no further text)\x1b[0m\n');
    }
  } catch (err: any) {
    console.error(`\x1b[31mError during execution: ${err.message}\x1b[0m\n`);
  }
}
