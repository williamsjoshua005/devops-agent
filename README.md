# Junior DevOps Agent Engine (v2.0)

An autonomous, task-driven, user-guided DevOps agent engine built on the **Pi & Claw harness architecture**. It provides an AI agent with access to day-to-day DevOps tooling (`kubectl`, `helm`, `az`, `docker`, `git`, filesystem, Prometheus) while enforcing strict safety guardrails, visual diff previews, GitOps PR workflows, immutable audit logging, and human-in-the-loop approvals.

---

## 🌟 Key Features

1. **Pi & Claw-Inspired Harness Loop:**
   - Methodical **ReAct Loop** (Think $\to$ Tool Selection $\to$ Policy Evaluation $\to$ Tool Execution $\to$ Observation $\to$ Verification).
   - Minimalist, fast, and multi-model compatible (Gemini, Claude, OpenAI, Kimi/Moonshot, Ollama).

2. **Tiered Autonomy & Junior Guardrails:**
   - **Tier 1 (Autonomous Read-Only):** Diagnostic queries (`kubectl get/describe/logs`, `az show/list`, `git diff`, `file_read`, `metrics_query`) execute immediately without user friction.
   - **Tier 2 (User Confirmation Gate):** Mutating operations (`rollout restart`, `apply`, `scale`, `docker restart`, `file_write`) pause and prompt the operator before running.
   - **Tier 3 (Blocked Destructive):** Catastrophic operations (`kubectl delete ns`, `terraform destroy`, `rm -rf /`, `az group delete`) are permanently blocked by policy.

3. **Visual Diff & Dry-Run Previews:**
   - Automatically generates color-coded unified diffs for file edits and manifest updates before operator approval.

4. **Environment-Aware Production Lock:**
   - Detects active Kubernetes context and environment (`prod` vs `staging` vs `dev`).
   - Flashes prominent warnings and enforces heightened approval criteria when operating in production.

5. **GitOps & PR Creator:**
   - Encourages the "Fix via PR" pattern: creates fix branches, commits modifications with structured RCA descriptions, and opens Pull Requests via `gh` / `az repos`.

6. **Observability & Metrics:**
   - Queries Kubernetes metrics-server (`kubectl top pods/nodes`) or Prometheus PromQL expressions to inspect CPU/memory throttling and error rates.

7. **Incident Postmortems & Knowledge Base:**
   - Automatically generates structured postmortem reports in `reports/postmortem-*.md`.
   - Indexes past outages into a local incident knowledge base (`knowledge_base/incidents.json`), allowing the agent to search past solutions when triaging new alerts.

8. **Proactive Alert Ingestion Webhook Server:**
   - Lightweight HTTP server (`/api/alerts/webhook`) that listens for Alertmanager, PagerDuty, or Azure Monitor alerts and automatically triggers background triage.
   - Exposes `/api/audit` for compliance review.

9. **Microsoft Teams Adaptive Card Adapter:**
   - Pre-built Adaptive Card (v1.5) builder formatting approvals and incident alerts with interactive buttons for Microsoft Teams channels.

---

## 🚀 Quick Start

### 1. Configure Environment
Copy `.env.example` to `.env` and set your preferred model provider and API key:

```bash
cp .env.example .env
```

Example for Google Gemini:
```env
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your_key_here
```

Example for Kimi (Moonshot AI):
```env
LLM_PROVIDER=kimi
LLM_MODEL=moonshot-v1-auto
MOONSHOT_API_KEY=your_key_here
```

### 2. Run the Interactive CLI
```bash
npm run dev
```

### 3. Run with Proactive Alert Webhook Server
```bash
npm run dev -- --server
```

### 4. Run Automated Smoke Tests
```bash
npm test
```

---

## 🛠️ Registered DevOps Tools

| Tool | Purpose | Autonomy Tier |
| :--- | :--- | :--- |
| `shell_exec` | Safe command runner with timeout and policy checks | Evaluated dynamically |
| `k8s_get_resources` | Query pods, deployments, services, ingress, events | Tier 1 (Read-Only) |
| `k8s_describe_resource` | Inspect conditions, events, probes, lifecycle state | Tier 1 (Read-Only) |
| `k8s_get_logs` | Fetch recent pod logs (with `-p` support for crashes) | Tier 1 (Read-Only) |
| `metrics_query` | Query Kubernetes top pods/nodes or Prometheus metrics | Tier 1 (Read-Only) |
| `knowledge_base_search` | Search past incident RCAs and remediations | Tier 1 (Read-Only) |
| `k8s_rollout_restart` | Workload rolling restarts | Tier 2 (Operator Approval) |
| `file_read` / `file_write` | Manifest and config reading / writing with diffs | Tier 1 (Read) / Tier 2 (Write) |
| `gitops_create_pr` | Branching, committing, and opening Pull Requests | Tier 2 (Operator Approval) |
| `generate_postmortem_report` | Generate postmortem and index into knowledge base | Tier 1 (Safe Action) |
| `az_resource_list` | Query Azure resources across groups/types | Tier 1 (Read-Only) |
| `az_aks_status` | Inspect AKS cluster health and node pool status | Tier 1 (Read-Only) |
