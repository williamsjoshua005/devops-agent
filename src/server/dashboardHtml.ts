export function getDashboardHtml(context: any): string {
  const envBadge = context.isProduction
    ? '<span class="badge badge-prod">🔴 PRODUCTION</span>'
    : `<span class="badge badge-dev">🟢 ${(context.environment || 'development').toUpperCase()}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Junior DevOps Agent — Mission Control</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.15);
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
    }
    .title-group { display: flex; align-items: center; gap: 12px; }
    .logo {
      width: 40px; height: 40px; border-radius: 8px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: bold; color: white;
    }
    h1 { font-size: 22px; font-weight: 700; }
    .badge {
      padding: 4px 10px; border-radius: 9999px;
      font-size: 12px; font-weight: 600; text-transform: uppercase;
    }
    .badge-dev { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #059669; }
    .badge-prod { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 12px; padding: 18px;
    }
    .stat-label { font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-val { font-size: 26px; font-weight: 700; margin-top: 6px; color: var(--accent); }
    .main-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; }
    @media (max-width: 900px) { .main-grid { grid-template-columns: 1fr; } }
    .panel {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 12px; padding: 20px; margin-bottom: 20px;
    }
    .panel-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
    textarea, input[type="text"] {
      width: 100%; background: #030712; border: 1px solid var(--card-border);
      color: white; border-radius: 8px; padding: 12px; font-size: 14px; outline: none;
      font-family: inherit; margin-bottom: 12px;
    }
    textarea:focus, input[type="text"]:focus { border-color: var(--accent); }
    .btn {
      background: #0284c7; color: white; border: none; border-radius: 8px;
      padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: #0369a1; }
    .btn-secondary { background: #1f2937; color: var(--text); border: 1px solid var(--card-border); margin-right: 8px; margin-bottom: 8px; }
    .btn-secondary:hover { background: #374151; }
    .terminal-out {
      background: #030712; border: 1px solid #111827; border-radius: 8px;
      padding: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px; color: #a5f3fc; min-height: 180px; max-height: 400px; overflow-y: auto;
      white-space: pre-wrap; line-height: 1.4;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 10px; border-bottom: 1px solid var(--card-border); color: var(--text-muted); font-weight: 600; }
    td { padding: 10px; border-bottom: 1px solid #1f2937; }
    .tier-read { color: #34d399; font-weight: 600; }
    .tier-mutate { color: #fbbf24; font-weight: 600; }
    .tier-danger { color: #f87171; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-group">
      <div class="logo">⚡</div>
      <div>
        <h1>Junior DevOps Agent — Mission Control v4.0</h1>
        <div style="font-size: 12px; color: var(--text-muted);">Autonomous Platform Engineering Engine • Pi/Claw Harness</div>
      </div>
    </div>
    <div>${envBadge}</div>
  </div>

  <div class="grid">
    <div class="stat-card">
      <div class="stat-label">Active DevOps Tools</div>
      <div class="stat-val" id="toolCount">20+ Tools</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Guardrail Policy</div>
      <div class="stat-val" style="color: #34d399;">Active (Strict)</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Audit Log Status</div>
      <div class="stat-val" id="auditStatus">Immutable (.jsonl)</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Multi-Agent SRE</div>
      <div class="stat-val" style="color: #a78bfa;">Online</div>
    </div>
  </div>

  <div class="main-grid">
    <div>
      <div class="panel">
        <div class="panel-title">Interactive Task Console</div>
        <textarea id="taskInput" rows="3" placeholder="Enter instructions for the agent (e.g., 'Check why pods in default are crashing', 'Run security audit on Dockerfile', 'Audit cluster for idle storage')..."></textarea>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <button class="btn-secondary" onclick="quickTask('Check why pods in the default namespace are failing')">Pod Triage</button>
            <button class="btn-secondary" onclick="quickTask('Check for expiring TLS certificates')">TLS Expiry</button>
            <button class="btn-secondary" onclick="quickTask('Audit cluster for idle PVCs and load balancers')">FinOps</button>
          </div>
          <button class="btn" id="runBtn" onclick="runTask()">Run Task ⚡</button>
        </div>
        <div style="margin-top: 16px;">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">LIVE EXECUTION CONSOLE</div>
          <div class="terminal-out" id="terminal">Ready. Enter a task or click a quick action above to begin.</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Incident Knowledge Base Search</div>
        <input type="text" id="kbQuery" placeholder="Search past incidents and postmortems (e.g. 'OOMKilled', '502 Bad Gateway', 'payment-service')..." oninput="searchKb()">
        <div class="terminal-out" id="kbResults" style="min-height: 100px; color: #e2e8f0;">Type a query to search historical incident postmortems...</div>
      </div>
    </div>

    <div>
      <div class="panel">
        <div class="panel-title">
          <span>Recent Audit Trail</span>
          <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px; margin: 0;" onclick="loadAudit()">Refresh</button>
        </div>
        <div style="max-height: 320px; overflow-y: auto;">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Tool</th>
                <th>Tier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="auditTableBody">
              <tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Loading audit history...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Live Service Dependency Map</div>
        <button class="btn-secondary" style="margin-bottom: 12px;" onclick="loadTopology()">Discover Topology Graph</button>
        <div class="terminal-out" id="topologyBox" style="color: #67e8f9; font-size: 12px;">Click above to discover cluster topology and blast-radius map.</div>
      </div>
    </div>
  </div>

  <script>
    async function loadAudit() {
      try {
        const res = await fetch('/api/audit');
        const data = await res.json();
        const tbody = document.getElementById('auditTableBody');
        tbody.innerHTML = '';
        if (!data.records || data.records.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No actions recorded yet.</td></tr>';
          return;
        }
        data.records.slice(0, 15).forEach(r => {
          const row = document.createElement('tr');
          const time = r.timestamp ? r.timestamp.slice(11, 19) : '--';
          const tierClass = r.tier === 'READ' ? 'tier-read' : r.tier === 'MUTATE' ? 'tier-mutate' : 'tier-danger';
          const status = r.isBlocked ? '⛔ Blocked' : r.approved ? '✔ Approved' : '✖ Rejected';
          row.innerHTML = '<td>' + time + '</td><td><code>' + r.toolName + '</code></td><td class="' + tierClass + '">' + r.tier + '</td><td>' + status + '</td>';
          tbody.appendChild(row);
        });
      } catch (e) {
        console.error(e);
      }
    }

    async function searchKb() {
      const q = document.getElementById('kbQuery').value.trim();
      const out = document.getElementById('kbResults');
      if (!q) {
        out.innerText = 'Type a query to search historical incident postmortems...';
        return;
      }
      try {
        const res = await fetch('/api/kb?q=' + encodeURIComponent(q));
        const data = await res.json();
        out.innerText = data.results || 'No results found.';
      } catch (e) {
        out.innerText = 'Error querying knowledge base: ' + e.message;
      }
    }

    async function loadTopology() {
      const box = document.getElementById('topologyBox');
      box.innerText = 'Discovering cluster topology...';
      try {
        const res = await fetch('/api/topology');
        const data = await res.json();
        box.innerText = data.topology || 'No topology detected.';
      } catch (e) {
        box.innerText = 'Error: ' + e.message;
      }
    }

    function quickTask(text) {
      document.getElementById('taskInput').value = text;
      runTask();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.innerText = text;
      return div.innerHTML;
    }

    async function runTask() {
      const task = document.getElementById('taskInput').value.trim();
      if (!task) return;
      const term = document.getElementById('terminal');
      const btn = document.getElementById('runBtn');
      btn.disabled = true;
      btn.innerText = 'Running...';
      term.innerText = '[Agent dispatched to investigate]: ' + task + '\n\nThinking...';

      try {
        const res = await fetch('/api/task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task })
        });
        const data = await res.json();
        if (data.error) {
          term.innerHTML = '<span style="color: #f87171; font-weight: bold;">[Error]:</span>\n' + escapeHtml(data.error);
        } else {
          term.innerText = data.result || '(Task completed with no text output)';
        }
        loadAudit();
      } catch (e) {
        term.innerText = 'Execution error: ' + e.message;
      } finally {
        btn.disabled = false;
        btn.innerText = 'Run Task ⚡';
      }
    }

    // Initial load
    loadAudit();
  </script>
</body>
</html>`;
}
