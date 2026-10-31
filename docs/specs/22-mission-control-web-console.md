# Feature Spec 22: Mission Control Web Console & Alert Webhook Server

## 1. Overview & Objective
The **Mission Control Web Console & Alert Webhook Server** serves as the graphical management and observability interface for the Junior DevOps Agent. It provides:
1. A real-time, browser-based DevOps terminal emulator with Server-Sent Events (SSE) streaming, Quick Action buttons, and a responsive floating approval bar.
2. Ingestion webhooks for Prometheus Alertmanager, Azure Monitor, and PagerDuty to launch autonomous incident triage, plus alert simulation capabilities.
3. SRE Command Palette (`Cmd+K` / `Ctrl+K`) and interactive Keyboard Shortcuts Cheatsheet (`?`) for rapid navigation.
4. Chat & Incident History Drawer with multi-criteria keyword search, role filtering, and dynamic tagging (`#k8s`, `#kafka`, `#redis`, `#queues`, `#incident`).
5. Live visualization and multi-criteria filtering of audit logs, cluster topology, and historical RCA incident postmortems.
6. Rigorous automated verification of client-side script syntax integrity to prevent client rendering crashes.

## 2. Server Architecture & Endpoints
Located in [`src/server/webhook.ts`](file:///Users/joshuawilliams/Documents/Research/devops-agent/src/server/webhook.ts) and [`src/server/dashboardHtml.ts`](file:///Users/joshuawilliams/Documents/Research/devops-agent/src/server/dashboardHtml.ts):

| HTTP Method | Route | Purpose | Output Format |
| :--- | :--- | :--- | :--- |
| **`GET`** | `/dashboard` (or `/`) | Mission Control Web Console UI | HTML5 / CSS3 / JavaScript |
| **`GET`** | `/health` | System healthcheck and uptime monitoring | JSON `{ status: 'ok', engine: ..., uptime: ... }` |
| **`GET`** | `/api/status` | Context, available tools count, and audit totals | JSON `{ context, toolsCount, totalToolsCount, tools: [...] }` |
| **`GET`** / **`POST`** | `/api/role` | Query or dynamically adjust agent autonomy tier (`junior`, `intermediate`, `senior`) | JSON `{ role, available: [...] }` |
| **`GET`** / **`POST`** | `/api/config/providers` | Query or toggle Cloud Providers (`AWS`, `Azure`, `GCP`) and strict kubeconfig grounding | JSON `{ cloudProviders, stickToKubeConfig, availableToolsCount }` |
| **`POST`** | `/api/alerts/webhook` | Ingests monitoring alerts and triggers proactive triage | JSON `{ status: 'accepted', target: ... }` |
| **`POST`** | `/api/alerts/simulate` | Triggers synthetic test alerts (`CrashLoopBackOff`, `OOMKilled`, `HighLatency`, `DiskPressure`) | JSON `{ status: 'simulated', alert: ... }` |
| **`POST`** | `/api/task` | Executes interactive tasks (JSON fallback) | JSON `{ result: string, sessionId, tags }` |
| **`GET`** / **`POST`** | `/api/task/stream` | Real-time Server-Sent Events (SSE) streaming execution | `text/event-stream` (`turn_start`, `tool_start`, `tool_end`, `done`) |
| **`POST`** | `/api/task/approval` | Resolves human-in-the-loop task approval or rejection | JSON `{ status: 'ok', approvalId, approved }` |
| **`GET`** | `/api/task/pending-approvals` | Lists active human-in-the-loop approval gates | JSON `{ pending: [...] }` |
| **`GET`** | `/api/chat/history` | Searches and filters chat session history (`?q=...&tag=...&role=...`) | JSON `{ sessions: ChatSessionRecord[], total: number }` |
| **`POST`** | `/api/chat/history/tag` | Adds or removes domain tags from chat sessions | JSON `{ success: true, session: ... }` |
| **`DELETE`** | `/api/chat/history` | Deletes a specific session (`?id=...`) or clears all history | JSON `{ success: true }` |
| **`GET`** | `/api/audit` | Retrieves recent tamper-evident audit records | JSON `{ records: AuditRecord[] }` |
| **`GET`** | `/api/audit/export` | Exports full compliance audit trail (`?format=csv` or `?format=json`) | CSV (`devops-audit-*.csv`) / JSON attachment |
| **`GET`** | `/api/kb` | Searches historical postmortems (`?q=query`) | JSON `{ query: string, results: string }` |
| **`GET`** | `/api/reports` | Lists stored postmortem markdown incident reports | JSON `{ reports: Array<{ filename, title, date, size }> }` |
| **`GET`** | `/api/reports/download` | Downloads specific postmortem markdown report (`?file=...`) | Markdown attachment (`Content-Disposition: attachment`) |
| **`GET`** | `/api/topology` | Discovers cluster service dependency graph | JSON `{ topology: string, diagram: string }` |
| **`GET`** | `/api/k8s/contexts` | Lists available Kubernetes contexts with environment annotation | JSON `{ current: string, contexts: Array<{ name, isCurrent, environment }> }` |
| **`POST`** | `/api/k8s/switch-context` | Switches active Kubernetes cluster context | JSON `{ success: true, currentContext, environment, isProduction }` |
| **`GET`** | `/api/finops` | Direct FinOps waste audit (`?namespace=...`) | JSON `{ audit: string }` |
| **`POST`** | `/api/security` | Direct static container / manifest security scan | JSON `{ report: string }` |
| **`GET`** | `/api/certs` | Direct TLS certificate expiration audit | JSON `{ report: string }` |

```mermaid
flowchart TD
    subgraph Webhook_Ingestion ["Webhook Ingestion & Simulation"]
        Alertmanager["Prometheus Alertmanager / PagerDuty"] -->|POST /api/alerts/webhook| IngestAlert["Ingest Alert Payload"]
        SimAlert["Simulate Alert Modal"] -->|POST /api/alerts/simulate| IngestAlert
        IngestAlert --> AutoTriage["Spawn Background Proactive Triage Task"]
        AutoTriage --> AgentHarness["DevOpsAgentHarness.run"]
    end

    subgraph Mission_Dashboard ["Mission Control Web Dashboard"]
        Operator["Operator Browser"] -->|GET /dashboard| DashboardUI["Mission Control Web UI"]
        CmdPalette["Command Palette (Cmd+K)"] --> DashboardUI
        ShortcutsModal["Shortcuts Cheatsheet (?)"] --> DashboardUI

        DashboardUI -->|POST /api/task/stream (SSE)| AgentHarness
        DashboardUI -->|GET /api/chat/history| HistoryDrawer["Chat & Incident Drawer"]
        DashboardUI -->|POST /api/task/approval| ApprovalGate["Floating Mobile / Desktop Approval Bar"]
        DashboardUI -->|GET /api/audit| AuditTable["Filtered Audit Log Stream"]
        DashboardUI -->|GET /api/audit/export| ExportAudit["Export CSV / JSON"]
        DashboardUI -->|GET /api/reports| ReportList["Download Postmortems"]
        DashboardUI -->|GET /api/topology| TopoGraph["Mermaid Topology Diagram"]
        DashboardUI -->|GET /api/kb| KBSearch["Incident Search Results"]
        DashboardUI -->|POST /api/k8s/switch-context| ContextSwitcher["Cluster Context Switcher"]
    end
```

## 3. UI Features & User Experience (UX)

### 3.1 Real-Time Streaming Terminal & Human-in-the-Loop Approvals
- **Server-Sent Events (SSE):** Interactive task execution streams live reasoning tokens, tool invocations (`tool_start`), execution latencies (`tool_end`), Senior SRE critiques (`sre_review`), and policy blocks (`policy_blocked`).
- **Floating Approval Bar:** When a `MUTATE` or `DANGEROUS` action triggers a human approval gate, a prominent floating approval bar renders with:
  - Tool name, affected resources, unified diff view, and Senior SRE risk review.
  - One-tap **Approve** and **Reject** buttons accessible on both desktop and mobile viewports.
- **📥 Download Terminal Report:** 1-click export of current terminal investigation output, container vulnerability scans, or diff analysis into a timestamped Markdown report (`devops-investigation-report-*.md`).
- **📋 Copy Terminal Output:** Instant clipboard copy of the terminal stream.

### 3.2 Global SRE Command Palette (`Cmd+K` / `Ctrl+K`)
- Pressing `Cmd+K` (macOS) or `Ctrl+K` (Linux/Windows) opens a high-speed modal command palette.
- Instantly search and execute:
  - Quick SRE diagnostics (Pod health, node pressure, OOMKilled investigations).
  - Middleware triages (Kafka lag inspect, Redis slowlog, RabbitMQ DLQ audit).
  - Cloud provider toggles (Enable/disable AWS, Azure, GCP).
  - Simulated alert triggers.
  - Keyboard navigation with `Up`/`Down` arrows and `Enter` to run.

### 3.3 Keyboard Shortcuts Cheatsheet (`?`)
- Pressing `?` toggles a modal reference displaying keybindings:
  - `Cmd+K` / `Ctrl+K`: Toggle Command Palette.
  - `?`: Toggle Keyboard Shortcuts Cheatsheet.
  - `Esc`: Close any open modal (Command Palette, Shortcuts, Postmortem Preview).
  - `Enter`: Submit task or execute selected command palette item.

### 3.4 Chat & Incident History Drawer (Search, Filter, Tag)
- **Persistent Session Drawer:** Sliding panel displaying past conversational sessions and proactive incident triage runs.
- **Multi-Criteria Search & Filtering:**
  - Full-text search across user prompts, tool outputs, and error messages.
  - Tag chips: `#k8s`, `#kafka`, `#redis`, `#queues`, `#aws`, `#azure`, `#gcp`, `#finops`, `#security`, `#iac`, `#gitops`, `#incident`.
  - Filter by role level (`Junior`, `Intermediate`, `Senior`).
- **Tag Management:** Add or remove custom tags dynamically (`POST /api/chat/history/tag`).
- **Session Clearance:** Delete individual sessions or clear full history (`DELETE /api/chat/history`).

### 3.5 Guardrail Policy & Audit Stream Forensics
- **Multi-Criteria Filtering:** Filter audit records by free-text search, tier chips (`READ`, `MUTATE`, `DANGEROUS`), execution status (All, Blocked, Approved, Pending), and domain categories.
- **📥 Export JSON & 📥 Export CSV:** 1-click download of the complete tamper-evident audit trail (`devops-audit-*.csv` or `devops-audit-*.json`).

### 3.6 Incident RCA Knowledge Base & Reports
- **Generated Postmortem Reports Catalog:** Visual cards showing all stored postmortems with title, date, and file size.
- **👁️ View Button:** In-browser Markdown preview of past incidents and RCA findings.
- **📥 Download .md Button:** 1-click download of the raw SRE postmortem Markdown report.
- **Semantic / Keyword Runbook Search:** Full-text instant search across historical incidents.

### 3.7 Mobile Responsive Layout
- Fully responsive layout utilizing CSS Grid and Flexbox:
  - Collapsible panels and adaptive font sizing for mobile screens (`< 768px`).
  - Sticky header with quick cluster context and role indicators.
  - Fixed-position bottom floating approval bar ensuring critical human-in-the-loop decisions are never obscured on small devices.

## 4. Verification & Tests
Verified in [`test/smoke.test.ts`](file:///Users/joshuawilliams/Documents/Research/devops-agent/test/smoke.test.ts):
- **Test 18:** Validates Web Dashboard HTML generation, CSS dark-mode styling, and audit table layout.
- **Test 102:** Verifies `PostmortemTool.listReports()` returns generated postmortem markdown reports.
- **Test 103:** Verifies `PostmortemTool.getReport()` returns markdown contents for valid reports and blocks path traversal attempts.
- **Test 104:** Verifies Mission Control HTML includes 1-click terminal report download, audit export, and postmortem catalog.
- **Test 116:** Validates Mission Control Dashboard UX enhancements including Command Palette modal (`Cmd+K`), Keyboard Shortcuts cheatsheet (`?`), responsive mobile floating approval bar, Chat History search/tagging, and multi-criteria audit filtering.
- **Test 117:** Validates Mission Control Client Script Integrity by compiling inline `<script>` contents through Node.js `vm.Script` to ensure 0 syntax errors.
