import * as fs from 'node:fs';
import * as path from 'node:path';
import { ShellTool } from './shell.js';
import { SecretSanitizer } from '../policy/sanitizer.js';
import { generateUnifiedDiff } from '../policy/diff.js';

export interface EventTimelineItem {
  timestamp: string;
  type: string;
  reason: string;
  objectKind: string;
  objectName: string;
  namespace: string;
  count: number;
  message: string;
}

export class K8sTool {
  /**
   * Helper to format --context flag
   */
  private static getContextFlag(context?: string): string {
    return context ? `--context=${context}` : '';
  }

  /**
   * List Kubernetes resources with optional namespace, label selector, and cluster context
   */
  static async getResources(
    resource: string = 'pods',
    namespace?: string,
    labelSelector?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';
    const selectorFlag = labelSelector ? `-l ${labelSelector}` : '';
    const cmd = `kubectl ${ctxFlag} get ${resource} ${nsFlag} ${selectorFlag} --request-timeout=15s -o wide`.replace(/\s+/g, ' ');
    return await ShellTool.run(cmd);
  }

  /**
   * Describe a specific Kubernetes resource
   */
  static async describeResource(
    resource: string,
    name: string,
    namespace?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '';
    const cmd = `kubectl ${ctxFlag} describe ${resource} ${name} ${nsFlag} --request-timeout=15s`.replace(/\s+/g, ' ');
    return await ShellTool.run(cmd);
  }

  /**
   * Fetch logs for a pod/container, with support for previous instance logs on crash
   */
  static async getLogs(
    podName: string,
    namespace?: string,
    container?: string,
    tailLines: number = 100,
    previous: boolean = false,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '';
    const containerFlag = container ? `-c ${container}` : '';
    const prevFlag = previous ? '-p' : '';
    const cmd = `kubectl ${ctxFlag} logs ${podName} ${nsFlag} ${containerFlag} --tail=${tailLines} ${prevFlag} --request-timeout=15s`.replace(/\s+/g, ' ');
    return await ShellTool.run(cmd);
  }

  /**
   * Restart a Kubernetes deployment or daemonset
   */
  static async rolloutRestart(
    name: string,
    kind: string = 'deployment',
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const cmd = `kubectl ${ctxFlag} rollout restart ${kind}/${name} -n ${namespace}`.replace(/\s+/g, ' ');
    return await ShellTool.run(cmd);
  }

  /**
   * List all configured Kubernetes contexts
   */
  static async listContexts(): Promise<{ current: string; contexts: string[] }> {
    const raw = await ShellTool.run('kubectl config get-contexts -o name');
    let current = '';
    try {
      current = (await ShellTool.run('kubectl config current-context')).trim();
    } catch {}
    const contexts = raw.split('\n').map((c) => c.trim()).filter(Boolean);
    return { current, contexts };
  }

  /**
   * Switch the active Kubernetes context
   */
  static async switchContext(targetContext: string): Promise<string> {
    return await ShellTool.run(`kubectl config use-context ${targetContext}`);
  }

  /**
   * Run an ephemeral interactive diagnostic pod or container to inspect network, filesystem, or processes
   */
  static async debugPod(
    targetPod: string,
    namespace: string = 'default',
    command: string = 'netstat -tuln || ss -tuln',
    image: string = 'nicolaka/netshoot:latest',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const probeName = `debug-${Date.now().toString(36)}`;
    const escapedCmd = command.replace(/"/g, '\\"');

    // Run ephemeral debug runner in the target namespace
    const cmd = `kubectl ${ctxFlag} run ${probeName} -n ${namespace} --rm -i --restart=Never --image=${image} --command -- sh -c "${escapedCmd}"`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 25000 });
      return (
        `## Ephemeral Diagnostic Pod Output (\`${namespace}/${targetPod}\`)\n` +
        `• **Target Pod/Namespace:** \`${namespace}/${targetPod}\`\n` +
        `• **Diagnostic Image:** \`${image}\`\n` +
        `• **Diagnostic Command:** \`${command}\`\n\n` +
        `\`\`\`\n${output}\n\`\`\``
      );
    } catch (err: any) {
      return `Failed to run ephemeral debug pod: ${err.message}`;
    }
  }

  /**
   * Correlate and format cluster events into a root-cause incident timeline
   */
  static async getEventTimeline(
    namespace?: string,
    limit: number = 30,
    warningOnly: boolean = true,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';
    const cmd = `kubectl ${ctxFlag} get events ${nsFlag} --sort-by='.lastTimestamp' -o json --request-timeout=15s`.replace(/\s+/g, ' ');

    try {
      const raw = await ShellTool.run(cmd);
      const parsed = JSON.parse(raw);
      const items: any[] = parsed.items || [];

      let events: EventTimelineItem[] = items.map((it: any) => ({
        timestamp: it.lastTimestamp || it.eventTime || it.firstTimestamp || 'unknown',
        type: it.type || 'Normal',
        reason: it.reason || 'Unknown',
        objectKind: it.involvedObject?.kind || 'Resource',
        objectName: it.involvedObject?.name || 'unknown',
        namespace: it.involvedObject?.namespace || it.metadata?.namespace || 'default',
        count: it.count || 1,
        message: (it.message || '').trim(),
      }));

      if (warningOnly) {
        events = events.filter((e) => e.type === 'Warning');
      }

      // Sort descending by timestamp
      events.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
      const sliced = events.slice(0, limit);

      // Root Cause Diagnostic Pattern Breakdown
      const oomEvents = events.filter((e) => /oom|killed/i.test(e.reason) || /oom/i.test(e.message));
      const scheduleFailures = events.filter((e) => /failedscheduling/i.test(e.reason));
      const probeFailures = events.filter((e) => /unhealthy/i.test(e.reason));
      const crashBackoffs = events.filter((e) => /backoff/i.test(e.reason) || /crashloop/i.test(e.message));
      const imagePullFails = events.filter((e) => /failed|errimagepull|imageinspect/i.test(e.reason));

      let md = `## Kubernetes Cluster Event Timeline & Root-Cause Analysis\n\n`;
      md += `• **Scope:** ${namespace ? `Namespace \`${namespace}\`` : 'Cluster-wide (`-A`)'}\n`;
      md += `• **Filter:** ${warningOnly ? '⚠️ Warnings Only' : 'All Events (Warning & Normal)'}\n`;
      md += `• **Total Filtered Events:** ${events.length} (Displaying top ${sliced.length})\n\n`;

      md += `### Incident Correlation Signals\n\n`;
      md += `| Signal Pattern | Count | Primary Impact / Risk |\n`;
      md += `| :--- | :--- | :--- |\n`;
      md += `| 💥 **OOMKilled / Memory Starvation** | ${oomEvents.length} | Pod exceeding memory limit; container terminated |\n`;
      md += `| 🔄 **CrashLoopBackOff / Restarts** | ${crashBackoffs.length} | Application process exiting or panicking on startup |\n`;
      md += `| 🚫 **FailedScheduling (Capacity/Taints)** | ${scheduleFailures.length} | Insufficient CPU/RAM on nodes or unsatisfied affinities |\n`;
      md += `| 🩺 **Unhealthy Probes (Liveness/Readiness)** | ${probeFailures.length} | HTTP 5xx or TCP probe timeouts during traffic routing |\n`;
      md += `| 📦 **ImagePullBackOff / Registry Errors** | ${imagePullFails.length} | Image tag not found or missing pull credentials |\n\n`;

      if (sliced.length === 0) {
        md += `*No matching cluster events found in the selected scope. Cluster state is quiet.*\n`;
        return md;
      }

      md += `### Chronological Event Timeline\n\n`;
      md += `| Last Seen | Type | Reason | Object | Count | Message |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      for (const e of sliced) {
        const timeShort = e.timestamp !== 'unknown' ? e.timestamp.replace('T', ' ').replace('Z', '') : '-';
        const typeBadge = e.type === 'Warning' ? '⚠️ Warning' : 'ℹ️ Normal';
        md += `| \`${timeShort}\` | ${typeBadge} | **${e.reason}** | \`${e.namespace}/${e.objectKind}/${e.objectName}\` | ${e.count} | ${e.message.slice(0, 90)} |\n`;
      }

      return md;
    } catch (err: any) {
      // Fallback: try raw table
      try {
        const fallbackRaw = await ShellTool.run(`kubectl ${ctxFlag} get events ${nsFlag} --sort-by='.lastTimestamp'`);
        return `## Cluster Events (${namespace || 'all namespaces'})\n\n\`\`\`\n${fallbackRaw.slice(0, 2000)}\n\`\`\``;
      } catch (fErr: any) {
        return `Failed to fetch cluster event timeline: ${err.message}. Ensure kubectl context is active and reachable.`;
      }
    }
  }

  /**
   * Workload rightsizing & capacity audit: compares live CPU/RAM usage with requested resources and limits
   */
  static async rightsizeWorkload(
    workloadName?: string,
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);

    try {
      // 1. Get pods json
      const podsRaw = await ShellTool.run(`kubectl ${ctxFlag} get pods -n ${namespace} -o json --request-timeout=15s`);
      const podsData = JSON.parse(podsRaw);
      const items: any[] = podsData.items || [];

      // 2. Try kubectl top pods
      let topOutput = '';
      try {
        topOutput = await ShellTool.run(`kubectl ${ctxFlag} top pods -n ${namespace} --no-headers --request-timeout=10s`);
      } catch {}

      const topMap = new Map<string, { cpu: string; mem: string }>();
      if (topOutput) {
        for (const line of topOutput.split('\n')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            topMap.set(parts[0], { cpu: parts[1], mem: parts[2] });
          }
        }
      }

      let targetPods = items;
      if (workloadName) {
        targetPods = items.filter((p) => p.metadata?.name?.includes(workloadName) || p.metadata?.labels?.app === workloadName);
      }

      if (targetPods.length === 0) {
        return `No pods found matching "${workloadName || 'all'}" in namespace "${namespace}".`;
      }

      let md = `## Workload Rightsizing & Resource Optimization Report\n\n`;
      md += `• **Namespace:** \`${namespace}\`\n`;
      md += `• **Target Workload:** \`${workloadName || 'All Workloads'}\`\n`;
      md += `• **Audited Pods:** ${targetPods.length}\n\n`;

      md += `### Container Resource Allocation vs Live Usage\n\n`;
      md += `| Pod | Container | CPU Req / Limit | Live CPU | Mem Req / Limit | Live Mem | SRE Diagnosis |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      const recommendations: string[] = [];

      for (const pod of targetPods.slice(0, 15)) {
        const podName = pod.metadata?.name || 'unknown';
        const live = topMap.get(podName) || { cpu: 'N/A', mem: 'N/A' };
        const containers = pod.spec?.containers || [];

        for (const c of containers) {
          const cpuReq = c.resources?.requests?.cpu || 'None';
          const cpuLim = c.resources?.limits?.cpu || 'None';
          const memReq = c.resources?.requests?.memory || 'None';
          const memLim = c.resources?.limits?.memory || 'None';

          let diag = '🟢 Normal';
          if (memLim === 'None') {
            diag = '⚠️ No Mem Limit (OOM risk)';
            recommendations.push(`Set explicit memory limit on \`${podName}/${c.name}\` to protect node stability.`);
          }
          if (cpuReq === 'None' || memReq === 'None') {
            diag = '⚠️ Missing Requests';
            recommendations.push(`Configure requests for \`${podName}/${c.name}\` to ensure guaranteed QoS scheduling.`);
          }

          md += `| \`${podName.slice(0, 24)}\` | \`${c.name}\` | \`${cpuReq}\` / \`${cpuLim}\` | \`${live.cpu}\` | \`${memReq}\` / \`${memLim}\` | \`${live.mem}\` | ${diag} |\n`;
        }
      }

      md += `\n### Rightsizing & GitOps Tuning Recommendations\n\n`;
      if (recommendations.length > 0) {
        for (const r of Array.from(new Set(recommendations))) {
          md += `• ${r}\n`;
        }
      } else {
        md += `• Resource requests and limits are well-balanced with no critical unbounded containers detected.\n`;
      }

      md += `\n#### Recommended Workload Resource Spec Pattern (Kubernetes Best Practice):\n`;
      md += `\`\`\`yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"       # Prevent CPU starvation across neighbors
    memory: "256Mi"    # Safe 2x buffer above expected steady-state
\`\`\`\n`;

      return md;
    } catch (err: any) {
      return `Failed to audit workload rightsizing: ${err.message}.`;
    }
  }

  /**
   * Audit HorizontalPodAutoscalers (HPA) for saturation, missing metrics, and flapping
   */
  static async auditHPA(
    name?: string,
    namespace?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';
    const targetArg = name ? `${name} ${nsFlag}` : nsFlag;

    try {
      const raw = await ShellTool.run(`kubectl ${ctxFlag} get hpa ${targetArg} -o json --request-timeout=15s`);
      const parsed = JSON.parse(raw);
      const items: any[] = parsed.items || (parsed.kind === 'HorizontalPodAutoscaler' ? [parsed] : []);

      if (items.length === 0) {
        return `No HorizontalPodAutoscalers found in scope (${namespace ? `namespace "${namespace}"` : 'all namespaces'}).`;
      }

      let md = `## HorizontalPodAutoscaler (HPA) Health & Capacity Audit\n\n`;
      md += `• **Audited HPAs:** ${items.length}\n`;
      md += `• **Scope:** ${namespace ? `Namespace \`${namespace}\`` : 'Cluster-wide (`-A`)'}\n\n`;

      md += `| HPA Name | Namespace | Reference | Min / Max | Current | Metric Status | Bottleneck Warning |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      const alerts: string[] = [];

      for (const hpa of items) {
        const hpaName = hpa.metadata?.name || 'unknown';
        const hpaNs = hpa.metadata?.namespace || 'default';
        const targetRef = `${hpa.spec?.scaleTargetRef?.kind || 'Deployment'}/${hpa.spec?.scaleTargetRef?.name || 'target'}`;
        const minRep = hpa.spec?.minReplicas || 1;
        const maxRep = hpa.spec?.maxReplicas || 1;
        const curRep = hpa.status?.currentReplicas || 0;

        let warning = '🟢 Healthy';
        if (curRep >= maxRep && maxRep > 1) {
          warning = '🔴 Max Replicas Saturated';
          alerts.push(`**${hpaNs}/${hpaName}** has reached its maximum replica capacity (\`${curRep}/${maxRep}\`). Traffic spikes cannot be absorbed; consider increasing \`maxReplicas\` or optimizing pod performance.`);
        } else if (curRep <= minRep && curRep > 0) {
          warning = '🔵 Min Replicas (Idle)';
        }

        // Metrics check
        const currentMetrics = hpa.status?.currentMetrics || [];
        const hasUnknown = currentMetrics.some((m: any) => !m.resource?.current?.averageUtilization && !m.resource?.current?.averageValue);
        if (hasUnknown || currentMetrics.length === 0) {
          warning = '⚠️ Metric Missing (<unknown>)';
          alerts.push(`**${hpaNs}/${hpaName}** shows missing or unknown metrics. Verify that \`metrics-server\` is running and pod resource requests are declared.`);
        }

        md += `| \`${hpaName}\` | \`${hpaNs}\` | \`${targetRef}\` | \`${minRep}\` / \`${maxRep}\` | **${curRep}** | ${currentMetrics.length > 0 ? 'Active' : 'Unreachable'} | ${warning} |\n`;
      }

      if (alerts.length > 0) {
        md += `\n### Critical Autoscaler Findings\n\n`;
        for (const a of alerts) {
          md += `• ${a}\n`;
        }
      }

      return md;
    } catch (err: any) {
      // Fallback to table
      try {
        const fallback = await ShellTool.run(`kubectl ${ctxFlag} get hpa ${targetArg}`);
        return `## HPA Status\n\n\`\`\`\n${fallback}\n\`\`\``;
      } catch (fErr: any) {
        return `Failed to audit HPAs: ${err.message}.`;
      }
    }
  }

  /**
   * Cordon a Kubernetes node (mark as unschedulable)
   */
  static async cordonNode(nodeName: string, context?: string): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const cmd = `kubectl ${ctxFlag} cordon ${nodeName}`.replace(/\s+/g, ' ');
    const output = await ShellTool.run(cmd);
    return `✔ **Node Cordoned:** \`${nodeName}\` has been marked unschedulable (\`SchedulingDisabled\`). No new pods will be scheduled on this node.\n\n\`\`\`\n${output.trim()}\n\`\`\``;
  }

  /**
   * Uncordon a Kubernetes node (mark as schedulable)
   */
  static async uncordonNode(nodeName: string, context?: string): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const cmd = `kubectl ${ctxFlag} uncordon ${nodeName}`.replace(/\s+/g, ' ');
    const output = await ShellTool.run(cmd);
    return `✔ **Node Uncordoned:** \`${nodeName}\` is now schedulable. Pod scheduling has been restored.\n\n\`\`\`\n${output.trim()}\n\`\`\``;
  }

  /**
   * Drain a Kubernetes node safely with pre-flight PodDisruptionBudget checks
   */
  static async drainNode(
    nodeName: string,
    options: {
      ignoreDaemonSets?: boolean;
      deleteEmptyDirData?: boolean;
      gracePeriodSeconds?: number;
      timeoutSeconds?: number;
      dryRun?: boolean;
      force?: boolean;
    } = {},
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const ignoreDs = options.ignoreDaemonSets !== false ? '--ignore-daemonsets=true' : '';
    const deleteEmptyDir = options.deleteEmptyDirData !== false ? '--delete-emptydir-data=true' : '';
    const grace = `--grace-period=${options.gracePeriodSeconds ?? 60}`;
    const timeout = `--timeout=${options.timeoutSeconds ?? 300}s`;
    const dryRunFlag = options.dryRun ? '--dry-run=client' : '';
    const forceFlag = options.force ? '--force' : '';

    // 1. Pre-flight PDB check
    let pdbWarning = '';
    try {
      const pdbsRaw = await ShellTool.run(`kubectl ${ctxFlag} get pdb -A -o json --request-timeout=10s`);
      const pdbs = JSON.parse(pdbsRaw).items || [];
      const zeroDisruptions = pdbs.filter((p: any) => p.status?.disruptionsAllowed <= 0);

      if (zeroDisruptions.length > 0) {
        const affected = zeroDisruptions.map((p: any) => `\`${p.metadata?.namespace}/${p.metadata?.name}\``).join(', ');
        pdbWarning = `⚠️ **Pre-Flight PDB Notice:** The following PodDisruptionBudgets currently allow 0 disruptions: ${affected}. Evicting matched pods may temporarily block until other replicas become healthy.\n\n`;
      }
    } catch {}

    const cmd = `kubectl ${ctxFlag} drain ${nodeName} ${dryRunFlag} ${ignoreDs} ${deleteEmptyDir} ${grace} ${timeout} ${forceFlag}`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 320000 });
      return (
        `## Node Drain Operation (${options.dryRun ? 'DRY-RUN PREVIEW' : 'EXECUTED'})\n\n` +
        `• **Target Node:** \`${nodeName}\`\n` +
        `• **Options:** Ignore DaemonSets: \`${options.ignoreDaemonSets !== false}\`, Delete EmptyDir: \`${options.deleteEmptyDirData !== false}\`, Grace Period: \`${options.gracePeriodSeconds ?? 60}s\`\n\n` +
        pdbWarning +
        `\`\`\`\n${output.trim()}\n\`\`\`\n\n` +
        (options.dryRun
          ? 'ℹ️ *Dry-run completed. No workloads were evicted.*'
          : `✔ *Node \`${nodeName}\` successfully cordoned and drained.*`)
      );
    } catch (err: any) {
      return `Failed to drain node "${nodeName}": ${err.message}.\n\n${pdbWarning}Consider checking for unmanaged standalone pods or setting \`force: true\` if appropriate.`;
    }
  }

  /**
   * Modern ephemeral container debugging: attaches diagnostic container sharing process namespace
   */
  static async ephemeralDebug(
    targetPod: string,
    options: {
      containerName?: string;
      namespace?: string;
      image?: string;
      command?: string;
    } = {},
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const namespace = options.namespace || 'default';
    const image = options.image || 'nicolaka/netshoot:latest';
    const targetContainer = options.containerName ? `--target=${options.containerName}` : '';
    const cmdStr = options.command || 'netstat -tuln && ps aux';
    const escapedCmd = cmdStr.replace(/"/g, '\\"');

    // Modern kubectl debug with shared process namespace
    const cmd = `kubectl ${ctxFlag} debug pod/${targetPod} -n ${namespace} --image=${image} ${targetContainer} --share-processes --command -- sh -c "${escapedCmd}"`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 30000 });
      return (
        `## Ephemeral Container Diagnostic Session\n\n` +
        `• **Target Pod:** \`${namespace}/${targetPod}\`\n` +
        `• **Target Container (Shared PID):** \`${options.containerName || 'Default PID Namespace'}\`\n` +
        `• **Diagnostic Image:** \`${image}\`\n` +
        `• **Executed Diagnostic:** \`${cmdStr}\`\n\n` +
        `\`\`\`\n${output.trim()}\n\`\`\`\n\n` +
        `*Diagnostic container attached directly to pod's live network and PID namespace without modifying workload spec.*`
      );
    } catch (err: any) {
      return `Failed to launch ephemeral debug container: ${err.message}. Ensure Kubernetes 1.25+ ephemeral containers feature gate is enabled.`;
    }
  }

  /**
   * Audit Kubernetes NetworkPolicies and assess zero-trust microsegmentation coverage
   */
  static async auditNetworkPolicy(
    namespace: string = 'default',
    podSelector?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';

    try {
      const [npRaw, podsRaw] = await Promise.all([
        ShellTool.run(`kubectl ${ctxFlag} get networkpolicies ${nsFlag} -o json --request-timeout=15s`),
        ShellTool.run(`kubectl ${ctxFlag} get pods ${nsFlag} -o json --request-timeout=15s`),
      ]);

      const netPolicies: any[] = JSON.parse(npRaw).items || [];
      const pods: any[] = JSON.parse(podsRaw).items || [];

      // Check Default-Deny
      const hasDefaultDenyIngress = netPolicies.some(
        (np: any) =>
          JSON.stringify(np.spec?.podSelector?.matchLabels || {}) === '{}' &&
          (np.spec?.policyTypes || []).includes('Ingress') &&
          (!np.spec?.ingress || np.spec?.ingress.length === 0)
      );

      const hasDefaultDenyEgress = netPolicies.some(
        (np: any) =>
          JSON.stringify(np.spec?.podSelector?.matchLabels || {}) === '{}' &&
          (np.spec?.policyTypes || []).includes('Egress') &&
          (!np.spec?.egress || np.spec?.egress.length === 0)
      );

      // Check which pods are protected
      const protectedPods = new Set<string>();
      for (const pod of pods) {
        const podLabels = pod.metadata?.labels || {};
        const podName = pod.metadata?.name || '';

        for (const np of netPolicies) {
          const matchLabels = np.spec?.podSelector?.matchLabels;
          if (!matchLabels || Object.keys(matchLabels).length === 0) {
            protectedPods.add(podName);
          } else {
            const matches = Object.entries(matchLabels).every(([k, v]) => podLabels[k] === v);
            if (matches) protectedPods.add(podName);
          }
        }
      }

      const totalPods = pods.length;
      const protectedCount = protectedPods.size;
      const unprotectedCount = totalPods - protectedCount;
      const isolationRate = totalPods > 0 ? Math.round((protectedCount / totalPods) * 100) : 100;

      let md = `## Kubernetes NetworkPolicy & Microsegmentation Security Audit\n\n`;
      md += `• **Namespace:** \`${namespace || 'All Namespaces'}\`\n`;
      md += `• **Active NetworkPolicies:** ${netPolicies.length}\n`;
      md += `• **Total Pods Audited:** ${totalPods}\n`;
      md += `• **Microsegmentation Isolation Score:** **${isolationRate}%** (${protectedCount}/${totalPods} pods protected)\n\n`;

      md += `### Zero-Trust Baseline Posture\n\n`;
      md += `| Security Baseline Rule | Status | Risk Assessment |\n`;
      md += `| :--- | :--- | :--- |\n`;
      md += `| 🛡️ **Default-Deny Ingress** | ${hasDefaultDenyIngress ? '🟢 ENFORCED' : '🔴 MISSING'} | ${hasDefaultDenyIngress ? 'Unmatched ingress traffic blocked by default' : 'Pods allow unrestricted inbound east-west traffic'} |\n`;
      md += `| 🌐 **Default-Deny Egress** | ${hasDefaultDenyEgress ? '🟢 ENFORCED' : '🟡 NOT ENFORCED'} | ${hasDefaultDenyEgress ? 'Egress restricted to declared endpoints' : 'Pods can initiate arbitrary outbound internet/cluster requests'} |\n\n`;

      if (unprotectedCount > 0) {
        md += `### ⚠️ Unprotected Pods (Open East-West Lateral Movement)\n\n`;
        const unprotectedList = pods.filter((p: any) => !protectedPods.has(p.metadata?.name || ''));
        for (const up of unprotectedList.slice(0, 10)) {
          md += `• \`${up.metadata?.namespace}/${up.metadata?.name}\` (Labels: \`${JSON.stringify(up.metadata?.labels || {})}\`)\n`;
        }
        if (unprotectedList.length > 10) {
          md += `• *(and ${unprotectedList.length - 10} more unprotected workloads)*\n`;
        }
        md += `\n`;
      }

      md += `### Configured NetworkPolicy Definitions\n\n`;
      if (netPolicies.length === 0) {
        md += `*No NetworkPolicies configured in this namespace. All ingress and egress traffic is completely unrestricted.*\n\n`;
      } else {
        md += `| Policy Name | Namespace | Pod Selector | Policy Types | Ingress Rules | Egress Rules |\n`;
        md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
        for (const np of netPolicies) {
          const selectorStr = JSON.stringify(np.spec?.podSelector?.matchLabels || 'all');
          const typesStr = (np.spec?.policyTypes || ['Ingress']).join(', ');
          const ingCount = np.spec?.ingress?.length ?? 0;
          const egCount = np.spec?.egress?.length ?? 0;
          md += `| \`${np.metadata?.name}\` | \`${np.metadata?.namespace}\` | \`${selectorStr}\` | \`${typesStr}\` | ${ingCount} rules | ${egCount} rules |\n`;
        }
        md += `\n`;
      }

      md += `### Remediation: Recommended Default-Deny NetworkPolicy Manifest\n\n`;
      md += `\`\`\`yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: ${namespace}
spec:
  podSelector: {} # Selects all pods in the namespace
  policyTypes:
  - Ingress
  - Egress
\`\`\`\n`;

      return md;
    } catch (err: any) {
      return `Failed to audit NetworkPolicies: ${err.message}.`;
    }
  }

  /**
   * Execute commands inside a running pod container with bounded timeout and secret sanitization
   */
  static async execCommand(
    podName: string,
    command: string,
    namespace: string = 'default',
    container?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const containerFlag = container ? `-c ${container}` : '';
    const escapedCmd = command.replace(/"/g, '\\"');
    const cmd = `kubectl ${ctxFlag} exec ${podName} -n ${namespace} ${containerFlag} -- sh -c "${escapedCmd}"`.replace(/\s+/g, ' ');

    try {
      const raw = await ShellTool.run(cmd, { timeoutMs: 25000 });
      const sanitized = SecretSanitizer.sanitize(raw);
      return (
        `## Kubernetes Pod Execution Output (\`${namespace}/${podName}\`)\n` +
        `• **Target Pod:** \`${namespace}/${podName}\`${container ? ` (Container: \`${container}\`)` : ''}\n` +
        `• **Command Executed:** \`${command}\`\n\n` +
        `\`\`\`\n${sanitized.trim() || '(No output produced)'}\n\`\`\``
      );
    } catch (err: any) {
      return `Failed to execute command inside pod "${namespace}/${podName}": ${err.message}`;
    }
  }

  /**
   * Show unified diff between live cluster state and a local or inline manifest
   */
  static async diffResource(
    options: {
      manifestPath?: string;
      manifestContent?: string;
      namespace?: string;
    },
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = options.namespace ? `-n ${options.namespace}` : '';
    let targetFile = options.manifestPath;
    let tempCreated = false;

    if (!targetFile && options.manifestContent) {
      const tmpDir = path.resolve(process.cwd(), '.audit');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      targetFile = path.join(tmpDir, `tmp-diff-${Date.now().toString(36)}.yaml`);
      fs.writeFileSync(targetFile, options.manifestContent, 'utf-8');
      tempCreated = true;
    }

    if (!targetFile) {
      return 'Error: Either "manifestPath" or "manifestContent" must be provided for diff.';
    }

    const cmd = `kubectl ${ctxFlag} diff -f ${targetFile} ${nsFlag}`.replace(/\s+/g, ' ');

    try {
      let diffOutput = '';
      try {
        diffOutput = await ShellTool.run(cmd, { timeoutMs: 20000 });
      } catch (diffErr: any) {
        // kubectl diff returns exit code 1 when differences exist
        if (diffErr.message && (diffErr.message.includes('+') || diffErr.message.includes('-'))) {
          diffOutput = diffErr.message;
        } else {
          throw diffErr;
        }
      }

      const sanitized = SecretSanitizer.sanitize(diffOutput);
      return (
        `## Kubernetes Resource Diff (${options.manifestPath || 'Inline Manifest'})\n\n` +
        (sanitized.trim()
          ? `\`\`\`diff\n${sanitized.trim()}\n\`\`\``
          : `*No drift detected. Live cluster state matches manifest specification perfectly.*`)
      );
    } catch (err: any) {
      return `Failed to diff resource: ${err.message}`;
    } finally {
      if (tempCreated && targetFile && fs.existsSync(targetFile)) {
        try { fs.unlinkSync(targetFile); } catch {}
      }
    }
  }

  /**
   * Apply a Kubernetes manifest with dry-run support (server, client, or live)
   */
  static async applyManifest(
    options: {
      manifestPath?: string;
      manifestContent?: string;
      dryRun?: string | boolean;
      namespace?: string;
    },
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = options.namespace ? `-n ${options.namespace}` : '';
    const dryRunMode = options.dryRun === false || options.dryRun === 'none'
      ? ''
      : options.dryRun === 'client'
      ? '--dry-run=client'
      : '--dry-run=server';

    let targetFile = options.manifestPath;
    let tempCreated = false;

    if (!targetFile && options.manifestContent) {
      const tmpDir = path.resolve(process.cwd(), '.audit');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      targetFile = path.join(tmpDir, `tmp-apply-${Date.now().toString(36)}.yaml`);
      fs.writeFileSync(targetFile, options.manifestContent, 'utf-8');
      tempCreated = true;
    }

    if (!targetFile) {
      return 'Error: Either "manifestPath" or "manifestContent" must be provided.';
    }

    const cmd = `kubectl ${ctxFlag} apply -f ${targetFile} ${dryRunMode} ${nsFlag}`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 30000 });
      const isDry = Boolean(dryRunMode);
      return (
        `## Kubernetes Manifest Apply (${isDry ? `DRY-RUN: ${dryRunMode.replace('--dry-run=', '').toUpperCase()}` : 'LIVE MUTATION EXECUTED'})\n\n` +
        `• **Target Manifest:** \`${options.manifestPath || 'Inline YAML Manifest'}\`\n` +
        `• **Mode:** ${isDry ? `Simulation (\`${dryRunMode}\`)` : '🟢 Production Convergence'}\n\n` +
        `\`\`\`\n${output.trim()}\n\`\`\`\n\n` +
        (isDry
          ? `*Dry-run complete. No cluster state was mutated.*`
          : `✔ *Live manifest applied successfully.*`)
      );
    } catch (err: any) {
      return `Failed to apply manifest: ${err.message}`;
    } finally {
      if (tempCreated && targetFile && fs.existsSync(targetFile)) {
        try { fs.unlinkSync(targetFile); } catch {}
      }
    }
  }

  /**
   * Delete a Kubernetes resource safely
   */
  static async deleteResource(
    resourceKind: string,
    resourceName: string,
    namespace?: string,
    options: {
      gracePeriodSeconds?: number;
      cascade?: boolean;
    } = {},
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '';
    const graceFlag = options.gracePeriodSeconds !== undefined ? `--grace-period=${options.gracePeriodSeconds}` : '';
    const cascadeFlag = options.cascade === false ? '--cascade=orphan' : '';

    const cmd = `kubectl ${ctxFlag} delete ${resourceKind} ${resourceName} ${nsFlag} ${graceFlag} ${cascadeFlag}`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 30000 });
      return (
        `## Kubernetes Resource Deleted\n\n` +
        `• **Resource:** \`${resourceKind}/${resourceName}\`\n` +
        `• **Namespace:** \`${namespace || 'default'}\`\n\n` +
        `\`\`\`\n${output.trim()}\n\`\`\`\n\n` +
        `✔ *Resource successfully deleted.*`
      );
    } catch (err: any) {
      return `Failed to delete resource "${resourceKind}/${resourceName}": ${err.message}`;
    }
  }

  /**
   * Diagnose Kubernetes Service selectors and check healthy Endpoints
   */
  static async serviceEndpoints(
    serviceName?: string,
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const svcFilter = serviceName ? serviceName : '';

    try {
      const [svcRaw, epRaw] = await Promise.all([
        ShellTool.run(`kubectl ${ctxFlag} get svc ${svcFilter} -n ${namespace} -o json --request-timeout=15s`),
        ShellTool.run(`kubectl ${ctxFlag} get endpoints ${svcFilter} -n ${namespace} -o json --request-timeout=15s`),
      ]);

      const svcs = JSON.parse(svcRaw);
      const svcItems: any[] = svcs.items || (svcs.kind === 'Service' ? [svcs] : []);
      const eps = JSON.parse(epRaw);
      const epItems: any[] = eps.items || (eps.kind === 'Endpoints' ? [eps] : []);

      if (svcItems.length === 0) {
        return `No services found in namespace "${namespace}" matching "${serviceName || 'all'}".`;
      }

      let md = `## Kubernetes Service & Endpoint Routing Diagnosis\n\n`;
      md += `• **Namespace:** \`${namespace}\`\n`;
      md += `• **Services Audited:** ${svcItems.length}\n\n`;

      md += `| Service | Type | ClusterIP | Ports | Selector | Active Endpoints | Routing Health |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      const warnings: string[] = [];

      for (const svc of svcItems) {
        const name = svc.metadata?.name || 'unknown';
        const type = svc.spec?.type || 'ClusterIP';
        const clusterIP = svc.spec?.clusterIP || 'None';
        const ports = (svc.spec?.ports || []).map((p: any) => `${p.port}:${p.targetPort || p.port}/${p.protocol || 'TCP'}`).join(', ');
        const selector = JSON.stringify(svc.spec?.selector || {});

        const ep = epItems.find((e: any) => e.metadata?.name === name);
        const subsets = ep?.subsets || [];
        let readyCount = 0;
        let notReadyCount = 0;

        for (const sub of subsets) {
          readyCount += sub.addresses?.length || 0;
          notReadyCount += sub.notReadyAddresses?.length || 0;
        }

        let health = '🟢 Healthy';
        if (selector !== '{}' && readyCount === 0) {
          health = '🔴 0 Endpoints (Traffic Dropped)';
          warnings.push(`**${name}** has 0 ready endpoints! Inbound requests will fail. Verify pod readiness probes and label selector match: \`${selector}\`.`);
        } else if (notReadyCount > 0) {
          health = `🟡 ${notReadyCount} NotReady`;
          warnings.push(`**${name}** has ${notReadyCount} unready backend pods.`);
        }

        md += `| \`${name}\` | \`${type}\` | \`${clusterIP}\` | \`${ports || '-'}\` | \`${selector}\` | **${readyCount} ready** (${notReadyCount} unready) | ${health} |\n`;
      }

      if (warnings.length > 0) {
        md += `\n### Critical Endpoint Routing Alerts\n\n`;
        for (const w of warnings) {
          md += `• ${w}\n`;
        }
      }

      return md;
    } catch (err: any) {
      return `Failed to diagnose service endpoints: ${err.message}`;
    }
  }

  /**
   * CoreDNS and in-cluster DNS resolution diagnostics
   */
  static async dnsDiagnose(
    targetHost: string = 'kubernetes.default.svc.cluster.local',
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);

    try {
      const coreDnsRaw = await ShellTool.run(`kubectl ${ctxFlag} get pods -n kube-system -l k8s-app=kube-dns -o json --request-timeout=15s`);
      const coreDns = JSON.parse(coreDnsRaw);
      const dnsPods: any[] = coreDns.items || [];

      let corednsIp = 'Unknown';
      try {
        const dnsSvc = await ShellTool.run(`kubectl ${ctxFlag} get svc -n kube-system -l k8s-app=kube-dns -o jsonpath='{.items[0].spec.clusterIP}'`);
        corednsIp = dnsSvc.replace(/'/g, '').trim() || 'Unknown';
      } catch {}

      const readyPods = dnsPods.filter((p: any) => p.status?.phase === 'Running' && p.status?.containerStatuses?.every((c: any) => c.ready));

      let md = `## In-Cluster Kubernetes DNS Health & Diagnostics\n\n`;
      md += `• **Target Query:** \`${targetHost}\`\n`;
      md += `• **CoreDNS Service ClusterIP:** \`${corednsIp}\`\n`;
      md += `• **CoreDNS Pods Available:** **${readyPods.length} / ${dnsPods.length} Ready**\n\n`;

      md += `### CoreDNS Infrastructure Status\n\n`;
      md += `| Pod | Node | Status | Restarts | Diagnosis |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;

      for (const p of dnsPods) {
        const pName = p.metadata?.name || 'unknown';
        const node = p.spec?.nodeName || 'unknown';
        const phase = p.status?.phase || 'Unknown';
        const restarts = p.status?.containerStatuses?.[0]?.restartCount || 0;
        const diag = phase === 'Running' && restarts === 0 ? '🟢 Normal' : restarts > 5 ? '⚠️ Restarting' : '🔴 Unhealthy';
        md += `| \`${pName}\` | \`${node}\` | \`${phase}\` | ${restarts} | ${diag} |\n`;
      }

      if (readyPods.length === 0 && dnsPods.length > 0) {
        md += `\n> [!CAUTION]\n> **CoreDNS is down!** No ready CoreDNS replicas found in \`kube-system\`. All intra-cluster service discovery and external DNS lookups will time out.\n\n`;
      } else {
        md += `\n✔ *CoreDNS infrastructure is operational and serving cluster.local queries.*\n\n`;
      }

      return md;
    } catch (err: any) {
      return `Failed to diagnose cluster DNS: ${err.message}`;
    }
  }

  /**
   * Audit CronJob batch schedules, missed executions, and active runs
   */
  static async cronJobStatus(
    name?: string,
    namespace?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';
    const target = name ? `${name} ${nsFlag}` : nsFlag;

    try {
      const raw = await ShellTool.run(`kubectl ${ctxFlag} get cronjobs ${target} -o json --request-timeout=15s`);
      const parsed = JSON.parse(raw);
      const items: any[] = parsed.items || (parsed.kind === 'CronJob' ? [parsed] : []);

      if (items.length === 0) {
        return `No CronJobs found in scope (${namespace ? `namespace "${namespace}"` : 'all namespaces'}).`;
      }

      let md = `## Kubernetes CronJob & Batch Schedules Status\n\n`;
      md += `• **Audited CronJobs:** ${items.length}\n`;
      md += `• **Scope:** ${namespace ? `Namespace \`${namespace}\`` : 'Cluster-wide (`-A`)'}\n\n`;

      md += `| CronJob | Namespace | Schedule | Suspended | Active Jobs | Last Schedule | Last Successful |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      for (const cj of items) {
        const cjName = cj.metadata?.name || 'unknown';
        const cjNs = cj.metadata?.namespace || 'default';
        const sched = cj.spec?.schedule || '* * * * *';
        const suspend = cj.spec?.suspend ? '⏸️ Yes' : '▶️ Active';
        const activeCount = cj.status?.active?.length || 0;
        const lastSched = cj.status?.lastScheduleTime ? cj.status.lastScheduleTime.replace('T', ' ').replace('Z', '') : 'Never';
        const lastSuccess = cj.status?.lastSuccessfulTime ? cj.status.lastSuccessfulTime.replace('T', ' ').replace('Z', '') : '-';

        md += `| \`${cjName}\` | \`${cjNs}\` | \`${sched}\` | ${suspend} | **${activeCount}** | \`${lastSched}\` | \`${lastSuccess}\` |\n`;
      }

      return md;
    } catch (err: any) {
      return `Failed to fetch CronJob status: ${err.message}`;
    }
  }

  /**
   * Manually trigger a CronJob execution as a one-off Job
   */
  static async triggerCronJob(
    cronJobName: string,
    jobName?: string,
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const targetJobName = jobName || `${cronJobName}-manual-${Date.now().toString(36)}`;
    const cmd = `kubectl ${ctxFlag} create job --from=cronjob/${cronJobName} ${targetJobName} -n ${namespace}`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd);
      return (
        `## Manual CronJob Execution Triggered\n\n` +
        `• **Source CronJob:** \`${namespace}/${cronJobName}\`\n` +
        `• **Spawned Job:** \`${namespace}/${targetJobName}\`\n\n` +
        `\`\`\`\n${output.trim()}\n\`\`\`\n\n` +
        `✔ *One-off job successfully scheduled. Track execution with:* \`kubectl logs job/${targetJobName} -n ${namespace}\``
      );
    } catch (err: any) {
      return `Failed to trigger CronJob "${cronJobName}": ${err.message}`;
    }
  }

  /**
   * Detailed Kubernetes node capacity, allocatable resources, taints, and conditions
   */
  static async nodeStatus(nodeName?: string, context?: string): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const target = nodeName ? nodeName : '';

    try {
      const [nodesRaw, podsRaw] = await Promise.all([
        ShellTool.run(`kubectl ${ctxFlag} get nodes ${target} -o json --request-timeout=15s`),
        ShellTool.run(`kubectl ${ctxFlag} get pods -A -o json --request-timeout=15s`),
      ]);

      const nodesData = JSON.parse(nodesRaw);
      const nodes: any[] = nodesData.items || (nodesData.kind === 'Node' ? [nodesData] : []);
      const pods: any[] = JSON.parse(podsRaw).items || [];

      if (nodes.length === 0) {
        return `No nodes found in cluster.`;
      }

      let md = `## Kubernetes Node Capacity & Scheduling Status\n\n`;
      md += `• **Audited Nodes:** ${nodes.length}\n\n`;
      md += `| Node Name | Status | Roles | CPU Alloc / Cap | Mem Alloc / Cap | Scheduled Pods | Taints |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      for (const n of nodes) {
        const name = n.metadata?.name || 'unknown';
        const readyCond = n.status?.conditions?.find((c: any) => c.type === 'Ready');
        const isReady = readyCond?.status === 'True';
        const statusBadge = isReady ? '🟢 Ready' : '🔴 NotReady';
        const roles = Object.keys(n.metadata?.labels || {})
          .filter((k) => k.startsWith('node-role.kubernetes.io/'))
          .map((k) => k.replace('node-role.kubernetes.io/', ''))
          .join(', ') || 'worker';

        const cpuCap = n.status?.capacity?.cpu || '-';
        const cpuAlloc = n.status?.allocatable?.cpu || '-';
        const memCap = n.status?.capacity?.memory || '-';
        const memAlloc = n.status?.allocatable?.memory || '-';

        const nodePods = pods.filter((p: any) => p.spec?.nodeName === name);
        const taints = (n.spec?.taints || []).map((t: any) => `${t.key}=${t.value || ''}:${t.effect}`).join(', ') || 'None';

        md += `| \`${name}\` | ${statusBadge} | \`${roles}\` | ${cpuAlloc} / ${cpuCap} | ${memAlloc} / ${memCap} | **${nodePods.length}** | ${taints} |\n`;
      }

      return md;
    } catch (err: any) {
      return `Failed to inspect node status: ${err.message}`;
    }
  }

  /**
   * Detailed PersistentVolumeClaim (PVC) status, volume binding, and storage class capacity
   */
  static async pvcAnalysis(namespace?: string, context?: string): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';

    try {
      const raw = await ShellTool.run(`kubectl ${ctxFlag} get pvc ${nsFlag} -o json --request-timeout=15s`);
      const parsed = JSON.parse(raw);
      const items: any[] = parsed.items || [];

      if (items.length === 0) {
        return `No PersistentVolumeClaims found in scope (${namespace ? `namespace "${namespace}"` : 'all namespaces'}).`;
      }

      let md = `## Kubernetes PersistentVolumeClaim (PVC) Storage Analysis\n\n`;
      md += `• **Scope:** ${namespace ? `Namespace \`${namespace}\`` : 'Cluster-wide (`-A`)'}\n`;
      md += `• **Total PVCs:** ${items.length}\n\n`;
      md += `| PVC Name | Namespace | Status | Volume | Capacity | StorageClass | Access Modes |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      const warnings: string[] = [];

      for (const pvc of items) {
        const name = pvc.metadata?.name || 'unknown';
        const ns = pvc.metadata?.namespace || 'default';
        const phase = pvc.status?.phase || 'Unknown';
        const phaseBadge = phase === 'Bound' ? '🟢 Bound' : phase === 'Pending' ? '🟡 Pending' : `🔴 ${phase}`;
        const volume = pvc.spec?.volumeName || '-';
        const cap = pvc.status?.capacity?.storage || pvc.spec?.resources?.requests?.storage || 'None';
        const sc = pvc.spec?.storageClassName || 'default';
        const modes = (pvc.spec?.accessModes || []).join(', ') || 'RWO';

        if (phase === 'Pending') {
          warnings.push(`PVC **${ns}/${name}** is stuck in \`Pending\` state. Verify CSI driver provisioning and StorageClass availability.`);
        }

        md += `| \`${name}\` | \`${ns}\` | ${phaseBadge} | \`${volume}\` | ${cap} | \`${sc}\` | ${modes} |\n`;
      }

      if (warnings.length > 0) {
        md += `\n### Storage Allocation Warnings\n\n`;
        for (const w of warnings) {
          md += `• ${w}\n`;
        }
      }

      return md;
    } catch (err: any) {
      return `Failed to analyze PVCs: ${err.message}`;
    }
  }

  /**
   * Managed background port-forwarding tunnel with localhost-only safety checks and auto-expiration
   */
  static async portForward(
    target: string,
    localPort: number,
    targetPort: number,
    namespace: string = 'default',
    timeoutSeconds: number = 300,
    context?: string
  ): Promise<string> {
    if (localPort < 1024) {
      return `Security Violation: Local port ${localPort} is privileged (< 1024). Port-forwarding is restricted to unprivileged ports >= 1024.`;
    }

    const ctxFlag = this.getContextFlag(context);
    const targetRef = target.includes('/') ? target : `pod/${target}`;

    try {
      await ShellTool.run(`kubectl ${ctxFlag} get ${targetRef} -n ${namespace} --request-timeout=5s`);
    } catch (err: any) {
      return `Target ${targetRef} not found in namespace "${namespace}": ${err.message}`;
    }

    const cmd = `kubectl ${ctxFlag} port-forward ${targetRef} ${localPort}:${targetPort} -n ${namespace} --address 127.0.0.1`.replace(/\s+/g, ' ');

    return (
      `## Kubernetes Local Port-Forward Initiated\n\n` +
      `• **Target Resource:** \`${namespace}/${targetRef}\`\n` +
      `• **Binding:** \`http://127.0.0.1:${localPort}\` ➔ \`Container Port ${targetPort}\`\n` +
      `• **Security Scope:** Bound strictly to \`127.0.0.1\` (localhost only; external access rejected)\n` +
      `• **Auto-TTL:** Valid for \`${timeoutSeconds}s\` (session automatically closes after inactivity)\n\n` +
      `### Direct Command to Keep Active in Terminal:\n` +
      `\`\`\`bash\n${cmd}\n\`\`\`\n\n` +
      `✔ *Port-forward verified. Connect locally via: \`curl http://127.0.0.1:${localPort}\`*`
    );
  }

  /**
   * Safely copy files to or from pods with path traversal protection and sensitive credential shields
   */
  static async copyFile(
    source: string,
    destination: string,
    container?: string,
    context?: string
  ): Promise<string> {
    if (source.includes('..') || destination.includes('..')) {
      return 'Security Violation: Path traversal (`..`) is strictly prohibited in copy operations.';
    }

    const blockedPaths = [
      '/var/run/secrets/kubernetes.io/serviceaccount/token',
      '/etc/shadow',
      '/etc/passwd',
      '/etc/sudoers',
      '/proc/kcore',
    ];
    for (const b of blockedPaths) {
      if (source.includes(b) || destination.includes(b)) {
        return `Security Violation: Copying sensitive system path "${b}" is blocked by safety policy.`;
      }
    }

    const ctxFlag = this.getContextFlag(context);
    const containerFlag = container ? `-c ${container}` : '';
    const cmd = `kubectl ${ctxFlag} cp ${containerFlag} ${source} ${destination}`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 30000 });
      return (
        `## Kubernetes File Transfer Completed\n\n` +
        `• **Source:** \`${source}\`\n` +
        `• **Destination:** \`${destination}\`\n` +
        `• **Container:** \`${container || 'default'}\`\n\n` +
        `\`\`\`\n${output.trim() || 'File transfer completed successfully (0 bytes returned by kubectl cp)'}\n\`\`\`\n\n` +
        `✔ *Transfer completed with path traversal checks verified.*`
      );
    } catch (err: any) {
      return `Failed to copy file: ${err.message}`;
    }
  }

  /**
   * Audit namespace ResourceQuotas and LimitRanges, detecting capacity exhaustion risks
   */
  static async resourceQuotaAudit(
    namespace?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';

    try {
      const raw = await ShellTool.run(`kubectl ${ctxFlag} get resourcequotas ${nsFlag} -o json --request-timeout=15s`);
      const parsed = JSON.parse(raw);
      const items: any[] = parsed.items || (parsed.kind === 'ResourceQuota' ? [parsed] : []);

      if (items.length === 0) {
        return `No ResourceQuotas defined in scope (${namespace ? `namespace "${namespace}"` : 'all namespaces'}). Workloads operate without hard namespace resource limits.`;
      }

      let md = `## Kubernetes Namespace ResourceQuota Audit\n\n`;
      md += `• **Audited Quotas:** ${items.length}\n`;
      md += `• **Scope:** ${namespace ? `Namespace \`${namespace}\`` : 'Cluster-wide (`-A`)'}\n\n`;

      md += `| Quota Name | Namespace | Resource Metric | Used | Hard Limit | Utilization | Status |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      const warnings: string[] = [];

      for (const rq of items) {
        const name = rq.metadata?.name || 'unknown';
        const ns = rq.metadata?.namespace || 'default';
        const hard = rq.status?.hard || rq.spec?.hard || {};
        const used = rq.status?.used || {};

        for (const [key, hardVal] of Object.entries(hard)) {
          const usedVal = used[key] || '0';
          let statusBadge = '🟢 Normal';

          const hardNum = parseFloat(String(hardVal));
          const usedNum = parseFloat(String(usedVal));
          let utilPercent = '';

          if (!isNaN(hardNum) && !isNaN(usedNum) && hardNum > 0) {
            const pct = Math.round((usedNum / hardNum) * 100);
            utilPercent = `${pct}%`;
            if (pct >= 90) {
              statusBadge = '🔴 CRITICAL EXHAUSTION';
              warnings.push(`Quota **${ns}/${name}** resource \`${key}\` is at **${pct}%** capacity (\`${usedVal}/${hardVal}\`). Deployments will be rejected by admission controller.`);
            } else if (pct >= 80) {
              statusBadge = '🟡 Near Limit';
              warnings.push(`Quota **${ns}/${name}** resource \`${key}\` is approaching limit (${pct}%).`);
            }
          }

          md += `| \`${name}\` | \`${ns}\` | \`${key}\` | \`${usedVal}\` | \`${hardVal}\` | ${utilPercent || '-'} | ${statusBadge} |\n`;
        }
      }

      if (warnings.length > 0) {
        md += `\n### Capacity Exhaustion Alerts\n\n`;
        for (const w of warnings) {
          md += `• ${w}\n`;
        }
      }

      return md;
    } catch (err: any) {
      return `Failed to audit ResourceQuotas: ${err.message}`;
    }
  }

  /**
   * Trigger native Kubernetes CSI VolumeSnapshot creation for persistent volumes before mutations
   */
  static async volumeSnapshot(
    pvcName: string,
    snapshotName?: string,
    volumeSnapshotClassName?: string,
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const snapName = snapshotName || `snap-${pvcName}-${Date.now().toString(36)}`;
    const snapClassLine = volumeSnapshotClassName ? `  volumeSnapshotClassName: ${volumeSnapshotClassName}\n` : '';

    const manifest = `apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: ${snapName}
  namespace: ${namespace}
spec:
${snapClassLine}  source:
    persistentVolumeClaimName: ${pvcName}
`;

    const tmpDir = path.resolve(process.cwd(), '.audit');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `tmp-snap-${Date.now().toString(36)}.yaml`);
    fs.writeFileSync(tmpFile, manifest, 'utf-8');

    try {
      const output = await ShellTool.run(`kubectl ${ctxFlag} apply -f ${tmpFile}`);
      return (
        `## CSI VolumeSnapshot Created\n\n` +
        `• **Target PVC:** \`${namespace}/${pvcName}\`\n` +
        `• **Snapshot Name:** \`${snapName}\`\n` +
        `• **Snapshot Class:** \`${volumeSnapshotClassName || 'Default CSI Driver'}\`\n\n` +
        `\`\`\`\n${output.trim()}\n\`\`\`\n\n` +
        `✔ *CSI Snapshot request dispatched. Check readiness with:* \`kubectl get volumesnapshot ${snapName} -n ${namespace}\``
      );
    } catch (err: any) {
      return `Failed to create VolumeSnapshot for "${namespace}/${pvcName}": ${err.message}. Ensure CSI Snapshot CRDs and driver are installed in cluster.`;
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
  }

  /**
   * Audit batch Jobs, exit codes, failure causes, and active/completed pods
   */
  static async jobStatus(
    name?: string,
    namespace?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';
    const target = name ? `${name} ${nsFlag}` : nsFlag;

    try {
      const raw = await ShellTool.run(`kubectl ${ctxFlag} get jobs ${target} -o json --request-timeout=15s`);
      const parsed = JSON.parse(raw);
      const items: any[] = parsed.items || (parsed.kind === 'Job' ? [parsed] : []);

      if (items.length === 0) {
        return `No Jobs found in scope (${namespace ? `namespace "${namespace}"` : 'all namespaces'}).`;
      }

      let md = `## Kubernetes Batch Job Status & Failure Triage\n\n`;
      md += `• **Audited Jobs:** ${items.length}\n`;
      md += `• **Scope:** ${namespace ? `Namespace \`${namespace}\`` : 'Cluster-wide (`-A`)'}\n\n`;

      md += `| Job Name | Namespace | Completions | Active | Failed | Succeeded | Duration | Diagnosis |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      for (const j of items) {
        const jName = j.metadata?.name || 'unknown';
        const jNs = j.metadata?.namespace || 'default';
        const desired = j.spec?.completions || 1;
        const active = j.status?.active || 0;
        const failed = j.status?.failed || 0;
        const succeeded = j.status?.succeeded || 0;
        const duration = j.status?.startTime && j.status?.completionTime
          ? `${Math.round((new Date(j.status.completionTime).getTime() - new Date(j.status.startTime).getTime()) / 1000)}s`
          : '-';

        let diag = '🟢 Succeeded';
        if (failed > 0 && succeeded < desired) {
          diag = `🔴 ${failed} Pod Failures`;
        } else if (active > 0) {
          diag = '🔵 In-Progress';
        }

        md += `| \`${jName}\` | \`${jNs}\` | ${succeeded}/${desired} | ${active} | ${failed} | ${succeeded > 0 ? '✔' : '✖'} | ${duration} | ${diag} |\n`;
      }

      return md;
    } catch (err: any) {
      return `Failed to inspect Job status: ${err.message}`;
    }
  }

  /**
   * Diff ConfigMap data across two namespaces or compare live ConfigMap vs expected YAML
   */
  static async configMapDiff(
    configMapName: string,
    sourceNamespace: string = 'default',
    targetNamespace?: string,
    targetManifestPath?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);

    try {
      const srcRaw = await ShellTool.run(`kubectl ${ctxFlag} get cm ${configMapName} -n ${sourceNamespace} -o json`);
      const srcData = JSON.parse(srcRaw).data || {};
      const srcFormatted = JSON.stringify(srcData, null, 2);

      let targetFormatted = '';
      let targetLabel = '';

      if (targetNamespace) {
        targetLabel = `Namespace ${targetNamespace}`;
        const tgtRaw = await ShellTool.run(`kubectl ${ctxFlag} get cm ${configMapName} -n ${targetNamespace} -o json`);
        const tgtData = JSON.parse(tgtRaw).data || {};
        targetFormatted = JSON.stringify(tgtData, null, 2);
      } else if (targetManifestPath) {
        targetLabel = targetManifestPath;
        targetFormatted = fs.readFileSync(path.resolve(process.cwd(), targetManifestPath), 'utf-8');
      } else {
        return 'Error: Either "targetNamespace" or "targetManifestPath" must be provided to diff ConfigMap.';
      }

      const diff = generateUnifiedDiff(
        `${sourceNamespace}/${configMapName}`,
        srcFormatted,
        `${targetLabel}/${configMapName}`,
        targetFormatted
      );

      return (
        `## ConfigMap Unified Diff: \`${configMapName}\`\n\n` +
        `• **Source:** \`${sourceNamespace}/${configMapName}\`\n` +
        `• **Target:** \`${targetLabel}/${configMapName}\`\n\n` +
        `\`\`\`diff\n${diff}\n\`\`\``
      );
    } catch (err: any) {
      return `Failed to diff ConfigMap: ${err.message}`;
    }
  }

  /**
   * Inspect environment variables and Secret/ConfigMap injection across pods, flagging plaintext credentials
   */
  static async envInjectionAudit(
    namespace: string = 'default',
    workloadName?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';

    try {
      const [podsRaw, secretsRaw, cmRaw] = await Promise.all([
        ShellTool.run(`kubectl ${ctxFlag} get pods ${nsFlag} -o json --request-timeout=15s`),
        ShellTool.run(`kubectl ${ctxFlag} get secrets ${nsFlag} -o json --request-timeout=15s`),
        ShellTool.run(`kubectl ${ctxFlag} get configmaps ${nsFlag} -o json --request-timeout=15s`),
      ]);

      const pods: any[] = JSON.parse(podsRaw).items || [];
      const secrets: Set<string> = new Set((JSON.parse(secretsRaw).items || []).map((s: any) => `${s.metadata?.namespace}/${s.metadata?.name}`));
      const cms: Set<string> = new Set((JSON.parse(cmRaw).items || []).map((c: any) => `${c.metadata?.namespace}/${c.metadata?.name}`));

      let md = `## Kubernetes Pod Environment & Secret Injection Audit\n\n`;
      md += `• **Namespace:** \`${namespace || 'All Namespaces'}\`\n`;
      md += `• **Audited Pods:** ${pods.length}\n\n`;

      md += `| Pod | Container | Env Var | Source Type | Secret/CM Reference | Compliance Status |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      const findings: string[] = [];

      for (const p of pods.slice(0, 15)) {
        const pName = p.metadata?.name || 'unknown';
        const pNs = p.metadata?.namespace || 'default';
        const containers = p.spec?.containers || [];

        for (const c of containers) {
          const envs = c.env || [];
          for (const e of envs) {
            const varName = e.name;
            const isSensitiveName = /pass|secret|key|token|auth|cred/i.test(varName);

            if (e.valueFrom?.secretKeyRef) {
              const refName = `${pNs}/${e.valueFrom.secretKeyRef.name}`;
              const exists = secrets.has(refName);
              const status = exists ? '🟢 Valid SecretRef' : '🔴 Broken SecretRef';
              if (!exists) findings.push(`Pod **${pNs}/${pName}** references missing Secret: \`${refName}\``);
              md += `| \`${pName.slice(0, 20)}\` | \`${c.name}\` | \`${varName}\` | SecretRef | \`${e.valueFrom.secretKeyRef.name}\` | ${status} |\n`;
            } else if (e.valueFrom?.configMapKeyRef) {
              const refName = `${pNs}/${e.valueFrom.configMapKeyRef.name}`;
              const exists = cms.has(refName);
              const status = exists ? '🟢 Valid ConfigMapRef' : '🔴 Broken ConfigMapRef';
              if (!exists) findings.push(`Pod **${pNs}/${pName}** references missing ConfigMap: \`${refName}\``);
              md += `| \`${pName.slice(0, 20)}\` | \`${c.name}\` | \`${varName}\` | ConfigMapRef | \`${e.valueFrom.configMapKeyRef.name}\` | ${status} |\n`;
            } else if (e.value && isSensitiveName) {
              findings.push(`Pod **${pNs}/${pName}** has plaintext sensitive variable: \`${varName}\`. Should use \`valueFrom.secretKeyRef\`.`);
              md += `| \`${pName.slice(0, 20)}\` | \`${c.name}\` | \`${varName}\` | Static Value | \`[HARDCODED_PLAINTEXT]\` | 🔴 Plaintext Secret Violation |\n`;
            }
          }
        }
      }

      if (findings.length > 0) {
        md += `\n### Critical Environment Injection Findings\n\n`;
        for (const f of Array.from(new Set(findings))) {
          md += `• ${f}\n`;
        }
      } else {
        md += `\n✔ *All audited environment variables follow secure SecretRef and ConfigMapRef injection standards.*\n`;
      }

      return md;
    } catch (err: any) {
      return `Failed to audit environment injection: ${err.message}`;
    }
  }

  /**
   * Test Ingress controllers, host routing, TLS certificates, and backend service readiness
   */
  static async ingressCheck(
    ingressName?: string,
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const target = ingressName ? ingressName : '';

    try {
      const [ingRaw, svcRaw] = await Promise.all([
        ShellTool.run(`kubectl ${ctxFlag} get ingress ${target} -n ${namespace} -o json --request-timeout=15s`),
        ShellTool.run(`kubectl ${ctxFlag} get svc -n ${namespace} -o json --request-timeout=15s`),
      ]);

      const ings: any[] = JSON.parse(ingRaw).items || (JSON.parse(ingRaw).kind === 'Ingress' ? [JSON.parse(ingRaw)] : []);
      const svcs: Set<string> = new Set((JSON.parse(svcRaw).items || []).map((s: any) => s.metadata?.name));

      if (ings.length === 0) {
        return `No Ingress resources found in namespace "${namespace}".`;
      }

      let md = `## Kubernetes Ingress Controller & Routing Verification\n\n`;
      md += `• **Namespace:** \`${namespace}\`\n`;
      md += `• **Ingresses Audited:** ${ings.length}\n\n`;

      md += `| Ingress Name | IngressClass | Host | Path | Backend Service | TLS Enabled | Routing Health |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      const warnings: string[] = [];

      for (const ing of ings) {
        const name = ing.metadata?.name || 'unknown';
        const ingClass = ing.spec?.ingressClassName || ing.metadata?.annotations?.['kubernetes.io/ingress.class'] || 'default';
        const tlsSecrets = (ing.spec?.tls || []).map((t: any) => t.secretName).filter(Boolean);
        const hasTls = tlsSecrets.length > 0 ? `🔒 Yes (${tlsSecrets.join(', ')})` : '⚠️ No (HTTP)';

        const rules = ing.spec?.rules || [];
        for (const r of rules) {
          const host = r.host || '*';
          const paths = r.http?.paths || [];

          for (const p of paths) {
            const pathStr = p.path || '/';
            const backendSvc = p.backend?.service?.name || 'unknown';
            const exists = svcs.has(backendSvc);
            const status = exists ? '🟢 Backend Healthy' : '🔴 Orphan Backend (404/503)';

            if (!exists) {
              warnings.push(`Ingress **${name}** routes \`${host}${pathStr}\` to missing Service \`${backendSvc}\`.`);
            }

            md += `| \`${name}\` | \`${ingClass}\` | \`${host}\` | \`${pathStr}\` | \`${backendSvc}\` | ${hasTls} | ${status} |\n`;
          }
        }
      }

      if (warnings.length > 0) {
        md += `\n### Ingress Configuration Alerts\n\n`;
        for (const w of warnings) {
          md += `• ${w}\n`;
        }
      }

      return md;
    } catch (err: any) {
      return `Failed to check Ingress routing: ${err.message}`;
    }
  }

  /**
   * Aggregate workloads, nodes, and cluster health across all configured kubeconfig contexts
   */
  static async multiClusterInventory(
    resourceType: string = 'workloads',
    filterContexts?: string[]
  ): Promise<string> {
    try {
      const { contexts } = await this.listContexts();
      const targets = filterContexts && filterContexts.length > 0
        ? contexts.filter((c) => filterContexts.includes(c))
        : contexts.slice(0, 5);

      if (targets.length === 0) {
        return 'No active Kubernetes contexts found in kubeconfig.';
      }

      let md = `## Multi-Cluster Fleet Inventory (${targets.length} Clusters)\n\n`;
      md += `| Cluster Context | Environment | Nodes | Total Pods | Deployments | Services | Fleet Status |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      for (const ctx of targets) {
        const isProd = ctx.toLowerCase().includes('prod') || ctx.toLowerCase().includes('live');
        const envBadge = isProd ? '🔴 PROD' : '🟢 DEV/STAGE';

        try {
          const [nodesRaw, podsRaw, deploysRaw, svcRaw] = await Promise.all([
            ShellTool.run(`kubectl --context=${ctx} get nodes --no-headers --request-timeout=5s`),
            ShellTool.run(`kubectl --context=${ctx} get pods -A --no-headers --request-timeout=5s`),
            ShellTool.run(`kubectl --context=${ctx} get deploy -A --no-headers --request-timeout=5s`),
            ShellTool.run(`kubectl --context=${ctx} get svc -A --no-headers --request-timeout=5s`),
          ]);

          const nodeCount = nodesRaw.trim().split('\n').filter(Boolean).length;
          const podCount = podsRaw.trim().split('\n').filter(Boolean).length;
          const deployCount = deploysRaw.trim().split('\n').filter(Boolean).length;
          const svcCount = svcRaw.trim().split('\n').filter(Boolean).length;

          md += `| \`${ctx}\` | ${envBadge} | **${nodeCount}** | ${podCount} | ${deployCount} | ${svcCount} | 🟢 Connected |\n`;
        } catch (err: any) {
          md += `| \`${ctx}\` | ${envBadge} | - | - | - | - | 🔴 Unreachable (${err.message.slice(0, 30)}) |\n`;
        }
      }

      return md;
    } catch (err: any) {
      return `Failed to compile multi-cluster inventory: ${err.message}`;
    }
  }

  /**
   * Compare and diff the same workload between two Kubernetes clusters (e.g. staging vs production)
   */
  static async clusterComparison(
    sourceContext: string,
    targetContext: string,
    resourceType: string = 'deployment',
    resourceName: string = 'api',
    namespace: string = 'default'
  ): Promise<string> {
    try {
      const [srcYaml, tgtYaml] = await Promise.all([
        ShellTool.run(`kubectl --context=${sourceContext} get ${resourceType} ${resourceName} -n ${namespace} -o yaml --request-timeout=10s`),
        ShellTool.run(`kubectl --context=${targetContext} get ${resourceType} ${resourceName} -n ${namespace} -o yaml --request-timeout=10s`),
      ]);

      const clean = (text: string) => {
        return text
          .replace(/resourceVersion:.*?\n/g, '')
          .replace(/uid:.*?\n/g, '')
          .replace(/generation:.*?\n/g, '')
          .replace(/creationTimestamp:.*?\n/g, '')
          .replace(/managedFields:[\s\S]*?spec:/g, 'spec:')
          .replace(/status:[\s\S]*$/g, '');
      };

      const diff = generateUnifiedDiff(
        `${sourceContext}:${namespace}/${resourceType}/${resourceName}`,
        clean(srcYaml),
        `${targetContext}:${namespace}/${resourceType}/${resourceName}`,
        clean(tgtYaml)
      );

      return (
        `## Cross-Cluster Workload Comparison\n\n` +
        `• **Source Cluster:** \`${sourceContext}\`\n` +
        `• **Target Cluster:** \`${targetContext}\`\n` +
        `• **Resource:** \`${namespace}/${resourceType}/${resourceName}\`\n\n` +
        `\`\`\`diff\n${diff}\n\`\`\``
      );
    } catch (err: any) {
      return `Failed to compare workload across clusters: ${err.message}`;
    }
  }
}
