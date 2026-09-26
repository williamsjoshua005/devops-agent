import { ToolDefinition, AgentContext } from '../types.js';
import { ShellTool } from './shell.js';
import { K8sTool } from './k8s.js';
import { AzureTool } from './azure.js';
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
      'Run a controlled chaos engineering resilience drill (e.g. "pod-kill") to verify self-healing recovery time. (Strictly FORBIDDEN in production).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['pod-kill'],
          description: 'Chaos drill type ("pod-kill").',
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
];

export async function executeTool(name: string, args: Record<string, any>, context?: AgentContext): Promise<string> {
  switch (name) {
    case 'shell_exec':
      return await ShellTool.run(args.command, { maxOutputChars: 12000 });
    case 'k8s_get_resources':
      return await K8sTool.getResources(args.resource, args.namespace, args.labelSelector);
    case 'k8s_describe_resource':
      return await K8sTool.describeResource(args.resource, args.name, args.namespace);
    case 'k8s_get_logs':
      return await K8sTool.getLogs(args.podName, args.namespace, args.container, args.tailLines, args.previous);
    case 'k8s_rollout_restart': {
      const restartOutput = await K8sTool.rolloutRestart(args.name, args.kind, args.namespace);
      const watchResult = await RolloutWatcher.watchAndVerify(args.name, args.kind, args.namespace, 25);
      return `${restartOutput}\n\n[Post-Mutation Verification]: ${watchResult.message}`;
    }
    case 'k8s_watch_rollout': {
      const res = await RolloutWatcher.watchAndVerify(args.name, args.kind, args.namespace, args.timeoutSeconds);
      return `Rollout Watcher Result:\nSuccess: ${res.succeeded}\nMessage: ${res.message}\nAuto-RolledBack: ${res.rolledBack}`;
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
    case 'file_read':
      return await FileTool.read(args.path);
    case 'file_write':
      return await FileTool.write(args.path, args.content);
    case 'file_list':
      return await FileTool.list(args.dirPath);
    default:
      throw new Error(`Tool "${name}" is not implemented.`);
  }
}
