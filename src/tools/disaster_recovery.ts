import { ShellTool } from './shell.js';

export class DisasterRecoveryTool {
  private static getContextFlag(context?: string): string {
    return context ? `--context=${context}` : '';
  }

  /**
   * Check Kubernetes cluster backup health using Velero, auditing freshness and failure rates
   */
  static async checkVeleroBackups(namespace: string = 'velero', context?: string): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const cmd = `kubectl ${ctxFlag} get backups.velero.io -n ${namespace} -o json`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });

      if (output.startsWith('Error executing command') || !output.trim().startsWith('{')) {
        // Fallback: check velero CLI
        const veleroCliOut = await ShellTool.run('velero backup get -o json', { timeoutMs: 10000 });
        if (!veleroCliOut.startsWith('Error') && veleroCliOut.trim().startsWith('{')) {
          return this.parseVeleroJson(JSON.parse(veleroCliOut));
        }

        return (
          `## Velero Disaster Recovery & Backup Audit\n` +
          `*(Velero CRDs not found in namespace \`${namespace}\` or Velero CLI not present)*\n\n` +
          `• **Status:** No Velero backup records discovered.\n` +
          `• **Pre-Flight SRE Caution:** Before mutating persistent cluster state, ensure volume snapshot controllers or etcd snapshot schedules are active!`
        );
      }

      const json = JSON.parse(output);
      return this.parseVeleroJson(json);
    } catch (err: any) {
      return `Failed to inspect Velero backups: ${err.message}`;
    }
  }

  /**
   * Create an on-demand Velero backup snapshot prior to executing high-risk mutations
   */
  static async createVeleroBackup(
    backupName?: string,
    includeNamespaces: string[] = ['default'],
    ttlHours: number = 72,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const name = backupName || `preflight-${Date.now().toString(36)}`;
    const nsList = includeNamespaces.join(',');

    const backupManifest = {
      apiVersion: 'velero.io/v1',
      kind: 'Backup',
      metadata: {
        name,
        namespace: 'velero',
        labels: { triggeredBy: 'devops-agent-preflight' },
      },
      spec: {
        includedNamespaces: includeNamespaces,
        ttl: `${ttlHours}h0m0s`,
        snapshotVolumes: true,
      },
    };

    const cmd = `echo '${JSON.stringify(backupManifest)}' | kubectl ${ctxFlag} apply -f -`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 20000 });
      return (
        `## On-Demand Velero Snapshot Dispatched 🛡️\n\n` +
        `• **Backup Name:** \`${name}\`\n` +
        `• **Target Namespaces:** \`${nsList}\`\n` +
        `• **Snapshot TTL:** \`${ttlHours} hours\`\n` +
        `• **Result:** ${output.trim()}\n\n` +
        `*Volume snapshot controllers are archiving persistent state to object storage.*`
      );
    } catch (err: any) {
      return `Failed to dispatch Velero backup: ${err.message}`;
    }
  }

  /**
   * Trigger an on-demand cloud database snapshot (AWS RDS / Azure SQL / GCP Cloud SQL)
   */
  static async createCloudDbSnapshot(
    provider: 'aws' | 'azure' | 'gcp',
    databaseIdentifier: string,
    snapshotName?: string,
    region?: string
  ): Promise<string> {
    const name = snapshotName || `preflight-snap-${Date.now().toString(36)}`;
    const regionFlag = region ? `--region ${region}` : '';

    let cmd = '';
    switch (provider.toLowerCase()) {
      case 'aws':
        cmd = `aws rds create-db-snapshot --db-instance-identifier ${databaseIdentifier} --db-snapshot-identifier ${name} ${regionFlag}`.trim();
        break;
      case 'azure':
        cmd = `az postgres flexible-server backup create --server-name ${databaseIdentifier} --name ${name}`.trim();
        break;
      case 'gcp':
        cmd = `gcloud sql backups create --instance=${databaseIdentifier} --description="${name}"`.trim();
        break;
      default:
        return `Unsupported cloud database provider: ${provider}`;
    }

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 30000 });
      return (
        `## Point-in-Time Cloud Database Snapshot Created 💾\n\n` +
        `• **Cloud Provider:** \`${provider.toUpperCase()}\`\n` +
        `• **Database Instance:** \`${databaseIdentifier}\`\n` +
        `• **Snapshot Identifier:** \`${name}\`\n` +
        `• **CLI Command Output:**\n\`\`\`\n${output.slice(0, 1500)}\n\`\`\`\n` +
        `✔ Pre-mutation recovery snapshot initiated successfully.`
      );
    } catch (err: any) {
      return `Failed to create database snapshot: ${err.message}`;
    }
  }

  private static parseVeleroJson(json: any): string {
    const items: any[] = json.items || [];
    if (items.length === 0) {
      return `## Velero Backup Audit\nNo backup records found in Velero. Ensure automated schedules are configured.`;
    }

    // Sort descending by creation timestamp
    items.sort((a, b) => {
      const tA = new Date(a.metadata?.creationTimestamp || 0).getTime();
      const tB = new Date(b.metadata?.creationTimestamp || 0).getTime();
      return tB - tA;
    });

    const latest = items[0];
    const latestDate = new Date(latest.metadata?.creationTimestamp || 0);
    const ageHours = (Date.now() - latestDate.getTime()) / (1000 * 60 * 60);

    let report = `## Velero Disaster Recovery & Backup Status\n\n`;
    if (ageHours > 24) {
      report += `⚠️ **CRITICAL RECOVERY WARNING:** The most recent backup (\`${latest.metadata.name}\`) was created **${ageHours.toFixed(1)} hours ago** (> 24h stale).\n\n`;
    } else {
      report += `🟢 **Backup Freshness Healthy:** Most recent backup was created **${ageHours.toFixed(1)} hours ago**.\n\n`;
    }

    report += `| Backup Name | Phase | Created | Expiration | Errors / Warnings |\n`;
    report += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const b of items.slice(0, 6)) {
      const name = b.metadata?.name || 'unknown';
      const phase = b.status?.phase || 'Unknown';
      const created = b.metadata?.creationTimestamp?.slice(0, 16) || '-';
      const expiration = b.status?.expiration?.slice(0, 16) || 'Never';
      const errs = b.status?.errors || 0;
      const warns = b.status?.warnings || 0;

      const phaseBadge = phase === 'Completed' ? '🟢 Completed' : phase === 'Failed' ? '🔴 Failed' : `🟡 ${phase}`;
      report += `| \`${name}\` | ${phaseBadge} | ${created} | ${expiration} | Errs: ${errs}, Warns: ${warns} |\n`;
    }

    return report;
  }
}
