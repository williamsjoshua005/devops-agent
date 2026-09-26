export function getDashboardHtml(context: any): string {
  const envBadge = context.isProduction
    ? '<span class="badge badge-prod">🔴 PRODUCTION (STRICT)</span>'
    : `<span class="badge badge-dev">🟢 ${(context.environment || 'development').toUpperCase()}</span>`;

  const kubeCtx = context.kubeContext || 'None (Local / Cloud CLIs)';
  const toolsCount = context.installedTools?.length || 5;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevOps Agent — Mission Control v4.0</title>
  <!-- Optional Mermaid for Live Topology -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #0f172a;
      --card-hover: #1e293b;
      --card-border: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.2);
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --purple: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 0;
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    /* Top Navbar */
    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 28px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .nav-brand { display: flex; align-items: center; gap: 14px; }
    .brand-logo {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: bold; color: white;
      box-shadow: 0 0 15px var(--accent-glow);
    }
    .brand-text h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
    .brand-text p { font-size: 11px; color: var(--text-muted); font-weight: 500; }
    .nav-meta { display: flex; align-items: center; gap: 12px; }
    .ctx-pill {
      display: flex; align-items: center; gap: 6px;
      background: #020617; border: 1px solid var(--card-border);
      padding: 5px 12px; border-radius: 9999px; font-size: 12px; color: var(--text-muted);
    }
    .ctx-pill code { color: #38bdf8; font-family: ui-monospace, monospace; }
    .badge {
      padding: 4px 10px; border-radius: 9999px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .badge-dev { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(5, 150, 105, 0.4); }
    .badge-prod { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(220, 38, 38, 0.4); }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot-green { background: #10b981; box-shadow: 0 0 8px #10b981; }
    .dot-amber { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* Main Container */
    .container { max-width: 1440px; margin: 0 auto; padding: 24px; width: 100%; flex: 1; }

    /* Metrics Strip */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px 20px;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .metric-card:hover { border-color: #334155; }
    .metric-label { font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-val { font-size: 24px; font-weight: 800; margin-top: 6px; color: var(--accent); display: flex; align-items: baseline; gap: 8px; }
    .metric-sub { font-size: 12px; color: var(--text-muted); font-weight: normal; }

    /* Tab Navigation */
    .tabs-bar {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 14px;
      font-weight: 600;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .tab-btn:hover { color: var(--text); background: rgba(255, 255, 255, 0.03); }
    .tab-btn.active {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
      border-bottom: 2px solid #38bdf8;
    }

    /* Tab Panels */
    .tab-panel { display: none; }
    .tab-panel.active { display: block; animation: fadeIn 0.2s ease-in-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

    /* Layout Grids */
    .dual-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; }
    @media (max-width: 992px) { .dual-grid { grid-template-columns: 1fr; } }

    .panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 22px;
      margin-bottom: 20px;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .panel-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .panel-subtitle { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; }

    /* Interactive Terminal & Inputs */
    .task-box { position: relative; }
    textarea, input[type="text"] {
      width: 100%;
      background: #020617;
      border: 1px solid var(--card-border);
      color: white;
      border-radius: 10px;
      padding: 14px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    textarea:focus, input[type="text"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }
    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 10px 0 16px;
    }
    .chip {
      background: #020617;
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .chip:hover {
      background: var(--card-hover);
      color: var(--text);
      border-color: #475569;
    }
    .chip-accent { border-color: rgba(56, 189, 248, 0.3); color: #7dd3fc; }
    .chip-accent:hover { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }

    /* Action Buttons */
    .btn {
      background: #0284c7;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .btn:hover { background: #0369a1; box-shadow: 0 0 12px rgba(2, 132, 199, 0.4); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: #1e293b;
      color: var(--text);
      border: 1px solid var(--card-border);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-secondary:hover { background: #334155; }
    .btn-danger { background: rgba(239, 68, 68, 0.2); border: 1px solid #dc2626; color: #f87171; }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.4); }

    /* Terminal & Rich Output */
    .terminal-container {
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 10px;
      overflow: hidden;
      margin-top: 14px;
    }
    .terminal-topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #090d16;
      padding: 8px 14px;
      border-bottom: 1px solid #1e293b;
      font-size: 12px;
      color: var(--text-muted);
    }
    .terminal-dots { display: flex; gap: 6px; }
    .t-dot { width: 10px; height: 10px; border-radius: 50%; }
    .t-red { background: #ef4444; }
    .t-yellow { background: #f59e0b; }
    .t-green { background: #10b981; }
    .terminal-body {
      padding: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      color: #e2e8f0;
      min-height: 220px;
      max-height: 520px;
      overflow-y: auto;
      line-height: 1.5;
    }
    .terminal-body pre {
      background: #090d16;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #1e293b;
      overflow-x: auto;
      margin: 8px 0;
    }
    .terminal-body code { color: #38bdf8; font-size: 12.5px; }
    .markdown-rendered h1, .markdown-rendered h2, .markdown-rendered h3 {
      color: #f8fafc; margin: 12px 0 6px; font-size: 15px; border-bottom: 1px solid #1e293b; padding-bottom: 4px;
    }
    .markdown-rendered p { margin-bottom: 8px; }
    .markdown-rendered ul, .markdown-rendered ol { margin-left: 20px; margin-bottom: 8px; }
    .markdown-rendered table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12.5px; }
    .markdown-rendered th { background: #090d16; text-align: left; padding: 8px; border: 1px solid #1e293b; color: #38bdf8; }
    .markdown-rendered td { padding: 8px; border: 1px solid #1e293b; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--card-border); color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e293b; }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .tier-read { color: #34d399; font-weight: 600; }
    .tier-mutate { color: #fbbf24; font-weight: 600; }
    .tier-danger { color: #f87171; font-weight: 600; }

    /* Cards & Simulation Tiles */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .card-tile {
      background: #020617;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: border-color 0.2s, transform 0.15s;
    }
    .card-tile:hover {
      border-color: #38bdf8;
      transform: translateY(-2px);
    }
    .tile-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    .tile-desc { font-size: 12.5px; color: var(--text-muted); margin-bottom: 14px; line-height: 1.4; }

    /* Modal */
    .modal-overlay {
      display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); z-index: 999;
      align-items: center; justify-content: center;
    }
    .modal-overlay.active { display: flex; }
    .modal-card {
      background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px;
      max-width: 700px; width: 90%; max-height: 85vh; display: flex; flex-direction: column;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .modal-header {
      padding: 18px 24px; border-bottom: 1px solid var(--card-border);
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-body { padding: 20px 24px; overflow-y: auto; font-size: 13px; line-height: 1.6; }
    .modal-close { background: none; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer; }
    .modal-close:hover { color: white; }

    /* Toast Notification */
    .toast {
      position: fixed; bottom: 24px; right: 24px;
      background: #0284c7; color: white; padding: 12px 20px; border-radius: 8px;
      font-size: 13px; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      transform: translateY(100px); opacity: 0; transition: all 0.3s; z-index: 1000;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
  </style>
</head>
<body>
  <!-- Navigation Header -->
  <header class="navbar">
    <div class="nav-brand">
      <div class="brand-logo">⚡</div>
      <div class="brand-text">
        <h1>DevOps Agent — Mission Control v4.0</h1>
        <p>Autonomous SRE • Multi-Cloud Orchestration • 3-Tier Guardrails</p>
      </div>
    </div>
    <div class="nav-meta">
      <div class="ctx-pill">
        <span>☸️ Context:</span>
        <code>${kubeCtx}</code>
      </div>
      <div>${envBadge}</div>
      <div class="ctx-pill" id="agentStatusPill">
        <span class="status-dot dot-green" id="agentDot"></span>
        <span id="agentStatusText">Agent Ready</span>
      </div>
    </div>
  </header>

  <div class="container">
    <!-- Top System Metrics Strip -->
    <div class="metrics-grid">
      <div class="metric-card" onclick="openToolsModal()" style="cursor: pointer;" title="Click to view all 27 native tools">
        <div class="metric-label">Platform Tools</div>
        <div class="metric-val" id="toolCountVal">27 Native ↗</div>
        <div class="metric-sub">K8s • Azure • AWS • GCP • FinOps</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Guardrail Safety Tier</div>
        <div class="metric-val" style="color: #34d399;">Active (Strict)</div>
        <div class="metric-sub">0 Destructive Commands Allowed</div>
      </div>
      <div class="metric-card" onclick="switchTab('tab-audit')" style="cursor: pointer;">
        <div class="metric-label">Audit Log Trail</div>
        <div class="metric-val" id="auditMetricVal" style="color: #38bdf8;">Immutable</div>
        <div class="metric-sub">Protected in <code>.audit/audit.jsonl</code></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Multi-Agent SRE Loop</div>
        <div class="metric-val" style="color: #a855f7;">Dual-Agent</div>
        <div class="metric-sub">Junior Investigator + Senior Reviewer</div>
      </div>
    </div>

    <!-- Tab Bar -->
    <nav class="tabs-bar">
      <button class="tab-btn active" onclick="switchTab('tab-console')">⚡ Interactive Terminal</button>
      <button class="tab-btn" onclick="switchTab('tab-audit')">🛡️ Guardrail Policy & Audit</button>
      <button class="tab-btn" onclick="switchTab('tab-finops')">💰 FinOps Multi-Cloud Waste</button>
      <button class="tab-btn" onclick="switchTab('tab-security')">🔒 Security & TLS Scanner</button>
      <button class="tab-btn" onclick="switchTab('tab-topology')">🗺️ Service Topology Map</button>
      <button class="tab-btn" onclick="switchTab('tab-kb')">🧠 Incident RCA Knowledge Base</button>
      <button class="tab-btn" onclick="switchTab('tab-simulate')">🚨 Alert Simulator & Webhook</button>
    </nav>

    <!-- Tab 1: Interactive Terminal -->
    <div class="tab-panel active" id="tab-console">
      <div class="dual-grid">
        <div>
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">⚡ Interactive Autonomous Terminal</div>
              <button class="btn-secondary" onclick="clearTerminal()" style="font-size: 11px;">Clear Output</button>
            </div>
            <div class="task-box">
              <textarea id="taskInput" rows="3" placeholder="Enter instructions for the agent (e.g. 'Diagnose failing pods in default', 'List all AWS EC2 instances', 'Audit cluster for waste', 'Check TLS cert expiry')..."></textarea>
            </div>

            <!-- Quick Action Chips (Categorized) -->
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; margin-top: 4px;">Quick Action Shortcuts:</div>
            <div class="chips-row">
              <span class="chip chip-accent" onclick="quickTask('Check why pods in the default namespace are failing')">☸️ Pod Crash Triage</span>
              <span class="chip" onclick="quickTask('List all pods and deployments in the default namespace')">☸️ K8s Workloads</span>
              <span class="chip chip-accent" onclick="quickTask('Run a complete multi-cloud FinOps audit for idle resources')">💰 FinOps Waste Scan</span>
              <span class="chip" onclick="quickTask('List all AWS EC2 instances and EKS status')">☁️ AWS Resources</span>
              <span class="chip" onclick="quickTask('List all GCP compute instances and GKE status')">☁️ GCP Resources</span>
              <span class="chip" onclick="quickTask('Inspect Azure resources and AKS cluster health')">☁️ Azure & AKS</span>
              <span class="chip chip-accent" onclick="quickTask('Check for expiring TLS certificates on domain api.github.com')">🔒 TLS Expiry Check</span>
              <span class="chip" onclick="quickTask('Run security audit on Dockerfile for vulnerabilities')">🛡️ Security Lint</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
              <span style="font-size: 12px; color: var(--text-muted);">Press <kbd style="background: #1e293b; padding: 2px 5px; border-radius: 4px;">Enter</kbd> to execute • <kbd style="background: #1e293b; padding: 2px 5px; border-radius: 4px;">Shift+Enter</kbd> for newline</span>
              <button class="btn" id="runBtn" onclick="runTask()">
                <span>Execute Task</span> ⚡
              </button>
            </div>

            <!-- Rich Terminal Output Box -->
            <div class="terminal-container">
              <div class="terminal-topbar">
                <div class="terminal-dots">
                  <div class="t-dot t-red"></div>
                  <div class="t-dot t-yellow"></div>
                  <div class="t-dot t-green"></div>
                </div>
                <div id="terminalStatus">Ready. Awaiting command...</div>
                <button class="btn-secondary" onclick="copyTerminalOutput()" style="font-size: 11px; padding: 2px 8px;">Copy Output</button>
              </div>
              <div class="terminal-body" id="terminalOutput">Welcome to DevOps Agent Mission Control v4.0.
Enter an instruction above or click any shortcut chip to dispatch autonomous diagnosis.</div>
            </div>
          </div>
        </div>

        <div>
          <!-- Live Real-Time Audit Feed Preview -->
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">🛡️ Live Audit Trail</div>
              <button class="btn-secondary" onclick="loadAudit()" style="font-size: 11px; padding: 4px 8px;">Refresh</button>
            </div>
            <div style="max-height: 280px; overflow-y: auto;">
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
            <div style="text-align: right; margin-top: 10px;">
              <button class="btn-secondary" onclick="switchTab('tab-audit')" style="font-size: 12px;">View Full Audit Stream →</button>
            </div>
          </div>

          <!-- Multi-Cloud Cluster Status -->
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">☁️ Multi-Cloud Status</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; background: #020617; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--card-border);">
                <span>☸️ <strong>Kubernetes</strong></span>
                <span class="badge badge-dev">${kubeCtx}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; background: #020617; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--card-border);">
                <span>🔷 <strong>Azure (AKS & Disks)</strong></span>
                <span style="color: #38bdf8; font-size: 12px; font-weight: 600;">Active Driver</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; background: #020617; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--card-border);">
                <span>🔶 <strong>Amazon Web Services (EKS & EBS)</strong></span>
                <span style="color: #f59e0b; font-size: 12px; font-weight: 600;">Active Driver</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; background: #020617; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--card-border);">
                <span>🔴 <strong>Google Cloud (GKE & Disks)</strong></span>
                <span style="color: #ef4444; font-size: 12px; font-weight: 600;">Active Driver</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 2: Guardrail Policy & Audit Stream -->
    <div class="tab-panel" id="tab-audit">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🛡️ Guardrail Policy & Compliance Stream</div>
            <div class="panel-subtitle">Every operation is classified into 3 tiers and cryptographically logged to <code>.audit/audit.jsonl</code>.</div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="auditSearchInput" placeholder="Filter by tool or command..." style="margin-bottom: 0; width: 220px; padding: 6px 12px; font-size: 12px;" oninput="filterAudit()">
            <button class="btn-secondary" onclick="loadAudit()" style="padding: 6px 12px; font-size: 12px;">Refresh</button>
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-bottom: 16px;">
          <button class="chip chip-accent" onclick="filterAuditTier('ALL')">All Actions</button>
          <button class="chip" onclick="filterAuditTier('READ')">🟢 Tier 1: Read (Autonomous)</button>
          <button class="chip" onclick="filterAuditTier('MUTATE')">🟡 Tier 2: Mutate (Approval)</button>
          <button class="chip" onclick="filterAuditTier('DANGEROUS')">🔴 Tier 3: Blocked (Destructive)</button>
        </div>

        <div style="max-height: 550px; overflow-y: auto;">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Tool Name</th>
                <th>Safety Tier</th>
                <th>Status</th>
                <th>Executed Command / Context</th>
              </tr>
            </thead>
            <tbody id="fullAuditTableBody">
              <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Loading complete audit stream...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 3: FinOps Multi-Cloud Waste Hunter -->
    <div class="tab-panel" id="tab-finops">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">💰 FinOps Multi-Cloud Waste Hunter</div>
            <div class="panel-subtitle">Correlate waste across Kubernetes PVCs, Idle LoadBalancers, Azure Disks, AWS EBS, and GCP Disks.</div>
          </div>
          <button class="btn" id="finopsScanBtn" onclick="runFinOpsScan()">
            <span>Run Multi-Cloud Waste Scan</span> 🚀
          </button>
        </div>

        <div class="cards-grid" style="margin-bottom: 20px;">
          <div class="card-tile">
            <div class="tile-title">📦 Kubernetes PVCs</div>
            <div class="tile-desc">Discovers persistent volume claims in Bound state but not attached to any running container.</div>
            <div style="font-size: 12px; color: #38bdf8;">Status: Monitored</div>
          </div>
          <div class="card-tile">
            <div class="tile-title">🌐 Idle LoadBalancers</div>
            <div class="tile-desc">Scans cloud load balancers with empty endpoints incurring cloud provision fees.</div>
            <div style="font-size: 12px; color: #38bdf8;">Status: Monitored</div>
          </div>
          <div class="card-tile">
            <div class="tile-title">💾 Azure Managed Disks</div>
            <div class="tile-desc">Identifies unattached managed disks in subscription resource groups.</div>
            <div style="font-size: 12px; color: #38bdf8;">Status: Monitored</div>
          </div>
          <div class="card-tile">
            <div class="tile-title">💽 AWS EBS Volumes</div>
            <div class="tile-desc">Detects unattached volumes in <code>available</code> state in AWS accounts.</div>
            <div style="font-size: 12px; color: #38bdf8;">Status: Monitored</div>
          </div>
          <div class="card-tile">
            <div class="tile-title">💿 GCP Persistent Disks</div>
            <div class="tile-desc">Finds standalone GCP storage disks with zero compute instance users.</div>
            <div style="font-size: 12px; color: #38bdf8;">Status: Monitored</div>
          </div>
        </div>

        <div class="terminal-container">
          <div class="terminal-topbar">
            <span>FINOPS AUDIT REPORT OUTPUT</span>
            <button class="btn-secondary" onclick="copyFinOpsOutput()" style="font-size: 11px;">Copy Report</button>
          </div>
          <div class="terminal-body markdown-rendered" id="finopsResults">Click "Run Multi-Cloud Waste Scan" to audit connected environments for idle infrastructure...</div>
        </div>
      </div>
    </div>

    <!-- Tab 4: Security & TLS Scanner -->
    <div class="tab-panel" id="tab-security">
      <div class="dual-grid">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">🛡️ Manifest & Docker Security Linter</div>
          </div>
          <div class="panel-subtitle">Audits Kubernetes YAML and Dockerfiles for root permissions, missing limits, and insecure images.</div>
          <input type="text" id="secFilePath" value="Dockerfile" placeholder="File path (e.g. Dockerfile, deploy.yaml)...">
          <button class="btn" onclick="runSecurityScan()" style="margin-bottom: 16px;">Scan Security Vulnerabilities</button>

          <div class="terminal-container">
            <div class="terminal-topbar">SECURITY AUDIT REPORT</div>
            <div class="terminal-body markdown-rendered" id="secResults">Enter a file path and click scan to audit manifests...</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">🔒 TLS & Certificate Expiry Checker</div>
          </div>
          <div class="panel-subtitle">Checks SSL/TLS certificates on Kubernetes ingresses or remote endpoints before they expire.</div>
          <input type="text" id="certHost" placeholder="Hostname (e.g. google.com, api.github.com) or leave blank for K8s ingress secrets...">
          <button class="btn" onclick="runCertCheck()" style="margin-bottom: 16px;">Check Expiry Status</button>

          <div class="terminal-container">
            <div class="terminal-topbar">CERTIFICATE STATUS REPORT</div>
            <div class="terminal-body markdown-rendered" id="certResults">Enter a hostname or click to check cluster ingress certificates...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 5: Live Service Topology -->
    <div class="tab-panel" id="tab-topology">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🗺️ Live Cluster Service Topology</div>
            <div class="panel-subtitle">Dynamically discovers Ingress $\to$ Service $\to$ Pod dependencies and generates an architectural map.</div>
          </div>
          <button class="btn" id="topoBtn" onclick="loadTopology()">Discover Topology 🔄</button>
        </div>

        <div id="mermaidVisual" style="background: #020617; border: 1px solid var(--card-border); border-radius: 10px; padding: 24px; min-height: 250px; text-align: center; overflow-x: auto;">
          <div style="color: var(--text-muted);">Click "Discover Topology" above to render the live dependency graph.</div>
        </div>

        <div style="margin-top: 16px;">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">RAW MERMAID GRAPH SPECIFICATION</div>
          <div class="terminal-container">
            <div class="terminal-body" id="topologyCode" style="color: #67e8f9; min-height: 100px;">Awaiting topology discovery...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 6: Incident RCA Knowledge Base -->
    <div class="tab-panel" id="tab-kb">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🧠 Incident RCA Knowledge Base</div>
            <div class="panel-subtitle">Vector-indexed past incident postmortems, root causes, and remediation runbooks.</div>
          </div>
        </div>
        <input type="text" id="kbQuery" placeholder="Search past incidents (e.g. 'CrashLoopBackOff', 'OOMKilled', 'database timeout', '502 Bad Gateway')..." oninput="searchKb()">

        <div class="terminal-container" style="margin-top: 14px;">
          <div class="terminal-topbar">SEARCH RESULTS</div>
          <div class="terminal-body markdown-rendered" id="kbResults">Type a query above to search through indexed incident postmortems...</div>
        </div>
      </div>
    </div>

    <!-- Tab 7: Alert Simulator & Webhook -->
    <div class="tab-panel" id="tab-simulate">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🚨 Automated Webhook & Alert Simulator</div>
            <div class="panel-subtitle">Simulate incoming Prometheus, Datadog, or Azure alerts to test autonomous triage and RCA generation.</div>
          </div>
        </div>

        <div class="cards-grid">
          <div class="card-tile">
            <div>
              <div class="tile-title" style="color: #f87171;">💥 CrashLoopBackOff Alert</div>
              <div class="tile-desc">Simulates a critical pod crash alert in the payment service caused by database connection failure.</div>
            </div>
            <button class="btn" onclick="simulateAlert('CrashLoopBackOff')" style="font-size: 12px; padding: 8px 12px;">Dispatch Alert</button>
          </div>

          <div class="card-tile">
            <div>
              <div class="tile-title" style="color: #fbbf24;">🛑 OOMKilled Memory Alert</div>
              <div class="tile-desc">Simulates a kernel cgroup OOMKilled alert for a microservice exceeding its 512Mi memory boundary.</div>
            </div>
            <button class="btn" onclick="simulateAlert('OOMKilled')" style="font-size: 12px; padding: 8px 12px;">Dispatch Alert</button>
          </div>

          <div class="card-tile">
            <div>
              <div class="tile-title" style="color: #38bdf8;">⏱️ High Latency (504 Timeout)</div>
              <div class="tile-desc">Simulates an upstream gateway timeout alert with P99 latency exceeding 2500ms.</div>
            </div>
            <button class="btn" onclick="simulateAlert('HighLatency')" style="font-size: 12px; padding: 8px 12px;">Dispatch Alert</button>
          </div>

          <div class="card-tile">
            <div>
              <div class="tile-title" style="color: #a855f7;">💾 Disk Pressure Alert</div>
              <div class="tile-desc">Simulates worker node root partition filling to 94% due to container log accumulation.</div>
            </div>
            <button class="btn" onclick="simulateAlert('DiskPressure')" style="font-size: 12px; padding: 8px 12px;">Dispatch Alert</button>
          </div>
        </div>

        <div class="terminal-container" style="margin-top: 20px;">
          <div class="terminal-topbar">SIMULATION DISPATCH STATUS</div>
          <div class="terminal-body" id="simulationOutput">Click any alert card above to trigger autonomous incident ingestion...</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Registered Tools Catalog -->
  <div class="modal-overlay" id="toolsModal">
    <div class="modal-card">
      <div class="modal-header">
        <div style="font-weight: 700; font-size: 16px;">🧰 Native DevOps Tool Catalog (27 Registered Tools)</div>
        <button class="modal-close" onclick="closeToolsModal()">&times;</button>
      </div>
      <div class="modal-body" id="toolsModalBody">
        Loading tool catalog...
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div class="toast" id="toast">Notification message</div>

  <!-- Dashboard JavaScript Logic -->
  <script>
    let auditRecords = [];
    let systemStatus = {};

    // Tab Switching
    function switchTab(tabId) {
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const target = document.getElementById(tabId);
      if (target) target.classList.add('active');
      const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
      if (btn) btn.classList.add('active');

      if (tabId === 'tab-audit') loadAudit();
    }

    // Toast helper
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    // Markdown Formatter (Lightweight & Safe)
    function renderMarkdown(md) {
      if (!md) return '';
      let html = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Code blocks
      html = html.replace(/\\\\\`\\\\\`\\\\\`([a-z]*)\\n([\\s\\S]*?)\\\\\`\\\\\`\\\\\`/g, (m, lang, code) => {
        return '<pre><code>' + code + '</code></pre>';
      });

      // Inline code
      html = html.replace(/\\\\\`([^\\\\\`]+)\\\\\`/g, '<code>$1</code>');

      // Headers
      html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

      // Bold & Italic
      html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/\\*(.*?)\\*/g, '<em>$1</em>');

      // Tables
      html = html.replace(/\\|(.+)\\|/g, (match) => {
        const cells = match.split('|').filter(c => c.trim().length > 0);
        return '<tr>' + cells.map(c => '<td>' + c.trim() + '</td>').join('') + '</tr>';
      });

      // Line breaks
      html = html.replace(/\\n/g, '<br>');
      return html;
    }

    // Load System Status
    async function loadSystemStatus() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        systemStatus = await res.json();
        if (systemStatus.toolsCount) {
          document.getElementById('toolCountVal').innerText = systemStatus.toolsCount + ' Native ↗';
        }
      } catch (e) {
        console.warn('Status load error:', e);
      }
    }

    // Open Tools Catalog Modal
    async function openToolsModal() {
      const modal = document.getElementById('toolsModal');
      const body = document.getElementById('toolsModalBody');
      modal.classList.add('active');

      if (!systemStatus.tools) {
        await loadSystemStatus();
      }

      if (systemStatus.tools) {
        body.innerHTML = systemStatus.tools.map((t, idx) => \`
          <div style="background: #020617; border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <code style="color: #38bdf8; font-weight: bold; font-size: 13px;">\${t.name}</code>
              <span style="font-size: 11px; color: var(--text-muted);">#\${idx + 1}</span>
            </div>
            <div style="color: #cbd5e1; font-size: 12px;">\${t.description}</div>
          </div>
        \`).join('');
      } else {
        body.innerHTML = 'Unable to fetch tool list.';
      }
    }

    function closeToolsModal() {
      document.getElementById('toolsModal').classList.remove('active');
    }

    // Load Audit Trail
    async function loadAudit() {
      try {
        const res = await fetch('/api/audit');
        const data = await res.json();
        auditRecords = data.records || [];

        renderAuditTables(auditRecords);
        document.getElementById('auditMetricVal').innerText = auditRecords.length + ' Recorded';
      } catch (e) {
        console.error('Audit load failed:', e);
      }
    }

    function renderAuditTables(records) {
      const miniBody = document.getElementById('auditTableBody');
      const fullBody = document.getElementById('fullAuditTableBody');

      if (!records || records.length === 0) {
        const emptyRow = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No actions recorded yet.</td></tr>';
        if (miniBody) miniBody.innerHTML = emptyRow;
        if (fullBody) fullBody.innerHTML = emptyRow;
        return;
      }

      // Mini preview (last 6)
      if (miniBody) {
        miniBody.innerHTML = records.slice(0, 6).map(r => {
          const time = r.timestamp ? r.timestamp.slice(11, 19) : '--';
          const tierClass = r.tier === 'READ' ? 'tier-read' : r.tier === 'MUTATE' ? 'tier-mutate' : 'tier-danger';
          const status = r.isBlocked ? '⛔ Blocked' : r.approved ? '✔ Approved' : '✖ Rejected';
          return '<tr><td>' + time + '</td><td><code>' + r.toolName + '</code></td><td class="' + tierClass + '">' + r.tier + '</td><td>' + status + '</td></tr>';
        }).join('');
      }

      // Full table
      if (fullBody) {
        fullBody.innerHTML = records.map(r => {
          const time = r.timestamp ? r.timestamp.replace('T', ' ').slice(0, 19) : '--';
          const tierClass = r.tier === 'READ' ? 'tier-read' : r.tier === 'MUTATE' ? 'tier-mutate' : 'tier-danger';
          const status = r.isBlocked ? '⛔ Blocked' : r.approved ? '✔ Approved' : '✖ Rejected';
          const cmd = r.command ? '<code>' + r.command.slice(0, 80) + '</code>' : '<span style="color: var(--text-muted);">-</span>';
          return '<tr><td>' + time + '</td><td><code>' + r.toolName + '</code></td><td class="' + tierClass + '">' + r.tier + '</td><td>' + status + '</td><td>' + cmd + '</td></tr>';
        }).join('');
      }
    }

    function filterAudit() {
      const q = document.getElementById('auditSearchInput').value.toLowerCase();
      const filtered = auditRecords.filter(r => 
        (r.toolName && r.toolName.toLowerCase().includes(q)) ||
        (r.command && r.command.toLowerCase().includes(q))
      );
      renderAuditTables(filtered);
    }

    function filterAuditTier(tier) {
      if (tier === 'ALL') {
        renderAuditTables(auditRecords);
      } else {
        renderAuditTables(auditRecords.filter(r => r.tier === tier));
      }
    }

    // Interactive Terminal Execution
    async function runTask() {
      const task = document.getElementById('taskInput').value.trim();
      if (!task) return;

      const out = document.getElementById('terminalOutput');
      const status = document.getElementById('terminalStatus');
      const btn = document.getElementById('runBtn');
      const dot = document.getElementById('agentDot');
      const agentText = document.getElementById('agentStatusText');

      btn.disabled = true;
      status.innerText = 'Agent executing task...';
      dot.className = 'status-dot dot-amber';
      agentText.innerText = 'Investigating...';

      out.innerHTML = '<span style="color: #38bdf8;">[DISPATCHING AGENT TASK]:</span> ' + task + '\\n\\n<span style="color: #94a3b8;">Gathering facts and analyzing cluster telemetry...</span>';

      try {
        const res = await fetch('/api/task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task })
        });
        const data = await res.json();

        if (data.error) {
          out.innerHTML = '<span style="color: #f87171; font-weight: bold;">[Execution Error]:</span>\\n' + data.error;
          showToast('Task execution encountered an error.');
        } else {
          out.innerHTML = renderMarkdown(data.result || '(Task completed with no text output)');
          showToast('Task completed successfully!');
        }
        loadAudit();
      } catch (e) {
        out.innerHTML = '<span style="color: #f87171;">Network / Server Error:</span> ' + e.message;
      } finally {
        btn.disabled = false;
        status.innerText = 'Execution finished.';
        dot.className = 'status-dot dot-green';
        agentText.innerText = 'Agent Ready';
      }
    }

    function quickTask(text) {
      document.getElementById('taskInput').value = text;
      runTask();
    }

    function clearTerminal() {
      document.getElementById('terminalOutput').innerHTML = 'Terminal cleared. Ready.';
      document.getElementById('terminalStatus').innerText = 'Ready.';
    }

    function copyTerminalOutput() {
      const text = document.getElementById('terminalOutput').innerText;
      navigator.clipboard.writeText(text);
      showToast('Output copied to clipboard!');
    }

    // FinOps Waste Scan
    async function runFinOpsScan() {
      const out = document.getElementById('finopsResults');
      const btn = document.getElementById('finopsScanBtn');
      btn.disabled = true;
      out.innerHTML = 'Auditing Kubernetes, Azure, AWS, and GCP for orphan volumes, disks, and idle load balancers...';

      try {
        const res = await fetch('/api/finops');
        const data = await res.json();
        out.innerHTML = renderMarkdown(data.audit || 'No waste detected.');
        showToast('FinOps audit completed!');
      } catch (e) {
        out.innerHTML = 'Error running FinOps audit: ' + e.message;
      } finally {
        btn.disabled = false;
      }
    }

    function copyFinOpsOutput() {
      navigator.clipboard.writeText(document.getElementById('finopsResults').innerText);
      showToast('FinOps report copied!');
    }

    // Security Scanner
    async function runSecurityScan() {
      const path = document.getElementById('secFilePath').value.trim();
      const out = document.getElementById('secResults');
      out.innerHTML = 'Scanning manifest for security best practices...';
      try {
        const res = await fetch('/api/security', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
        const data = await res.json();
        out.innerHTML = renderMarkdown(data.report || 'No security findings.');
      } catch (e) {
        out.innerHTML = 'Scan error: ' + e.message;
      }
    }

    // TLS Cert Check
    async function runCertCheck() {
      const hostname = document.getElementById('certHost').value.trim();
      const out = document.getElementById('certResults');
      out.innerHTML = 'Inspecting TLS certificate validity...';
      try {
        const url = hostname ? '/api/certs?hostname=' + encodeURIComponent(hostname) : '/api/certs';
        const res = await fetch(url);
        const data = await res.json();
        out.innerHTML = renderMarkdown(data.report || 'No certificate data.');
      } catch (e) {
        out.innerHTML = 'Certificate check error: ' + e.message;
      }
    }

    // Topology Discovery
    async function loadTopology() {
      const box = document.getElementById('topologyCode');
      const visual = document.getElementById('mermaidVisual');
      const btn = document.getElementById('topoBtn');
      btn.disabled = true;
      box.innerText = 'Discovering cluster service topology...';

      try {
        const res = await fetch('/api/topology');
        const data = await res.json();
        const raw = data.topology || 'graph TD; NoTopology["No services detected"];';
        box.innerText = raw;

        if (window.mermaid) {
          try {
            mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
            const { svg } = await mermaid.render('mermaidGraph', raw);
            visual.innerHTML = svg;
          } catch (mErr) {
            visual.innerHTML = '<div style="color: #f87171;">Diagram syntax parsed as text below.</div>';
          }
        } else {
          visual.innerHTML = '<pre style="text-align: left; color: #67e8f9;">' + raw + '</pre>';
        }
        showToast('Topology discovered!');
      } catch (e) {
        box.innerText = 'Topology discovery error: ' + e.message;
      } finally {
        btn.disabled = false;
      }
    }

    // Knowledge Base Search
    async function searchKb() {
      const q = document.getElementById('kbQuery').value.trim();
      const out = document.getElementById('kbResults');
      if (!q) {
        out.innerHTML = 'Type a query above to search through indexed incident postmortems...';
        return;
      }
      try {
        const res = await fetch('/api/kb?q=' + encodeURIComponent(q));
        const data = await res.json();
        out.innerHTML = renderMarkdown(data.results || 'No historical incidents matched your query.');
      } catch (e) {
        out.innerHTML = 'Search error: ' + e.message;
      }
    }

    // Alert Simulation
    async function simulateAlert(type) {
      const out = document.getElementById('simulationOutput');
      out.innerHTML = 'Dispatching simulated [' + type + '] alert to proactive webhook handler...';
      try {
        const res = await fetch('/api/alerts/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });
        const data = await res.json();
        out.innerHTML = '<span style="color: #34d399; font-weight: bold;">✔ ' + data.message + '</span>\\n\\n' +
          'Dispatched Payload:\\n' + JSON.stringify(data.alert, null, 2) + '\\n\\n' +
          'Agent is now proactively executing diagnostic runbooks in the background.';
        showToast('Simulated alert dispatched to agent!');
        setTimeout(loadAudit, 3000);
      } catch (e) {
        out.innerHTML = 'Simulation error: ' + e.message;
      }
    }

    // Keyboard shortcut (Enter to run in textarea)
    document.getElementById('taskInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runTask();
      }
    });

    // Close modal on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeToolsModal();
    });

    // Initial Data Fetch
    loadAudit();
    loadSystemStatus();
    // Auto-refresh audit trail every 6 seconds
    setInterval(loadAudit, 6000);
  </script>
</body>
</html>`;
}
