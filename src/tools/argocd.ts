import { ShellTool } from './shell.js';

export interface ArgoResourceSync {
  group: string;
  kind: string;
  name: string;
  namespace: string;
  status: 'Synced' | 'OutOfSync';
  health?: string;
  hook?: boolean;
}

export class ArgoCdTool {
  private static getContextFlag(context?: string): string {
    return context ? `--context=${context}` : '';
  }

  /**
   * Get sync and health status of an Argo CD GitOps Application (or all applications)
   */
  static async getAppStatus(
    appName?: string,
    namespace: string = 'argocd',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);

    // Try querying the Application CRD directly via kubectl
    const target = appName ? appName : '';
    const cmd = `kubectl ${ctxFlag} get applications.argoproj.io ${target} -n ${namespace} -o json`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });

      if (output.startsWith('Error executing command') || !output.trim().startsWith('{')) {
        // Fallback: check if argocd CLI is available
        const cliCmd = `argocd app get ${appName || '--all'} -o json`;
        const cliOutput = await ShellTool.run(cliCmd, { timeoutMs: 10000 });
        if (!cliOutput.startsWith('Error') && cliOutput.trim().startsWith('{')) {
          return this.formatAppJson(JSON.parse(cliOutput));
        }

        return (
          `## Argo CD GitOps Application Status\n` +
          `No active Argo CD Applications found in namespace \`${namespace}\` or Argo CD CRDs are not installed in this cluster.\n` +
          `*(Verify that the Argo CD operator is deployed or specify the correct namespace with --namespace)*`
        );
      }

      const json = JSON.parse(output);
      if (json.items && Array.isArray(json.items)) {
        return this.formatAppList(json.items, namespace);
      } else {
        return this.formatAppJson(json);
      }
    } catch (err: any) {
      return `Failed to retrieve Argo CD application status: ${err.message}`;
    }
  }

  /**
   * Inspect out-of-sync manifest drift for an Argo CD application
   */
  static async diffApp(
    appName: string,
    namespace: string = 'argocd',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const cmd = `kubectl ${ctxFlag} get applications.argoproj.io ${appName} -n ${namespace} -o json`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });
      if (!output.trim().startsWith('{')) {
        return `Unable to locate Argo CD application "${appName}" in namespace "${namespace}".`;
      }

      const app = JSON.parse(output);
      const resources: any[] = app.status?.resources || [];
      const outOfSync = resources.filter((r) => r.status === 'OutOfSync');

      if (outOfSync.length === 0) {
        return (
          `## Argo CD Drift Analysis: \`${appName}\`\n` +
          `🟢 **Status: IN-SYNC**\n` +
          `All ${resources.length} declared Kubernetes resources match the Git repository (${app.spec?.source?.repoURL || 'Git'}). No cluster drift detected!`
        );
      }

      let report = `## Argo CD Drift Analysis: \`${appName}\`\n`;
      report += `⚠️ **Status: OUT-OF-SYNC (${outOfSync.length} resources drifted)**\n\n`;
      report += `| Kind | Resource Name | Namespace | Live Health | Sync Status |\n`;
      report += `| :--- | :--- | :--- | :--- | :--- |\n`;

      for (const res of outOfSync) {
        const health = res.health?.status || 'Unknown';
        report += `| \`${res.kind}\` | \`${res.name}\` | \`${res.namespace || '-'}\` | ${health} | 🔴 **OutOfSync** |\n`;
      }

      report += `\n**Git Source:** \`${app.spec?.source?.repoURL || '-'}\` @ \`${app.spec?.source?.targetRevision || 'HEAD'}\` (path: \`${app.spec?.source?.path || '.'}\`)\n`;
      report += `**Recommendation:** Trigger \`argocd_sync_app\` or inspect Git pull request to reconcile cluster drift.`;

      return report;
    } catch (err: any) {
      return `Failed to inspect Argo CD diff: ${err.message}`;
    }
  }

  /**
   * Synchronize an Argo CD application to reconcile live cluster state with Git
   */
  static async syncApp(
    appName: string,
    namespace: string = 'argocd',
    prune: boolean = false,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);

    // Patch the Argo CD Application CRD to initiate sync
    const patchPayload = {
      operation: {
        sync: {
          prune,
          syncStrategy: { apply: { force: false } },
        },
      },
    };

    const cmd = `kubectl ${ctxFlag} patch applications.argoproj.io ${appName} -n ${namespace} --type merge -p '${JSON.stringify(patchPayload)}'`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });
      if (output.startsWith('Error executing command')) {
        return `Failed to trigger sync for Argo CD app "${appName}": ${output}`;
      }

      return (
        `## Argo CD GitOps Sync Initiated 🚀\n` +
        `• **Application:** \`${appName}\`\n` +
        `• **Namespace:** \`${namespace}\`\n` +
        `• **Prune Resources:** \`${prune ? 'Yes (--prune)' : 'No'}\`\n` +
        `• **Operation:** Sync operation dispatched to Argo CD controller.\n\n` +
        `Monitor health via \`argocd_app_status\` to confirm all resources reach \`Healthy\` and \`Synced\` states.`
      );
    } catch (err: any) {
      return `Failed to sync Argo CD application: ${err.message}`;
    }
  }

  private static formatAppList(items: any[], namespace: string): string {
    let report = `## Argo CD Applications (${items.length} apps found in namespace \`${namespace}\`)\n\n`;
    report += `| Application | Sync Status | Health | Git Repo | Path |\n`;
    report += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const app of items) {
      const name = app.metadata?.name || 'unknown';
      const sync = app.status?.sync?.status || 'Unknown';
      const health = app.status?.health?.status || 'Unknown';
      const repo = (app.spec?.source?.repoURL || '').split('/').slice(-2).join('/') || '-';
      const path = app.spec?.source?.path || '/';

      const syncBadge = sync === 'Synced' ? '🟢 Synced' : '🔴 OutOfSync';
      const healthBadge = health === 'Healthy' ? '🟢 Healthy' : health === 'Degraded' ? '🔴 Degraded' : `🟡 ${health}`;

      report += `| \`${name}\` | ${syncBadge} | ${healthBadge} | \`${repo}\` | \`${path}\` |\n`;
    }

    return report;
  }

  private static formatAppJson(app: any): string {
    const name = app.metadata?.name || 'unknown';
    const syncStatus = app.status?.sync?.status || 'Unknown';
    const healthStatus = app.status?.health?.status || 'Unknown';
    const repo = app.spec?.source?.repoURL || 'Unknown';
    const revision = app.spec?.source?.targetRevision || 'HEAD';
    const path = app.spec?.source?.path || '.';
    const destNs = app.spec?.destination?.namespace || 'default';

    return (
      `## Argo CD Application: \`${name}\`\n\n` +
      `• **Sync Status:** ${syncStatus === 'Synced' ? '🟢 **Synced**' : '🔴 **OutOfSync**'}\n` +
      `• **Health Status:** ${healthStatus === 'Healthy' ? '🟢 **Healthy**' : `🟡 **${healthStatus}**`}\n` +
      `• **Git Repository:** \`${repo}\` (revision: \`${revision}\`)\n` +
      `• **Target Path:** \`${path}\`\n` +
      `• **Destination Namespace:** \`${destNs}\`\n`
    );
  }
}
