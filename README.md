# DevOps Autonomous Agent Engine (v4.5)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-100%2B%20Passing-brightgreen.svg)](file:///Users/joshuawilliams/Documents/Research/devops-agent/test/smoke.test.ts)
[![Tools](https://img.shields.io/badge/Tools-108%20Native-orange.svg)](file:///Users/joshuawilliams/Documents/Research/devops-agent/src/tools/index.ts)

An autonomous, task-driven, user-guided enterprise DevOps agent engine built on the **Pi & Claw harness architecture**. It provides an AI agent with access to day-to-day DevOps tooling (`kubectl`, `helm`, `kustomize`, `terraform`, `flux`, `argocd`, `docker`, `git`, cloud CLIs, filesystem, Prometheus, Loki) while enforcing strict 3-tier safety guardrails, visual diff previews, GitOps PR workflows, automated rollback watchers, multi-agent SRE peer reviews, multi-cloud isolation toggles, strict kubeconfig grounding, Model Context Protocol (MCP), and human-in-the-loop approvals.

---

## 🌟 Key Features

1. **Pi & Claw-Inspired Harness Loop:**
   - Methodical **ReAct Loop** (Think $\to$ Tool Selection $\to$ Policy Evaluation $\to$ Tool Execution $\to$ Observation $\to$ Verification).
   - Multi-model compatible (Gemini, Claude, OpenAI, Kimi/Moonshot, Ollama).

2. **Multi-Tier Role Hierarchy & Autonomous Tiers:**
   - **Junior DevOps:** All mutations require explicit human sign-off; safe read-only commands execute autonomously.
   - **Intermediate DevOps:** Standard triage, diffing, dry-runs, and non-destructive in-cluster commands run autonomously; production mutations require approval.
   - **Senior SRE:** Autonomous execution of advanced diagnostics and recovery workflows, bounded by immutable Tier 3 production guardrails.

3. **Cloud Provider Toggles & Strict Kubeconfig Grounding:**
   - Selectively enable or disable cloud providers (`AWS`, `Azure`, `GCP`) via configuration, CLI flags, REPL commands, or REST API.
   - **Kubernetes-Only Mode (`--k8s-only`):** Disables all cloud providers, reducing the catalog from 108 down to 102 tools.
   - **Strict In-Cluster Grounding (`stickToKubeConfig`):** Guardrails strictly block cloud credentials wrappers (`aws eks update-kubeconfig`, `az aks get-credentials`, `gcloud container clusters get-credentials`), eliminating cluster drift.

4. **Enterprise Kubernetes & Containers Toolset (33 Specialized Tools):**
   - Interactive debugging (`k8s_exec`, `k8s_port_forward`, `k8s_copy`), resource lifecycle & dry-run diffing (`k8s_diff_resource`, `k8s_apply_manifest`, `k8s_delete_resource`, `k8s_wait_for_condition`), scheduling triage (`k8s_node_status`, `k8s_node_cordon`, `k8s_node_uncordon`, `k8s_node_drain`, `k8s_scheduling_analysis`, `k8s_resource_quota_audit`), autoscaling audits (`k8s_hpa_audit`, `k8s_vpa_recommendations`, `k8s_pdb_audit`, `k8s_disruption_budget_check`), storage management (`k8s_pvc_analysis`, `k8s_pv_cleanup`, `k8s_volume_snapshot`), batch workloads (`k8s_job_status`, `k8s_cronjob_status`, `k8s_trigger_cronjob`), secrets auditing (`k8s_configmap_diff`, `k8s_secret_rotate_check`, `k8s_env_injection_audit`), networking (`k8s_network_policy_audit`, `k8s_ingress_check`, `k8s_service_endpoints`, `k8s_dns_diagnose`), multi-cluster fleet management (`k8s_multi_cluster_inventory`, `k8s_cluster_comparison`, `k8s_git_sync_status`), and FinOps/GreenOps (`k8s_cost_by_namespace`, `k8s_carbon_footprint`).

5. **Declarative GitOps & Infrastructure as Code:**
   - **Terraform / OpenTofu:** Plan, apply, drift detection, state inspection, and workspace management (`terraform_*`).
   - **Helm & Kustomize:** Local template rendering, values inspection, chart linting, upgrade/install with dry-run, visual diffing, and rollback (`helm_*`, `kustomize_*`).
   - **Argo CD & Flux v2:** App status, diffing, synchronization, and rollback (`argocd_*`, `flux_*`).
   - **CI/CD Automation:** Failed pipeline inspection, automatic reruns, and PR check validation (`ci_*`, `gitops_verify_pr_checks`).

6. **SRE Runbooks, Secrets Compliance & Observability:**
   - Vetted operational runbooks with step-by-step verification (`runbook_*`).
   - Secret metadata and TTL audits across Vault, SealedSecrets, and External Secrets Operator (`vault_secret_inspect`, `sealed_secrets_check`, `external_secrets_check`).
   - Istio / Linkerd service mesh proxy synchronization diagnostics (`service_mesh_diagnose`).
   - Disaster recovery backups with Velero and cloud database point-in-time snapshots (`velero_*`, `cloud_db_snapshot`).
   - Centralized logging via Grafana Loki LogQL (`loki_log_query`) and distributed tracing latency via Jaeger/Tempo (`trace_latency_query`).
   - On-call alert triage for PagerDuty and Opsgenie (`pagerduty_manage`, `opsgenie_manage`).

7. **Mission Control Web Console & Alert Webhooks (`/dashboard`):**
   - Modern, dark-mode single-page Web Console on port 3456 (`http://localhost:3456/dashboard`).
   - Live interactive execution console, streaming logs, cloud provider navbar pill with dropdown toggles, audit forensics, and Prometheus Alertmanager webhook ingestion.

8. **Safety Envelope, Visual Diffs & Autonomous Rollback:**
   - 3-Tier deterministic policy with Environment-Aware Production Lock.
   - Visual ANSI unified diff previews for all configuration changes.
   - Autonomous Rollout Watcher detecting pod failures post-mutation and triggering instant `kubectl rollout undo`.

9. **Model Context Protocol (MCP) Server:**
   - Exposes platform tools over stdio JSON-RPC 2.0 for Claude Desktop, Cursor, or Antigravity via `--mcp`.

---

## 🚀 Quick Start

### 1. Configure Environment
```bash
cp .env.example .env
```
Key configuration parameters:
```env
LLM_PROVIDER=openai               # gemini | openai | claude | kimi | ollama
OPENAI_API_KEY=your_key_here
ROLE=intermediate                 # junior | intermediate | senior
ENVIRONMENT=development           # development | staging | production

# Cloud Provider Toggles & In-Cluster Grounding
ENABLE_AWS=true
ENABLE_AZURE=true
ENABLE_GCP=true
STICK_TO_KUBECONFIG=true
```

### 2. Interactive Terminal CLI
```bash
npm run dev
```

### 3. Mission Control Web Console (port 3456)
```bash
npm run dev -- --server
```
Open your browser to **`http://localhost:3456/dashboard`**.

### 4. Kubernetes-Only Mode
```bash
npm run dev -- --k8s-only
```
Instantly disables AWS, Azure, and GCP tools, locking the agent strictly to current kubeconfig context.

### 5. Run as an MCP Server (Claude Desktop / Cursor / Antigravity)
```bash
npm run dev -- --mcp
```

### 6. Automated Test Suite
```bash
npm test
```

---

## ☁️ Cloud Provider Toggles & Kubeconfig Grounding

The engine allows operators to enforce strict operational boundaries:

| Method | Syntax | Effect |
| :--- | :--- | :--- |
| **CLI Flags** | `--no-aws`, `--no-azure`, `--no-gcp` | Disables specific cloud provider tools & CLI commands |
| **K8s-Only Flag** | `--k8s-only` | Disables all cloud providers; reduces catalog to 102 tools |
| **Grounding Flag** | `--stick-to-kubeconfig` | Blocks credentials wrapper overrides (`aws eks ...`, `az aks ...`, `gcloud ...`) |
| **REPL Command** | `/cloud` or `/providers` | Shows active cloud providers and grounding status |
| **REPL Toggle** | `/cloud <aws\|azure\|gcp> <on\|off>` | Dynamically toggles specific cloud provider |
| **REPL K8s-Only** | `/k8s-only` | Instantly switches agent into Kubernetes-only mode |
| **REST API** | `GET /api/config/providers` | Queries active cloud providers and tool counts |
| **REST API** | `POST /api/config/providers` | Updates `{ aws: false, stickToKubeConfig: true }` |
| **Web Console** | Top Navbar Pill (`AWS • AZ • GCP`) | Dropdown menu with 1-click toggles and K8s-Only activation |

---

## 🛠️ Registered DevOps Tools (108 Tools)

When all cloud providers are enabled, the agent exposes **108 native tools**. In Kubernetes-Only mode (`--k8s-only`), the catalog dynamically scales to **102 tools**.

### 1. Interactive Workload Debugging & Sockets (4 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_exec` | Tier 1 (Dev) / Tier 2 (Prod) | Execute bounded diagnostic commands inside a pod container. Dangerous commands blocked by Tier 3. |
| `k8s_port_forward` | Tier 2 Approval | Open managed local port-forward tunnel to pod or service. Privileged ports (<1024) blocked. |
| `k8s_copy` | Tier 2 Approval | Safely copy files to/from pods (`kubectl cp`). Path traversal and sensitive credentials blocked. |
| `k8s_debug_pod` | Tier 2 Approval | Launch ephemeral diagnostic container attached to workload for socket and network debugging. |

### 2. Core Kubernetes Operations & Workload Lifecycle (8 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_get_resources` | Tier 1 (Read-Only) | Query pods, deployments, services, ingress, nodes, events across namespaces (`-A`). |
| `k8s_describe_resource` | Tier 1 (Read-Only) | Inspect resource conditions, events, probes, exit codes, and lifecycle states. |
| `k8s_get_logs` | Tier 1 (Read-Only) | Stream container stdout/stderr. Supports `--previous` (`-p`) for crashed containers. |
| `k8s_rollout_restart` | Tier 2 Approval | Trigger rolling restart with automated Rollout Watcher and rollback protection. |
| `k8s_watch_rollout` | Tier 1 (Safe Action) | Monitor rollout progression and verify workload stabilization. |
| `k8s_diff_resource` | Tier 1 (Read-Only) | Generate unified diff between live cluster state and a local YAML manifest or Git state. |
| `k8s_apply_manifest` | Tier 1 (DryRun) / Tier 2 (Live) | Apply Kubernetes manifests with dry-run support (`server`, `client`, `none`). |
| `k8s_delete_resource` | Tier 2 Approval | Safely delete resources with dependency checks. Critical infrastructure permanently protected. |

### 3. Scheduling, Capacity & Node Maintenance (7 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_node_status` | Tier 1 (Read-Only) | Inspect node capacity, allocatable CPU/RAM, conditions, taints, and drain eligibility. |
| `k8s_node_cordon` | Tier 2 Approval | Mark node as unschedulable (`SchedulingDisabled`) before maintenance. |
| `k8s_node_uncordon` | Tier 2 Approval | Restore unschedulable node to active service. |
| `k8s_node_drain` | Tier 1 (DryRun) / Tier 2 (Live) | Safely drain a node respecting PodDisruptionBudgets and daemonsets. |
| `k8s_resource_quota_audit` | Tier 1 (Read-Only) | Audit namespace ResourceQuotas and LimitRanges to detect exhaustion risks. |
| `k8s_scheduling_analysis` | Tier 1 (Read-Only) | Triage why pods are stuck in Pending (resource limits, taints, affinity, topology spread). |
| `k8s_wait_for_condition` | Tier 1 (Read-Only) | Poll resource until it reaches target condition (`Ready`, `Complete`) with timeout. |

### 4. Autoscaling, Resilience & Chaos (5 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_hpa_audit` / `k8s_hpa_status` | Tier 1 (Read-Only) | Audit HorizontalPodAutoscalers for metric thresholds and min/max saturation limits. |
| `k8s_vpa_recommendations` | Tier 1 (Read-Only) | Pull VerticalPodAutoscaler sizing recommendations for CPU/memory requests. |
| `k8s_pdb_audit` | Tier 1 (Read-Only) | Audit PodDisruptionBudget coverage across workloads to flag disruption gaps. |
| `k8s_disruption_budget_check` | Tier 1 (Read-Only) | Validate whether a planned rollout, restart, or drain is safe given active PDBs. |
| `chaos_drill` | Tier 2 (Dev) / Tier 3 (Blocked Prod) | Controlled pod termination drill to measure self-healing recovery times. |

### 5. Persistent Storage & Volume Resilience (3 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_pvc_analysis` | Tier 1 (Read-Only) | Audit PVC utilization, access modes, storage classes, and snapshot support. |
| `k8s_pv_cleanup` | Tier 1 (DryRun) / Tier 2 (Live) | Find Released, Failed, or orphaned PersistentVolumes and propose reclamation. |
| `k8s_volume_snapshot` | Tier 2 Approval | Trigger native CSI VolumeSnapshot creation for persistent volumes before mutations. |

### 6. Batch Workloads & Automation (3 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_job_status` | Tier 1 (Read-Only) | Audit batch Jobs, exit codes, failure causes, and active/completed pods. |
| `k8s_cronjob_status` | Tier 1 (Read-Only) | Audit CronJob schedules, last run times, active executions, and suspend states. |
| `k8s_trigger_cronjob` | Tier 2 Approval | Manually trigger a CronJob execution as a one-off batch Job. |

### 7. Configuration, Secrets & Security Compliance (8 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_configmap_diff` | Tier 1 (Read-Only) | Diff ConfigMap data across two namespaces or compare live state vs. Git manifest. |
| `k8s_secret_rotate_check` | Tier 1 (Read-Only) | Audit secret age and flag unrotated secrets older than threshold without value leakage. |
| `k8s_env_injection_audit` | Tier 1 (Read-Only) | Inspect environment variables and detect hardcoded secrets vs. ConfigMap/Secret refs. |
| `security_scan` | Tier 1 (Read-Only) | Static analysis of YAML manifests and Dockerfiles for security risks. |
| `container_image_scan` | Tier 1 (Read-Only) | Scan container images for CVEs and vulnerabilities (Trivy/Clair format). |
| `vault_secret_inspect` | Tier 1 (Read-Only) | Audit HashiCorp Vault, AWS, Azure, or K8s secret metadata, TTLs, and rotation dates. |
| `sealed_secrets_check` | Tier 1 (Read-Only) | Audit Bitnami SealedSecrets decryption sync and encryption certificate health. |
| `external_secrets_check` | Tier 1 (Read-Only) | Audit External Secrets Operator (ESO) CRDs and secret store sync status. |

### 8. Networking, Ingress & Service Mesh (6 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_network_policy_audit` | Tier 1 (Read-Only) | Audit NetworkPolicies for Zero-Trust compliance and detect unisolated workloads. |
| `k8s_ingress_check` | Tier 1 (Read-Only) | Test Ingress controllers, host routing rules, TLS cert termination, and backends. |
| `k8s_service_endpoints` | Tier 1 (Read-Only) | Verify Kubernetes Service selector routing and healthy active Endpoints. |
| `k8s_dns_diagnose` | Tier 1 (Read-Only) | Deep in-cluster DNS diagnostic auditing CoreDNS pods, upstreams, and latency. |
| `diagnose_connectivity` | Tier 1 (Read-Only) | Ephemeral probe pod testing internal cluster DNS resolution and TCP handshakes. |
| `service_mesh_diagnose` | Tier 1 (Read-Only) | Diagnose Istio / Linkerd proxy sync (CDS/LDS/EDS/RDS) and mTLS enforcement. |

### 9. Multi-Cluster Fleet & Git Synchronization (5 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_multi_cluster_inventory` | Tier 1 (Read-Only) | Aggregate workloads, nodes, and cluster health across all configured contexts. |
| `k8s_cluster_comparison` | Tier 1 (Read-Only) | Compare and diff identical workloads between two clusters (e.g. staging vs. prod). |
| `k8s_git_sync_status` | Tier 1 (Read-Only) | Compare live cluster state directly against a local Git repository path. |
| `k8s_list_contexts` | Tier 1 (Read-Only) | List configured Kubernetes contexts and clusters. |
| `k8s_switch_context` | Tier 1 (Dev) / Tier 2 (Prod) | Safely switch active cluster context with production safety warnings. |

### 10. FinOps, GreenOps & Governance (4 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `k8s_cost_by_namespace` | Tier 1 (Read-Only) | Estimate cloud cost allocation by namespace and workload using CPU/RAM requests. |
| `k8s_carbon_footprint` | Tier 1 (Read-Only) | Estimate operational carbon footprint (kg CO2e) and power consumption. |
| `finops_idle_resources_audit` | Tier 1 (Read-Only) | Scan for unattached PVCs, idle LoadBalancers, and orphaned cloud volumes. |
| `cert_expiry_check` | Tier 1 (Read-Only) | Scan Ingress secrets and hostnames for expiring TLS certificates. |

### 11. Infrastructure as Code (Terraform & OpenTofu) (5 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `terraform_plan` | Tier 1 (Read-Only) | Plan and summarize proposed infrastructure additions, modifications, and deletions. |
| `terraform_apply` | Tier 2 Approval | Apply a Terraform or OpenTofu plan to mutate cloud infrastructure. |
| `terraform_drift_detect` | Tier 1 (Read-Only) | Detect infrastructure configuration drift against declared state without mutating. |
| `terraform_state_inspect` | Tier 1 (Read-Only) | Inspect state resources, outputs, and modules without revealing sensitive values. |
| `terraform_workspace_manage` | Tier 1 (List) / Tier 2 (Select) | Manage Terraform workspaces (list, active, select, create). |

### 12. Helm & Kustomize Package Management (8 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `helm_template` | Tier 1 (Read-Only) | Render Helm chart templates locally without cluster contact. |
| `helm_values_get` | Tier 1 (Read-Only) | Retrieve active user-supplied or computed values from a deployed Helm release. |
| `helm_lint` | Tier 1 (Read-Only) | Run lint checks on chart directories to audit syntax and variable definitions. |
| `helm_diff` | Tier 1 (Read-Only) | Generate visual unified diff of what a Helm upgrade would change before execution. |
| `helm_upgrade_install` | Tier 1 (DryRun) / Tier 2 (Live) | Install or upgrade a Helm release. Dry-run executes safely; live requires approval. |
| `helm_status` | Tier 1 (Read-Only) | Query release status, revision, chart version, and resource health. |
| `helm_history` | Tier 1 (Read-Only) | List historical revisions and deployment descriptions. |
| `helm_rollback` | Tier 2 Approval | Roll back a failed or degraded Helm release to a previous healthy revision. |
| `kustomize_build` | Tier 1 (Read-Only) | Render Kustomize manifests from an overlay or base directory into compiled YAML. |
| `kustomize_diff` | Tier 1 (Read-Only) | Compare two Kustomize targets (e.g. base vs overlay) and output a unified diff. |

### 13. GitOps Engines (Argo CD & Flux v2) (6 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `argocd_app_status` | Tier 1 (Read-Only) | Query sync (`Synced`/`OutOfSync`) and health (`Healthy`/`Degraded`) status. |
| `argocd_diff_app` | Tier 1 (Read-Only) | Inspect specific out-of-sync resources and manifest drift against Git. |
| `argocd_sync_app` | Tier 2 Approval | Trigger automated GitOps reconciliation to sync live cluster with Git. |
| `argocd_app_rollback` | Tier 2 Approval | Roll back an Argo CD application to a previous deployment revision. |
| `flux_app_status` | Tier 1 (Read-Only) | Query Flux CD sync status for Kustomizations, HelmReleases, and GitRepositories. |
| `flux_sync_reconcile` | Tier 2 Approval | Trigger an immediate reconciliation on a Flux CD resource to bypass sync intervals. |

### 14. CI/CD & Pull Request Automation (4 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `gitops_create_pr` | Tier 2 Approval | Automated branch creation, manifest commit synthesis, and Pull Request opening. |
| `gitops_verify_pr_checks` | Tier 1 (Read-Only) | Inspect PR CI status, required checks, review approvals, and merge readiness. |
| `ci_pipeline_logs` | Tier 1 (Read-Only) | Inspect failed CI/CD workflow logs, job steps, and error stack traces. |
| `ci_rerun_failed` | Tier 2 Approval | Re-trigger failed CI/CD pipeline jobs after automated fixes. |

### 15. Cloud Providers (AWS, Azure, GCP) (6 Tools, Togglable)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `aws_resource_list` | Tier 1 (Read-Only) | Query AWS resources across EC2, S3, RDS, Lambda, VPC. *(Toggled by AWS switch)* |
| `aws_eks_status` | Tier 1 (Read-Only) | Inspect Amazon EKS cluster health, status, and managed node groups. |
| `az_resource_list` | Tier 1 (Read-Only) | Query Azure resources across resource groups and resource types. *(Toggled by Azure switch)* |
| `az_aks_status` | Tier 1 (Read-Only) | Inspect AKS cluster health, provisioning state, and agent node pools. |
| `gcp_resource_list` | Tier 1 (Read-Only) | Query GCP compute instances, buckets, Cloud SQL, and VPC networks. *(Toggled by GCP switch)* |
| `gcp_gke_status` | Tier 1 (Read-Only) | Inspect Google Kubernetes Engine cluster status, node pools, and health. |

### 16. Observability, Telemetry & Incident Management (7 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `metrics_query` | Tier 1 (Read-Only) | Query Kubernetes `top pods`/`nodes` or Prometheus PromQL metrics. |
| `loki_log_query` | Tier 1 (Read-Only) | Query centralized multi-service logs across the cluster via Grafana Loki LogQL. |
| `trace_latency_query` | Tier 1 (Read-Only) | Query distributed traces from Jaeger/Tempo to pinpoint latency bottlenecks. |
| `k8s_event_timeline` | Tier 1 (Read-Only) | Correlate Warning and Normal events across pods, nodes, and controllers into incident timelines. |
| `topology_graph` | Tier 1 (Read-Only) | Map Ingress $\to$ Service $\to$ Pod dependency graph and render blast-radius maps. |
| `pagerduty_manage` | Tier 1 (List) / Tier 2 (Triage) | Manage PagerDuty incidents: list triggered alerts, acknowledge, add notes, resolve. |
| `opsgenie_manage` | Tier 1 (List) / Tier 2 (Triage) | Manage Opsgenie on-call alerts: list open alerts, acknowledge, close. |

### 17. SRE Runbooks & Disaster Recovery (6 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `runbook_list` | Tier 1 (Read-Only) | List available vetted enterprise SRE runbooks matching optional symptoms. |
| `runbook_validate` | Tier 1 (Read-Only) | Pre-flight validation of runbook prerequisites, parameters, and blast radius. |
| `runbook_execute` | Tier 2 Approval | Step-by-step SRE runbook remediation with auto-rollback triggers. |
| `velero_backup_check` | Tier 1 (Read-Only) | Audit Kubernetes cluster backup health using Velero, schedules, and freshness. |
| `velero_create_backup` | Tier 2 Approval | Create on-demand Velero backup snapshot prior to high-risk maintenance. |
| `cloud_db_snapshot` | Tier 2 Approval | Trigger on-demand point-in-time snapshot for AWS RDS, Azure DB, or GCP Cloud SQL. |

### 18. System, Filesystem & Knowledge Memory (6 Tools)
| Tool | Action Tier | Description |
| :--- | :--- | :--- |
| `shell_exec` | Dynamic Guardrail | Execute shell commands in isolated sandbox or host with strict safety filters. |
| `file_read` | Tier 1 (Read-Only) | Read contents of local files (manifests, configs, source code). |
| `file_write` | Tier 2 Approval | Create or overwrite files with automated visual unified diff generation. |
| `file_list` | Tier 1 (Read-Only) | List files and directories in local paths. |
| `knowledge_base_search` | Tier 1 (Read-Only) | Keyword search across historical incident postmortems and RCAs. |
| `semantic_kb_search` | Tier 1 (Read-Only) | Semantic vector cosine similarity search across postmortem repository. |
| `generate_postmortem_report`| Tier 1 (Safe Action) | Generate structured postmortem report and index into knowledge base memory. |
| `canary_deploy` | Tier 2 Approval | Progressive canary deployment (10% traffic) with automated error abort. |

---

## ⌨️ Interactive CLI Slash Commands

Run `npm run dev` to enter the interactive REPL. The engine provides intuitive slash commands:

| Command | Description |
| :--- | :--- |
| `/role <junior\|intermediate\|senior>` | Switch active operator role and autonomy permissions |
| `/cloud` or `/providers` | View cloud providers status and kubeconfig grounding |
| `/cloud <aws\|azure\|gcp> <on\|off>` | Dynamically enable or disable a cloud provider |
| `/k8s-only` | Instantly switch to Kubernetes-only mode (disables AWS, Azure, GCP) |
| `/cloud stick <on\|off>` | Toggle strict in-cluster kubeconfig grounding |
| `/clusters` | List available Kubernetes contexts |
| `/context <name>` | Switch active Kubernetes context safely |
| `/tools` | List currently available platform tools and descriptions |
| `/runbooks` | List vetted enterprise SRE runbooks |
| `/timeline [ns]` | Render Kubernetes incident event timeline |
| `/rightsize [ns]` | Display CPU/memory rightsizing capacity recommendations |
| `/hpa [ns]` | Audit HorizontalPodAutoscalers for saturation bottlenecks |
| `/netpol [ns]` | Audit NetworkPolicies for Zero-Trust microsegmentation |
| `/scan <image>` | Scan container image for CVEs and vulnerabilities |
| `/security [dir]` | Run static security linter against manifests and Dockerfiles |
| `/finops` | Audit idle resources, unattached PVCs, and cloud waste |
| `/kb <query>` | Search postmortem knowledge base memory |
| `/audit` | View recent entries from the immutable audit ledger |
| `/mcp` | Print instructions for configuring Claude Desktop or Cursor MCP |
| `/exit` | Exit the CLI |

---

## 🌐 Mission Control & REST API

Start the engine in server mode (`npm run dev -- --server`) to enable the Web Console on port 3456:

- **Mission Control Web Console:** `http://localhost:3456/dashboard`
- **Health Check:** `GET http://localhost:3456/health`
- **Cloud Provider Config:**
  - `GET /api/config/providers` — Returns active providers, grounding status, and tool counts.
  - `POST /api/config/providers` — Update provider settings dynamically (`{ "aws": false, "stickToKubeConfig": true }`).
- **Prometheus Alertmanager Webhook:** `POST /api/alerts/webhook`
- **Immutable Audit Trail:** `GET /api/audit`
- **Interactive Task Execution API:** `POST /api/tasks`

---

## 🧪 Testing & Verification

The engine is backed by a comprehensive automated test suite with **100+ passing tests**:
```bash
# Build TypeScript
npm run build

# Run unit tests for Cloud Provider Toggles & Kubeconfig Grounding
npx tsx test/cloud_provider.test.ts

# Run complete platform smoke test suite
npm test
```

---

## 📚 Technical Documentation

Explore the complete specifications in the [`docs/specs/`](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/) directory:
- [Spec 01: Progressive Safety Guardrails & 3-Tier Policy](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/01-safety-guardrails-and-policy.md)
- [Spec 06: ReAct Agent Loop & LLM Harness](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/06-react-agent-loop-and-llm-harness.md)
- [Spec 20: Model Context Protocol (MCP)](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/20-model-context-protocol-mcp.md)
- [Spec 22: Mission Control Web Console](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/22-mission-control-web-console.md)
- [Spec 25: Enterprise Kubernetes & Containers Toolset](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/25-enterprise-kubernetes-and-containers-toolset.md)
- [Spec 26: Cloud Provider Toggles & Strict Kubeconfig Grounding](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/26-cloud-provider-toggles-and-kubeconfig-grounding.md)
- [Spec 27: GitOps (Argo CD & Flux v2), Helm, Kustomize, and Terraform IaC](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/27-gitops-helm-flux-argocd-and-terraform-iac.md)
- [Spec 28: SRE Runbooks, Vault & Secrets, Service Mesh, and Observability](file:///Users/joshuawilliams/Documents/Research/devops-agent/docs/specs/28-sre-runbooks-vault-secrets-and-observability.md)
