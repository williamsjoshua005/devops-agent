# Junior DevOps Agent Engine (v4.0)

An autonomous, task-driven, user-guided DevOps agent engine built on the **Pi & Claw harness architecture**. It provides an AI agent with access to day-to-day DevOps tooling (`kubectl`, `helm`, `az`, `docker`, `git`, filesystem, Prometheus) while enforcing strict safety guardrails, visual diff previews, GitOps PR workflows, automated rollback watchers, multi-agent peer reviews, Model Context Protocol (MCP), and human-in-the-loop approvals.

---

## 🌟 Key Features

1. **Pi & Claw-Inspired Harness Loop:**
   - Methodical **ReAct Loop** (Think $\to$ Tool Selection $\to$ Policy Evaluation $\to$ Tool Execution $\to$ Observation $\to$ Verification).
   - Minimalist, fast, and multi-model compatible (Gemini, Claude, OpenAI, Kimi/Moonshot, Ollama).

2. **Mission Control Web Dashboard (`/dashboard`):**
   - High-performance, dark-mode single-page Web Console on port 3456 (`http://localhost:3456/dashboard`).
   - Live interactive task execution console with real-time streaming output, audit history table, and incident search.

3. **Service Dependency Topology & Blast-Radius Mapping (`topology_graph`):**
   - Discovers incoming ingress routes $\to$ services $\to$ target workloads $\to$ databases and renders both Mermaid flowcharts and ASCII blast-radius maps.

4. **In-Cluster Ephemeral Network & Connectivity Prober (`diagnose_connectivity`):**
   - Launches disposable probe pods to test internal DNS resolution and TCP socket handshakes (e.g. to databases or internal APIs) with zero credential leakage.

5. **Progressive Canary Deployments (`canary_deploy`):**
   - Routes fractional traffic (~10%) to a canary release, verifies health, and auto-aborts/cleans up immediately if errors occur, preserving baseline availability.

6. **Semantic Vector Incident Memory Search (`semantic_kb_search`):**
   - Semantic term-frequency cosine vector search matching query concepts to historical incident postmortems.

7. **Automated Chaos Resilience Drills (`chaos_drill`):**
   - Safely injects failures (e.g. `pod-kill`) in staging/dev environments to measure self-healing recovery times. (Strictly prohibited in production).

8. **Multi-Platform Chat Adapters (Teams, Slack, Discord):**
   - **Microsoft Teams:** Adaptive Cards (v1.5) with interactive approval buttons.
   - **Slack:** Block Kit interactive cards.
   - **Discord:** Rich color-coded embed messages.

9. **Multi-Agent Senior SRE Peer Review:**
   - Pre-flight critique analyzing blast radius (Low/Medium/High) and downtime risks before human operator approval.

10. **Autonomous Rollout Watcher & Auto-Rollback:**
    - Detects failing or crashing pods post-mutation and triggers `kubectl rollout undo` automatically.

11. **Model Context Protocol (MCP) Server & Client:**
    - Exposes the engine over stdio JSON-RPC for Claude Desktop, Cursor, or Antigravity via `--mcp`.

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

### 3. Run with Mission Control Web Console (port 3456)
```bash
npm run dev -- --server
```
Then open your browser to **`http://localhost:3456/dashboard`**.

### 4. Run as an MCP Server (for Claude Desktop / Cursor / Antigravity)
```bash
npm run dev -- --mcp
```

### 5. Run Automated Smoke Tests
```bash
npm test
```

---

## 🛠️ Registered DevOps Tools (55 Tools)

| Tool | Purpose | Autonomy Tier |
| :--- | :--- | :--- |
| `shell_exec` | Safe command runner with sandbox support | Dynamic Guardrail |
| `k8s_get_resources` | Query pods, deployments, services, ingress, events | Tier 1 (Read-Only) |
| `k8s_describe_resource` | Inspect conditions, events, probes, lifecycle state | Tier 1 (Read-Only) |
| `k8s_get_logs` | Fetch recent pod logs (with `-p` support for crashes) | Tier 1 (Read-Only) |
| `topology_graph` | Service dependency graph & blast radius mapping | Tier 1 (Read-Only) |
| `diagnose_connectivity` | In-cluster ephemeral network DNS & TCP probe | Tier 1 (Read-Only) |
| `canary_deploy` | Progressive canary deployment with auto-abort | Tier 2 (SRE + Operator Approval) |
| `chaos_drill` | Controlled pod-kill self-healing test (Dev only) | Tier 2 (Dev) / Tier 3 (Blocked on Prod) |
| `k8s_rollout_restart` | Workload rolling restarts with automatic rollback | Tier 2 (SRE + Operator Approval) |
| `k8s_watch_rollout` | Monitor rollout and auto-rollback on failure | Tier 1 (Safe Action) |
| `security_scan` | Audit YAML manifests and Dockerfiles for security | Tier 1 (Read-Only) |
| `cert_expiry_check` | Scan Ingress secrets & hostnames for expiring TLS | Tier 1 (Read-Only) |
| `finops_idle_resources_audit` | Scan for unattached PVCs, idle LoadBalancers, orphan disks | Tier 1 (Read-Only) |
| `metrics_query` | Query Kubernetes top pods/nodes or Prometheus metrics | Tier 1 (Read-Only) |
| `knowledge_base_search` | Search past incident RCAs and remediations | Tier 1 (Read-Only) |
| `semantic_kb_search` | Vector search across historical incident memory | Tier 1 (Read-Only) |
| `gitops_create_pr` | Branching, committing, and opening Pull Requests | Tier 2 (SRE + Operator Approval) |
| `generate_postmortem_report` | Generate postmortem and index into knowledge base | Tier 1 (Safe Action) |
| `file_read` / `file_write` | Manifest and config reading / writing with diffs | Tier 1 (Read) / Tier 2 (Write) |
| `az_resource_list` | Query Azure resources across groups/types | Tier 1 (Read-Only) |
| `az_aks_status` | Inspect AKS cluster health and node pool status | Tier 1 (Read-Only) |
| `aws_resource_list` | Query AWS resources across EC2, S3, RDS, Lambda, VPC | Tier 1 (Read-Only) |
| `aws_eks_status` | Inspect Amazon EKS cluster health & node groups | Tier 1 (Read-Only) |
| `gcp_resource_list` | Query GCP compute, buckets, Cloud SQL, VPCs | Tier 1 (Read-Only) |
| `gcp_gke_status` | Inspect Google Kubernetes Engine cluster status | Tier 1 (Read-Only) |
| `k8s_list_contexts` | List configured Kubernetes contexts and clusters | Tier 1 (Read-Only) |
| `k8s_switch_context` | Safely switch active cluster context with prod warnings | Tier 1 (Dev) / Tier 2 (Prod Approval) |
| `terraform_plan` | Plan & summarize additions, modifications, destructions | Tier 1 (Read-Only) |
| `terraform_drift_detect` | Detect infrastructure drift against state without mutating | Tier 1 (Read-Only) |
| `helm_diff` | Visual unified diff of release upgrades before deployment | Tier 1 (Read-Only) |
| `helm_status` | Query release status, revision, and resource health | Tier 1 (Read-Only) |
| `helm_history` | Inspect historical Helm deployment revisions | Tier 1 (Read-Only) |
| `helm_rollback` | Rollback failed/degraded release to previous revision | Tier 2 (SRE + Operator Approval) |
| `argocd_app_status` | Query sync and health status for Argo CD applications | Tier 1 (Read-Only) |
| `argocd_diff_app` | Inspect out-of-sync manifest drift in GitOps applications | Tier 1 (Read-Only) |
| `argocd_sync_app` | Synchronize application to reconcile live cluster with Git | Tier 2 (SRE + Operator Approval) |
| `loki_log_query` | Query centralized multi-service logs via Grafana Loki LogQL | Tier 1 (Read-Only) |
| `trace_latency_query` | Pinpoint microservice latency bottlenecks via Jaeger/Tempo | Tier 1 (Read-Only) |
| `k8s_debug_pod` | Ephemeral diagnostic container for sockets & network | Tier 2 (Dev) / Tier 2 (Prod Approval) |
| `pagerduty_manage` | Triage, acknowledge, note, or resolve PagerDuty incidents | Tier 1 (Read-Only / Triage) |
| `opsgenie_manage` | Triage, acknowledge, close, or add notes to Opsgenie alerts | Tier 1 (Read-Only / Triage) |
| `velero_backup_check` | Audit Velero cluster backup status, completion, and freshness | Tier 1 (Read-Only) |
| `velero_create_backup` | On-demand cluster backup pre-flight snapshot before maintenance | Tier 2 (SRE + Operator Approval) |
| `cloud_db_snapshot` | Trigger point-in-time snapshot for AWS RDS, Azure DB, GCP Cloud SQL | Tier 2 (SRE + Operator Approval) |
| `ci_pipeline_logs` | View failed CI/CD workflow logs & stack traces (GH Actions / GitLab) | Tier 1 (Read-Only) |
| `ci_rerun_failed` | Re-trigger failed CI/CD pipeline jobs after automated fixes | Tier 2 (SRE + Operator Approval) |
| `k8s_policy_audit` | Audit admission control violations (Kyverno, OPA Gatekeeper, PSS) | Tier 1 (Read-Only) |
| `runbook_list` | List available vetted enterprise SRE runbooks & symptoms | Tier 1 (Read-Only) |
| `runbook_validate` | Pre-flight validation of runbook prerequisites & blast radius | Tier 1 (Read-Only) |
| `runbook_execute` | Step-by-step SRE runbook remediation with auto-rollback | Tier 2 (SRE + Operator Approval) |
| `vault_secret_inspect` | Safe audit of Vault / AWS / Azure / K8s secret metadata & TTL | Tier 1 (Read-Only) |
| `sealed_secrets_check` | Audit Bitnami SealedSecrets decryption sync & cert health | Tier 1 (Read-Only) |
| `service_mesh_diagnose` | Diagnose Istio / Linkerd proxy sync (CDS/LDS/EDS/RDS) & mTLS | Tier 1 (Read-Only) |



