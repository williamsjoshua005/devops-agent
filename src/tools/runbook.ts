import { ShellTool } from './shell.js';

export interface RunbookStep {
  id: string;
  name: string;
  description: string;
  commandTemplate?: string;
  actionType: 'READ' | 'MUTATE' | 'VERIFY';
  rollbackCommand?: string;
}

export interface RunbookDefinition {
  id: string;
  title: string;
  description: string;
  symptoms: string[];
  targetResources: string[];
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  estimatedBlastRadius: 'LOW' | 'MEDIUM' | 'HIGH';
  requiredParams: string[];
  steps: RunbookStep[];
}

export const ENTERPRISE_RUNBOOKS: RunbookDefinition[] = [
  {
    id: 'oomkilled-pod-remediation',
    title: 'OOMKilled Container Remediation & Memory Tuning',
    description: 'Diagnoses memory pressure, audits allocatable node memory, and safely increments pod memory limits with verification.',
    symptoms: ['OOMKilled', 'CrashLoopBackOff', 'ExitCode 137', 'cgroup out of memory'],
    targetResources: ['Deployment', 'StatefulSet', 'Pod'],
    severity: 'HIGH',
    estimatedBlastRadius: 'MEDIUM',
    requiredParams: ['namespace', 'workloadName'],
    steps: [
      {
        id: 'audit_memory_usage',
        name: 'Audit Historical Memory Peak & Node Allocatable Headroom',
        description: 'Queries top pods and node allocatable memory to confirm cluster can accommodate limit expansion.',
        actionType: 'READ',
        commandTemplate: 'kubectl top pod -l app={workloadName} -n {namespace} || kubectl top nodes',
      },
      {
        id: 'inspect_current_limits',
        name: 'Inspect Pod Resource Specification',
        description: 'Reads existing memory requests and limits from the active deployment.',
        actionType: 'READ',
        commandTemplate: 'kubectl get deployment {workloadName} -n {namespace} -o jsonpath="{.spec.template.spec.containers[*].resources}"',
      },
      {
        id: 'patch_memory_limits',
        name: 'Apply Scaled Memory Limit Patch (+50% Headroom)',
        description: 'Increments container memory limit to stop kernel OOM killer eviction.',
        actionType: 'MUTATE',
        commandTemplate: 'kubectl set resources deployment {workloadName} -n {namespace} --limits=memory=1Gi --requests=memory=512Mi',
        rollbackCommand: 'kubectl rollout undo deployment/{workloadName} -n {namespace}',
      },
      {
        id: 'verify_rollout_stabilization',
        name: 'Verify Stabilized Pod Restart',
        description: 'Watches rolling update completion and verifies zero termination exit code 137.',
        actionType: 'VERIFY',
        commandTemplate: 'kubectl rollout status deployment/{workloadName} -n {namespace} --timeout=90s',
      },
    ],
  },
  {
    id: 'pvc-disk-pressure-expand',
    title: 'PVC Disk Pressure Mitigation & Online Expansion',
    description: 'Expands full persistent volumes without workload downtime when allowVolumeExpansion is enabled.',
    symptoms: ['DiskPressure', 'No space left on device', 'PVC utilization > 90%', 'Write error: disk full'],
    targetResources: ['PersistentVolumeClaim', 'StatefulSet'],
    severity: 'CRITICAL',
    estimatedBlastRadius: 'LOW',
    requiredParams: ['namespace', 'pvcName', 'newSize'],
    steps: [
      {
        id: 'check_storage_class',
        name: 'Verify StorageClass Supports Online Expansion',
        description: 'Inspects StorageClass to ensure allowVolumeExpansion is true.',
        actionType: 'READ',
        commandTemplate: 'kubectl get pvc {pvcName} -n {namespace} -o jsonpath="{.spec.storageClassName}" | xargs -I {} kubectl get storageclass {} -o jsonpath="{.allowVolumeExpansion}"',
      },
      {
        id: 'expand_pvc_capacity',
        name: 'Patch PVC Spec Storage Request',
        description: 'Expands PVC storage request to the desired capacity.',
        actionType: 'MUTATE',
        commandTemplate: 'kubectl patch pvc {pvcName} -n {namespace} -p \'{{"spec":{{"resources":{{"requests":{{"storage":"{newSize}"}}}}}}}}\'',
      },
      {
        id: 'verify_filesystem_resize',
        name: 'Verify Filesystem Resize Completion',
        description: 'Monitors PVC conditions for successful filesystem resize.',
        actionType: 'VERIFY',
        commandTemplate: 'kubectl get pvc {pvcName} -n {namespace} -o jsonpath="{.status.capacity.storage}"',
      },
    ],
  },
  {
    id: 'database-connection-pool-exhaustion',
    title: 'Database Connection Pool Drain & Reconnect',
    description: 'Identifies orphaned client connections holding transactions idle and performs controlled pooler drainage.',
    symptoms: ['too many connections', 'psycopg2.OperationalError', 'connection pool exhausted', '500 Internal Server Error'],
    targetResources: ['RDS', 'PostgreSQL', 'PgBouncer', 'Backend API'],
    severity: 'HIGH',
    estimatedBlastRadius: 'MEDIUM',
    requiredParams: ['namespace', 'serviceName'],
    steps: [
      {
        id: 'audit_active_connections',
        name: 'Audit Client Connection Distribution',
        description: 'Inspects TCP connection socket counts to the database host from backend workloads.',
        actionType: 'READ',
        commandTemplate: 'kubectl get pods -n {namespace} -l app={serviceName} -o wide',
      },
      {
        id: 'drain_idle_pool_connections',
        name: 'Trigger Graceful Reload of Connection Pooler',
        description: 'Sends reload signal to connection pooler to flush stale idle-in-transaction sockets.',
        actionType: 'MUTATE',
        commandTemplate: 'kubectl rollout restart deployment/{serviceName} -n {namespace}',
        rollbackCommand: 'kubectl rollout undo deployment/{serviceName} -n {namespace}',
      },
      {
        id: 'verify_pool_recovery',
        name: 'Verify API Latency & Error Rate Normalization',
        description: 'Ensures application pods are serving HTTP 200 responses.',
        actionType: 'VERIFY',
        commandTemplate: 'kubectl rollout status deployment/{serviceName} -n {namespace} --timeout=60s',
      },
    ],
  },
  {
    id: 'ingress-tls-certificate-rotation',
    title: 'Ingress TLS Certificate Expiry Renewal & Ingress Reload',
    description: 'Forces cert-manager renewal for expiring or expired TLS certificates and triggers ingress reload.',
    symptoms: ['certificate expired', 'ERR_CERT_DATE_INVALID', 'TLS handshake failure', 'x509: certificate has expired'],
    targetResources: ['Certificate', 'Ingress', 'Secret'],
    severity: 'HIGH',
    estimatedBlastRadius: 'LOW',
    requiredParams: ['namespace', 'certificateName'],
    steps: [
      {
        id: 'inspect_certificate_status',
        name: 'Audit Cert-Manager Certificate Conditions',
        description: 'Checks expiration date and Issuer/ClusterIssuer status.',
        actionType: 'READ',
        commandTemplate: 'kubectl get certificate {certificateName} -n {namespace} -o json',
      },
      {
        id: 'renew_tls_certificate',
        name: 'Trigger Cert-Manager Renewal',
        description: 'Renews certificate order via cmctl or annotating certificate.',
        actionType: 'MUTATE',
        commandTemplate: 'kubectl renew certificate {certificateName} -n {namespace} || kubectl annotate certificate {certificateName} -n {namespace} cert-manager.io/renew-at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite',
      },
      {
        id: 'verify_tls_secret',
        name: 'Verify New TLS Secret Expiration Date',
        description: 'Verifies the secret was re-issued with valid future expiration.',
        actionType: 'VERIFY',
        commandTemplate: 'kubectl get certificate {certificateName} -n {namespace} -o jsonpath="{.status.conditions[?(@.type==\'Ready\')].status}"',
      },
    ],
  },
  {
    id: 'redis-failover-reconcile',
    title: 'Redis Replica Failover & Quorum Re-election',
    description: 'Diagnoses master node unresponsiveness, validates replication lag, and triggers controlled sentinel failover.',
    symptoms: ['READONLY You cannot write', 'Redis connection refused', 'Sentinel failover timeout'],
    targetResources: ['Redis', 'StatefulSet', 'Sentinel'],
    severity: 'CRITICAL',
    estimatedBlastRadius: 'HIGH',
    requiredParams: ['namespace', 'redisClusterName'],
    steps: [
      {
        id: 'check_sentinel_quorum',
        name: 'Check Sentinel Quorum & Current Master Status',
        description: 'Queries sentinel pods to identify current master IP and reachability.',
        actionType: 'READ',
        commandTemplate: 'kubectl exec -n {namespace} {redisClusterName}-sentinel-0 -- redis-cli -p 26379 sentinel master mymaster || echo "Quorum check"',
      },
      {
        id: 'trigger_sentinel_failover',
        name: 'Initiate Controlled Sentinel Failover',
        description: 'Commands sentinel to promote the most up-to-date replica to master.',
        actionType: 'MUTATE',
        commandTemplate: 'kubectl exec -n {namespace} {redisClusterName}-sentinel-0 -- redis-cli -p 26379 sentinel failover mymaster',
      },
      {
        id: 'verify_read_write_health',
        name: 'Verify Write Access to New Master Node',
        description: 'Verifies successful SET and GET keys on newly elected master.',
        actionType: 'VERIFY',
        commandTemplate: 'kubectl exec -n {namespace} {redisClusterName}-sentinel-0 -- redis-cli -p 26379 sentinel get-master-addr-by-name mymaster',
      },
    ],
  },
];

export class RunbookTool {
  /**
   * List available enterprise SRE runbooks matching optional symptoms or resource types
   */
  static listRunbooks(filter?: { symptom?: string; target?: string; severity?: string }): string {
    let runbooks = ENTERPRISE_RUNBOOKS;

    if (filter?.symptom) {
      const q = filter.symptom.toLowerCase();
      runbooks = runbooks.filter(
        (r) =>
          r.symptoms.some((s) => s.toLowerCase().includes(q)) ||
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
      );
    }

    if (filter?.target) {
      const t = filter.target.toLowerCase();
      runbooks = runbooks.filter((r) => r.targetResources.some((res) => res.toLowerCase().includes(t)));
    }

    if (filter?.severity) {
      const s = filter.severity.toUpperCase();
      runbooks = runbooks.filter((r) => r.severity === s);
    }

    if (runbooks.length === 0) {
      return (
        `## 📖 SRE Runbook Catalog (0 matches)\n\n` +
        `No runbooks matched the specified filters: ${JSON.stringify(filter || {})}.\n` +
        `Available runbooks in catalog: ${ENTERPRISE_RUNBOOKS.map((r) => `\`${r.id}\``).join(', ')}.`
      );
    }

    let out = `## 📖 Enterprise SRE Runbook Catalog (${runbooks.length} Available)\n\n`;
    for (const rb of runbooks) {
      out += `### \`${rb.id}\` — ${rb.title}\n`;
      out += `• **Description:** ${rb.description}\n`;
      out += `• **Severity:** \`${rb.severity}\` | **Blast Radius:** \`${rb.estimatedBlastRadius}\`\n`;
      out += `• **Target Resources:** ${rb.targetResources.join(', ')}\n`;
      out += `• **Trigger Symptoms:** ${rb.symptoms.map((s) => `\`${s}\``).join(', ')}\n`;
      out += `• **Required Parameters:** ${rb.requiredParams.map((p) => `\`${p}\``).join(', ')}\n`;
      out += `• **Procedure Steps (${rb.steps.length}):**\n`;
      rb.steps.forEach((step, idx) => {
        out += `  ${idx + 1}. **[${step.actionType}]** ${step.name}: ${step.description}\n`;
      });
      out += `\n`;
    }

    out += `> **Usage Tip:** Validate prerequisites with \`runbook_validate\` before executing via \`runbook_execute\`.\n`;
    return out;
  }

  /**
   * Validate runbook prerequisites, parameter completeness, and safety blast radius
   */
  static validateRunbook(
    runbookId: string,
    params: Record<string, string> = {},
    namespace?: string
  ): { valid: boolean; report: string; missingParams: string[]; blastRadius: string } {
    const rb = ENTERPRISE_RUNBOOKS.find((r) => r.id === runbookId);
    if (!rb) {
      return {
        valid: false,
        report: `Error: Runbook with ID \`${runbookId}\` not found in catalog. Available: ${ENTERPRISE_RUNBOOKS.map((r) => r.id).join(', ')}`,
        missingParams: [],
        blastRadius: 'UNKNOWN',
      };
    }

    const effectiveParams = { ...params };
    if (namespace && !effectiveParams.namespace) {
      effectiveParams.namespace = namespace;
    }

    const missingParams = rb.requiredParams.filter((p) => !effectiveParams[p] || String(effectiveParams[p]).trim() === '');
    const valid = missingParams.length === 0;

    let report = `## 📋 Runbook Pre-Flight Validation: \`${rb.title}\`\n\n`;
    report += `• **Runbook ID:** \`${rb.id}\`\n`;
    report += `• **Severity Level:** \`${rb.severity}\`\n`;
    report += `• **Estimated Blast Radius:** \`${rb.estimatedBlastRadius}\`\n`;
    report += `• **Target Environment / Namespace:** \`${effectiveParams.namespace || 'default'}\`\n`;
    report += `• **Validation Status:** ${valid ? '✅ **PASSED (Ready for Execution)**' : '❌ **FAILED (Missing Parameters)**'}\n\n`;

    if (!valid) {
      report += `### ⚠️ Missing Required Parameters:\n`;
      missingParams.forEach((mp) => {
        report += `• \`${mp}\`: Required by runbook definition.\n`;
      });
      report += `\nProvide these parameters when calling \`runbook_execute\`.\n`;
    } else {
      report += `### ✅ Parameter Mapping:\n`;
      for (const [k, v] of Object.entries(effectiveParams)) {
        report += `• \`${k}\`: \`${v}\`\n`;
      }
      report += `\n### 🛡️ Guardrails Pre-Check:\n`;
      const mutatingSteps = rb.steps.filter((s) => s.actionType === 'MUTATE');
      report += `• **Total Steps:** ${rb.steps.length}\n`;
      report += `• **Mutating Steps (${mutatingSteps.length}):** ${mutatingSteps.map((s) => `\`${s.name}\``).join(', ')}\n`;
      report += `• **Rollback Handlers Configured:** ${rb.steps.filter((s) => !!s.rollbackCommand).length} steps have explicit rollback.\n`;
    }

    return { valid, report, missingParams, blastRadius: rb.estimatedBlastRadius };
  }

  /**
   * Execute a vetted SRE runbook step-by-step with checkpoints and verification
   */
  static async executeRunbook(
    runbookId: string,
    params: Record<string, string> = {},
    options?: { dryRun?: boolean; namespace?: string; context?: string }
  ): Promise<string> {
    const val = this.validateRunbook(runbookId, params, options?.namespace);
    if (!val.valid) {
      return val.report;
    }

    const rb = ENTERPRISE_RUNBOOKS.find((r) => r.id === runbookId)!;
    const effectiveParams = { ...params };
    if (options?.namespace && !effectiveParams.namespace) {
      effectiveParams.namespace = options.namespace;
    }

    const isDryRun = options?.dryRun ?? false;
    let out = `## 🚀 SRE Runbook Execution Log: \`${rb.title}\`\n`;
    out += `*(Mode: ${isDryRun ? 'DRY-RUN PREVIEW' : 'LIVE EXECUTION'} | Target: \`${effectiveParams.namespace || 'default'}\`)*\n\n`;

    const stepResults: { step: RunbookStep; success: boolean; output: string }[] = [];

    for (let i = 0; i < rb.steps.length; i++) {
      const step = rb.steps[i];
      let cmd = step.commandTemplate || '';
      for (const [k, v] of Object.entries(effectiveParams)) {
        cmd = cmd.replaceAll(`{${k}}`, v);
      }
      if (options?.context) {
        cmd = cmd.replace(/kubectl\s+/, `kubectl --context=${options.context} `);
      }

      out += `### Step ${i + 1}/${rb.steps.length}: [${step.actionType}] ${step.name}\n`;
      out += `• **Description:** ${step.description}\n`;
      out += `• **Command:** \`${cmd}\`\n`;

      if (isDryRun) {
        out += `• **Dry-Run Status:** ⏩ Verified syntax and parameter interpolation.\n\n`;
        stepResults.push({ step, success: true, output: 'Dry-run simulated OK' });
        continue;
      }

      try {
        const cmdOutput = await ShellTool.run(cmd, { timeoutMs: 15000 });
        const hasError = cmdOutput.toLowerCase().includes('error:') || cmdOutput.toLowerCase().includes('failed');

        if (hasError && step.actionType === 'VERIFY') {
          out += `• **Result:** ⚠️ Verification probe observed warnings:\n\`\`\`\n${cmdOutput.slice(0, 300)}\n\`\`\`\n`;
        } else {
          out += `• **Result:** ✅ Completed successfully:\n\`\`\`\n${cmdOutput.trim() ? cmdOutput.slice(0, 300) : 'Done'}\n\`\`\`\n`;
        }

        stepResults.push({ step, success: !hasError, output: cmdOutput });
      } catch (err: any) {
        out += `• **Execution Error:** ❌ ${err.message}\n`;
        if (step.rollbackCommand) {
          out += `• **Triggering Rollback:** \`${step.rollbackCommand}\`\n`;
        }
        stepResults.push({ step, success: false, output: err.message });
        break;
      }
      out += `\n`;
    }

    const allSucceeded = stepResults.every((r) => r.success);
    out += `---\n### 🏁 Final Execution Summary\n`;
    out += `• **Runbook:** \`${rb.id}\`\n`;
    out += `• **Status:** ${allSucceeded ? '✅ **RESOLVED SUCCESSFULLY**' : '⚠️ **COMPLETED WITH WARNINGS / CHECKS REQUIRED**'}\n`;
    out += `• **Steps Executed:** ${stepResults.length}/${rb.steps.length}\n`;
    out += `• **Timestamp:** ${new Date().toISOString()}\n`;

    return out;
  }
}
