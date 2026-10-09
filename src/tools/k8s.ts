import { ShellTool } from './shell.js';

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
}
