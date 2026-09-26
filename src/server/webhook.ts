import * as http from 'node:http';
import { DevOpsAgentHarness } from '../harness/loop.js';
import { AuditLogger } from '../policy/audit.js';
import { PostmortemTool } from '../tools/postmortem.js';
import { TopologyTool } from '../tools/topology.js';
import { getDashboardHtml } from './dashboardHtml.js';

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

      // 1. Dashboard Web UI
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHtml(this.harness.getContext()));
        return;
      }

      // 2. Health check
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', engine: 'junior-devops-agent', uptime: process.uptime() }));
        return;
      }

      // 3. Audit query endpoint
      if (req.method === 'GET' && url.pathname === '/api/audit') {
        const records = await this.auditLogger.getRecent(50);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records }));
        return;
      }

      // 4. Knowledge base search
      if (req.method === 'GET' && url.pathname === '/api/kb') {
        const query = url.searchParams.get('q') || '';
        const results = await PostmortemTool.searchKnowledgeBase(query);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ query, results }));
        return;
      }

      // 5. Cluster Topology discovery endpoint
      if (req.method === 'GET' && url.pathname === '/api/topology') {
        const topology = await TopologyTool.discover();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ topology }));
        return;
      }

      // 6. Interactive Task Execution from Web UI
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

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  }

  start(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
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
