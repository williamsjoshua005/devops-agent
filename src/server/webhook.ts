import * as http from 'node:http';
import { DevOpsAgentHarness } from '../harness/loop.js';
import { AuditLogger } from '../policy/audit.js';
import { PostmortemTool } from '../tools/postmortem.js';
import { TopologyTool } from '../tools/topology.js';
import { FinOpsTool } from '../tools/finops.js';
import { SecurityLinterTool } from '../tools/security.js';
import { CertExpiryTool } from '../tools/certificates.js';
import { K8sTool } from '../tools/k8s.js';
import { TOOL_DEFINITIONS } from '../tools/index.js';
import { getDashboardHtml } from './dashboardHtml.js';
import { WebApprovalHandler } from '../policy/approvals.js';

export interface WebhookServerOptions {
  port?: number;
  harness: DevOpsAgentHarness;
  auditLogger: AuditLogger;
}

export class AlertWebhookServer {
  private server: http.Server;
  private port: number;
  private harness: DevOpsAgentHarness;
  private auditLogger: AuditLogger;

  constructor(options: WebhookServerOptions) {
    this.port = options.port || 3456;
    this.harness = options.harness;
    this.auditLogger = options.auditLogger;

    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Security: Validate auth token if WEB_AUTH_TOKEN environment variable is set (skipping /health)
      const expectedToken = process.env.WEB_AUTH_TOKEN;
      if (expectedToken && url.pathname !== '/health') {
        const authHeader = req.headers['authorization'];
        const queryToken = url.searchParams.get('token');
        const provided = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : queryToken;
        if (!provided || provided !== expectedToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: valid WEB_AUTH_TOKEN required.' }));
          return;
        }
      }

      // 1. Dashboard Web UI
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        });
        res.end(getDashboardHtml(this.harness.getContext()));
        return;
      }

      // 2. Health check
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', engine: 'devops-agent', uptime: process.uptime() }));
        return;
      }

      // 3. System Status & Tool Registry
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const ctx = this.harness.getContext();
        const records = await this.auditLogger.getRecent(100);
        const blockedCount = records.filter((r) => r.isBlocked).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            context: ctx,
            toolsCount: TOOL_DEFINITIONS.length,
            tools: TOOL_DEFINITIONS.map((t) => ({ name: t.name, description: t.description })),
            auditTotal: records.length,
            auditBlocked: blockedCount,
            uptime: process.uptime(),
          })
        );
        return;
      }

      // 3b. Role management endpoints
      if (req.method === 'GET' && url.pathname === '/api/role') {
        const role = this.harness.getContext().roleLevel || 'junior';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ role, available: ['junior', 'intermediate', 'senior'] }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/role') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { role } = JSON.parse(body || '{}');
            if (role === 'junior' || role === 'intermediate' || role === 'senior') {
              this.harness.setRoleLevel(role);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, role }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid role. Must be junior, intermediate, or senior.' }));
            }
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Malformed JSON payload.' }));
          }
        });
        return;
      }

      // 4. Audit query endpoint
      if (req.method === 'GET' && url.pathname === '/api/audit') {
        const records = await this.auditLogger.getRecent(50);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records }));
        return;
      }

      // 5. Knowledge base search
      if (req.method === 'GET' && url.pathname === '/api/kb') {
        const query = url.searchParams.get('q') || '';
        const results = await PostmortemTool.searchKnowledgeBase(query);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ query, results }));
        return;
      }

      // 6. Cluster Topology discovery endpoint
      if (req.method === 'GET' && url.pathname === '/api/topology') {
        const topology = await TopologyTool.discover();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ topology }));
        return;
      }

      // 7. Direct FinOps Multi-Cloud Waste Audit
      if (req.method === 'GET' && url.pathname === '/api/finops') {
        try {
          const ns = url.searchParams.get('namespace') || undefined;
          const audit = await FinOpsTool.audit(ns);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ audit }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // 8. Direct Security Linter Scan
      if (req.method === 'POST' && url.pathname === '/api/security') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const { path } = JSON.parse(body || '{}');
            const target = path || 'Dockerfile';
            const report = await SecurityLinterTool.scan(target);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ report }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 9. Direct TLS Certificate Expiry Check
      if (req.method === 'GET' && url.pathname === '/api/certs') {
        try {
          const hostname = url.searchParams.get('hostname') || undefined;
          const namespace = url.searchParams.get('namespace') || undefined;
          const report = await CertExpiryTool.check({ hostname, namespace });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ report }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // 10. Interactive Task Execution from Web UI (Non-streaming fallback)
      if (req.method === 'POST' && url.pathname === '/api/task') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const { task } = JSON.parse(body || '{}');
            if (!task) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing task string in payload.' }));
              return;
            }

            console.log(`\n\x1b[36m[Web Console Task]:\x1b[0m ${task}`);
            const result = await this.harness.run({ task });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 11. Real-Time Streaming Task Execution (Server-Sent Events / SSE)
      if (
        (req.method === 'POST' && url.pathname === '/api/task/stream') ||
        (req.method === 'GET' && url.pathname === '/api/task/stream')
      ) {
        const processStream = async (taskStr: string) => {
          if (!taskStr || !taskStr.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing task string in payload.' }));
            return;
          }

          console.log(`\n\x1b[35m[Web Console Stream Task]:\x1b[0m ${taskStr}`);

          // SSE Headers
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          // Flush headers immediately if available
          (res as any).flushHeaders?.();

          const sendSse = (eventType: string, payload: any) => {
            res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
          };

          const startTime = Date.now();
          sendSse('start', {
            task: taskStr,
            timestamp: new Date().toISOString(),
          });

          try {
            const finalResult = await this.harness.run({
              task: taskStr,
              approvalHandler: new WebApprovalHandler((pending) => {
                sendSse('approval_requested', {
                  approvalId: pending.id,
                  toolName: pending.toolName,
                  args: pending.args,
                  actionSummary: pending.evaluation.actionSummary,
                  reason: pending.evaluation.reason,
                  diff: pending.evaluation.diff,
                  isProduction: pending.evaluation.isProductionWarning,
                  sreReview: pending.sreReview,
                });
              }),
              onTurnStart: (turn) => {
                sendSse('turn_start', { turn });
              },
              onToolStart: (name, args) => {
                sendSse('tool_start', { name, args });
              },
              onToolEnd: (name, output, durationMs) => {
                sendSse('tool_end', {
                  name,
                  durationMs: durationMs || 0,
                  outputSummary:
                    output.length > 800 ? output.slice(0, 800) + '... [truncated]' : output,
                });
              },
              onSreReview: (review) => {
                sendSse('sre_review', {
                  verdict: review.verdict,
                  blastRadius: review.blastRadius,
                  critique: review.critique,
                });
              },
              onPolicyBlocked: (actionSummary, reason) => {
                sendSse('policy_blocked', { actionSummary, reason });
              },
              onTextChunk: (chunk) => {
                sendSse('text_chunk', { chunk });
              },
            });

            const totalDurationMs = Date.now() - startTime;
            sendSse('done', {
              result: finalResult,
              durationMs: totalDurationMs,
            });
            res.end();
          } catch (err: any) {
            sendSse('error', { error: err.message || String(err) });
            res.end();
          }
        };

        if (req.method === 'GET') {
          const queryTask = url.searchParams.get('task') || '';
          processStream(queryTask);
        } else {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            try {
              const { task } = JSON.parse(body || '{}');
              processStream(task);
            } catch (e: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Malformed JSON payload.' }));
            }
          });
        }
        return;
      }

      // 6b. Resolve Human-in-the-Loop Task Approval
      if (
        req.method === 'POST' &&
        (url.pathname === '/api/task/approval' || url.pathname === '/api/tasks/approval')
      ) {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const { approvalId, approved } = data;
            if (!approvalId || typeof approved !== 'boolean') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing approvalId or boolean approved flag.' }));
              return;
            }

            const success = WebApprovalHandler.resolveApproval(approvalId, approved);
            if (!success) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error: `Pending approval "${approvalId}" not found or timed out.`,
                })
              );
              return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', approvalId, approved }));
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid JSON body: ${err.message}` }));
          }
        });
        return;
      }

      // 6c. List Active Pending Approvals
      if (
        req.method === 'GET' &&
        (url.pathname === '/api/task/pending-approvals' ||
          url.pathname === '/api/tasks/pending-approvals')
      ) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pending: WebApprovalHandler.getAllPending() }));
        return;
      }

      // 7. Alert Ingestion Webhook (Alertmanager / PagerDuty / Azure Monitor)
      if (req.method === 'POST' && url.pathname === '/api/alerts/webhook') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            console.log(`\n\x1b[35m⚡ [WEBHOOK ALERT RECEIVED]:\x1b[0m ${JSON.stringify(payload).slice(0, 200)}...`);

            const alertName =
              payload.commonLabels?.alertname ||
              payload.alerts?.[0]?.labels?.alertname ||
              payload.title ||
              payload.alertName ||
              'Generic Infrastructure Alert';

            const namespace =
              payload.commonLabels?.namespace ||
              payload.alerts?.[0]?.labels?.namespace ||
              'default';

            const resource =
              payload.commonLabels?.pod ||
              payload.commonLabels?.deployment ||
              payload.alerts?.[0]?.labels?.pod ||
              payload.service ||
              '';

            const summary =
              payload.commonAnnotations?.summary ||
              payload.commonAnnotations?.description ||
              payload.description ||
              'Alert triggered by monitoring system.';

            const triagePrompt = `[PROACTIVE INCIDENT TRIAGE]: Alert "${alertName}" received for resource "${resource}" in namespace "${namespace}".
Details: ${summary}
Please follow standard runbooks to:
1. Diagnose pod/resource status and logs.
2. Identify Root Cause Analysis (RCA).
3. If remediation is clear and safe, propose actions or generate a postmortem report.`;

            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                status: 'accepted',
                message: `Triage initiated for alert: ${alertName}`,
                target: { alertName, resource, namespace },
              })
            );

            // Run triage in background
            setTimeout(async () => {
              try {
                console.log(`\x1b[90m[Proactive Triage running for ${alertName}...]\x1b[0m`);
                await this.harness.run({ task: triagePrompt });
              } catch (err: any) {
                console.error(`Error during proactive triage: ${err.message}`);
              }
            }, 50);
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid JSON payload: ${err.message}` }));
          }
        });
        return;
      }

      // 12. Simulate Alert Trigger
      if (req.method === 'POST' && url.pathname === '/api/alerts/simulate') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const { type, resource, namespace } = JSON.parse(body || '{}');
            const alertType = type || 'CrashLoopBackOff';
            const targetNs = namespace || 'default';
            const targetRes = resource || 'payment-service-67b4f59c8d-k92lx';

            const payloadMap: Record<string, any> = {
              CrashLoopBackOff: {
                title: 'PodCrashLooping: Critical error in container execution',
                alertName: 'PodCrashLooping',
                namespace: targetNs,
                pod: targetRes,
                summary: `Container payment in pod ${targetRes} is in CrashLoopBackOff exiting with code 1. Application failed to bind to database port 5432.`,
              },
              OOMKilled: {
                title: 'KubePodOOMKilled: Memory limit exceeded',
                alertName: 'KubePodOOMKilled',
                namespace: targetNs,
                pod: targetRes,
                summary: `Pod ${targetRes} exceeded memory limit of 512Mi and was OOMKilled by kernel cgroups.`,
              },
              HighLatency: {
                title: 'HighHttpLatency: P99 Latency > 2500ms',
                alertName: 'HighHttpLatency',
                namespace: targetNs,
                service: targetRes,
                summary: `HTTP 504 Gateway Timeout rate spiked to 14.2% on ${targetRes} in namespace ${targetNs}.`,
              },
              DiskPressure: {
                title: 'KubeletDiskPressure: Available disk below 10%',
                alertName: 'KubeletDiskPressure',
                namespace: targetNs,
                pod: targetRes,
                summary: `Node /var/log directory partition filled to 94% on worker node hosting ${targetRes}.`,
              },
            };

            const alertPayload = payloadMap[alertType] || payloadMap.CrashLoopBackOff;

            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                status: 'simulated',
                alert: alertPayload,
                message: `Simulated alert [${alertType}] dispatched to DevOps Agent for triage.`,
              })
            );

            // Dispatch triage asynchronously
            setTimeout(async () => {
              const triagePrompt = `[PROACTIVE INCIDENT TRIAGE]: Alert "${alertPayload.alertName}" received for resource "${alertPayload.pod || alertPayload.service}" in namespace "${alertPayload.namespace}".
Details: ${alertPayload.summary}
Please follow standard runbooks to diagnose the issue and determine root cause.`;
              try {
                await this.harness.run({ task: triagePrompt });
              } catch (err: any) {
                console.error('Error simulating alert triage:', err.message);
              }
            }, 50);
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 13. Kubernetes Contexts List
      if (req.method === 'GET' && url.pathname === '/api/k8s/contexts') {
        try {
          const list = await K8sTool.listContexts();
          const current = this.harness.getContext().kubeContext || list.current;
          const annotated = list.contexts.map((ctx) => {
            const low = ctx.toLowerCase();
            const env =
              low.includes('prod') || low.includes('dr') || low.includes('live')
                ? 'production'
                : low.includes('stage') || low.includes('staging') || low.includes('uat')
                ? 'staging'
                : 'development';
            return {
              name: ctx,
              isCurrent: ctx === current,
              environment: env,
            };
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ current, contexts: annotated }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // 14. Kubernetes Context Switcher
      if (req.method === 'POST' && url.pathname === '/api/k8s/switch-context') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const { context: targetContext } = JSON.parse(body || '{}');
            if (!targetContext) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing "context" parameter in payload.' }));
              return;
            }

            const previousContext = this.harness.getContext().kubeContext;
            await K8sTool.switchContext(targetContext);
            this.harness.updateKubeContext(targetContext);
            const updatedContext = this.harness.getContext();

            await this.auditLogger.record({
              sessionId: 'web-console',
              toolName: 'k8s_switch_context',
              args: { previousContext, targetContext },
              tier: 'MUTATE',
              isBlocked: false,
              requiresApproval: false,
              approved: true,
              durationMs: 40,
              outputSummary: `Switched active Kubernetes context from ${previousContext} to ${targetContext} (${updatedContext.environment}).`,
            });

            console.log(
              `\x1b[36m[K8s Context Switched]:\x1b[0m ${previousContext} -> ${targetContext} (${updatedContext.environment})`
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: true,
                previousContext,
                currentContext: targetContext,
                environment: updatedContext.environment,
                isProduction: updatedContext.isProduction,
                message: `Active Kubernetes context switched to "${targetContext}". Environment set to ${updatedContext.environment.toUpperCase()}.`,
              })
            );
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  }

  start(): Promise<number> {
    return new Promise((resolve) => {
      const host = process.env.WEBHOOK_HOST || undefined;
      this.server.listen(this.port, host, () => {
        console.log(`\x1b[32m✔ Mission Control Web Console: http://localhost:${this.port}/dashboard\x1b[0m`);
        console.log(`  \x1b[90m- Ingest Alerts: POST http://localhost:${this.port}/api/alerts/webhook\x1b[0m`);
        console.log(`  \x1b[90m- Audit Log:    GET  http://localhost:${this.port}/api/audit\x1b[0m`);
        console.log(`  \x1b[90m- Health:       GET  http://localhost:${this.port}/health\x1b[0m\n`);
        resolve(this.port);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
