# Junior DevOps Agent Engine (v3.0)

An autonomous, task-driven, user-guided DevOps agent engine built on the **Pi & Claw harness architecture**. It provides an AI agent with access to day-to-day DevOps tooling (`kubectl`, `helm`, `az`, `docker`, `git`, filesystem, Prometheus) while enforcing strict safety guardrails, visual diff previews, GitOps PR workflows, automated rollback watchers, multi-agent peer reviews, Model Context Protocol (MCP), and human-in-the-loop approvals.

---

## 🌟 Key Features

1. **Pi & Claw-Inspired Harness Loop:**
   - Methodical **ReAct Loop** (Think $\to$ Tool Selection $\to$ Policy Evaluation $\to$ Tool Execution $\to$ Observation $\to$ Verification).
   - Minimalist, fast, and multi-model compatible (Gemini, Claude, OpenAI, Kimi/Moonshot, Ollama).

2. **Multi-Agent "Peer Review" Pattern (Senior SRE Reviewer):**
   - Every mutating action proposed by the Junior Agent undergoes an architectural critique by the **Senior SRE Reviewer Agent** before reaching the operator.
   - Evaluates blast radius (Low/Medium/High), downtime risk, and suggests pre-flight safeguards.

3. **Autonomous Post-Mutation Rollback Watcher:**
   - When workload restarts or manifest changes are applied, the agent verifies rollout status.
   - If pods enter `CrashLoopBackOff` or the rollout times out, the agent **automatically triggers a rollback** (`kubectl rollout undo`) to preserve service availability.

4. **Security & Best-Practice Linter (`security_scan`):**
   - Audits Kubernetes YAML manifests and Dockerfiles for security risks: privileged containers, root execution, unpinned `:latest` tags, and missing CPU/memory limits.

5. **TLS Certificate & Secret Expiry Sentinel (`cert_expiry_check`):**
   - Automatically scans Kubernetes TLS secrets and live HTTPS endpoints to flag certificates expiring within 14 or 30 days.

6. **FinOps & Cloud Waste Hunter (`finops_idle_resources_audit`):**
   - Identifies orphaned Azure disks, unattached PersistentVolumeClaims (PVCs), and idle LoadBalancers without active pod backends.

7. **Universal Model Context Protocol (MCP) Server & Client:**
   - **MCP Server:** Run `npm run dev -- --mcp` to expose the engine over stdio JSON-RPC for Claude Desktop, Cursor, or Antigravity.
   - **MCP Client:** Dynamically connects third-party MCP tool servers into the agent's tool registry.

8. **Ephemeral Docker Sandbox Runner:**
   - Runs shell execution inside disposable, unprivileged Docker containers for zero-trust isolation with automatic fallback.

9. **Environment-Aware Production Lock & Visual Diffs:**
   - Automatically flags production clusters with `🔴` badges and strict verification gates.
   - Produces colored unified diffs before any file mutation is confirmed.

10. **Proactive Alert Webhook Server & Teams Adaptive Cards:**
    - Ingests alerts via `POST /api/alerts/webhook` to trigger autonomous triage.
    - Generates Microsoft Teams Adaptive Cards (v1.5) with interactive approval and rejection buttons.

---

## 🚀 Quick Start

### 1. Configure Environment
```bash
cp .env.example .env
```

Set your model provider (e.g. `LLM_PROVIDER=gemini` or `LLM_PROVIDER=kimi` or `LLM_PROVIDER=ollama`).

### 2. Run the Interactive CLI
```bash
npm run dev
```

### 3. Run as an MCP Server (for Claude Desktop / Cursor / Antigravity)
```bash
npm run dev -- --mcp
```

### 4. Run with Proactive Alert Webhook Server (port 3456)
```bash
npm run dev -- --server
```

### 5. Run Automated Smoke Tests
```bash
npm test
```

---

## 🛠️ Registered DevOps Tools (18 Tools)

| Tool | Purpose | Autonomy Tier |
| :--- | :--- | :--- |
| `shell_exec` | Safe command runner with sandbox support | Dynamic Guardrail |
| `k8s_get_resources` | Query pods, deployments, services, ingress, events | Tier 1 (Read-Only) |
| `k8s_describe_resource` | Inspect conditions, events, probes, lifecycle state | Tier 1 (Read-Only) |
| `k8s_get_logs` | Fetch recent pod logs (with `-p` support for crashes) | Tier 1 (Read-Only) |
| `k8s_rollout_restart` | Workload rolling restarts with automatic rollback verification | Tier 2 (SRE + Operator Approval) |
| `k8s_watch_rollout` | Monitor rollout and auto-rollback on failure | Tier 1 (Safe Action) |
| `security_scan` | Audit YAML manifests and Dockerfiles for security flaws | Tier 1 (Read-Only) |
| `cert_expiry_check` | Scan Ingress secrets and hostnames for expiring TLS certs | Tier 1 (Read-Only) |
| `finops_idle_resources_audit` | Scan for unattached PVCs, idle LoadBalancers, orphan disks | Tier 1 (Read-Only) |
| `metrics_query` | Query Kubernetes top pods/nodes or Prometheus metrics | Tier 1 (Read-Only) |
| `knowledge_base_search` | Search past incident RCAs and remediations | Tier 1 (Read-Only) |
| `gitops_create_pr` | Branching, committing, and opening Pull Requests | Tier 2 (SRE + Operator Approval) |
| `generate_postmortem_report` | Generate postmortem and index into knowledge base | Tier 1 (Safe Action) |
| `file_read` / `file_write` | Manifest and config reading / writing with diffs | Tier 1 (Read) / Tier 2 (Write) |
| `az_resource_list` | Query Azure resources across groups/types | Tier 1 (Read-Only) |
| `az_aks_status` | Inspect AKS cluster health and node pool status | Tier 1 (Read-Only) |
