import { ShellTool } from './shell.js';

export interface FinOpsFinding {
  resource: string;
  category: 'Unattached Storage' | 'Idle LoadBalancer' | 'Orphan Cloud Disk' | 'Over-Provisioned';
  detail: string;
  recommendation: string;
}

export class FinOpsTool {
  /**
   * Audit Kubernetes and Cloud resources for waste, unattached storage, and idle load balancers
   */
  static async audit(namespace?: string): Promise<string> {
    const findings: FinOpsFinding[] = [];
    const nsFlag = namespace ? `-n ${namespace}` : '-A';

    // 1. Audit Unattached PVCs
    try {
      const pvcOutput = await ShellTool.run(`kubectl get pvc ${nsFlag} -o json`);
      if (!pvcOutput.startsWith('Error executing command')) {
        const pvcJson = JSON.parse(pvcOutput);
        const podsOutput = await ShellTool.run(`kubectl get pods ${nsFlag} -o json`);
        const podsJson = !podsOutput.startsWith('Error') ? JSON.parse(podsOutput) : { items: [] };

        // Collect all mounted PVC names
        const mountedPvcNames = new Set<string>();
        for (const pod of podsJson.items || []) {
          for (const vol of pod.spec?.volumes || []) {
            if (vol.persistentVolumeClaim?.claimName) {
              mountedPvcNames.add(`${pod.metadata.namespace}/${vol.persistentVolumeClaim.claimName}`);
            }
          }
        }

        for (const pvc of pvcJson.items || []) {
          const key = `${pvc.metadata.namespace}/${pvc.metadata.name}`;
          const capacity = pvc.status?.capacity?.storage || 'unknown';
          if (!mountedPvcNames.has(key)) {
            findings.push({
              resource: `PVC: ${key} (${capacity})`,
              category: 'Unattached Storage',
              detail: `PersistentVolumeClaim is Bound but has zero pods attached to it.`,
              recommendation: `Verify if data is needed; backup snapshot and delete to avoid recurring disk storage charges.`,
            });
          }
        }
      }
    } catch {}

    // 2. Audit Idle LoadBalancer Services (empty endpoints)
    try {
      const svcOutput = await ShellTool.run(`kubectl get svc ${nsFlag} --field-selector spec.type=LoadBalancer -o json`);
      if (!svcOutput.startsWith('Error executing command')) {
        const svcJson = JSON.parse(svcOutput);
        for (const svc of svcJson.items || []) {
          const key = `${svc.metadata.namespace}/${svc.metadata.name}`;
          const epOutput = await ShellTool.run(`kubectl get endpoints ${svc.metadata.name} -n ${svc.metadata.namespace} -o json`);
          if (!epOutput.startsWith('Error executing command')) {
            const epJson = JSON.parse(epOutput);
            const hasSubsets = epJson.subsets && epJson.subsets.length > 0;
            if (!hasSubsets) {
              findings.push({
                resource: `Service (LoadBalancer): ${key}`,
                category: 'Idle LoadBalancer',
                detail: `LoadBalancer service has no active pod endpoints receiving traffic.`,
                recommendation: `Cloud providers charge per active LoadBalancer (~$18-25/month). Delete service if obsolete or fix selector.`,
              });
            }
          }
        }
      }
    } catch {}

    // 3. Audit Orphan Azure Managed Disks
    try {
      const azOutput = await ShellTool.run('az disk list --query "[?managedBy==null].{name:name, resourceGroup:resourceGroup, diskSizeGb:diskSizeGb}" -o json');
      if (!azOutput.startsWith('Error executing command') && azOutput.trim().startsWith('[')) {
        const orphanDisks = JSON.parse(azOutput);
        for (const disk of orphanDisks) {
          findings.push({
            resource: `Azure Disk: ${disk.name} (${disk.diskSizeGb} GB)`,
            category: 'Orphan Cloud Disk',
            detail: `Managed disk in resource group "${disk.resourceGroup}" is unattached (managedBy is null).`,
            recommendation: `Orphaned disks incur monthly Azure storage fees. Archive or delete if decommissioned.`,
          });
        }
      }
    } catch {}

    return this.formatReport(findings);
  }

  private static formatReport(findings: FinOpsFinding[]): string {
    let report = `## FinOps & Cloud Waste Audit Report\n`;

    if (findings.length === 0) {
      report += `✔ No obvious idle resources detected. Cluster and storage are lean and clean!\n`;
      return report;
    }

    report += `**Found ${findings.length} potentially wasteful or orphaned resources:**\n\n`;
    report += `| Resource | Category | Issue Detail | Recommended FinOps Action |\n`;
    report += `| :--- | :--- | :--- | :--- |\n`;

    for (const f of findings) {
      report += `| \`${f.resource}\` | **${f.category}** | ${f.detail} | ${f.recommendation} |\n`;
    }

    return report;
  }
}
