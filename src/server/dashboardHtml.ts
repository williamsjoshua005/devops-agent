import { TOOL_DEFINITIONS, getAvailableToolDefinitions } from '../tools/index.js';

export function getDashboardHtml(context: any): string {
  const envBadge = context.isProduction
    ? '<span class="badge badge-prod">🔴 PRODUCTION (STRICT)</span>'
    : `<span class="badge badge-dev">🟢 ${(context.environment || 'development').toUpperCase()}</span>`;

  const kubeCtx = context.kubeContext || 'None (Local / Cloud CLIs)';
  const availableTools = getAvailableToolDefinitions(context);
  const toolsCount = availableTools.length;
  const roleStr = (context.roleLevel || 'intermediate').toUpperCase();

  const cp = context.cloudProviders ?? {
    aws: process.env.ENABLE_AWS !== 'false' && process.env.CLOUD_AWS !== 'false',
    azure: process.env.ENABLE_AZURE !== 'false' && process.env.CLOUD_AZURE !== 'false',
    gcp: process.env.ENABLE_GCP !== 'false' && process.env.CLOUD_GCP !== 'false',
  };
  const stick = context.stickToKubeConfig !== false;
  const enabledProviders: string[] = [];
  if (cp.aws) enabledProviders.push('AWS');
  if (cp.azure) enabledProviders.push('AZ');
  if (cp.gcp) enabledProviders.push('GCP');
  const cloudSummary = enabledProviders.length > 0 ? enabledProviders.join(' • ') : 'K8S ONLY';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevOps Agent — Mission Control v4.5</title>
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
      flex-wrap: wrap;
      gap: 12px;
      padding: 12px 24px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .nav-brand { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
    .brand-logo {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: bold; color: white;
      box-shadow: 0 0 15px var(--accent-glow);
    }
    .brand-text h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
    .brand-text p { font-size: 11px; color: var(--text-muted); font-weight: 500; }
    .nav-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ctx-pill {
      display: flex; align-items: center; gap: 6px;
      background: #020617; border: 1px solid var(--card-border);
      padding: 5px 12px; border-radius: 9999px; font-size: 12px; color: var(--text-muted);
    }
    .role-pill-highlight {
      background: rgba(56, 189, 248, 0.12) !important;
      border: 1px solid rgba(56, 189, 248, 0.45) !important;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
      cursor: pointer;
    }
    .role-pill-highlight strong, .role-pill-highlight code {
      color: #38bdf8 !important;
      font-weight: 700;
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
    .dot-red { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* Cluster Dropdown Styles */
    .cluster-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 8px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      width: 300px;
      max-height: 380px;
      overflow-y: auto;
      z-index: 1000;
      text-align: left;
    }
    .cluster-dropdown-right {
      left: auto !important;
      right: 0 !important;
    }
    .dropdown-header {
      padding: 10px 14px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
      letter-spacing: 0.05em;
    }
    .cluster-item {
      padding: 10px 14px;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: background 0.15s;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .cluster-item:hover {
      background: #1e293b;
    }
    .cluster-item.current {
      background: rgba(56, 189, 248, 0.12);
      border-left: 3px solid #38bdf8;
    }

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
    .dual-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; min-width: 0; }
    .dual-grid > * { min-width: 0; max-width: 100%; }
    @media (max-width: 992px) { .dual-grid { grid-template-columns: 1fr; } }

    .panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 22px;
      margin-bottom: 20px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
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
      position: relative;
      max-width: 100%;
      min-width: 0;
      margin-top: 14px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
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
      flex-wrap: wrap;
      gap: 8px;
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
      min-height: 240px;
      max-height: 560px;
      overflow-y: scroll;
      overflow-x: auto;
      line-height: 1.55;
      word-break: break-word;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      scrollbar-width: thin;
      scrollbar-color: #475569 #090d16;
    }
    .terminal-body.no-wrap {
      white-space: pre;
      word-break: normal;
      overflow-wrap: normal;
    }
    .terminal-body pre {
      background: #090d16;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #1e293b;
      overflow-x: auto;
      margin: 8px 0;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      max-width: 100%;
      scrollbar-width: thin;
      scrollbar-color: #334155 #090d16;
    }
    .terminal-body code { color: #38bdf8; font-size: 12.5px; }

    /* Custom Always-Visible Draggable Scrollbar */
    .terminal-body::-webkit-scrollbar,
    .terminal-body pre::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    .terminal-body::-webkit-scrollbar-track,
    .terminal-body pre::-webkit-scrollbar-track {
      background: #090d16;
      border-left: 1px solid #1e293b;
      border-radius: 0 0 10px 0;
    }
    .terminal-body::-webkit-scrollbar-thumb,
    .terminal-body pre::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 6px;
      border: 2px solid #090d16;
      cursor: grab;
    }
    .terminal-body::-webkit-scrollbar-thumb:hover,
    .terminal-body pre::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }
    .terminal-body::-webkit-scrollbar-thumb:active,
    .terminal-body pre::-webkit-scrollbar-thumb:active {
      background: #38bdf8;
      cursor: grabbing;
    }

    /* Floating Scroll-to-Bottom Pill */
    .terminal-scroll-pill {
      position: absolute;
      bottom: 16px;
      right: 22px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(8px);
      border: 1px solid #38bdf8;
      color: #38bdf8;
      font-size: 11px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      transition: all 0.2s ease;
      z-index: 10;
    }
    .terminal-scroll-pill:hover {
      background: #0284c7;
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(2, 132, 199, 0.4);
    }
    .btn-active {
      background: rgba(56, 189, 248, 0.2) !important;
      border-color: #38bdf8 !important;
      color: #38bdf8 !important;
    }

    /* Real-Time Execution Streaming Styles */
    .stream-header {
      background: rgba(15, 23, 42, 0.6);
      border-left: 3px solid #38bdf8;
      padding: 10px 14px;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .stream-turn-divider {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 14px 0 8px;
    }
    .stream-turn-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #1e293b;
    }
    .stream-card {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px 14px;
      margin: 6px 0;
      animation: fadeIn 0.15s ease-out;
    }
    .stream-card-running {
      border-left: 3px solid #f59e0b;
    }
    .stream-card-done {
      border-left: 3px solid #10b981;
    }
    .stream-card-blocked {
      border-left: 3px solid #ef4444;
    }
    .stream-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
    }
    .stream-tool-badge {
      background: #1e293b;
      color: #38bdf8;
      font-family: inherit;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 12px;
    }
    .stream-duration-badge {
      font-size: 11px;
      color: #94a3b8;
    }
    .stream-tool-body {
      margin-top: 8px;
      font-size: 12px;
      color: #cbd5e1;
      max-height: 180px;
      overflow-y: auto;
      background: #020617;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid #1e293b;
      white-space: pre-wrap;
      word-break: break-word;
      scrollbar-width: thin;
      scrollbar-color: #334155 #090d16;
    }
    .stream-tool-body::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .stream-tool-body::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 4px;
    }
    .stream-sre-card {
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid #3b82f6;
      border-radius: 8px;
      padding: 10px 14px;
      margin: 8px 0;
    }
    .stream-sre-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
    }
    .stream-sre-approved { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .stream-sre-caution { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .stream-sre-rejected { background: rgba(239, 68, 68, 0.2); color: #f87171; }
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

    /* Sub-tabs Switcher */
    .sub-tabs-bar {
      display: inline-flex;
      background: #020617;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 3px;
      gap: 4px;
    }
    .sub-tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .sub-tab-btn:hover { color: var(--text); }
    .sub-tab-btn.active {
      background: #1e293b;
      color: #38bdf8;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .chip-sm {
      padding: 2px 8px !important;
      font-size: 11px !important;
    }

    /* Chat Session Cards */
    .chat-session-card {
      background: #020617;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .chat-session-card:hover {
      border-color: #38bdf8;
      background: #0b1329;
    }
    .chat-session-card.selected {
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.08);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
    }
    .session-tag-badge {
      display: inline-block;
      background: rgba(56, 189, 248, 0.12);
      color: #7dd3fc;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      margin-right: 4px;
      border: 1px solid rgba(56, 189, 248, 0.25);
    }
    .audit-tag-pill {
      display: inline-block;
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .audit-tag-pill:hover {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      border-color: #38bdf8;
    }

    /* Command Palette Modal (Cmd+K) */
    .cmd-palette-card {
      max-width: 620px;
      width: 95%;
      background: #090d16;
      border: 1px solid #38bdf8;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(56, 189, 248, 0.2);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .cmd-palette-search-box {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      border-bottom: 1px solid #1e293b;
      background: #0f172a;
    }
    .cmd-palette-search-box input {
      background: transparent !important;
      border: none !important;
      font-size: 15px;
      color: white;
      width: 100%;
      outline: none;
      padding: 0;
      box-shadow: none !important;
    }
    .cmd-palette-results {
      max-height: 360px;
      overflow-y: auto;
      padding: 8px;
    }
    .cmd-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.1s;
      color: #cbd5e1;
    }
    .cmd-item:hover, .cmd-item.active {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
    }
    .cmd-item-label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13.5px;
      font-weight: 500;
    }
    .cmd-palette-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 16px;
      border-top: 1px solid #1e293b;
      background: #060911;
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Shortcuts Cheatsheet */
    .shortcuts-section {
      background: #020617;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }
    .shortcuts-title {
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    .shortcut-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 12.5px;
    }
    .shortcut-row:last-child { border-bottom: none; }
    kbd {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    /* Mobile Floating Thumb Approval Bar */
    .mobile-approval-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(12px);
      border-top: 2px solid #f59e0b;
      padding: 12px 20px;
      z-index: 1000;
      box-shadow: 0 -4px 25px rgba(0, 0, 0, 0.6);
      animation: slideUp 0.25s ease-out;
    }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .mobile-approval-inner {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    /* Mobile Responsive Layout Breakpoints */
    @media (max-width: 768px) {
      .navbar {
        padding: 10px 14px;
      }
      .brand-text p {
        display: none;
      }
      .container {
        padding: 12px 10px;
      }
      .dual-grid {
        grid-template-columns: 1fr !important;
        gap: 14px;
      }
      .tabs-bar {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 4px;
      }
      .tabs-bar::-webkit-scrollbar {
        display: none;
      }
      .tab-btn {
        padding: 8px 12px;
        font-size: 13px;
      }
      .btn, .btn-secondary {
        min-height: 42px;
        padding: 8px 14px;
        font-size: 13px;
      }
      .chip {
        padding: 6px 10px;
        font-size: 12px;
      }
      .cluster-dropdown {
        width: 280px;
        left: 50% !important;
        transform: translateX(-50%);
      }
      .responsive-table thead {
        display: none;
      }
      .responsive-table, .responsive-table tbody, .responsive-table tr, .responsive-table td {
        display: block;
        width: 100%;
      }
      .responsive-table tr {
        background: #020617;
        border: 1px solid var(--card-border);
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 8px;
      }
      .responsive-table td {
        padding: 4px 0;
        border: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12.5px;
      }
      .responsive-table td::before {
        content: attr(data-label);
        font-weight: 600;
        color: var(--text-muted);
        font-size: 11px;
        text-transform: uppercase;
      }
    }
  </style>
</head>
<body>
  <!-- Navigation Header -->
  <header class="navbar">
    <div class="nav-brand">
      <div class="brand-logo">⚡</div>
      <div class="brand-text">
        <h1>DevOps Agent — Mission Control v4.5</h1>
        <p>Junior • Intermediate • Senior SRE • Multi-Cloud Orchestration • Guardrails</p>
      </div>
    </div>
    <div class="nav-meta">
      <div class="ctx-pill role-pill-highlight" id="rolePill" onclick="toggleRoleDropdown(event)" style="cursor: pointer; position: relative;" title="Click to switch DevOps Role Hierarchy">
        <span>👔 Role:</span>
        <code id="activeRoleText" class="activeRoleTextSync">${roleStr}</code>
        <span class="status-dot dot-green" id="roleDot"></span>
        <span style="font-size: 10px; color: var(--text-muted); margin-left: 2px;">▼</span>

        <!-- Role Dropdown Menu -->
        <div id="roleDropdownMenu" class="cluster-dropdown" style="display: none; min-width: 280px;">
          <div class="dropdown-header">SWITCH DEVOPS ROLE HIERARCHY</div>
          <div class="cluster-item" onclick="switchRole('junior', event)">
            <div>
              <div style="font-weight: 700; color: #facc15;">🟡 Junior DevOps Agent</div>
              <div style="font-size: 11px; color: var(--text-muted);">Strict approval gate; all mutations require human approval</div>
            </div>
          </div>
          <div class="cluster-item" onclick="switchRole('intermediate', event)">
            <div>
              <div style="font-weight: 700; color: #38bdf8;">🔵 Intermediate DevOps</div>
              <div style="font-size: 11px; color: var(--text-muted);">Autonomous non-prod fixes, self-healing rollouts, GitOps PRs</div>
            </div>
          </div>
          <div class="cluster-item" onclick="switchRole('senior', event)">
            <div>
              <div style="font-weight: 700; color: #c084fc;">🟣 Senior SRE Architect</div>
              <div style="font-size: 11px; color: var(--text-muted);">Architectural peer reviews, blast radius analysis, error budgets</div>
            </div>
          </div>
        </div>
      </div>
      <div class="ctx-pill" id="clusterPill" onclick="toggleClusterDropdown(event)" style="cursor: pointer; position: relative;" title="Click to switch Kubernetes cluster context">
        <span>☸️ Context:</span>
        <code id="activeKubeCtx">${kubeCtx}</code>
        <span class="status-dot ${context.isProduction ? 'dot-red' : 'dot-green'}" id="clusterEnvDot"></span>
        <span style="font-size: 10px; color: var(--text-muted); margin-left: 2px;">▼</span>

        <!-- Cluster Dropdown Menu -->
        <div id="clusterDropdownMenu" class="cluster-dropdown" style="display: none;">
          <div class="dropdown-header">SWITCH KUBERNETES CONTEXT</div>
          <div id="clusterListItems">Loading contexts...</div>
        </div>
      </div>
      <!-- Cloud Provider Pill -->
      <div class="ctx-pill" id="cloudPill" onclick="toggleCloudDropdown(event)" style="cursor: pointer; position: relative;" title="Click to configure Cloud Providers and Kubeconfig Grounding">
        <span>☁️ Cloud:</span>
        <code id="activeCloudText">${cloudSummary}</code>
        <span class="status-dot dot-green" id="cloudDot"></span>
        <span style="font-size: 10px; color: var(--text-muted); margin-left: 2px;">▼</span>

        <!-- Cloud Dropdown Menu -->
        <div id="cloudDropdownMenu" class="cluster-dropdown cluster-dropdown-right" style="display: none; min-width: 320px;" onclick="event.stopPropagation()">
          <div class="dropdown-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span>CLOUD PROVIDERS & KUBECONFIG</span>
            <span onclick="toggleCloudDropdown(event)" style="cursor: pointer; color: var(--text-muted); font-size: 13px; padding: 0 4px;" title="Close">✕</span>
          </div>
          <div class="cluster-item" onclick="toggleProvider('aws', event)" style="cursor: pointer; user-select: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div>
                <div style="font-weight: 700; color: #f1f5f9;">AWS (EKS / EC2)</div>
                <div style="font-size: 11px; color: var(--text-muted);">aws_* tools and aws CLI</div>
              </div>
              <button id="awsBadge" class="badge ${cp.aws ? 'badge-dev' : 'badge-prod'}" style="cursor: pointer; border: none; font-size: 11px; padding: 4px 10px;">${cp.aws ? 'ON' : 'OFF'}</button>
            </div>
          </div>
          <div class="cluster-item" onclick="toggleProvider('azure', event)" style="cursor: pointer; user-select: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div>
                <div style="font-weight: 700; color: #f1f5f9;">Azure (AKS / ARM)</div>
                <div style="font-size: 11px; color: var(--text-muted);">az_* tools and az CLI</div>
              </div>
              <button id="azureBadge" class="badge ${cp.azure ? 'badge-dev' : 'badge-prod'}" style="cursor: pointer; border: none; font-size: 11px; padding: 4px 10px;">${cp.azure ? 'ON' : 'OFF'}</button>
            </div>
          </div>
          <div class="cluster-item" onclick="toggleProvider('gcp', event)" style="cursor: pointer; user-select: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div>
                <div style="font-weight: 700; color: #f1f5f9;">GCP (GKE / Compute)</div>
                <div style="font-size: 11px; color: var(--text-muted);">gcp_* tools and gcloud CLI</div>
              </div>
              <button id="gcpBadge" class="badge ${cp.gcp ? 'badge-dev' : 'badge-prod'}" style="cursor: pointer; border: none; font-size: 11px; padding: 4px 10px;">${cp.gcp ? 'ON' : 'OFF'}</button>
            </div>
          </div>
          <div style="border-top: 1px solid var(--card-border); margin: 6px 0;"></div>
          <div class="cluster-item" onclick="toggleStickKubeConfig(event)" style="cursor: pointer; user-select: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div>
                <div style="font-weight: 700; color: #38bdf8;">☸️ Stick to Kubeconfig</div>
                <div style="font-size: 11px; color: var(--text-muted);">Strict in-cluster diagnostics only</div>
              </div>
              <button id="stickBadge" class="badge ${stick ? 'badge-dev' : 'badge-prod'}" style="cursor: pointer; border: none; font-size: 11px; padding: 4px 10px;">${stick ? 'ACTIVE' : 'OFF'}</button>
            </div>
          </div>
          <div style="border-top: 1px solid var(--card-border); margin: 6px 0;"></div>
          <div style="padding: 6px 12px; background: rgba(255, 255, 255, 0.02);" onclick="event.stopPropagation()">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #38bdf8;">☸️ Kubeconfig File</span>
              <span id="kubeConfigResetBtn" onclick="resetKubeConfig(event)" style="font-size: 10px; color: var(--text-muted); cursor: pointer; text-decoration: underline;" title="Reset to default kubeconfig">Reset</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <input type="text" id="customKubeConfigInput" placeholder="e.g. sb-config or ~/.kube/config" style="flex: 1; font-size: 11px; padding: 4px 6px; background: var(--bg-card); border: 1px solid var(--card-border); border-radius: 4px; color: var(--text-main);" />
              <button onclick="applyCustomKubeConfig(event)" style="padding: 3px 8px; font-size: 11px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Set</button>
            </div>
            <div id="activeKubeConfigDisplay" style="font-size: 10px; color: var(--text-muted); margin-top: 4px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Active kubeconfig">
              ${context.kubeconfig || 'Default (~/.kube/config)'}
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 8px 12px; background: rgba(0,0,0,0.2);">
            <button onclick="activateK8sOnly(event)" style="padding: 6px 8px; font-size: 11px; font-weight: 700; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 6px; cursor: pointer;" title="Block cloud tools and ground to K8s">
              ⚡ K8s Only
            </button>
            <button onclick="enableAllClouds(event)" style="padding: 6px 8px; font-size: 11px; font-weight: 700; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; border-radius: 6px; cursor: pointer;" title="Enable AWS, Azure, and GCP">
              ☁️ Enable All
            </button>
          </div>
        </div>
      </div>
      <div class="ctx-pill" onclick="openCommandPalette()" style="cursor: pointer; background: rgba(56, 189, 248, 0.08); border-color: rgba(56, 189, 248, 0.35);" title="Global Command Palette (Cmd+K)">
        <span style="font-weight: 700; color: #38bdf8;">⌘K</span>
        <span style="font-size: 11px; color: #7dd3fc;">Palette</span>
      </div>
      <div class="ctx-pill" onclick="openShortcutsModal()" style="cursor: pointer;" title="Keyboard Shortcuts (?)">
        <span>⌨️</span>
        <span style="font-size: 11px;">Shortcuts</span>
      </div>
      <div id="envBadgeContainer">${envBadge}</div>
      <div class="ctx-pill" id="agentStatusPill">
        <span class="status-dot dot-green" id="agentDot"></span>
        <span id="agentStatusText">Agent Ready</span>
      </div>
    </div>
  </header>

  <div class="container">
    <!-- Top System Metrics Strip -->
    <div class="metrics-grid">
      <div class="metric-card" onclick="openToolsModal()" style="cursor: pointer;" title="Click to view all native tools">
        <div class="metric-label">Platform Tools</div>
        <div class="metric-val" id="toolCountVal">${toolsCount} Native ↗</div>
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
      <div class="metric-card" onclick="toggleRoleDropdown(event)" style="cursor: pointer;" title="Click to toggle DevOps role hierarchy">
        <div class="metric-label">DevOps Hierarchy Role</div>
        <div class="metric-val" id="roleMetricVal" style="color: #a855f7;">${roleStr}</div>
        <div class="metric-sub">Junior • Intermediate • Senior SRE</div>
      </div>
    </div>

    <!-- Tab Bar -->
    <nav class="tabs-bar">
      <button class="tab-btn active" onclick="switchTab('tab-console')">⚡ Interactive Terminal</button>
      <button class="tab-btn" onclick="switchTab('tab-audit')">🛡️ Guardrail Policy & Audit</button>
      <button class="tab-btn" onclick="switchTab('tab-finops')">💰 FinOps Multi-Cloud Waste</button>
      <button class="tab-btn" onclick="switchTab('tab-security')">🔒 Security & TLS Scanner</button>
      <button class="tab-btn" onclick="switchTab('tab-topology')">🗺️ Service Topology Map</button>
      <button class="tab-btn" onclick="switchTab('tab-kb')">🧠 Incident RCA & Reports</button>
      <button class="tab-btn" onclick="switchTab('tab-simulate')">🚨 Alert Simulator & Webhook</button>
    </nav>

    <!-- Tab 1: Interactive Terminal -->
    <div class="tab-panel active" id="tab-console">
      <div class="dual-grid">
        <div>
          <div class="panel">
            <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div class="panel-title">⚡ Interactive Autonomous Terminal</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="ctx-pill role-pill-highlight" onclick="toggleRoleDropdown(event)" style="font-size: 11px; padding: 4px 10px; cursor: pointer;" title="Click to change DevOps role autonomy">
                  <span>Autonomy:</span>
                  <strong class="activeRoleTextSync" style="color: #38bdf8;">${roleStr}</strong>
                  <span style="font-size: 9px; color: var(--text-muted); margin-left: 2px;">▼</span>
                </div>
                <button class="btn-secondary" onclick="clearTerminal()" style="font-size: 11px;">Clear Output</button>
              </div>
            </div>
            <div class="task-box">
              <textarea id="taskInput" rows="3" placeholder="Enter instructions for the agent (e.g. 'Diagnose failing pods in default', 'List all AWS EC2 instances', 'Audit cluster for waste', 'Check TLS cert expiry')..."></textarea>
            </div>

            <!-- Quick Action Chips (Categorized) -->
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; margin-top: 4px;">Quick Action Shortcuts:</div>
            <div class="chips-row">
              <span class="chip chip-accent" onclick="quickTask('Check why pods in the default namespace are failing')">☸️ Pod Crash Triage</span>
              <span class="chip" onclick="quickTask('List all configured Kubernetes contexts and clusters')">☸️ List Clusters</span>
              <span class="chip" onclick="quickTask('List all pods and deployments in the default namespace')">☸️ K8s Workloads</span>
              <span class="chip chip-accent" onclick="quickTask('Run a complete multi-cloud FinOps audit for idle resources')">💰 FinOps Waste Scan</span>
              <span class="chip" onclick="quickTask('/terraform')">🏗️ Terraform Plan</span>
              <span class="chip" onclick="quickTask('/argocd')">🔄 Argo CD Sync</span>
              <span class="chip" onclick="quickTask('/flux')">⚡ Flux CD Apps</span>
              <span class="chip" onclick="quickTask('helm_template for default chart')">📦 Helm Template</span>
              <span class="chip" onclick="quickTask('/kustomize')">🧩 Kustomize Build</span>
              <span class="chip" onclick="quickTask('List all AWS EC2 instances and EKS status')">☁️ AWS Resources</span>
              <span class="chip" onclick="quickTask('List all GCP compute instances and GKE status')">☁️ GCP Resources</span>
              <span class="chip" onclick="quickTask('Inspect Azure resources and AKS cluster health')">☁️ Azure & AKS</span>
              <span class="chip chip-accent" onclick="quickTask('/cloud')">☁️ Cloud Providers</span>
              <span class="chip" onclick="quickTask('/k8s-only')">🔒 K8s-Only Mode</span>
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
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div class="terminal-dots">
                    <div class="t-dot t-red"></div>
                    <div class="t-dot t-yellow"></div>
                    <div class="t-dot t-green"></div>
                  </div>
                  <div id="terminalStatus" style="font-weight: 500;">Ready. Awaiting command...</div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button class="btn-secondary" id="wrapToggleBtn" onclick="toggleWrap()" style="font-size: 11px; padding: 3px 8px;" title="Toggle word wrap to prevent horizontal stretching">Wrap: ON</button>
                  <button class="btn-secondary" onclick="scrollToBottom()" style="font-size: 11px; padding: 3px 8px;" title="Scroll directly to the bottom line">⬇ Bottom</button>
                  <button class="btn-secondary" onclick="copyTerminalOutput()" style="font-size: 11px; padding: 3px 8px;" title="Copy terminal output to clipboard">📋 Copy</button>
                  <button class="btn-secondary" onclick="downloadTerminalReport()" style="font-size: 11px; padding: 3px 8px;" title="Download terminal investigation report as Markdown file">📥 Download</button>
                  <button class="btn-secondary" onclick="clearTerminal()" style="font-size: 11px; padding: 3px 8px;" title="Clear terminal screen">🗑 Clear</button>
                </div>
              </div>
              <div class="terminal-body" id="terminalOutput">Welcome to DevOps Agent Mission Control v4.0.
Enter an instruction above or click any shortcut chip to dispatch autonomous diagnosis.</div>
              <button id="terminalScrollBottomPill" class="terminal-scroll-pill" onclick="scrollToBottom()" style="display: none;" title="Jump to latest output">
                ⬇ Scroll to Latest
              </button>
            </div>
          </div>
        </div>

        <div>
          <!-- Chat & Incident History + Live Audit Trail (Dual Subtabs) -->
          <div class="panel">
            <div class="panel-header" style="margin-bottom: 12px; gap: 6px; flex-wrap: wrap;">
              <div class="sub-tabs-bar">
                <button class="sub-tab-btn active" id="subtabChatBtn" onclick="switchRightSubTab('chat')">💬 Incident History (<span id="chatHistoryCount">0</span>)</button>
                <button class="sub-tab-btn" id="subtabAuditBtn" onclick="switchRightSubTab('audit')">🛡️ Live Audit</button>
              </div>
              <div style="display: flex; gap: 6px; align-items: center;">
                <button class="btn-secondary" id="clearHistoryBtn" onclick="clearChatHistory()" style="font-size: 11px; padding: 3px 8px;" title="Clear session history">🗑 Clear</button>
                <button class="btn-secondary" onclick="refreshRightPanel()" style="font-size: 11px; padding: 3px 8px;" title="Refresh active view">🔄</button>
              </div>
            </div>

            <!-- Subtab 1: Interactive Chat & Incident History -->
            <div id="subtabChatContent">
              <div style="margin-bottom: 10px;">
                <input type="text" id="chatSearchInput" placeholder="Search sessions or tags (e.g. 'kafka', '#k8s')..." style="margin-bottom: 8px; padding: 7px 12px; font-size: 12px;" oninput="filterChatHistory()">
                <div class="chips-row" style="margin: 0; gap: 4px;">
                  <span class="chip chip-accent chip-sm" id="chatTag-ALL" onclick="filterChatTag('ALL')">All</span>
                  <span class="chip chip-sm" id="chatTag-incident" onclick="filterChatTag('#incident')">🚨 Incident</span>
                  <span class="chip chip-sm" id="chatTag-k8s" onclick="filterChatTag('#k8s')">☸️ K8s</span>
                  <span class="chip chip-sm" id="chatTag-kafka" onclick="filterChatTag('#kafka')">📨 Kafka</span>
                  <span class="chip chip-sm" id="chatTag-redis" onclick="filterChatTag('#redis')">⚡ Redis</span>
                  <span class="chip chip-sm" id="chatTag-cloud" onclick="filterChatTag('#cloud')">☁️ Cloud</span>
                  <span class="chip chip-sm" id="chatTag-finops" onclick="filterChatTag('#finops')">💰 FinOps</span>
                  <span class="chip chip-sm" id="chatTag-security" onclick="filterChatTag('#security')">🔒 Sec</span>
                </div>
              </div>

              <!-- Chat Session Cards List -->
              <div id="chatHistoryContainer" style="max-height: 290px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                <div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 20px 0;">No chat sessions recorded yet. Enter an instruction or click a shortcut chip!</div>
              </div>
            </div>

            <!-- Subtab 2: Live Audit Trail Preview -->
            <div id="subtabAuditContent" style="display: none;">
              <div style="max-height: 290px; overflow-y: auto;">
                <table class="responsive-table">
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
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button class="btn-secondary" onclick="loadAudit()" style="padding: 6px 12px; font-size: 12px;">Refresh</button>
            <button class="btn-secondary" onclick="exportAudit('json')" style="padding: 6px 12px; font-size: 12px;" title="Export full compliance audit trail as JSON">📥 Export JSON</button>
            <button class="btn-secondary" onclick="exportAudit('csv')" style="padding: 6px 12px; font-size: 12px;" title="Export full compliance audit trail as CSV">📥 Export CSV</button>
          </div>
        </div>

        <!-- Advanced Multi-Criteria Filter Controls -->
        <div style="background: #020617; border: 1px solid var(--card-border); border-radius: 10px; padding: 14px; margin-bottom: 16px;">
          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px;">
            <div style="flex: 1; min-width: 220px;">
              <input type="text" id="auditSearchInput" placeholder="🔍 Search tool name, command, output, or error..." style="margin-bottom: 0; padding: 8px 12px; font-size: 13px;" oninput="applyAuditFilters()">
            </div>
            <select id="auditStatusFilter" onchange="applyAuditFilters()" style="background: #0f172a; border: 1px solid var(--card-border); color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; outline: none;">
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">✔ Approved Actions</option>
              <option value="BLOCKED">⛔ Blocked Actions</option>
              <option value="REJECTED">✖ Rejected Actions</option>
            </select>
            <select id="auditTimeFilter" onchange="applyAuditFilters()" style="background: #0f172a; border: 1px solid var(--card-border); color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; outline: none;">
              <option value="ALL">All Time</option>
              <option value="15M">Last 15 Minutes</option>
              <option value="1H">Last 1 Hour</option>
              <option value="TODAY">Today Only</option>
            </select>
            <button class="btn-secondary" onclick="resetAuditFilters()" style="padding: 8px 12px; font-size: 12px;">↺ Reset</button>
          </div>

          <!-- Tier Chips Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Safety Tier:</span>
              <button class="chip chip-accent chip-sm" id="auditTier-ALL" onclick="filterAuditTier('ALL')">All Tiers</button>
              <button class="chip chip-sm" id="auditTier-READ" onclick="filterAuditTier('READ')">🟢 Tier 1: Read</button>
              <button class="chip chip-sm" id="auditTier-MUTATE" onclick="filterAuditTier('MUTATE')">🟡 Tier 2: Mutate</button>
              <button class="chip chip-sm" id="auditTier-DANGEROUS" onclick="filterAuditTier('DANGEROUS')">🔴 Tier 3: Blocked</button>
            </div>
            <div id="auditFilterCount" style="font-size: 12px; color: var(--text-muted);">
              Showing all recorded actions
            </div>
          </div>

          <!-- Domain Tags Row -->
          <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.05);">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Domain Tags:</span>
            <span class="chip chip-accent chip-sm" id="auditTag-ALL" onclick="filterAuditTag('ALL')">All Tags</span>
            <span class="chip chip-sm" id="auditTag-k8s" onclick="filterAuditTag('#k8s')">☸️ #k8s</span>
            <span class="chip chip-sm" id="auditTag-aws" onclick="filterAuditTag('#aws')">🔶 #aws</span>
            <span class="chip chip-sm" id="auditTag-azure" onclick="filterAuditTag('#azure')">🔷 #azure</span>
            <span class="chip chip-sm" id="auditTag-gcp" onclick="filterAuditTag('#gcp')">🔴 #gcp</span>
            <span class="chip chip-sm" id="auditTag-kafka" onclick="filterAuditTag('#kafka')">📨 #kafka</span>
            <span class="chip chip-sm" id="auditTag-redis" onclick="filterAuditTag('#redis')">⚡ #redis</span>
            <span class="chip chip-sm" id="auditTag-queues" onclick="filterAuditTag('#queues')">🐰 #queues</span>
            <span class="chip chip-sm" id="auditTag-iac" onclick="filterAuditTag('#iac')">🏗️ #iac</span>
            <span class="chip chip-sm" id="auditTag-security" onclick="filterAuditTag('#security')">🛡️ #security</span>
            <span class="chip chip-sm" id="auditTag-runbook" onclick="filterAuditTag('#runbook')">📖 #runbook</span>
          </div>
        </div>

        <div style="max-height: 550px; overflow-y: auto;">
          <table class="responsive-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Tool Name & Tags</th>
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

    <!-- Tab 6: Incident RCA Knowledge Base & Downloadable Reports -->
    <div class="tab-panel" id="tab-kb">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🧠 Incident RCA Knowledge Base & Postmortem Reports</div>
            <div class="panel-subtitle">Browse and download incident postmortem markdown reports, or search indexed root cause runbooks.</div>
          </div>
          <button class="btn-secondary" onclick="loadReportsList()" style="padding: 6px 12px; font-size: 12px;">🔄 Refresh Reports</button>
        </div>

        <!-- Downloadable Reports Catalog -->
        <div style="margin-bottom: 24px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--text);">📄 Generated Postmortem Incident Reports</div>
          <div id="reportsListContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px;">
            <div style="color: var(--text-muted); font-size: 13px;">Loading reports catalog...</div>
          </div>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;">

        <!-- Knowledge Base Full-Text Search -->
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--text);">🔍 Semantic & Keyword Runbook Search</div>
        <input type="text" id="kbQuery" placeholder="Search past incidents (e.g. 'CrashLoopBackOff', 'OOMKilled', 'database timeout', '502 Bad Gateway')..." oninput="searchKb()">

        <div class="terminal-container" style="margin-top: 14px;">
          <div class="terminal-topbar">SEARCH RESULTS & INCIDENT VIEWER</div>
          <div class="terminal-body markdown-rendered" id="kbResults">Type a query above to search through indexed incident postmortems, or click "View" on any report above.</div>
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
        <div style="font-weight: 700; font-size: 16px;">🧰 Native DevOps Tool Catalog (<span id="toolsModalCount">${toolsCount}</span> Registered Tools)</div>
        <button class="modal-close" onclick="closeToolsModal()">&times;</button>
      </div>
      <div class="modal-body" id="toolsModalBody">
        ${availableTools.map((t, idx) => `
          <div style="background: #020617; border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <code style="color: #38bdf8; font-weight: bold; font-size: 13px;">${t.name}</code>
              <span style="font-size: 11px; color: var(--text-muted);">#${idx + 1}</span>
            </div>
            <div style="color: #cbd5e1; font-size: 12px;">${t.description}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <!-- Modal: Global SRE Command Palette (Cmd+K / Ctrl+K) -->
  <div class="modal-overlay" id="commandPaletteModal" onclick="closeCommandPalette()">
    <div class="modal-card cmd-palette-card" onclick="event.stopPropagation()">
      <div class="cmd-palette-search-box">
        <span style="font-size: 16px; color: #38bdf8;">⌘</span>
        <input type="text" id="cmdPaletteInput" placeholder="Type a runbook, role, or action (e.g. 'kafka', 'crashloop', 'senior', 'audit')..." autocomplete="off" oninput="filterPalette()">
        <kbd style="cursor: pointer;" onclick="closeCommandPalette()">ESC</kbd>
      </div>
      <div class="cmd-palette-results" id="cmdPaletteResults">
        <!-- Rendered dynamically -->
      </div>
      <div class="cmd-palette-footer">
        <span>Navigate: <kbd>↑</kbd> <kbd>↓</kbd></span>
        <span>Execute: <kbd>Enter</kbd></span>
        <span>Dismiss: <kbd>Esc</kbd></span>
      </div>
    </div>
  </div>

  <!-- Modal: Keyboard Shortcuts Cheatsheet (?) -->
  <div class="modal-overlay" id="shortcutsModal" onclick="closeShortcutsModal()">
    <div class="modal-card" style="max-width: 650px;" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div style="font-weight: 700; font-size: 16px; display: flex; align-items: center; gap: 8px;">
          <span>⌨️ Mission Control Keyboard Shortcuts</span>
        </div>
        <button class="modal-close" onclick="closeShortcutsModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="shortcuts-section">
          <div class="shortcuts-title">Navigation & Quick Access</div>
          <div class="shortcut-row"><span>Global Command Palette</span><div><kbd>⌘</kbd> + <kbd>K</kbd> / <kbd>Ctrl</kbd> + <kbd>K</kbd></div></div>
          <div class="shortcut-row"><span>Keyboard Shortcuts Cheatsheet</span><div><kbd>?</kbd> or <kbd>Shift</kbd> + <kbd>/</kbd></div></div>
          <div class="shortcut-row"><span>Dismiss Modal / Dropdown</span><div><kbd>Esc</kbd></div></div>
        </div>
        <div class="shortcuts-section">
          <div class="shortcuts-title">Terminal & Investigation</div>
          <div class="shortcut-row"><span>Dispatch Task Prompt</span><div><kbd>Enter</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd></div></div>
          <div class="shortcut-row"><span>Newline in Prompt Box</span><div><kbd>Shift</kbd> + <kbd>Enter</kbd></div></div>
          <div class="shortcut-row"><span>Clear Terminal Output</span><div><kbd>⌘</kbd> + <kbd>L</kbd> / <kbd>Ctrl</kbd> + <kbd>L</kbd></div></div>
          <div class="shortcut-row"><span>Jump to Latest Output</span><div><kbd>⌘</kbd> + <kbd>↓</kbd></div></div>
        </div>
        <div class="shortcuts-section">
          <div class="shortcuts-title">DevOps Autonomy Hierarchy</div>
          <div class="shortcut-row"><span>Switch to Junior SRE (Strict Gate)</span><div><kbd>Alt</kbd> + <kbd>1</kbd></div></div>
          <div class="shortcut-row"><span>Switch to Intermediate SRE</span><div><kbd>Alt</kbd> + <kbd>2</kbd></div></div>
          <div class="shortcut-row"><span>Switch to Senior SRE Architect</span><div><kbd>Alt</kbd> + <kbd>3</kbd></div></div>
        </div>
        <div class="shortcuts-section">
          <div class="shortcuts-title">Guardrail Approvals</div>
          <div class="shortcut-row"><span>Approve Pending Mutation</span><div><kbd>Y</kbd> or <kbd>A</kbd></div></div>
          <div class="shortcut-row"><span>Reject Pending Mutation</span><div><kbd>N</kbd> or <kbd>R</kbd></div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Mobile Floating Thumb Approval Bar -->
  <div id="mobileApprovalBar" class="mobile-approval-bar" style="display: none;">
    <div class="mobile-approval-inner">
      <div>
        <div style="font-size: 11px; color: #f59e0b; font-weight: 700; letter-spacing: 0.05em;">⚠️ APPROVAL REQUIRED</div>
        <div id="mobileApprovalText" style="font-size: 12px; font-weight: 600; color: white;">Mutate action awaiting confirmation</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn" id="mobileApproveBtn" onclick="resolveActiveApproval(true)" style="background: #10b981; border: 1px solid #059669; padding: 8px 16px; font-size: 12px; font-weight: 700;">✔ Approve</button>
        <button class="btn" id="mobileRejectBtn" onclick="resolveActiveApproval(false)" style="background: #ef4444; border: 1px solid #dc2626; padding: 8px 14px; font-size: 12px; font-weight: 700;">✖ Reject</button>
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

    // Terminal ANSI Color & Format Converter
    function convertAnsiToHtml(str) {
      if (!str) return '';
      const ansiMap = {
        '30': '#64748b', '31': '#f87171', '32': '#4ade80', '33': '#fbbf24',
        '34': '#60a5fa', '35': '#c084fc', '36': '#38bdf8', '37': '#f1f5f9',
        '90': '#94a3b8', '91': '#fca5a5', '92': '#86efac', '93': '#fde047',
        '94': '#93c5fd', '95': '#d8b4fe', '96': '#67e8f9', '97': '#ffffff'
      };

      let out = str.replace(/(?:\\u001b|\\x1b|[\\u001b\\x1b])\\[([0-9;]+)m/g, (match, codeStr) => {
        const codes = codeStr.split(';');
        let span = '';
        for (const c of codes) {
          if (c === '0' || c === '39' || c === '49') return '</span>';
          if (c === '1') span += '<span style="font-weight: 600;">';
          else if (ansiMap[c]) span += '<span style="color: ' + ansiMap[c] + ';">';
        }
        return span || '';
      });

      // Handle naked bracket codes like [33m or [39m
      out = out.replace(/\\[([0-9]{1,2})m/g, (match, c) => {
        if (c === '0' || c === '39') return '</span>';
        if (ansiMap[c]) return '<span style="color: ' + ansiMap[c] + ';">';
        return '';
      });

      out = out.replace(/(?:\\u001b|\\x1b|[\\u001b\\x1b])\\[[0-9;]*[a-zA-Z]/g, '');
      return out;
    }

    // Markdown Formatter (Lightweight & Safe)
    function renderMarkdown(md) {
      if (!md) return '';
      let html = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Convert terminal ANSI colors and escape sequences to styled spans
      html = convertAnsiToHtml(html);

      // Code blocks
      html = html.replace(/\`\`\`([a-z]*)\\n([\\s\\S]*?)\`\`\`/g, (m, lang, code) => {
        return '<pre><code>' + code + '</code></pre>';
      });

      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

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
          var modalCount = document.getElementById('toolsModalCount');
          if (modalCount) modalCount.innerText = systemStatus.toolsCount;
        }
        if (systemStatus.context && systemStatus.context.roleLevel) {
          const r = systemStatus.context.roleLevel.toUpperCase();
          document.querySelectorAll('.activeRoleTextSync').forEach(function(el) {
            el.innerText = r;
          });
          const metricVal = document.getElementById('roleMetricVal');
          if (metricVal) metricVal.innerText = r;
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

    // Audit Multi-Criteria Filters State
    let auditFilters = {
      q: '',
      tier: 'ALL',
      status: 'ALL',
      tag: 'ALL',
      time: 'ALL'
    };

    function inferAuditTag(toolName) {
      if (!toolName) return '#ops';
      const name = toolName.toLowerCase();
      if (name.startsWith('k8s_') || name === 'kubectl') return '#k8s';
      if (name.startsWith('aws_')) return '#aws';
      if (name.startsWith('az_')) return '#azure';
      if (name.startsWith('gcp_')) return '#gcp';
      if (name.startsWith('kafka_')) return '#kafka';
      if (name.startsWith('redis_')) return '#redis';
      if (name.startsWith('rabbitmq_') || name.startsWith('activemq_')) return '#queues';
      if (name.startsWith('terraform_') || name.startsWith('pulumi_') || name.startsWith('ansible_')) return '#iac';
      if (name.startsWith('sec_') || name.startsWith('trivy_') || name.startsWith('falco_') || name.startsWith('cert_')) return '#security';
      if (name.startsWith('runbook_')) return '#runbook';
      return '#ops';
    }

    // Load Audit Trail
    async function loadAudit() {
      try {
        const res = await fetch('/api/audit');
        const data = await res.json();
        auditRecords = data.records || [];

        applyAuditFilters();
        const metric = document.getElementById('auditMetricVal');
        if (metric) metric.innerText = auditRecords.length + ' Recorded';
      } catch (e) {
        console.error('Audit load failed:', e);
      }
    }

    function exportAudit(format) {
      window.location.href = '/api/audit/export?format=' + encodeURIComponent(format);
      showToast('Exporting compliance audit log as ' + format.toUpperCase() + '...');
    }

    function applyAuditFilters() {
      const qInput = document.getElementById('auditSearchInput');
      if (qInput) auditFilters.q = qInput.value.toLowerCase().trim();

      const statusSelect = document.getElementById('auditStatusFilter');
      if (statusSelect) auditFilters.status = statusSelect.value;

      const timeSelect = document.getElementById('auditTimeFilter');
      if (timeSelect) auditFilters.time = timeSelect.value;

      const now = Date.now();
      const filtered = auditRecords.filter(r => {
        // Text search (tool, command, output, error)
        if (auditFilters.q) {
          const matchTool = r.toolName && r.toolName.toLowerCase().includes(auditFilters.q);
          const matchCmd = r.command && r.command.toLowerCase().includes(auditFilters.q);
          const matchOut = r.outputSummary && r.outputSummary.toLowerCase().includes(auditFilters.q);
          const matchErr = r.error && r.error.toLowerCase().includes(auditFilters.q);
          if (!matchTool && !matchCmd && !matchOut && !matchErr) return false;
        }

        // Tier filter
        if (auditFilters.tier !== 'ALL' && r.tier !== auditFilters.tier) return false;

        // Status filter
        if (auditFilters.status !== 'ALL') {
          if (auditFilters.status === 'BLOCKED' && !r.isBlocked) return false;
          if (auditFilters.status === 'APPROVED' && (r.isBlocked || r.approved === false)) return false;
          if (auditFilters.status === 'REJECTED' && r.approved !== false) return false;
        }

        // Tag filter
        if (auditFilters.tag !== 'ALL') {
          const tag = inferAuditTag(r.toolName);
          if (tag.toLowerCase() !== auditFilters.tag.toLowerCase()) return false;
        }

        // Time filter
        if (auditFilters.time !== 'ALL' && r.timestamp) {
          const recordTime = new Date(r.timestamp).getTime();
          const diffMs = now - recordTime;
          if (auditFilters.time === '15M' && diffMs > 15 * 60 * 1000) return false;
          if (auditFilters.time === '1H' && diffMs > 60 * 60 * 1000) return false;
          if (auditFilters.time === 'TODAY' && diffMs > 24 * 60 * 60 * 1000) return false;
        }

        return true;
      });

      renderAuditTables(filtered);

      const countEl = document.getElementById('auditFilterCount');
      if (countEl) {
        countEl.innerText = 'Showing ' + filtered.length + ' of ' + auditRecords.length + ' recorded actions';
      }
    }

    function filterAudit() {
      applyAuditFilters();
    }

    function filterAuditTier(tier) {
      auditFilters.tier = tier;
      ['ALL', 'READ', 'MUTATE', 'DANGEROUS'].forEach(t => {
        const btn = document.getElementById('auditTier-' + t);
        if (btn) {
          if (t === tier) btn.classList.add('chip-accent');
          else btn.classList.remove('chip-accent');
        }
      });
      applyAuditFilters();
    }

    function filterAuditTag(tag) {
      auditFilters.tag = tag;
      const tagIds = ['ALL', 'k8s', 'aws', 'azure', 'gcp', 'kafka', 'redis', 'queues', 'iac', 'security', 'runbook'];
      tagIds.forEach(t => {
        const el = document.getElementById('auditTag-' + t);
        if (el) {
          const currentTagFormatted = t === 'ALL' ? 'ALL' : '#' + t;
          if (currentTagFormatted.toLowerCase() === tag.toLowerCase()) el.classList.add('chip-accent');
          else el.classList.remove('chip-accent');
        }
      });
      applyAuditFilters();
    }

    function resetAuditFilters() {
      auditFilters = { q: '', tier: 'ALL', status: 'ALL', tag: 'ALL', time: 'ALL' };
      const qInput = document.getElementById('auditSearchInput');
      if (qInput) qInput.value = '';
      const statusSelect = document.getElementById('auditStatusFilter');
      if (statusSelect) statusSelect.value = 'ALL';
      const timeSelect = document.getElementById('auditTimeFilter');
      if (timeSelect) timeSelect.value = 'ALL';
      filterAuditTier('ALL');
      filterAuditTag('ALL');
    }

    function renderAuditTables(records) {
      const miniBody = document.getElementById('auditTableBody');
      const fullBody = document.getElementById('fullAuditTableBody');

      if (!records || records.length === 0) {
        const emptyRow = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No actions recorded matching filters.</td></tr>';
        if (miniBody) miniBody.innerHTML = emptyRow;
        if (fullBody) fullBody.innerHTML = emptyRow;
        return;
      }

      // Mini preview (last 6 of raw audit trail)
      if (miniBody) {
        miniBody.innerHTML = auditRecords.slice(0, 6).map(r => {
          const time = r.timestamp ? r.timestamp.slice(11, 19) : '--';
          const tierClass = r.tier === 'READ' ? 'tier-read' : r.tier === 'MUTATE' ? 'tier-mutate' : 'tier-danger';
          const status = r.isBlocked ? '⛔ Blocked' : r.approved ? '✔ Approved' : '✖ Rejected';
          return '<tr><td data-label="Time">' + time + '</td><td data-label="Tool"><code>' + r.toolName + '</code></td><td data-label="Tier" class="' + tierClass + '">' + r.tier + '</td><td data-label="Status">' + status + '</td></tr>';
        }).join('');
      }

      // Full table
      if (fullBody) {
        fullBody.innerHTML = records.map(r => {
          const time = r.timestamp ? r.timestamp.replace('T', ' ').slice(0, 19) : '--';
          const tierClass = r.tier === 'READ' ? 'tier-read' : r.tier === 'MUTATE' ? 'tier-mutate' : 'tier-danger';
          const status = r.isBlocked ? '⛔ Blocked' : r.approved ? '✔ Approved' : '✖ Rejected';
          const tag = inferAuditTag(r.toolName);
          const cmd = r.command ? '<code>' + escapeHtml(r.command.slice(0, 90)) + '</code>' : (r.outputSummary ? '<span style="color: #94a3b8; font-size: 11.5px;">' + escapeHtml(r.outputSummary.slice(0, 80)) + '</span>' : '<span style="color: var(--text-muted);">-</span>');
          return '<tr>' +
            '<td data-label="Timestamp" style="font-size: 12px; color: var(--text-muted);">' + time + '</td>' +
            '<td data-label="Tool">' +
              '<code>' + escapeHtml(r.toolName) + '</code> ' +
              '<span class="audit-tag-pill" onclick="filterAuditTag(&quot;' + tag + '&quot;)">' + tag + '</span>' +
            '</td>' +
            '<td data-label="Tier" class="' + tierClass + '">' + r.tier + '</td>' +
            '<td data-label="Status">' + status + '</td>' +
            '<td data-label="Context">' + cmd + '</td>' +
          '</tr>';
        }).join('');
      }
    }

    // Chat & Incident History System
    let chatHistory = [];
    let currentChatTag = 'ALL';
    let selectedChatSessionId = null;

    async function loadChatHistory() {
      try {
        const res = await fetch('/api/chat/history');
        if (res.ok) {
          const data = await res.json();
          chatHistory = data.sessions || [];
        }
      } catch (e) {
        const local = localStorage.getItem('devops_agent_chat_history');
        if (local) {
          try { chatHistory = JSON.parse(local); } catch (err) {}
        }
      }
      renderChatHistory();
    }

    function filterChatHistory() {
      renderChatHistory();
    }

    function filterChatTag(tag) {
      currentChatTag = tag;
      const tags = ['ALL', 'incident', 'k8s', 'kafka', 'redis', 'cloud', 'finops', 'security'];
      tags.forEach(t => {
        const el = document.getElementById('chatTag-' + t);
        if (el) {
          const formatted = t === 'ALL' ? 'ALL' : '#' + t;
          if (formatted.toLowerCase() === tag.toLowerCase()) el.classList.add('chip-accent');
          else el.classList.remove('chip-accent');
        }
      });
      renderChatHistory();
    }

    function renderChatHistory() {
      const container = document.getElementById('chatHistoryContainer');
      const countEl = document.getElementById('chatHistoryCount');
      if (countEl) countEl.innerText = chatHistory.length;

      if (!container) return;
      const qInput = document.getElementById('chatSearchInput');
      const q = qInput ? qInput.value.toLowerCase().trim() : '';

      const filtered = chatHistory.filter(s => {
        if (q) {
          const matchTask = s.task && s.task.toLowerCase().includes(q);
          const matchRes = s.result && s.result.toLowerCase().includes(q);
          const matchErr = s.error && s.error.toLowerCase().includes(q);
          const matchTag = s.tags && s.tags.some(t => t.toLowerCase().includes(q));
          if (!matchTask && !matchRes && !matchErr && !matchTag) return false;
        }
        if (currentChatTag !== 'ALL') {
          if (!s.tags || !s.tags.some(t => t.toLowerCase() === currentChatTag.toLowerCase())) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 20px 0;">No matching sessions found.</div>';
        return;
      }

      container.innerHTML = filtered.map(s => {
        const time = s.timestamp ? s.timestamp.slice(11, 19) : '--';
        const isRunning = s.status === 'RUNNING';
        const isSuccess = s.status === 'SUCCESS';
        const dotClass = isRunning ? 'dot-amber' : isSuccess ? 'dot-green' : 'dot-red';
        const roleStr = (s.role || 'junior').toUpperCase();
        const shortPrompt = s.task.length > 55 ? s.task.slice(0, 55) + '...' : s.task;
        const tagsHtml = (s.tags || []).map(t => '<span class="session-tag-badge" onclick="event.stopPropagation(); filterChatTag(&quot;' + t + '&quot;)">' + escapeHtml(t) + '</span>').join('');
        const isSelected = selectedChatSessionId === s.id ? ' selected' : '';

        return '<div class="chat-session-card' + isSelected + '" onclick="inspectChatSession(&quot;' + s.id + '&quot;)">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
            '<div style="display: flex; align-items: center; gap: 6px;">' +
              '<span class="status-dot ' + dotClass + '"></span>' +
              '<span style="font-size: 11px; color: var(--text-muted);">' + time + '</span>' +
              '<span class="badge badge-dev" style="font-size: 9px; padding: 2px 6px;">' + roleStr + '</span>' +
            '</div>' +
            '<div style="display: flex; gap: 4px;">' +
              '<button class="btn-secondary" onclick="event.stopPropagation(); rerunChatSession(&quot;' + s.id + '&quot;)" style="padding: 2px 6px; font-size: 10px;" title="Re-run task">⚡ Re-run</button>' +
              '<button class="btn-secondary" onclick="event.stopPropagation(); tagChatSession(&quot;' + s.id + '&quot;)" style="padding: 2px 6px; font-size: 10px;" title="Add Tag">+ Tag</button>' +
            '</div>' +
          '</div>' +
          '<div style="font-size: 12.5px; font-weight: 600; color: #f1f5f9; margin-bottom: 4px;">' + escapeHtml(shortPrompt) + '</div>' +
          '<div>' + tagsHtml + '</div>' +
        '</div>';
      }).join('');
    }

    function inspectChatSession(id) {
      selectedChatSessionId = id;
      renderChatHistory();
      const session = chatHistory.find(s => s.id === id);
      if (!session) return;

      const out = document.getElementById('terminalOutput');
      const status = document.getElementById('terminalStatus');
      if (status) status.innerText = 'Viewing session [' + (session.timestamp ? session.timestamp.slice(11, 19) : '') + ']';

      if (out) {
        const resText = session.result || (session.error ? '[Error]: ' + session.error : '(No result output)');
        out.innerHTML =
          '<div class="stream-header">' +
            '<div style="display: flex; justify-content: space-between; align-items: center;">' +
              '<div style="color: #38bdf8; font-weight: 600; font-size: 13px;">⚡ [SESSION ARCHIVE]: "' + escapeHtml(session.task) + '"</div>' +
              '<span class="badge badge-dev">' + (session.role || 'junior').toUpperCase() + '</span>' +
            '</div>' +
            '<div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Recorded: ' + (session.timestamp || '') + ' • Status: ' + session.status + '</div>' +
          '</div>' +
          '<div class="markdown-rendered" style="margin-top: 14px;">' + renderMarkdown(resText) + '</div>';
        scrollToBottom();
      }
    }

    function rerunChatSession(id) {
      const session = chatHistory.find(s => s.id === id);
      if (!session) return;
      document.getElementById('taskInput').value = session.task;
      runTask();
    }

    async function tagChatSession(id) {
      const tag = prompt('Enter a tag to attach to this incident session (e.g. #p1, #prod, #resolved):');
      if (!tag) return;
      const formatted = tag.startsWith('#') ? tag : '#' + tag;

      try {
        const res = await fetch('/api/chat/history/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, tag: formatted })
        });
        if (res.ok) {
          const target = chatHistory.find(s => s.id === id);
          if (target && !target.tags.includes(formatted)) {
            target.tags.push(formatted);
          }
          showToast('Tag ' + formatted + ' added to session!');
          renderChatHistory();
        }
      } catch (err) {
        showToast('Failed to add tag: ' + err.message);
      }
    }

    async function clearChatHistory() {
      if (!confirm('Clear all recorded chat & incident sessions?')) return;
      try {
        await fetch('/api/chat/history', { method: 'DELETE' });
      } catch (e) {}
      chatHistory = [];
      localStorage.removeItem('devops_agent_chat_history');
      renderChatHistory();
      showToast('Session history cleared.');
    }

    function switchRightSubTab(tab) {
      const chatContent = document.getElementById('subtabChatContent');
      const auditContent = document.getElementById('subtabAuditContent');
      const chatBtn = document.getElementById('subtabChatBtn');
      const auditBtn = document.getElementById('subtabAuditBtn');

      if (tab === 'chat') {
        if (chatContent) chatContent.style.display = 'block';
        if (auditContent) auditContent.style.display = 'none';
        if (chatBtn) chatBtn.classList.add('active');
        if (auditBtn) auditBtn.classList.remove('active');
      } else {
        if (chatContent) chatContent.style.display = 'none';
        if (auditContent) auditContent.style.display = 'block';
        if (chatBtn) chatBtn.classList.remove('active');
        if (auditBtn) auditBtn.classList.add('active');
      }
    }

    function refreshRightPanel() {
      loadChatHistory();
      loadAudit();
      showToast('Incident history and audit refreshed.');
    }

    // HTML Entity Escaping
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Stream Event Dispatcher & Renderer
    function handleStreamEvent(eventType, data, stepsContainer, finalContainer, status) {
      if (eventType === 'turn_start') {
        const div = document.createElement('div');
        div.className = 'stream-turn-divider';
        div.innerHTML = '<span>Turn ' + data.turn + ' • Reasoning & Planning</span>';
        stepsContainer.appendChild(div);
        status.innerText = 'Turn ' + data.turn + ': Agent analyzing...';
        scrollToBottom();
      } else if (eventType === 'tool_start') {
        const card = document.createElement('div');
        card.className = 'stream-card stream-card-running';
        const argsStr = data.args ? JSON.stringify(data.args) : '';
        const shortArgs = argsStr.length > 70 ? argsStr.slice(0, 70) + '...' : argsStr;
        card.innerHTML = 
          '<div class="stream-card-header">' +
            '<div>' +
              '<span style="color: #f59e0b;">⏳</span> ' +
              '<span class="stream-tool-badge">' + escapeHtml(data.name) + '</span> ' +
              '<span style="color: #94a3b8; font-size: 11.5px; margin-left: 6px;">' + escapeHtml(shortArgs) + '</span>' +
            '</div>' +
            '<span class="stream-duration-badge">Running...</span>' +
          '</div>';
        stepsContainer.appendChild(card);
        status.innerText = 'Executing ' + data.name + '...';
        scrollToBottom();
      } else if (eventType === 'tool_end') {
        const runningCards = stepsContainer.querySelectorAll('.stream-card-running');
        const card = runningCards.length > 0 ? runningCards[runningCards.length - 1] : null;
        const durSec = (data.durationMs / 1000).toFixed(1);
        if (card) {
          card.className = 'stream-card stream-card-done';
          const header = card.querySelector('.stream-card-header');
          if (header) {
            header.innerHTML = 
              '<div>' +
                '<span style="color: #10b981;">✔</span> ' +
                '<span class="stream-tool-badge">' + escapeHtml(data.name) + '</span>' +
              '</div>' +
              '<span class="stream-duration-badge" style="color: #34d399;">✔ ' + durSec + 's</span>';
          }
          if (data.outputSummary) {
            const body = document.createElement('div');
            body.className = 'stream-tool-body';
            body.innerHTML = convertAnsiToHtml(escapeHtml(data.outputSummary));
            card.appendChild(body);
          }
        }
        status.innerText = 'Tool ' + data.name + ' completed (' + durSec + 's)';
        scrollToBottom();
      } else if (eventType === 'sre_review') {
        const badgeClass = data.verdict === 'APPROVED' ? 'stream-sre-approved' : data.verdict === 'CAUTION' ? 'stream-sre-caution' : 'stream-sre-rejected';
        const card = document.createElement('div');
        card.className = 'stream-sre-card';
        card.innerHTML = 
          '<div style="display: flex; justify-content: space-between; align-items: center;">' +
            '<div style="font-weight: 600; font-size: 12px; color: #60a5fa;">🛡️ Senior SRE Architectural Review</div>' +
            '<span class="stream-sre-badge ' + badgeClass + '">' + escapeHtml(data.verdict) + ' (Blast Radius: ' + escapeHtml(data.blastRadius) + ')</span>' +
          '</div>' +
          '<div style="font-size: 11.5px; color: #cbd5e1; margin-top: 6px;">' + escapeHtml(data.critique) + '</div>';
        stepsContainer.appendChild(card);
        scrollToBottom();
      } else if (eventType === 'policy_blocked') {
        const card = document.createElement('div');
        card.className = 'stream-card stream-card-blocked';
        card.innerHTML = 
          '<div style="color: #f87171; font-weight: 600; font-size: 12.5px;">⛔ Action Blocked by Policy</div>' +
          '<div style="color: #e2e8f0; font-size: 12px; margin-top: 4px;"><strong>' + escapeHtml(data.actionSummary) + '</strong></div>' +
          '<div style="color: #94a3b8; font-size: 11.5px; margin-top: 2px;">Reason: ' + escapeHtml(data.reason) + '</div>';
        stepsContainer.appendChild(card);
        scrollToBottom();
      } else if (eventType === 'approval_requested') {
        const card = document.createElement('div');
        const isProd = data.isProduction;
        card.id = 'approval-card-' + data.approvalId;
        card.className = 'stream-card';
        card.style.borderLeft = isProd ? '4px solid #ef4444' : '4px solid #f59e0b';
        card.style.background = isProd ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)';
        card.style.padding = '14px';

        let diffHtml = '';
        if (data.diff) {
          diffHtml = '<div style="margin-top: 10px; font-size: 11px; background: #020617; padding: 10px; border-radius: 6px; overflow-x: auto; font-family: monospace; border: 1px solid #334155;">' +
            convertAnsiToHtml(escapeHtml(data.diff)) +
          '</div>';
        }

        let sreHtml = '';
        if (data.sreReview) {
          const badgeClass = data.sreReview.verdict === 'APPROVED' ? 'stream-sre-approved' : 'stream-sre-caution';
          sreHtml = '<div style="margin-top: 8px; font-size: 11.5px; color: #94a3b8; background: rgba(30, 41, 59, 0.5); padding: 8px 10px; border-radius: 6px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center;">' +
              '<strong style="color: #60a5fa;">🛡️ Senior SRE Pre-Flight Review</strong>' +
              '<span class="stream-sre-badge ' + badgeClass + '">' + escapeHtml(data.sreReview.verdict) + ' (' + escapeHtml(data.sreReview.blastRadius) + ')</span>' +
            '</div>' +
            '<div style="margin-top: 4px; color: #cbd5e1;">' + escapeHtml(data.sreReview.critique) + '</div>' +
          '</div>';
        }

        card.innerHTML = 
          '<div style="display: flex; justify-content: space-between; align-items: center;">' +
            '<div style="color: ' + (isProd ? '#f87171' : '#f59e0b') + '; font-weight: 700; font-size: 13px;">' +
              (isProd ? '🚨 PRODUCTION MUTATION APPROVAL REQUIRED' : '⚠️ HUMAN-IN-THE-LOOP APPROVAL REQUIRED') +
            '</div>' +
            '<span style="font-size: 11px; color: #94a3b8; font-family: monospace;">ID: ' + escapeHtml((data.approvalId || '').slice(0, 8)) + '</span>' +
          '</div>' +
          '<div style="margin-top: 8px; font-size: 12.5px; color: #f1f5f9;"><strong>Action:</strong> ' + escapeHtml(data.actionSummary) + '</div>' +
          '<div style="margin-top: 4px; font-size: 11.5px; color: #94a3b8;"><strong>Reason:</strong> ' + escapeHtml(data.reason) + '</div>' +
          sreHtml +
          diffHtml +
          '<div id="approval-actions-' + data.approvalId + '" style="margin-top: 12px; display: flex; gap: 10px;">' +
            '<button class="btn btn-primary" onclick="resolveWebApproval(&quot;' + escapeHtml(data.approvalId) + '&quot;, true)" style="background: #10b981; border-color: #059669; font-size: 12px; padding: 6px 16px;">✔ Approve & Execute</button>' +
            '<button class="btn" onclick="resolveWebApproval(&quot;' + escapeHtml(data.approvalId) + '&quot;, false)" style="background: #ef4444; border-color: #dc2626; color: white; font-size: 12px; padding: 6px 16px;">✖ Reject / Cancel</button>' +
          '</div>';

        activePendingApprovalId = data.approvalId;
        const mobBar = document.getElementById('mobileApprovalBar');
        if (mobBar) {
          const mobText = document.getElementById('mobileApprovalText');
          if (mobText) mobText.innerText = data.actionSummary || 'Action requires confirmation';
          mobBar.style.display = 'block';
        }

        stepsContainer.appendChild(card);
        status.innerText = isProd ? '⚠️ Awaiting PRODUCTION approval...' : '⚠️ Awaiting operator approval...';
        showToast('Approval required for: ' + data.actionSummary);
        scrollToBottom();
      } else if (eventType === 'text_chunk') {
        let chunkContainer = document.getElementById('streamLiveText');
        if (!chunkContainer) {
          chunkContainer = document.createElement('div');
          chunkContainer.id = 'streamLiveText';
          chunkContainer.className = 'markdown-rendered';
          chunkContainer.style.marginTop = '10px';
          chunkContainer.style.color = '#cbd5e1';
          stepsContainer.appendChild(chunkContainer);
        }
        chunkContainer.innerHTML += renderMarkdown(data.chunk || '');
        scrollToBottom();
      } else if (eventType === 'done') {
        activePendingApprovalId = null;
        const mobBarDone = document.getElementById('mobileApprovalBar');
        if (mobBarDone) mobBarDone.style.display = 'none';

        const liveText = document.getElementById('streamLiveText');
        if (liveText) liveText.remove();
        const durSec = (data.durationMs / 1000).toFixed(1);
        const resStr = data.result || '';
        const hasWarning = resStr.includes('⚠️') || resStr.includes('[LLM Connection Error]') || resStr.includes('[LLM API');
        finalContainer.innerHTML = 
          '<div class="stream-turn-divider" style="margin-top: 16px;"><span>Final Solution & Root Cause Analysis</span></div>' +
          '<div class="markdown-rendered" style="margin-top: 8px;">' +
            renderMarkdown(resStr || '(Task completed with no text output)') +
          '</div>' +
          '<div style="color: ' + (hasWarning ? '#f59e0b' : '#34d399') + '; font-size: 11px; margin-top: 12px; display: flex; align-items: center; gap: 6px;">' +
            '<span>' + (hasWarning ? '⚠️ Investigation completed with notice in ' : '✔ Autonomous investigation finished in ') + durSec + 's</span>' +
          '</div>';
        status.innerText = (hasWarning ? 'Completed with notice in ' : 'Task completed in ') + durSec + 's.';
        showToast(hasWarning ? 'Completed with diagnostic notice.' : 'Task completed successfully!');
        scrollToBottom();
        loadChatHistory();
      } else if (eventType === 'error') {
        activePendingApprovalId = null;
        const mobBarErr = document.getElementById('mobileApprovalBar');
        if (mobBarErr) mobBarErr.style.display = 'none';

        const liveText = document.getElementById('streamLiveText');
        if (liveText) liveText.remove();
        finalContainer.innerHTML = 
          '<div class="stream-card stream-card-blocked" style="margin-top: 14px;">' +
            '<div style="color: #f87171; font-weight: bold;">[Execution Error]</div>' +
            '<div style="margin-top: 6px;">' + escapeHtml(data.error || 'Unknown execution error') + '</div>' +
          '</div>';
        status.innerText = 'Task failed.';
        showToast('Execution error.');
        scrollToBottom();
        loadChatHistory();
      }
    }

    // Interactive Terminal Real-Time Streaming Execution
    async function runTask() {
      const task = document.getElementById('taskInput').value.trim();
      if (!task) {
        showToast('Please enter an instruction or click a quick action shortcut!');
        const inputEl = document.getElementById('taskInput');
        if (inputEl) inputEl.focus();
        return;
      }

      const out = document.getElementById('terminalOutput');
      const status = document.getElementById('terminalStatus');
      const btn = document.getElementById('runBtn');
      const dot = document.getElementById('agentDot');
      const agentText = document.getElementById('agentStatusText');

      btn.disabled = true;
      btn.innerHTML = '<span>Streaming...</span> ⏳';
      status.innerText = 'Connecting to agent engine...';
      dot.className = 'status-dot dot-amber';
      agentText.innerText = 'Investigating...';

      // Initialize terminal stream view
      out.innerHTML = 
        '<div class="stream-header">' +
          '<div style="color: #38bdf8; font-weight: 600; font-size: 13.5px;">⚡ [TASK DISPATCHED]: "' + escapeHtml(task) + '"</div>' +
          '<div style="color: #94a3b8; font-size: 11.5px; margin-top: 4px;">Connected to SRE autonomous execution pipeline. Telemetry stream active...</div>' +
        '</div>' +
        '<div id="streamSteps"></div>' +
        '<div id="streamFinalResult"></div>';
      scrollToBottom();

      const stepsContainer = document.getElementById('streamSteps');
      const finalContainer = document.getElementById('streamFinalResult');

      try {
        const response = await fetch('/api/task/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task })
        });

        if (!response.ok || !response.body) {
          throw new Error('Streaming failed with HTTP ' + response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\\r?\\n\\r?\\n/);
          buffer = parts.pop() || '';

          for (const chunk of parts) {
            const lines = chunk.split(/\\r?\\n/);
            let eventType = 'message';
            let dataStr = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const val = line.slice(6);
                dataStr = dataStr ? (dataStr + '\\n' + val) : val;
              }
            }

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              handleStreamEvent(eventType, data, stepsContainer, finalContainer, status);
            } catch (err) {
              console.warn('Failed to parse SSE payload:', err, dataStr);
            }
          }
        }

        loadAudit();
      } catch (e) {
        console.warn('Streaming error, falling back to synchronous execution:', e);
        try {
          const res = await fetch('/api/task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task })
          });
          const data = await res.json();
          if (data.error) {
            out.innerHTML = '<span style="color: #f87171; font-weight: bold;">[Execution Error]:</span><br>' + escapeHtml(data.error);
          } else {
            out.innerHTML = renderMarkdown(data.result || '(Task completed with no output)');
            showToast('Task completed successfully!');
          }
          loadAudit();
        } catch (fallbackErr) {
          out.innerHTML = '<span style="color: #f87171;">Connection Error:</span> ' + escapeHtml(fallbackErr.message);
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Execute Task</span> ⚡';
        dot.className = 'status-dot dot-green';
        agentText.innerText = 'Agent Ready';
        scrollToBottom();
      }
    }

    function quickTask(text) {
      document.getElementById('taskInput').value = text;
      runTask();
    }

    function scrollToBottom() {
      const el = document.getElementById('terminalOutput');
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
      const pill = document.getElementById('terminalScrollBottomPill');
      if (pill) pill.style.display = 'none';
    }

    async function resolveWebApproval(approvalId, approved) {
      activePendingApprovalId = null;
      const mobBar = document.getElementById('mobileApprovalBar');
      if (mobBar) mobBar.style.display = 'none';

      const actionsEl = document.getElementById('approval-actions-' + approvalId);
      if (actionsEl) {
        actionsEl.innerHTML = '<span style="font-size: 12px; color: #94a3b8;">Submitting response... ⏳</span>';
      }
      try {
        const res = await fetch('/api/task/approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId, approved })
        });
        const data = await res.json();
        if (actionsEl) {
          if (approved) {
            actionsEl.innerHTML = '<span style="font-size: 12px; color: #34d399; font-weight: 600;">✔ Operator Approved. Resuming execution...</span>';
            showToast('Action approved by operator.');
          } else {
            actionsEl.innerHTML = '<span style="font-size: 12px; color: #f87171; font-weight: 600;">✖ Operator Declined. Action safely aborted.</span>';
            showToast('Action rejected.');
          }
        }
      } catch (err) {
        if (actionsEl) {
          actionsEl.innerHTML = '<span style="font-size: 12px; color: #ef4444;">Failed to submit approval: ' + escapeHtml(err.message) + '</span>';
        }
      }
    }

    function toggleWrap() {
      const el = document.getElementById('terminalOutput');
      const btn = document.getElementById('wrapToggleBtn');
      if (!el || !btn) return;
      if (el.classList.contains('no-wrap')) {
        el.classList.remove('no-wrap');
        btn.innerText = 'Wrap: ON';
        btn.classList.remove('btn-active');
        showToast('Word wrap enabled: Lines wrap cleanly.');
      } else {
        el.classList.add('no-wrap');
        btn.innerText = 'Wrap: OFF';
        btn.classList.add('btn-active');
        showToast('Word wrap disabled: Raw horizontal formatting.');
      }
    }

    function setupTerminalScrollListener() {
      const el = document.getElementById('terminalOutput');
      const pill = document.getElementById('terminalScrollBottomPill');
      if (!el || !pill) return;
      el.addEventListener('scroll', () => {
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceToBottom > 80) {
          pill.style.display = 'flex';
        } else {
          pill.style.display = 'none';
        }
      });
    }

    function clearTerminal() {
      document.getElementById('terminalOutput').innerHTML = 'Terminal cleared. Ready.';
      document.getElementById('terminalStatus').innerText = 'Ready.';
      const pill = document.getElementById('terminalScrollBottomPill');
      if (pill) pill.style.display = 'none';
    }

    function copyTerminalOutput() {
      const text = document.getElementById('terminalOutput').innerText;
      navigator.clipboard.writeText(text);
      showToast('Output copied to clipboard!');
    }

    function downloadTerminalReport() {
      const el = document.getElementById('terminalOutput');
      const text = el ? el.innerText : '';
      if (!text || !text.trim() || text.includes('Welcome to DevOps Agent Mission Control')) {
        showToast('Terminal is empty or awaiting instruction.', true);
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = 'devops-investigation-report-' + timestamp + '.md';
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Downloaded ' + filename + '!');
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
        // Use the clean diagram source for rendering; fall back to the report text.
        const diagram = data.diagram || stripMermaidFences(data.topology) || 'graph TD\\n  NoTopology["No services detected"];';
        box.innerText = diagram;

        if (window.mermaid) {
          try {
            mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
            const { svg } = await mermaid.render('mermaidGraph', diagram);
            visual.innerHTML = svg;
          } catch (mErr) {
            console.warn('Mermaid render error:', mErr);
            visual.innerHTML = '<div style="color: #f87171;">Unable to render diagram. Syntax shown in raw graph below.</div>';
          }
        } else {
          visual.innerHTML = '<pre style="text-align: left; color: #67e8f9;">' + escapeHtml(diagram) + '</pre>';
        }
        showToast('Topology discovered!');
      } catch (e) {
        box.innerText = 'Topology discovery error: ' + e.message;
      } finally {
        btn.disabled = false;
      }
    }

    function stripMermaidFences(text) {
      if (!text) return '';
      return text
        .replace(/^\s*\`\`\`mermaid\s*/i, '')
        .replace(/\s*\`\`\`\s*$/, '')
        .replace(/^##.*$/gm, '')
        .replace(/^###.*$/gm, '')
        .trim();
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

    // Stored Incident Postmortem Reports Catalog
    async function loadReportsList() {
      const container = document.getElementById('reportsListContainer');
      if (!container) return;
      try {
        const res = await fetch('/api/reports');
        const data = await res.json();
        const reports = data.reports || [];
        if (reports.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No postmortem reports generated yet. Reports generated during triage will appear here.</div>';
          return;
        }
        container.innerHTML = reports.map((r) => {
          const sizeKb = (r.size / 1024).toFixed(1) + ' KB';
          const safeName = escapeHtml(r.filename);
          const safeTitle = escapeHtml(r.title);
          const encoded = encodeURIComponent(r.filename);
          return (
            '<div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px;">' +
              '<div>' +
                '<div style="font-weight: 600; font-size: 13px; color: #38bdf8; margin-bottom: 4px;">' + safeTitle + '</div>' +
                '<div style="font-size: 11px; color: var(--text-muted);">' +
                  '📅 ' + r.date + ' • 📦 ' + sizeKb + ' • <code style="font-size: 10px;">' + safeName + '</code>' +
                '</div>' +
              '</div>' +
              '<div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">' +
                '<button class="btn-secondary" onclick="viewReport(&quot;' + encoded + '&quot;)" style="font-size: 11px; padding: 4px 8px;">👁️ View</button>' +
                '<a href="/api/reports/download?file=' + encoded + '" class="btn-secondary" style="font-size: 11px; padding: 4px 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" download>📥 Download .md</a>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      } catch (err) {
        container.innerHTML = '<div style="color: #f87171; font-size: 12px;">Failed to load reports: ' + err.message + '</div>';
      }
    }

    async function viewReport(filename) {
      const decoded = decodeURIComponent(filename);
      const out = document.getElementById('kbResults');
      out.innerHTML = 'Loading report <code>' + escapeHtml(decoded) + '</code>...';
      try {
        const res = await fetch('/api/reports/download?file=' + encodeURIComponent(decoded));
        if (!res.ok) throw new Error('Status ' + res.status);
        const md = await res.text();
        out.innerHTML = renderMarkdown(md);
        out.scrollIntoView({ behavior: 'smooth' });
        showToast('Loaded ' + decoded);
      } catch (e) {
        out.innerHTML = 'Failed to load report: ' + e.message;
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

    // Command Palette and Shortcuts Functions
    let paletteActiveIndex = 0;

    const commandPaletteActions = [
      { id: 'runbook-crashloop', icon: '☸️', label: 'Runbook: Pod CrashLoopBackOff Triage', shortcut: 'runbook', action: () => quickTask('Check why pods in the default namespace are failing') },
      { id: 'runbook-kafka', icon: '📨', label: 'Runbook: Kafka Consumer Lag & Offset Reset', shortcut: 'runbook', action: () => quickTask('Inspect Kafka cluster health and consumer group lag') },
      { id: 'runbook-redis', icon: '⚡', label: 'Runbook: Redis Eviction & Cache Stampede', shortcut: 'runbook', action: () => quickTask('Run redis_info_diagnose and analyze keyspace memory') },
      { id: 'runbook-rabbitmq', icon: '🐰', label: 'Runbook: RabbitMQ Backpressure & DLQ Triage', shortcut: 'runbook', action: () => quickTask('Check rabbitmq_queue_status and rabbitmq_dlq_inspect') },
      { id: 'runbook-activemq', icon: '📬', label: 'Runbook: ActiveMQ Poison Pill DLQ Surge', shortcut: 'runbook', action: () => quickTask('Run activemq_queue_audit and sample dlq triage') },
      { id: 'runbook-circuit', icon: '🔌', label: 'Runbook: Downstream Service Circuit Breaker', shortcut: 'runbook', action: () => quickTask('Run service_endpoint_probe and audit db connection pool starvation') },
      { id: 'finops-scan', icon: '💰', label: 'FinOps: Run Multi-Cloud Waste Scan', shortcut: 'finops', action: () => { switchTab('tab-finops'); runFinOpsScan(); } },
      { id: 'sec-scan', icon: '🔒', label: 'Security: Check TLS Certificate Expiry', shortcut: 'security', action: () => { switchTab('tab-security'); runCertCheck(); } },
      { id: 'sec-lint', icon: '🛡️', label: 'Security: Lint Dockerfile & K8s Manifests', shortcut: 'security', action: () => { switchTab('tab-security'); runSecurityScan(); } },
      { id: 'topo-discover', icon: '🗺️', label: 'Topology: Discover Cluster Dependency Graph', shortcut: 'topology', action: () => { switchTab('tab-topology'); loadTopology(); } },
      { id: 'role-junior', icon: '🟡', label: 'Role: Switch to Junior SRE (Strict Approval Gate)', shortcut: 'Alt+1', action: () => switchRole('junior') },
      { id: 'role-intermediate', icon: '🔵', label: 'Role: Switch to Intermediate SRE Autonomy', shortcut: 'Alt+2', action: () => switchRole('intermediate') },
      { id: 'role-senior', icon: '🟣', label: 'Role: Switch to Senior SRE Architect', shortcut: 'Alt+3', action: () => switchRole('senior') },
      { id: 'tab-console', icon: '⚡', label: 'Navigate: Interactive Autonomous Terminal', shortcut: 'Tab 1', action: () => switchTab('tab-console') },
      { id: 'tab-audit', icon: '🛡️', label: 'Navigate: Guardrail Policy & Audit Stream', shortcut: 'Tab 2', action: () => switchTab('tab-audit') },
      { id: 'tab-finops', icon: '💰', label: 'Navigate: FinOps Multi-Cloud Waste Hunter', shortcut: 'Tab 3', action: () => switchTab('tab-finops') },
      { id: 'tab-security', icon: '🔒', label: 'Navigate: Security & TLS Scanner', shortcut: 'Tab 4', action: () => switchTab('tab-security') },
      { id: 'tab-topology', icon: '🗺️', label: 'Navigate: Live Cluster Service Topology', shortcut: 'Tab 5', action: () => switchTab('tab-topology') },
      { id: 'tab-kb', icon: '🧠', label: 'Navigate: Incident RCA Knowledge Base & Reports', shortcut: 'Tab 6', action: () => switchTab('tab-kb') },
      { id: 'tab-simulate', icon: '🚨', label: 'Navigate: Alert Simulator & Webhook Pipeline', shortcut: 'Tab 7', action: () => switchTab('tab-simulate') },
      { id: 'term-clear', icon: '🧹', label: 'Terminal: Clear Output Screen', shortcut: '⌘L', action: () => clearTerminal() },
      { id: 'term-download', icon: '📥', label: 'Terminal: Download Markdown Investigation Report', shortcut: 'download', action: () => downloadTerminalReport() },
      { id: 'audit-export-json', icon: '📥', label: 'Audit: Export Compliance Log as JSON', shortcut: 'export', action: () => exportAudit('json') },
      { id: 'audit-export-csv', icon: '📥', label: 'Audit: Export Compliance Log as CSV', shortcut: 'export', action: () => exportAudit('csv') },
      { id: 'show-shortcuts', icon: '⌨️', label: 'Help: View All Keyboard Shortcuts', shortcut: '?', action: () => openShortcutsModal() }
    ];

    function openCommandPalette() {
      const modal = document.getElementById('commandPaletteModal');
      const input = document.getElementById('cmdPaletteInput');
      if (modal) modal.classList.add('active');
      if (input) {
        input.value = '';
        input.focus();
      }
      paletteActiveIndex = 0;
      filterPalette();
    }

    function closeCommandPalette() {
      const modal = document.getElementById('commandPaletteModal');
      if (modal) modal.classList.remove('active');
    }

    function toggleCommandPalette() {
      const modal = document.getElementById('commandPaletteModal');
      if (modal && modal.classList.contains('active')) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    }

    function filterPalette() {
      const input = document.getElementById('cmdPaletteInput');
      const query = input ? input.value.toLowerCase().trim() : '';
      const resultsContainer = document.getElementById('cmdPaletteResults');
      if (!resultsContainer) return;

      const filtered = commandPaletteActions.filter(item => {
        if (!query) return true;
        return item.label.toLowerCase().includes(query) ||
               (item.shortcut && item.shortcut.toLowerCase().includes(query));
      });

      if (filtered.length === 0) {
        resultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px;">No matching actions found.</div>';
        return;
      }

      if (paletteActiveIndex >= filtered.length) paletteActiveIndex = 0;

      resultsContainer.innerHTML = filtered.map((item, idx) => {
        const isActive = idx === paletteActiveIndex ? ' active' : '';
        return '<div class="cmd-item' + isActive + '" onclick="executePaletteAction(' + idx + ')">' +
          '<div class="cmd-item-label">' +
            '<span>' + item.icon + '</span>' +
            '<span>' + escapeHtml(item.label) + '</span>' +
          '</div>' +
          '<div class="cmd-item-shortcut"><kbd>' + escapeHtml(item.shortcut) + '</kbd></div>' +
        '</div>';
      }).join('');
    }

    function executePaletteAction(index) {
      const input = document.getElementById('cmdPaletteInput');
      const query = input ? input.value.toLowerCase().trim() : '';
      const filtered = commandPaletteActions.filter(item => {
        if (!query) return true;
        return item.label.toLowerCase().includes(query) ||
               (item.shortcut && item.shortcut.toLowerCase().includes(query));
      });
      const selected = filtered[index];
      if (selected && selected.action) {
        closeCommandPalette();
        selected.action();
      }
    }

    function openShortcutsModal() {
      const modal = document.getElementById('shortcutsModal');
      if (modal) modal.classList.add('active');
    }

    function closeShortcutsModal() {
      const modal = document.getElementById('shortcutsModal');
      if (modal) modal.classList.remove('active');
    }

    function resolveActiveApproval(approved) {
      if (activePendingApprovalId) {
        resolveWebApproval(activePendingApprovalId, approved);
      } else {
        showToast('No pending approval awaiting authorization.');
      }
    }

    // Global Keyboard Shortcuts Engine
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && ['INPUT', 'TEXTAREA'].includes(activeEl.tagName);

      // Cmd+K or Ctrl+K -> Toggle Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      // Cmd+L or Ctrl+L -> Clear Terminal
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        clearTerminal();
        return;
      }

      // Cmd+Enter or Ctrl+Enter -> Run Task from anywhere
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        runTask();
        return;
      }

      // Alt+1, Alt+2, Alt+3 -> Instant Role Autonomy Switch
      if (e.altKey && e.key === '1') { e.preventDefault(); switchRole('junior'); return; }
      if (e.altKey && e.key === '2') { e.preventDefault(); switchRole('intermediate'); return; }
      if (e.altKey && e.key === '3') { e.preventDefault(); switchRole('senior'); return; }

      // ? or Shift+/ -> Open Shortcuts Modal (when not in an input/textarea)
      if (e.key === '?' && !isInputFocused) {
        e.preventDefault();
        openShortcutsModal();
        return;
      }

      // Escape -> Close any open modal or dropdown
      if (e.key === 'Escape') {
        closeCommandPalette();
        closeShortcutsModal();
        closeToolsModal();
        closeRoleDropdown();
        return;
      }

      // Hotkeys for Pending Human Approvals: Y or A to approve, N or R to reject
      if (activePendingApprovalId && !isInputFocused) {
        if (e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'a') {
          e.preventDefault();
          resolveActiveApproval(true);
          return;
        }
        if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'r') {
          e.preventDefault();
          resolveActiveApproval(false);
          return;
        }
      }
    });

    // Command Palette Arrow & Enter Navigation
    document.getElementById('cmdPaletteInput')?.addEventListener('keydown', (e) => {
      const resultsContainer = document.getElementById('cmdPaletteResults');
      if (!resultsContainer) return;
      const items = resultsContainer.querySelectorAll('.cmd-item');
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        paletteActiveIndex = (paletteActiveIndex + 1) % items.length;
        filterPalette();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        paletteActiveIndex = (paletteActiveIndex - 1 + items.length) % items.length;
        filterPalette();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executePaletteAction(paletteActiveIndex);
      }
    });

    // Enter in Task Textarea
    document.getElementById('taskInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runTask();
      }
    });

    // Cluster Context Management
    let availableClusters = [];

    async function loadClusters() {
      try {
        const res = await fetch('/api/k8s/contexts');
        if (!res.ok) return;
        const data = await res.json();
        availableClusters = data.contexts || [];
        renderClusterMenu(data.current, availableClusters);
      } catch (e) {
        console.error('Failed to load clusters:', e);
      }
    }

    function renderClusterMenu(current, contexts) {
      const container = document.getElementById('clusterListItems');
      if (!container) return;
      if (!contexts || contexts.length === 0) {
        container.innerHTML = '<div style="padding: 12px; color: var(--text-muted); text-align: center;">No contexts found.</div>';
        return;
      }
      container.onclick = function(e) {
        const item = e.target.closest('.cluster-item');
        if (item && item.getAttribute('data-context')) {
          switchClusterContext(item.getAttribute('data-context'), e);
        }
      };

      container.innerHTML = contexts.map((c) => {
        const isCur = c.name === current;
        const dotClass = c.environment === 'production' ? 'dot-red' : 'dot-green';
        const badgeClass = c.environment === 'production' ? 'badge-prod' : 'badge-dev';
        return '<div class="cluster-item ' + (isCur ? 'current' : '') + '" data-context="' + c.name + '">' +
          '<div style="display: flex; align-items: center; gap: 8px;">' +
            '<span class="status-dot ' + dotClass + '"></span>' +
            '<strong style="color: ' + (isCur ? '#38bdf8' : '#f8fafc') + ';">' + c.name + '</strong>' +
          '</div>' +
          '<span class="badge ' + badgeClass + '" style="font-size: 9px; padding: 2px 6px;">' + c.environment.toUpperCase() + '</span>' +
        '</div>';
      }).join('');
    }

    function toggleClusterDropdown(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('clusterDropdownMenu');
      const roleMenu = document.getElementById('roleDropdownMenu');
      const cloudMenu = document.getElementById('cloudDropdownMenu');
      if (roleMenu) roleMenu.style.display = 'none';
      if (cloudMenu) cloudMenu.style.display = 'none';
      if (!menu) return;
      if (menu.style.display === 'none' || !menu.style.display) {
        menu.style.display = 'block';
        loadClusters();
      } else {
        menu.style.display = 'none';
      }
    }

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
      const clusterMenu = document.getElementById('clusterDropdownMenu');
      if (clusterMenu && !e.target.closest('#clusterPill')) {
        clusterMenu.style.display = 'none';
      }
      const roleMenu = document.getElementById('roleDropdownMenu');
      if (roleMenu && !e.target.closest('#rolePill')) {
        roleMenu.style.display = 'none';
      }
      const cloudMenu = document.getElementById('cloudDropdownMenu');
      if (cloudMenu && !e.target.closest('#cloudPill')) {
        cloudMenu.style.display = 'none';
      }
    });

    function toggleRoleDropdown(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('roleDropdownMenu');
      const clusterMenu = document.getElementById('clusterDropdownMenu');
      const cloudMenu = document.getElementById('cloudDropdownMenu');
      if (clusterMenu) clusterMenu.style.display = 'none';
      if (cloudMenu) cloudMenu.style.display = 'none';
      if (!menu) return;
      menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
    }

    async function switchRole(newRole, e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('roleDropdownMenu');
      if (menu) menu.style.display = 'none';

      try {
        const res = await fetch('/api/role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if (data.success) {
          document.querySelectorAll('.activeRoleTextSync').forEach(function(el) {
            el.innerText = newRole.toUpperCase();
          });
          const metricVal = document.getElementById('roleMetricVal');
          if (metricVal) metricVal.innerText = newRole.toUpperCase();
          showToast('DevOps Role updated to ' + newRole.toUpperCase());
          loadAudit();
        } else {
          showToast('Failed to switch role: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        showToast('Error switching role: ' + err.message);
      }
    }

    async function switchClusterContext(targetContext, e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('clusterDropdownMenu');
      if (menu) menu.style.display = 'none';

      showToast('Switching context to ' + targetContext + '...');

      try {
        const res = await fetch('/api/k8s/switch-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: targetContext }),
        });
        const data = await res.json();

        if (data.success) {
          const act = document.getElementById('activeKubeCtx');
          if (act) act.innerText = data.currentContext;

          const envBadgeContainer = document.getElementById('envBadgeContainer');
          const isProd = data.isProduction;
          if (envBadgeContainer) {
            envBadgeContainer.innerHTML = isProd
              ? '<span class="badge badge-prod">🔴 PRODUCTION (STRICT)</span>'
              : '<span class="badge badge-dev">🟢 ' + data.environment.toUpperCase() + '</span>';
          }

          const dot = document.getElementById('clusterEnvDot');
          if (dot) dot.className = 'status-dot ' + (isProd ? 'dot-red' : 'dot-green');

          showToast(data.message);
          loadAudit();
          loadClusters();
        } else {
          showToast('Failed to switch context: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        showToast('Error switching context: ' + err.message);
      }
    }

    let currentCloudConfig = { aws: true, azure: true, gcp: true, stickToKubeConfig: true };

    function toggleCloudDropdown(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('cloudDropdownMenu');
      const roleMenu = document.getElementById('roleDropdownMenu');
      const clusterMenu = document.getElementById('clusterDropdownMenu');
      if (roleMenu) roleMenu.style.display = 'none';
      if (clusterMenu) clusterMenu.style.display = 'none';
      if (!menu) return;
      const isVisible = menu.style.display === 'block';
      menu.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        loadCloudProviders();
      }
    }

    async function loadCloudProviders() {
      try {
        const res = await fetch('/api/config/providers');
        const data = await res.json();
        if (data.cloudProviders) {
          currentCloudConfig = {
            ...data.cloudProviders,
            stickToKubeConfig: data.stickToKubeConfig,
          };
          updateCloudUI(data.cloudProviders, data.stickToKubeConfig);
        }
        if (data.kubeconfig) {
          const input = document.getElementById('customKubeConfigInput');
          if (input && !input.value) input.value = data.kubeconfig;
          const display = document.getElementById('activeKubeConfigDisplay');
          if (display) display.innerText = data.kubeconfig;
        }
      } catch (e) {}
    }

    function updateCloudUI(cp, stick) {
      const awsBadge = document.getElementById('awsBadge');
      const azureBadge = document.getElementById('azureBadge');
      const gcpBadge = document.getElementById('gcpBadge');
      const stickBadge = document.getElementById('stickBadge');
      const text = document.getElementById('activeCloudText');
      const cloudDot = document.getElementById('cloudDot');

      if (awsBadge) {
        awsBadge.className = 'badge ' + (cp.aws ? 'badge-dev' : 'badge-prod');
        awsBadge.innerText = cp.aws ? 'ON' : 'OFF';
      }
      if (azureBadge) {
        azureBadge.className = 'badge ' + (cp.azure ? 'badge-dev' : 'badge-prod');
        azureBadge.innerText = cp.azure ? 'ON' : 'OFF';
      }
      if (gcpBadge) {
        gcpBadge.className = 'badge ' + (cp.gcp ? 'badge-dev' : 'badge-prod');
        gcpBadge.innerText = cp.gcp ? 'ON' : 'OFF';
      }
      if (stickBadge) {
        stickBadge.className = 'badge ' + (stick ? 'badge-dev' : 'badge-prod');
        stickBadge.innerText = stick ? 'ACTIVE' : 'OFF';
      }
      if (text) {
        const enabled = [];
        if (cp.aws) enabled.push('AWS');
        if (cp.azure) enabled.push('AZ');
        if (cp.gcp) enabled.push('GCP');
        text.innerText = enabled.length > 0 ? enabled.join(' • ') : 'K8S ONLY';
      }
      if (cloudDot) {
        const hasAny = cp.aws || cp.azure || cp.gcp;
        cloudDot.className = 'status-dot ' + (hasAny ? 'dot-green' : 'dot-yellow');
      }
    }

    async function toggleProvider(provider, e) {
      if (e) e.stopPropagation();
      const newVal = !currentCloudConfig[provider];
      try {
        const res = await fetch('/api/config/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [provider]: newVal }),
        });
        const data = await res.json();
        if (data.success) {
          currentCloudConfig = { ...data.cloudProviders, stickToKubeConfig: data.stickToKubeConfig };
          updateCloudUI(data.cloudProviders, data.stickToKubeConfig);
          showToast(provider.toUpperCase() + ' provider ' + (newVal ? 'ENABLED' : 'DISABLED'));
          loadSystemStatus();
        }
      } catch (err) {
        showToast('Error updating provider: ' + err.message);
      }
    }

    async function toggleStickKubeConfig(e) {
      if (e) e.stopPropagation();
      const newVal = !currentCloudConfig.stickToKubeConfig;
      try {
        const res = await fetch('/api/config/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stickToKubeConfig: newVal }),
        });
        const data = await res.json();
        if (data.success) {
          currentCloudConfig = { ...data.cloudProviders, stickToKubeConfig: data.stickToKubeConfig };
          updateCloudUI(data.cloudProviders, data.stickToKubeConfig);
          showToast('Stick to Kubeconfig ' + (newVal ? 'ACTIVATED' : 'DISABLED'));
        }
      } catch (err) {
        showToast('Error updating kubeconfig grounding: ' + err.message);
      }
    }

    async function activateK8sOnly(e) {
      if (e) e.stopPropagation();
      try {
        const res = await fetch('/api/config/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aws: false, azure: false, gcp: false, stickToKubeConfig: true }),
        });
        const data = await res.json();
        if (data.success) {
          currentCloudConfig = { ...data.cloudProviders, stickToKubeConfig: data.stickToKubeConfig };
          updateCloudUI(data.cloudProviders, data.stickToKubeConfig);
          showToast('Kubernetes-Only Mode ACTIVATED');
          loadSystemStatus();
        }
      } catch (err) {
        showToast('Error activating k8s-only: ' + err.message);
      }
    }

    async function enableAllClouds(e) {
      if (e) e.stopPropagation();
      try {
        const res = await fetch('/api/config/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aws: true, azure: true, gcp: true }),
        });
        const data = await res.json();
        if (data.success) {
          currentCloudConfig = { ...data.cloudProviders, stickToKubeConfig: data.stickToKubeConfig };
          updateCloudUI(data.cloudProviders, data.stickToKubeConfig);
          showToast('All Cloud Providers (AWS, Azure, GCP) ENABLED');
          loadSystemStatus();
        }
      } catch (err) {
        showToast('Error enabling clouds: ' + err.message);
      }
    }

    async function applyCustomKubeConfig(e) {
      if (e) e.stopPropagation();
      const input = document.getElementById('customKubeConfigInput');
      const val = input ? input.value.trim() : '';
      if (!val) {
        showToast('Please specify a kubeconfig file (e.g. sb-config)');
        return;
      }
      try {
        const res = await fetch('/api/config/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kubeconfig: val }),
        });
        const data = await res.json();
        if (data.success) {
          const display = document.getElementById('activeKubeConfigDisplay');
          if (display) display.innerText = data.kubeconfig || val;
          showToast('Kubeconfig switched: ' + (data.kubeconfig || val));
          loadClusters();
          loadSystemStatus();
        }
      } catch (err) {
        showToast('Error setting kubeconfig: ' + err.message);
      }
    }

    async function resetKubeConfig(e) {
      if (e) e.stopPropagation();
      try {
        const res = await fetch('/api/config/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kubeconfig: 'reset' }),
        });
        const data = await res.json();
        if (data.success) {
          const input = document.getElementById('customKubeConfigInput');
          if (input) input.value = '';
          const display = document.getElementById('activeKubeConfigDisplay');
          if (display) display.innerText = 'Default (~/.kube/config)';
          showToast('Reset to default kubeconfig');
          loadClusters();
          loadSystemStatus();
        }
      } catch (err) {
        showToast('Error resetting kubeconfig: ' + err.message);
      }
    }

    // Initial Data Fetch
    loadAudit();
    loadChatHistory();
    loadSystemStatus();
    loadClusters();
    loadCloudProviders();
    loadReportsList();
    setupTerminalScrollListener();
    // Auto-refresh audit trail and chat history every 6 seconds
    setInterval(() => {
      loadAudit();
      loadChatHistory();
    }, 6000);
  </script>
</body>
</html>`;
}
