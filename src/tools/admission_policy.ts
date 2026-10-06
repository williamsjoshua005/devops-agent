import { ShellTool } from './shell.js';

export class AdmissionPolicyTool {
  private static getContextFlag(context?: string): string {
    return context ? `--context=${context}` : '';
  }

  /**
   * Audit live Kubernetes admission control policy compliance (Kyverno, OPA Gatekeeper, Pod Security Standards)
   */
  static async audit(namespace?: string, context?: string): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';

    // 1. Query standardized PolicyReport / ClusterPolicyReport CRDs (Kyverno / OPA / Trivy)
    const reportCmd = `kubectl ${ctxFlag} get policyreports,clusterpolicyreports ${nsFlag} -o json`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(reportCmd, { timeoutMs: 15000 });

      if (!output.startsWith('Error executing command') && output.trim().startsWith('{')) {
        const json = JSON.parse(output);
        const items: any[] = json.items || [];

        if (items.length > 0) {
          return this.formatPolicyReports(items);
        }
      }
    } catch {}

    // 2. Fallback: Audit Pod Security Standards (PSS) labels on namespaces
    const nsCmd = `kubectl ${ctxFlag} get namespaces -o json`.replace(/\s+/g, ' ');
    try {
      const nsOutput = await ShellTool.run(nsCmd, { timeoutMs: 15000 });
      if (!nsOutput.startsWith('Error') && nsOutput.trim().startsWith('{')) {
        const nsJson = JSON.parse(nsOutput);
        return this.formatPssAudit(nsJson.items || []);
      }
    } catch {}

    return (
      `## Kubernetes Admission Control & Policy Audit\n` +
      `*(No Kyverno or OPA Gatekeeper PolicyReports found in cluster)*\n\n` +
      `• **Status:** Admission controllers (Kyverno / Gatekeeper) not actively reporting.\n` +
      `• **Recommendation:** Deploy Kyverno (\`helm install kyverno kyverno/kyverno\`) to enforce CIS benchmarks and Pod Security Standards automatically.`
    );
  }

  private static formatPolicyReports(items: any[]): string {
    let totalPass = 0;
    let totalFail = 0;
    let totalWarn = 0;
    const violations: Array<{ policy: string; resource: string; severity: string; message: string }> = [];

    for (const item of items) {
      const summary = item.summary || {};
      totalPass += summary.pass || 0;
      totalFail += summary.fail || 0;
      totalWarn += summary.warn || 0;

      for (const res of item.results || []) {
        if (res.result === 'fail' || res.result === 'warn') {
          violations.push({
            policy: res.policy || 'Policy Violation',
            resource: `${res.resources?.[0]?.kind || 'Workload'}/${res.resources?.[0]?.name || 'unknown'}`,
            severity: res.severity || 'medium',
            message: res.message || 'Non-compliant configuration detected.',
          });
        }
      }
    }

    let report = `## Cluster Admission Policy Compliance (Kyverno / OPA Gatekeeper)\n\n`;
    report += `### Summary Metrics:\n`;
    report += `• 🟢 **Passed Rules:** \`${totalPass}\`\n`;
    report += `• 🔴 **Failed Violations:** \`${totalFail}\`\n`;
    report += `• 🟡 **Warnings:** \`${totalWarn}\`\n\n`;

    if (violations.length === 0) {
      report += `✔ **Zero Policy Violations:** All inspected workloads conform to Pod Security Standards and security baseline policies.\n`;
    } else {
      report += `### High-Priority Policy Violations:\n`;
      report += `| Policy Rule | Target Workload | Severity | Violation Detail |\n`;
      report += `| :--- | :--- | :--- | :--- |\n`;
      for (const v of violations.slice(0, 10)) {
        const sevBadge = v.severity === 'critical' ? '🔴 Critical' : v.severity === 'high' ? '🟠 High' : '🟡 Medium';
        report += `| \`${v.policy}\` | \`${v.resource}\` | ${sevBadge} | ${v.message.slice(0, 50)}... |\n`;
      }
    }

    return report;
  }

  private static formatPssAudit(namespaces: any[]): string {
    let report = `## Pod Security Standards (PSS) Namespace Audit\n\n`;
    report += `| Namespace | Enforce Level | Audit Level | Warn Level |\n`;
    report += `| :--- | :--- | :--- | :--- |\n`;

    for (const ns of namespaces.slice(0, 10)) {
      const name = ns.metadata?.name || 'unknown';
      const labels = ns.metadata?.labels || {};
      const enforce = labels['pod-security.kubernetes.io/enforce'] || 'privileged (unrestricted)';
      const audit = labels['pod-security.kubernetes.io/audit'] || '-';
      const warn = labels['pod-security.kubernetes.io/warn'] || '-';

      const enforceBadge =
        enforce === 'restricted'
          ? '🟢 restricted'
          : enforce === 'baseline'
          ? '🟡 baseline'
          : '🔴 privileged (unrestricted)';

      report += `| \`${name}\` | ${enforceBadge} | \`${audit}\` | \`${warn}\` |\n`;
    }

    report += `\n**Recommendation:** Upgrade production namespaces to \`pod-security.kubernetes.io/enforce=baseline\` or \`restricted\` to prevent root container escalation.`;
    return report;
  }
}
