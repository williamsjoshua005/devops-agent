import { ToolDefinition, AgentContext } from '../types.js';
import { ShellTool } from './shell.js';
import { K8sTool } from './k8s.js';
import { AzureTool } from './azure.js';
import { AwsTool } from './aws.js';
import { GcpTool } from './gcp.js';
import { FileTool } from './files.js';
import { GitOpsTool } from './gitops.js';
import { MetricsTool } from './metrics.js';
import { PostmortemTool } from './postmortem.js';
import { SecurityLinterTool } from './security.js';
import { CertExpiryTool } from './certificates.js';
import { FinOpsTool } from './finops.js';
import { RolloutWatcher } from '../policy/watcher.js';
import { TopologyTool } from './topology.js';
import { NetworkProberTool } from './network.js';
import { CanaryTool } from './canary.js';
import { ChaosTool } from './chaos.js';
import { SemanticKbTool } from './semantic_kb.js';
import { TerraformTool } from './terraform.js';
import { HelmTool } from './helm.js';
import { ArgoCdTool } from './argocd.js';
import { ObservabilityTool } from './observability.js';
import { IncidentManagementTool } from './incident_management.js';
import { DisasterRecoveryTool } from './disaster_recovery.js';
import { CiCdTool } from './cicd.js';
import { AdmissionPolicyTool } from './admission_policy.js';
import { RunbookTool } from './runbook.js';
import { VaultSecretTool } from './vault_secret.js';
import { ServiceMeshTool } from './service_mesh.js';
import { FluxTool } from './flux.js';
import { KustomizeTool } from './kustomize.js';
import { ContainerSecurityTool } from './container_security.js';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'shell_exec',
    description:
      'Execute a bash/zsh command in the terminal. Use for running CLI tools (kubectl, helm, az, docker, git) or running custom scripts and diagnostics.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command line string to execute.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'k8s_get_resources',
    description:
      'Query Kubernetes resources (pods, deployments, services, ingress, events, nodes). Omit namespace to query all namespaces.',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Kubernetes resource type, e.g. "pods", "deployments", "services", "ingress", "events", "nodes".',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace. If omitted, queries across all namespaces (-A).',
        },
        labelSelector: {
          type: 'string',
          description: 'Optional Kubernetes label selector (e.g. "app=payment").',
        },
      },
      required: ['resource'],
    },
  },
  {
    name: 'k8s_describe_resource',
    description:
      'Describe a Kubernetes resource to inspect detailed conditions, events, lifecycle state, and configuration.',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Resource type (e.g. "pod", "deployment", "service").',
        },
        name: {
          type: 'string',
          description: 'Resource name.',
        },
        namespace: {
          type: 'string',
          description: 'Namespace where the resource lives.',
        },
      },
      required: ['resource', 'name'],
    },
  },
  {
    name: 'k8s_get_logs',
    description:
      'Fetch recent logs for a Kubernetes pod. Supports retrieving previous crashed instance logs with previous=true.',
    parameters: {
      type: 'object',
      properties: {
        podName: {
          type: 'string',
          description: 'Name of the pod.',
        },
        namespace: {
          type: 'string',
          description: 'Namespace of the pod.',
        },
        container: {
          type: 'string',
          description: 'Optional container name if the pod has multiple containers.',
        },
        tailLines: {
          type: 'number',
          description: 'Number of recent lines to retrieve (default: 100).',
        },
        previous: {
          type: 'boolean',
          description: 'Set to true to retrieve logs from previous crashed/terminated container instance (-p). Crucial for CrashLoopBackOff triage.',
        },
      },
      required: ['podName'],
    },
  },
  {
    name: 'k8s_rollout_restart',
    description:
      'Trigger a rolling restart of a Kubernetes deployment, daemonset, or statefulset. Automatically monitors rollout and auto-rolls back if pods crash. (Requires user confirmation).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the deployment/workload.',
        },
        kind: {
          type: 'string',
          description: 'Workload kind: "deployment", "daemonset", or "statefulset" (default: "deployment").',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (default: "default").',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'k8s_watch_rollout',
    description:
      'Monitor a Kubernetes rollout until completion. If rollout times out or pods enter CrashLoopBackOff, automatically triggers an automated rollback.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Workload name.',
        },
        kind: {
          type: 'string',
          description: 'Workload kind (default "deployment").',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (default "default").',
        },
        timeoutSeconds: {
          type: 'number',
          description: 'Monitoring timeout window in seconds (default 30).',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'k8s_list_contexts',
    description:
      'List all configured Kubernetes cluster contexts from kubeconfig, indicating the currently active context.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'k8s_switch_context',
    description:
      'Switch the active Kubernetes cluster context. Dynamically updates environment safety guardrails.',
    parameters: {
      type: 'object',
      properties: {
        contextName: {
          type: 'string',
          description: 'Name of the Kubernetes context to switch to (e.g., "prod", "staging", "aks-uat").',
        },
      },
      required: ['contextName'],
    },
  },
  {
    name: 'topology_graph',
    description:
      'Discover and graph service-to-service communication dependencies, ingress gateways, and blast-radius mapping.',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace to discover (omit for all namespaces).',
        },
      },
    },
  },
  {
    name: 'diagnose_connectivity',
    description:
      'Run an ephemeral in-cluster network probe to test DNS resolution and TCP port reachability without leaking credentials.',
    parameters: {
      type: 'object',
      properties: {
        targetHost: {
          type: 'string',
          description: 'Target hostname or internal service name to probe (e.g. "postgres-db.default.svc.cluster.local").',
        },
        targetPort: {
          type: 'number',
          description: 'Target TCP port (e.g. 5432, 6379, 80, 443).',
        },
        namespace: {
          type: 'string',
          description: 'Namespace to run the ephemeral probe pod from.',
        },
      },
      required: ['targetHost'],
    },
  },
  {
    name: 'canary_deploy',
    description:
      'Orchestrate a progressive Canary release: routes ~10% traffic to new image, verifies health, and auto-aborts on failure. (Requires user confirmation).',
    parameters: {
      type: 'object',
      properties: {
        serviceName: {
          type: 'string',
          description: 'Name of the deployment/service.',
        },
        newImage: {
          type: 'string',
          description: 'New container image tag to deploy as canary.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace.',
        },
        trafficWeight: {
          type: 'number',
          description: 'Percentage of traffic to route to canary (default 10).',
        },
      },
      required: ['serviceName', 'newImage'],
    },
  },
  {
    name: 'chaos_drill',
    description:
      'Run a controlled resilience verification drill (e.g. restart pod) to verify workload recovery time. (Permitted in development environments only).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['pod-kill'],
          description: 'Resilience drill action ("pod-kill").',
        },
        targetWorkload: {
          type: 'string',
          description: 'Name of the deployment to drill.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace.',
        },
      },
      required: ['action', 'targetWorkload'],
    },
  },
  {
    name: 'security_scan',
    description:
      'Audit a Kubernetes YAML manifest or Dockerfile for security vulnerabilities (privileged containers, running as root, missing resource limits, host mounts, hardcoded tokens).',
    parameters: {
      type: 'object',
      properties: {
        targetPath: {
          type: 'string',
          description: 'Relative or absolute file path to the YAML manifest or Dockerfile to audit.',
        },
      },
      required: ['targetPath'],
    },
  },
  {
    name: 'cert_expiry_check',
    description:
      'Inspect TLS certificates in Kubernetes secrets or against a live hostname to detect impending certificate expiration.',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace to scan for TLS secrets (omit for all namespaces).',
        },
        hostname: {
          type: 'string',
          description: 'Live HTTPS hostname to inspect (e.g. "api.mycompany.com").',
        },
        port: {
          type: 'number',
          description: 'Target port for live HTTPS check (default 443).',
        },
      },
    },
  },
  {
    name: 'finops_idle_resources_audit',
    description:
      'Audit Kubernetes cluster and cloud for wasted resources: unattached PersistentVolumeClaims (PVCs), idle LoadBalancers without endpoints, and orphaned cloud disks.',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace to audit (omit for all namespaces).',
        },
      },
    },
  },
  {
    name: 'metrics_query',
    description: 'Query resource metrics from Kubernetes metrics-server (CPU/RAM usage for pods or nodes) or Prometheus.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['pods', 'nodes', 'prometheus'],
          description: 'Target to query: "pods", "nodes", or "prometheus".',
        },
        namespace: {
          type: 'string',
          description: 'Namespace filter when querying pods.',
        },
        promQuery: {
          type: 'string',
          description: 'PromQL query expression when target is "prometheus".',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'gitops_create_pr',
    description: 'Create a Git branch, commit changes, and open a Pull Request following GitOps best practices. (Requires user confirmation).',
    parameters: {
      type: 'object',
      properties: {
        branchName: {
          type: 'string',
          description: 'Branch name (e.g. "fix/increase-payment-memory-limit").',
        },
        title: {
          type: 'string',
          description: 'Pull Request title.',
        },
        body: {
          type: 'string',
          description: 'Pull Request markdown description explaining the Root Cause Analysis (RCA) and changes.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of modified file paths to stage and commit.',
        },
      },
      required: ['branchName', 'title', 'body'],
    },
  },
  {
    name: 'generate_postmortem_report',
    description: 'Generate an incident postmortem markdown report and index it into the local incident knowledge base.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Incident title.',
        },
        severity: {
          type: 'string',
          enum: ['P1', 'P2', 'P3', 'P4'],
          description: 'Incident severity level.',
        },
        service: {
          type: 'string',
          description: 'Name of the affected service or infrastructure component.',
        },
        impact: {
          type: 'string',
          description: 'User and business impact of the outage/incident.',
        },
        symptom: {
          type: 'string',
          description: 'Observed technical symptoms.',
        },
        rootCause: {
          type: 'string',
          description: 'Detailed Root Cause Analysis (RCA).',
        },
        remediation: {
          type: 'string',
          description: 'Remediation and steps taken to restore service.',
        },
        actionItems: {
          type: 'array',
          items: { type: 'string' },
          description: 'Preventative action items to prevent recurrence.',
        },
      },
      required: ['title', 'severity', 'service', 'impact', 'symptom', 'rootCause', 'remediation'],
    },
  },
  {
    name: 'knowledge_base_search',
    description: 'Search past incident postmortems in the knowledge base for previous solutions and root causes.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords to search for (e.g. "CrashLoopBackOff payment-service", "OOMKilled", "502 Bad Gateway").',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'semantic_kb_search',
    description: 'Search past incident postmortems using semantic term-frequency vector similarity.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Semantic query describing the issue or symptom.',
        },
        topK: {
          type: 'number',
          description: 'Number of top similar matches to return (default 3).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'az_resource_list',
    description: 'List Azure cloud resources in a subscription or specific resource group.',
    parameters: {
      type: 'object',
      properties: {
        resourceGroup: {
          type: 'string',
          description: 'Optional resource group name.',
        },
        resourceType: {
          type: 'string',
          description: 'Optional Azure resource type filter (e.g. "Microsoft.ContainerService/managedClusters").',
        },
      },
    },
  },
  {
    name: 'az_aks_status',
    description: 'Inspect status, node pools, and health of an Azure Kubernetes Service (AKS) managed cluster.',
    parameters: {
      type: 'object',
      properties: {
        clusterName: {
          type: 'string',
          description: 'AKS cluster name.',
        },
        resourceGroup: {
          type: 'string',
          description: 'Resource group containing the AKS cluster.',
        },
      },
      required: ['clusterName', 'resourceGroup'],
    },
  },
  {
    name: 'aws_resource_list',
    description: 'List resources in an AWS account across services (ec2, s3, rds, vpc, lambda).',
    parameters: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description: 'AWS service to inspect (e.g. "ec2", "s3", "rds", "vpc", "lambda"). Defaults to "ec2".',
        },
        region: {
          type: 'string',
          description: 'Optional AWS region (e.g. "us-east-1", "eu-west-1").',
        },
      },
    },
  },
  {
    name: 'aws_eks_status',
    description: 'Inspect status, node groups, and health of an Amazon Elastic Kubernetes Service (EKS) cluster.',
    parameters: {
      type: 'object',
      properties: {
        clusterName: {
          type: 'string',
          description: 'Amazon EKS cluster name.',
        },
        region: {
          type: 'string',
          description: 'Optional AWS region.',
        },
      },
      required: ['clusterName'],
    },
  },
  {
    name: 'gcp_resource_list',
    description: 'List resources in a Google Cloud Platform (GCP) project (compute instances, storage buckets, sql, networks).',
    parameters: {
      type: 'object',
      properties: {
        resourceType: {
          type: 'string',
          description: 'GCP resource type (e.g. "instances", "storage", "sql", "networks"). Defaults to "instances".',
        },
        project: {
          type: 'string',
          description: 'Optional GCP project ID.',
        },
      },
    },
  },
  {
    name: 'gcp_gke_status',
    description: 'Inspect status, node pools, and health of a Google Kubernetes Engine (GKE) cluster.',
    parameters: {
      type: 'object',
      properties: {
        clusterName: {
          type: 'string',
          description: 'GKE cluster name.',
        },
        location: {
          type: 'string',
          description: 'GCP zone or region (e.g. "us-central1-a" or "us-central1").',
        },
        project: {
          type: 'string',
          description: 'Optional GCP project ID.',
        },
      },
      required: ['clusterName'],
    },
  },
  {
    name: 'file_read',
    description: 'Read the contents of a local file (e.g. YAML manifest, Helm values, Dockerfile).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative or absolute file path to read.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_write',
    description: 'Create or overwrite a local file with new content. (Requires user confirmation).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to write.',
        },
        content: {
          type: 'string',
          description: 'Text content to write into the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'file_list',
    description: 'List files and directories in a local folder.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: 'Directory path (defaults to current directory ".").',
        },
      },
    },
  },
  {
    name: 'terraform_plan',
    description:
      'Run a Terraform or OpenTofu Plan to inspect proposed infrastructure changes, summarize additions/modifications/destructions, and detect high-risk replacements.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: 'Working directory containing Terraform files (defaults to ".").',
        },
        varFile: {
          type: 'string',
          description: 'Optional path to terraform variables file (e.g. "prod.tfvars").',
        },
      },
    },
  },
  {
    name: 'terraform_drift_detect',
    description:
      'Detect configuration drift between live cloud resources and declared Terraform state without modifying state.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: 'Working directory containing Terraform files (defaults to ".").',
        },
      },
    },
  },
  {
    name: 'helm_diff',
    description:
      'Generate a visual unified diff of what a Helm release upgrade would change before deploying.',
    parameters: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release.',
        },
        chartPath: {
          type: 'string',
          description: 'Path or repository reference for the Helm chart (e.g. "./charts/api").',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        valuesFile: {
          type: 'string',
          description: 'Optional path to custom values YAML file (e.g. "values-prod.yaml").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['releaseName', 'chartPath'],
    },
  },
  {
    name: 'helm_status',
    description:
      'Query the current status, revision, chart version, and resource health of a deployed Helm release.',
    parameters: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['releaseName'],
    },
  },
  {
    name: 'helm_history',
    description:
      'List historical revisions and deployment descriptions for a Helm release.',
    parameters: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['releaseName'],
    },
  },
  {
    name: 'helm_rollback',
    description:
      'Rollback a failed or degraded Helm release to a previous revision.',
    parameters: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release.',
        },
        revision: {
          type: 'number',
          description: 'Target revision number to rollback to (omitting rolls back to previous revision).',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['releaseName'],
    },
  },
  {
    name: 'argocd_app_status',
    description:
      'Query sync status (Synced/OutOfSync) and health status (Healthy/Degraded) for Argo CD GitOps applications.',
    parameters: {
      type: 'object',
      properties: {
        appName: {
          type: 'string',
          description: 'Specific application name (omit to list all applications across the cluster).',
        },
        namespace: {
          type: 'string',
          description: 'Argo CD controller namespace (defaults to "argocd").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'argocd_diff_app',
    description:
      'Inspect specific out-of-sync resources and manifest drift for an Argo CD application.',
    parameters: {
      type: 'object',
      properties: {
        appName: {
          type: 'string',
          description: 'Argo CD application name.',
        },
        namespace: {
          type: 'string',
          description: 'Argo CD namespace (defaults to "argocd").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['appName'],
    },
  },
  {
    name: 'argocd_sync_app',
    description:
      'Trigger an automated GitOps sync operation on an Argo CD application to reconcile live cluster state with Git.',
    parameters: {
      type: 'object',
      properties: {
        appName: {
          type: 'string',
          description: 'Argo CD application name to synchronize.',
        },
        namespace: {
          type: 'string',
          description: 'Argo CD namespace (defaults to "argocd").',
        },
        prune: {
          type: 'boolean',
          description: 'Whether to prune resources no longer in Git (defaults to false).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['appName'],
    },
  },
  {
    name: 'loki_log_query',
    description:
      'Query centralized multi-service and multi-container logs across the cluster using Grafana Loki LogQL.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'LogQL query string (e.g. \'{app="checkout"} |= "error"\').',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log lines to return (defaults to 50).',
        },
        startRange: {
          type: 'string',
          description: 'Time window to search (e.g. "1h", "6h", "24h").',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'trace_latency_query',
    description:
      'Query distributed traces from Jaeger / Tempo / OpenTelemetry to pinpoint microservice latency bottlenecks and error spans.',
    parameters: {
      type: 'object',
      properties: {
        serviceName: {
          type: 'string',
          description: 'Microservice name to query traces for (e.g. "payment-svc").',
        },
        minDurationMs: {
          type: 'number',
          description: 'Minimum trace latency in milliseconds (defaults to 500).',
        },
        limit: {
          type: 'number',
          description: 'Maximum traces to analyze (defaults to 5).',
        },
      },
      required: ['serviceName'],
    },
  },
  {
    name: 'k8s_debug_pod',
    description:
      'Launch an ephemeral diagnostic pod or container attached to a target workload to inspect sockets, DNS, and processes.',
    parameters: {
      type: 'object',
      properties: {
        targetPod: {
          type: 'string',
          description: 'Target pod name or workload.',
        },
        namespace: {
          type: 'string',
          description: 'Namespace (defaults to "default").',
        },
        command: {
          type: 'string',
          description: 'Diagnostic shell command to execute in the container (e.g. "netstat -tuln" or "curl -v localhost:8080").',
        },
        image: {
          type: 'string',
          description: 'Diagnostic container image (defaults to "nicolaka/netshoot:latest").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['targetPod'],
    },
  },
  {
    name: 'pagerduty_manage',
    description:
      'Manage PagerDuty on-call incidents: list triggered alerts, acknowledge, attach diagnostic notes with root cause, or resolve.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'acknowledge', 'note', 'resolve'],
          description: 'Action to perform on PagerDuty incident (defaults to "list").',
        },
        incidentId: {
          type: 'string',
          description: 'Target PagerDuty incident ID (e.g. "PD-9921").',
        },
        noteText: {
          type: 'string',
          description: 'Diagnostic root cause note to attach to the incident timeline.',
        },
      },
    },
  },
  {
    name: 'opsgenie_manage',
    description:
      'Manage Opsgenie on-call alerts: list open alerts, acknowledge, add notes, or close.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'acknowledge', 'note', 'close'],
          description: 'Action to perform on Opsgenie alert (defaults to "list").',
        },
        alertId: {
          type: 'string',
          description: 'Target Opsgenie alert ID.',
        },
        noteText: {
          type: 'string',
          description: 'Note content to append to the alert.',
        },
      },
    },
  },
  {
    name: 'velero_backup_check',
    description:
      'Audit Kubernetes cluster backup health using Velero, verifying schedule status, recent backup age, and failure rates.',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Velero controller namespace (defaults to "velero").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'velero_create_backup',
    description:
      'Create an on-demand Velero backup snapshot prior to performing high-risk mutations or migrations.',
    parameters: {
      type: 'object',
      properties: {
        backupName: {
          type: 'string',
          description: 'Custom backup name (defaults to auto-generated preflight name).',
        },
        includeNamespaces: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of namespaces to back up (defaults to ["default"]).',
        },
        ttlHours: {
          type: 'number',
          description: 'Snapshot retention time in hours (defaults to 72).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'cloud_db_snapshot',
    description:
      'Trigger an on-demand point-in-time snapshot for AWS RDS, Azure Database, or GCP Cloud SQL before database mutations.',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['aws', 'azure', 'gcp'],
          description: 'Cloud provider hosting the database.',
        },
        databaseIdentifier: {
          type: 'string',
          description: 'Database instance identifier / name.',
        },
        snapshotName: {
          type: 'string',
          description: 'Optional snapshot name.',
        },
        region: {
          type: 'string',
          description: 'Cloud region (e.g. "us-east-1").',
        },
      },
      required: ['provider', 'databaseIdentifier'],
    },
  },
  {
    name: 'ci_pipeline_logs',
    description:
      'Inspect failed CI/CD pipeline runs, job steps, and error stack traces (GitHub Actions & GitLab CI).',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['github', 'gitlab'],
          description: 'CI/CD provider (defaults to "github").',
        },
        runId: {
          type: 'string',
          description: 'Specific workflow run or pipeline ID (omit to list recent runs).',
        },
        repo: {
          type: 'string',
          description: 'Repository name in "owner/repo" format (optional).',
        },
      },
    },
  },
  {
    name: 'ci_rerun_failed',
    description:
      'Re-trigger failed CI/CD workflow jobs in GitHub Actions or GitLab CI after resolving issues.',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['github', 'gitlab'],
          description: 'CI/CD provider (defaults to "github").',
        },
        runId: {
          type: 'string',
          description: 'Workflow run or pipeline ID to rerun.',
        },
        repo: {
          type: 'string',
          description: 'Repository name in "owner/repo" format (optional).',
        },
      },
      required: ['runId'],
    },
  },
  {
    name: 'k8s_policy_audit',
    description:
      'Audit live Kubernetes admission control policy compliance (Kyverno, OPA Gatekeeper, and Pod Security Standards).',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace to audit (omit to audit all namespaces).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'runbook_list',
    description:
      'List available vetted enterprise SRE runbooks matching optional symptoms, target resources, or severity level.',
    parameters: {
      type: 'object',
      properties: {
        symptom: {
          type: 'string',
          description: 'Alert symptom or error code to filter by (e.g. "OOMKilled", "DiskPressure", "certificate expired").',
        },
        target: {
          type: 'string',
          description: 'Target resource type to filter by (e.g. "Deployment", "PVC", "Redis").',
        },
        severity: {
          type: 'string',
          enum: ['CRITICAL', 'HIGH', 'MEDIUM'],
          description: 'Runbook severity tier.',
        },
      },
    },
  },
  {
    name: 'runbook_validate',
    description:
      'Pre-flight validation of SRE runbook prerequisites, parameters, target environment, and estimated blast radius.',
    parameters: {
      type: 'object',
      properties: {
        runbookId: {
          type: 'string',
          description: 'Unique runbook ID to validate (e.g. "oomkilled-pod-remediation", "pvc-disk-pressure-expand").',
        },
        params: {
          type: 'object',
          description: 'Key-value parameters required by the runbook (e.g. {"workloadName":"api", "namespace":"prod"}).',
        },
        namespace: {
          type: 'string',
          description: 'Target Kubernetes namespace.',
        },
      },
      required: ['runbookId'],
    },
  },
  {
    name: 'runbook_execute',
    description:
      'Execute a vetted enterprise SRE runbook step-by-step with checkpoints, health verification, and rollback handlers.',
    parameters: {
      type: 'object',
      properties: {
        runbookId: {
          type: 'string',
          description: 'Unique runbook ID to execute (e.g. "oomkilled-pod-remediation", "pvc-disk-pressure-expand").',
        },
        params: {
          type: 'object',
          description: 'Execution parameters for the runbook.',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, simulates execution and parameter expansion without applying mutating commands.',
        },
        namespace: {
          type: 'string',
          description: 'Target Kubernetes namespace.',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['runbookId'],
    },
  },
  {
    name: 'vault_secret_inspect',
    description:
      'Safely audit HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or Kubernetes secret metadata (TTL, version, key names) strictly redacting plaintext values.',
    parameters: {
      type: 'object',
      properties: {
        secretIdentifier: {
          type: 'string',
          description: 'Secret name, Vault path (e.g. "secret/data/payment/api-keys"), AWS secret ID, or K8s secret name.',
        },
        provider: {
          type: 'string',
          enum: ['vault', 'aws', 'azure', 'k8s'],
          description: 'Secrets management provider (defaults to "vault" if path contains "/", else "k8s").',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (if provider is "k8s").',
        },
        vaultName: {
          type: 'string',
          description: 'Azure Key Vault name (required if provider is "azure").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['secretIdentifier'],
    },
  },
  {
    name: 'sealed_secrets_check',
    description:
      'Audit Bitnami SealedSecrets in the Kubernetes cluster, checking decryption synchronization status and certificate health.',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace to audit (omit to audit all namespaces).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'service_mesh_diagnose',
    description:
      'Diagnose service mesh (Istio / Linkerd) proxy synchronization (CDS/LDS/EDS/RDS), mTLS enforcement, and circuit-breaker trip metrics.',
    parameters: {
      type: 'object',
      properties: {
        meshType: {
          type: 'string',
          enum: ['istio', 'linkerd', 'auto'],
          description: 'Service mesh technology (defaults to auto-detecting Istio or Linkerd).',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace under diagnosis.',
        },
        podName: {
          type: 'string',
          description: 'Specific pod under investigation for sidecar analysis.',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'external_secrets_check',
    description:
      'Audit External Secrets Operator (ESO) resources in Kubernetes (ExternalSecret, SecretStore, ClusterSecretStore CRDs) and verify synchronization status.',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace to audit (omit to audit all namespaces).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'terraform_state_inspect',
    description:
      'Inspect Terraform/OpenTofu state resources, view state resource details, or diagnose distributed state locks.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: 'Working directory containing Terraform configuration (defaults to ".").',
        },
        resourceAddress: {
          type: 'string',
          description: 'Optional resource address to show details (e.g. "aws_s3_bucket.data"). Omit to list all state resources.',
        },
      },
    },
  },
  {
    name: 'terraform_workspace_manage',
    description:
      'Manage Terraform/OpenTofu workspaces (list, show active, select, or create a new workspace).',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: 'Working directory containing Terraform configuration (defaults to ".").',
        },
        action: {
          type: 'string',
          enum: ['list', 'show', 'select', 'new'],
          description: 'Workspace action: "list", "show", "select", or "new" (defaults to "list").',
        },
        workspaceName: {
          type: 'string',
          description: 'Workspace name (required when selecting or creating a workspace).',
        },
      },
    },
  },
  {
    name: 'terraform_apply',
    description:
      'Apply a Terraform or OpenTofu plan to modify cloud infrastructure. (Requires operator approval).',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: 'Working directory containing Terraform configuration (defaults to ".").',
        },
        planFile: {
          type: 'string',
          description: 'Optional path to pre-generated plan file.',
        },
      },
    },
  },
  {
    name: 'gitops_verify_pr_checks',
    description:
      'Inspect Pull Request CI status, required checks, review approvals, and mergeability before GitOps deployment.',
    parameters: {
      type: 'object',
      properties: {
        prNumber: {
          type: 'string',
          description: 'Pull Request number to verify (omit to check current branch PR).',
        },
        repo: {
          type: 'string',
          description: 'Optional GitHub repository ("owner/repo").',
        },
      },
    },
  },
  {
    name: 'argocd_app_rollback',
    description:
      'Rollback an Argo CD application to a previous deployment revision. (Requires operator approval).',
    parameters: {
      type: 'object',
      properties: {
        appName: {
          type: 'string',
          description: 'Argo CD application name to rollback.',
        },
        revisionId: {
          type: 'number',
          description: 'Optional target revision ID or history ID.',
        },
        namespace: {
          type: 'string',
          description: 'Argo CD namespace (defaults to "argocd").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['appName'],
    },
  },
  {
    name: 'flux_app_status',
    description:
      'Query Flux CD synchronization status for Kustomizations, HelmReleases, and GitRepositories across the cluster.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Optional resource name to inspect.',
        },
        kind: {
          type: 'string',
          enum: ['all', 'kustomization', 'helmrelease', 'gitrepository'],
          description: 'Flux resource kind filter (defaults to "all").',
        },
        namespace: {
          type: 'string',
          description: 'Flux controller namespace (defaults to "flux-system").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'flux_sync_reconcile',
    description:
      'Trigger an immediate reconciliation on a Flux CD Kustomization, HelmRelease, or GitRepository. (Requires operator confirmation).',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['kustomization', 'helmrelease', 'gitrepository'],
          description: 'Flux resource kind to reconcile.',
        },
        name: {
          type: 'string',
          description: 'Flux resource name to reconcile.',
        },
        namespace: {
          type: 'string',
          description: 'Flux controller namespace (defaults to "flux-system").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['kind', 'name'],
    },
  },
  {
    name: 'helm_template',
    description:
      'Render Helm chart templates locally without cluster contact to inspect rendered YAML manifests.',
    parameters: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release.',
        },
        chartPath: {
          type: 'string',
          description: 'Path or repository reference for the chart (e.g. "./charts/api").',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        valuesFile: {
          type: 'string',
          description: 'Optional path to custom values YAML file (e.g. "values-staging.yaml").',
        },
        setValues: {
          type: 'string',
          description: 'Optional comma-separated key=value overrides (e.g. "replicaCount=3,image.tag=v2.1").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['releaseName', 'chartPath'],
    },
  },
  {
    name: 'helm_values_get',
    description:
      'Retrieve active user-supplied or computed values from a deployed Helm release.',
    parameters: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the deployed Helm release.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        allValues: {
          type: 'boolean',
          description: 'Whether to dump all computed values including defaults (defaults to false for user overrides only).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['releaseName'],
    },
  },
  {
    name: 'helm_lint',
    description:
      'Run helm lint on a local chart directory to audit syntax, template variables, and best practices.',
    parameters: {
      type: 'object',
      properties: {
        chartPath: {
          type: 'string',
          description: 'Path to the local Helm chart directory.',
        },
        valuesFile: {
          type: 'string',
          description: 'Optional path to custom values YAML file.',
        },
      },
      required: ['chartPath'],
    },
  },
  {
    name: 'helm_upgrade_install',
    description:
      'Install or upgrade a Helm release with dry-run support. (Live mode requires operator confirmation).',
    parameters: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release.',
        },
        chartPath: {
          type: 'string',
          description: 'Path or repository reference for the chart.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        valuesFile: {
          type: 'string',
          description: 'Optional path to custom values YAML file.',
        },
        dryRun: {
          type: 'boolean',
          description: 'Whether to run in dry-run simulation mode (defaults to true for safety preview).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['releaseName', 'chartPath'],
    },
  },
  {
    name: 'kustomize_build',
    description:
      'Render Kustomize manifests from an overlay or base directory into complete Kubernetes YAML.',
    parameters: {
      type: 'object',
      properties: {
        targetPath: {
          type: 'string',
          description: 'Path to directory containing kustomization.yaml (e.g. "overlays/production"). Defaults to ".".',
        },
      },
    },
  },
  {
    name: 'kustomize_diff',
    description:
      'Compare two Kustomize targets (e.g. base vs overlay or dev vs prod) and output a colorable visual diff.',
    parameters: {
      type: 'object',
      properties: {
        basePath: {
          type: 'string',
          description: 'Path to base directory containing kustomization.yaml.',
        },
        overlayPath: {
          type: 'string',
          description: 'Path to target overlay directory containing kustomization.yaml.',
        },
      },
      required: ['basePath', 'overlayPath'],
    },
  },
  {
    name: 'k8s_event_timeline',
    description:
      'Correlate and aggregate Kubernetes Warning and Normal events across pods, nodes, and namespaces into a root-cause incident timeline.',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace. If omitted, queries across all namespaces (-A).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of recent events to display (defaults to 30).',
        },
        warningOnly: {
          type: 'boolean',
          description: 'Whether to restrict events to Warning type (defaults to true for incident triage).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'k8s_workload_rightsize',
    description:
      'Audit workload CPU and memory requests and limits against live usage, detecting OOM risks, CPU throttling, and overprovisioned idle cost.',
    parameters: {
      type: 'object',
      properties: {
        workloadName: {
          type: 'string',
          description: 'Optional target workload name or pod label selector.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'k8s_hpa_audit',
    description:
      'Audit HorizontalPodAutoscalers (HPA) for min/max replica saturation bottlenecks, flapping, and missing or unknown metrics.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Optional specific HPA name.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace. If omitted, audits across all namespaces (-A).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
  {
    name: 'k8s_node_cordon',
    description:
      'Mark a Kubernetes node as unschedulable (SchedulingDisabled) to prevent new pods from landing on it before maintenance.',
    parameters: {
      type: 'object',
      properties: {
        nodeName: {
          type: 'string',
          description: 'Name of the Kubernetes node to cordon.',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['nodeName'],
    },
  },
  {
    name: 'k8s_node_uncordon',
    description:
      'Mark an unschedulable Kubernetes node as schedulable again after maintenance or recovery.',
    parameters: {
      type: 'object',
      properties: {
        nodeName: {
          type: 'string',
          description: 'Name of the Kubernetes node to uncordon.',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['nodeName'],
    },
  },
  {
    name: 'k8s_node_drain',
    description:
      'Safely drain a Kubernetes node with pre-flight PodDisruptionBudget (PDB) verification, ignoring DaemonSets and protecting stateful workloads.',
    parameters: {
      type: 'object',
      properties: {
        nodeName: {
          type: 'string',
          description: 'Name of the node to drain.',
        },
        ignoreDaemonSets: {
          type: 'boolean',
          description: 'Ignore DaemonSet-managed pods (defaults to true).',
        },
        deleteEmptyDirData: {
          type: 'boolean',
          description: 'Continue even if pods use emptyDir volumes (defaults to true).',
        },
        gracePeriodSeconds: {
          type: 'number',
          description: 'Period of time in seconds given to each pod to terminate gracefully (defaults to 60).',
        },
        timeoutSeconds: {
          type: 'number',
          description: 'The length of time to wait before giving up (defaults to 300).',
        },
        dryRun: {
          type: 'boolean',
          description: 'Whether to simulate eviction without actually evicting pods (defaults to false).',
        },
        force: {
          type: 'boolean',
          description: 'Force eviction even if pods are unmanaged by a controller (defaults to false).',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['nodeName'],
    },
  },
  {
    name: 'k8s_ephemeral_debug',
    description:
      'Attach a modern ephemeral diagnostic container directly to a live pod sharing its PID and network namespace without terminating or modifying the workload.',
    parameters: {
      type: 'object',
      properties: {
        targetPod: {
          type: 'string',
          description: 'Name of the target pod to debug.',
        },
        containerName: {
          type: 'string',
          description: 'Optional container name to share process namespace with.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        image: {
          type: 'string',
          description: 'Diagnostic container image (defaults to "nicolaka/netshoot:latest").',
        },
        command: {
          type: 'string',
          description: 'Command to execute inside the ephemeral container (defaults to "netstat -tuln && ps aux").',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
      required: ['targetPod'],
    },
  },
  {
    name: 'container_image_scan',
    description:
      'Scan a container image for security vulnerabilities and CVEs using Trivy, Grype, or heuristic inspection.',
    parameters: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: 'Container image reference (e.g. "nginx:latest", "redis:6.0", "repo/app:v1.2.3").',
        },
        severityThreshold: {
          type: 'string',
          description: 'Minimum severity threshold to report: "CRITICAL", "HIGH", "MEDIUM", or "LOW" (defaults to "HIGH").',
        },
        format: {
          type: 'string',
          description: 'Output format: "summary" (markdown) or "json" (defaults to "summary").',
        },
      },
      required: ['image'],
    },
  },
  {
    name: 'k8s_network_policy_audit',
    description:
      'Audit Kubernetes NetworkPolicies and evaluate Zero-Trust microsegmentation isolation, detecting unprotected pods vulnerable to lateral movement.',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace (defaults to "default").',
        },
        podSelector: {
          type: 'string',
          description: 'Optional pod label selector to audit specific workloads.',
        },
        context: {
          type: 'string',
          description: 'Optional Kubernetes cluster context.',
        },
      },
    },
  },
];

export async function executeTool(name: string, args: Record<string, any>, context?: AgentContext): Promise<string> {
  switch (name) {
    case 'shell_exec':
      return await ShellTool.run(args.command, { maxOutputChars: 12000 });
    case 'k8s_get_resources': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.getResources(args.resource, args.namespace, args.labelSelector, targetCtx);
    }
    case 'k8s_describe_resource': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.describeResource(args.resource, args.name, args.namespace, targetCtx);
    }
    case 'k8s_get_logs': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.getLogs(args.podName, args.namespace, args.container, args.tailLines, args.previous, targetCtx);
    }
    case 'k8s_rollout_restart': {
      const targetCtx = args.context || context?.kubeContext;
      const restartOutput = await K8sTool.rolloutRestart(args.name, args.kind, args.namespace, targetCtx);
      const watchResult = await RolloutWatcher.watchAndVerify(args.name, args.kind, args.namespace, 25, targetCtx);
      return `${restartOutput}\n\n[Post-Mutation Verification]: ${watchResult.message}`;
    }
    case 'k8s_watch_rollout': {
      const targetCtx = args.context || context?.kubeContext;
      const res = await RolloutWatcher.watchAndVerify(args.name, args.kind, args.namespace, args.timeoutSeconds, targetCtx);
      return `Rollout Watcher Result:\nSuccess: ${res.succeeded}\nMessage: ${res.message}\nAuto-RolledBack: ${res.rolledBack}`;
    }
    case 'k8s_list_contexts': {
      const res = await K8sTool.listContexts();
      return `Current Kubernetes Context: ${res.current}\nAvailable Contexts:\n${res.contexts.map((c) => (c === res.current ? `* ${c} (active)` : `  ${c}`)).join('\n')}`;
    }
    case 'k8s_switch_context': {
      const out = await K8sTool.switchContext(args.contextName);
      if (context) {
        context.kubeContext = args.contextName;
        const raw = `${process.env.ENVIRONMENT || ''} ${args.contextName}`.toLowerCase();
        if (raw.includes('prod') || raw.includes('production') || raw.includes('live') || raw.includes('dr')) {
          context.environment = 'production';
          context.isProduction = true;
        } else if (raw.includes('stage') || raw.includes('staging') || raw.includes('uat')) {
          context.environment = 'staging';
          context.isProduction = false;
        } else {
          context.environment = 'development';
          context.isProduction = false;
        }
      }
      return `${out}\n[Environment Updated]: ${context?.environment?.toUpperCase()} (isProduction: ${context?.isProduction})`;
    }
    case 'topology_graph':
      return await TopologyTool.discover(args.namespace);
    case 'diagnose_connectivity':
      return await NetworkProberTool.probe(args.targetHost, args.targetPort, args.namespace);
    case 'canary_deploy':
      return await CanaryTool.deploy(args as any);
    case 'chaos_drill':
      return await ChaosTool.drill(args.action, args.targetWorkload, args.namespace, context?.isProduction);
    case 'security_scan':
      return await SecurityLinterTool.scan(args.targetPath);
    case 'cert_expiry_check':
      return await CertExpiryTool.check(args as any);
    case 'finops_idle_resources_audit':
      return await FinOpsTool.audit(args.namespace);
    case 'metrics_query':
      return await MetricsTool.query(args.target, args.namespace, args.promQuery);
    case 'gitops_create_pr':
      return await GitOpsTool.createPR(args as any);
    case 'generate_postmortem_report':
      return await PostmortemTool.generate(args as any);
    case 'knowledge_base_search':
      return await PostmortemTool.searchKnowledgeBase(args.query);
    case 'semantic_kb_search':
      return await SemanticKbTool.search(args.query, args.topK);
    case 'az_resource_list':
      return await AzureTool.listResources(args.resourceGroup, args.resourceType);
    case 'az_aks_status':
      return await AzureTool.getAksStatus(args.clusterName, args.resourceGroup);
    case 'aws_resource_list':
      return await AwsTool.listResources(args.service, args.region);
    case 'aws_eks_status':
      return await AwsTool.getEksStatus(args.clusterName, args.region);
    case 'gcp_resource_list':
      return await GcpTool.listResources(args.resourceType, args.project);
    case 'gcp_gke_status':
      return await GcpTool.getGkeStatus(args.clusterName, args.location, args.project);
    case 'file_read':
      return await FileTool.read(args.path);
    case 'file_write':
      return await FileTool.write(args.path, args.content);
    case 'file_list':
      return await FileTool.list(args.dirPath);
    case 'terraform_plan':
      return await TerraformTool.plan(args.dirPath, args.varFile);
    case 'terraform_drift_detect':
      return await TerraformTool.detectDrift(args.dirPath);
    case 'helm_diff': {
      const targetCtx = args.context || context?.kubeContext;
      return await HelmTool.diff(args.releaseName, args.chartPath, args.namespace, args.valuesFile, targetCtx);
    }
    case 'helm_status': {
      const targetCtx = args.context || context?.kubeContext;
      return await HelmTool.status(args.releaseName, args.namespace, targetCtx);
    }
    case 'helm_history': {
      const targetCtx = args.context || context?.kubeContext;
      return await HelmTool.history(args.releaseName, args.namespace, targetCtx);
    }
    case 'helm_rollback': {
      const targetCtx = args.context || context?.kubeContext;
      return await HelmTool.rollback(args.releaseName, args.revision, args.namespace, targetCtx);
    }
    case 'argocd_app_status': {
      const targetCtx = args.context || context?.kubeContext;
      return await ArgoCdTool.getAppStatus(args.appName, args.namespace, targetCtx);
    }
    case 'argocd_diff_app': {
      const targetCtx = args.context || context?.kubeContext;
      return await ArgoCdTool.diffApp(args.appName, args.namespace, targetCtx);
    }
    case 'argocd_sync_app': {
      const targetCtx = args.context || context?.kubeContext;
      return await ArgoCdTool.syncApp(args.appName, args.namespace, args.prune, targetCtx);
    }
    case 'loki_log_query':
      return await ObservabilityTool.queryLoki(args.query, args.limit, args.startRange);
    case 'trace_latency_query':
      return await ObservabilityTool.queryTraces(args.serviceName, args.minDurationMs, args.limit);
    case 'k8s_debug_pod': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.debugPod(args.targetPod, args.namespace, args.command, args.image, targetCtx);
    }
    case 'pagerduty_manage':
      return await IncidentManagementTool.managePagerDuty(args.action, args.incidentId, args.noteText);
    case 'opsgenie_manage':
      return await IncidentManagementTool.manageOpsgenie(args.action, args.alertId, args.noteText);
    case 'velero_backup_check': {
      const targetCtx = args.context || context?.kubeContext;
      return await DisasterRecoveryTool.checkVeleroBackups(args.namespace, targetCtx);
    }
    case 'velero_create_backup': {
      const targetCtx = args.context || context?.kubeContext;
      return await DisasterRecoveryTool.createVeleroBackup(args.backupName, args.includeNamespaces, args.ttlHours, targetCtx);
    }
    case 'cloud_db_snapshot':
      return await DisasterRecoveryTool.createCloudDbSnapshot(args.provider, args.databaseIdentifier, args.snapshotName, args.region);
    case 'ci_pipeline_logs':
      return await CiCdTool.viewPipelineLogs(args.provider, args.runId, args.repo);
    case 'ci_rerun_failed':
      return await CiCdTool.rerunFailed(args.provider, args.runId, args.repo);
    case 'k8s_policy_audit': {
      const targetCtx = args.context || context?.kubeContext;
      return await AdmissionPolicyTool.audit(args.namespace, targetCtx);
    }
    case 'runbook_list':
      return RunbookTool.listRunbooks(args);
    case 'runbook_validate':
      return RunbookTool.validateRunbook(args.runbookId, args.params, args.namespace).report;
    case 'runbook_execute': {
      const targetCtx = args.context || context?.kubeContext;
      return await RunbookTool.executeRunbook(args.runbookId, args.params, {
        dryRun: args.dryRun,
        namespace: args.namespace,
        context: targetCtx,
      });
    }
    case 'vault_secret_inspect': {
      const targetCtx = args.context || context?.kubeContext;
      return await VaultSecretTool.inspectSecret(args.secretIdentifier, {
        provider: args.provider,
        namespace: args.namespace,
        vaultName: args.vaultName,
        context: targetCtx,
      });
    }
    case 'sealed_secrets_check': {
      const targetCtx = args.context || context?.kubeContext;
      return await VaultSecretTool.auditSealedSecrets({
        namespace: args.namespace,
        context: targetCtx,
      });
    }
    case 'service_mesh_diagnose': {
      const targetCtx = args.context || context?.kubeContext;
      return await ServiceMeshTool.diagnoseMesh({
        meshType: args.meshType,
        namespace: args.namespace,
        podName: args.podName,
        context: targetCtx,
      });
    }
    case 'external_secrets_check': {
      const targetCtx = args.context || context?.kubeContext;
      return await VaultSecretTool.auditExternalSecrets({
        namespace: args.namespace,
        context: targetCtx,
      });
    }
    case 'terraform_state_inspect':
      return await TerraformTool.inspectState(args.dirPath, args.resourceAddress);
    case 'terraform_workspace_manage':
      return await TerraformTool.manageWorkspace(args.dirPath, args.action, args.workspaceName);
    case 'terraform_apply':
      return await TerraformTool.apply(args.dirPath, args.planFile);
    case 'gitops_verify_pr_checks':
      return await GitOpsTool.verifyPR(args.prNumber, args.repo);
    case 'argocd_app_rollback': {
      const targetCtx = args.context || context?.kubeContext;
      return await ArgoCdTool.rollbackApp(args.appName, args.revisionId, args.namespace, targetCtx);
    }
    case 'flux_app_status': {
      const targetCtx = args.context || context?.kubeContext;
      return await FluxTool.getStatus(args.name, args.kind, args.namespace, targetCtx);
    }
    case 'flux_sync_reconcile': {
      const targetCtx = args.context || context?.kubeContext;
      return await FluxTool.reconcile(args.kind, args.name, args.namespace, targetCtx);
    }
    case 'helm_template': {
      const targetCtx = args.context || context?.kubeContext;
      return await HelmTool.template(args.releaseName, args.chartPath, args.namespace, args.valuesFile, args.setValues, targetCtx);
    }
    case 'helm_values_get': {
      const targetCtx = args.context || context?.kubeContext;
      return await HelmTool.getValues(args.releaseName, args.namespace, args.allValues, targetCtx);
    }
    case 'helm_lint':
      return await HelmTool.lint(args.chartPath, args.valuesFile);
    case 'helm_upgrade_install': {
      const targetCtx = args.context || context?.kubeContext;
      return await HelmTool.upgradeInstall(args.releaseName, args.chartPath, args.namespace, args.valuesFile, args.dryRun, targetCtx);
    }
    case 'kustomize_build':
      return await KustomizeTool.build(args.targetPath);
    case 'kustomize_diff':
      return await KustomizeTool.diff(args.basePath, args.overlayPath);
    case 'k8s_event_timeline': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.getEventTimeline(args.namespace, args.limit, args.warningOnly, targetCtx);
    }
    case 'k8s_workload_rightsize': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.rightsizeWorkload(args.workloadName, args.namespace, targetCtx);
    }
    case 'k8s_hpa_audit': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.auditHPA(args.name, args.namespace, targetCtx);
    }
    case 'k8s_node_cordon': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.cordonNode(args.nodeName, targetCtx);
    }
    case 'k8s_node_uncordon': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.uncordonNode(args.nodeName, targetCtx);
    }
    case 'k8s_node_drain': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.drainNode(args.nodeName, args, targetCtx);
    }
    case 'k8s_ephemeral_debug': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.ephemeralDebug(args.targetPod, args, targetCtx);
    }
    case 'container_image_scan':
      return await ContainerSecurityTool.scanImage(args.image, args.severityThreshold, args.format);
    case 'k8s_network_policy_audit': {
      const targetCtx = args.context || context?.kubeContext;
      return await K8sTool.auditNetworkPolicy(args.namespace, args.podSelector, targetCtx);
    }
    default:
      throw new Error(`Tool "${name}" is not implemented.`);
  }
}

export { FluxTool } from './flux.js';
export { KustomizeTool } from './kustomize.js';
export { ContainerSecurityTool } from './container_security.js';
