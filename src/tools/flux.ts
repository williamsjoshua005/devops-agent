import { ShellTool } from './shell.js';

export interface FluxResourceItem {
  kind: string;
  name: string;
  namespace: string;
  ready: boolean;
  suspended: boolean;
  message: string;
  revision?: string;
}

export class FluxTool {
  private static getContextFlag(context?: string): string {
    return context ? `--context=${context}` : '';
  }

  /**
   * Query Flux CD synchronization status for Kustomizations, HelmReleases, and GitRepositories
   */
  static async getStatus(
    name?: string,
    kind: 'all' | 'kustomization' | 'helmrelease' | 'gitrepository' = 'all',
    namespace: string = 'flux-system',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);

    let targetCrds = 'kustomizations.kustomize.toolkit.fluxcd.io,helmreleases.helm.toolkit.fluxcd.io,gitrepositories.source.toolkit.fluxcd.io';
    if (kind === 'kustomization') targetCrds = 'kustomizations.kustomize.toolkit.fluxcd.io';
    if (kind === 'helmrelease') targetCrds = 'helmreleases.helm.toolkit.fluxcd.io';
    if (kind === 'gitrepository') targetCrds = 'gitrepositories.source.toolkit.fluxcd.io';

    const targetName = name ? name : '';
    const cmd = `kubectl ${ctxFlag} get ${targetCrds} ${targetName} -n ${namespace} -o json`.replace(/\s+/g, ' ');

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });

      if (output.startsWith('Error executing command') || !output.trim().startsWith('{')) {
        // Fallback: check if flux CLI is present
        const fluxCheck = await ShellTool.run(`flux get all -n ${namespace}`, { timeoutMs: 10000 });
        if (!fluxCheck.startsWith('Error') && fluxCheck.includes('NAME')) {
          return `## Flux CD Status (Namespace: \`${namespace}\`)\n\`\`\`\n${fluxCheck}\n\`\`\``;
        }

        return (
          `## Flux CD GitOps Status\n` +
          `No Flux CD resources found in namespace \`${namespace}\` or Flux CRDs are not installed in cluster.\n` +
          `*(Verify that Flux CD is deployed via \`flux install\` or specify the target namespace)*`
        );
      }

      const json = JSON.parse(output);
      const items: any[] = json.items ? json.items : [json];

      const parsed: FluxResourceItem[] = items.map((item) => {
        const itemKind = item.kind || 'Resource';
        const itemName = item.metadata?.name || 'unknown';
        const itemNs = item.metadata?.namespace || namespace;
        const suspended = !!item.spec?.suspend;

        const conditions: any[] = item.status?.conditions || [];
        const readyCond = conditions.find((c) => c.type === 'Ready');
        const ready = readyCond?.status === 'True';
        const message = readyCond?.message || item.status?.lastHandledReconcileAt || 'No status message';
        const revision = item.status?.lastAppliedRevision || item.status?.artifact?.revision || '-';

        return {
          kind: itemKind,
          name: itemName,
          namespace: itemNs,
          ready,
          suspended,
          message,
          revision,
        };
      });

      let report = `## Flux CD GitOps Status (${parsed.length} resources in namespace \`${namespace}\`)\n\n`;
      report += `| Kind | Resource Name | Ready | Suspended | Last Applied Revision | Status Details |\n`;
      report += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      for (const res of parsed) {
        const readyBadge = res.ready ? '🟢 True' : '🔴 False';
        const suspBadge = res.suspended ? '⏸ Yes' : 'No';
        report += `| \`${res.kind}\` | \`${res.name}\` | ${readyBadge} | ${suspBadge} | \`${res.revision}\` | ${res.message} |\n`;
      }

      return report;
    } catch (err: any) {
      return `Failed to query Flux CD status: ${err.message}`;
    }
  }

  /**
   * Trigger an immediate reconciliation on a Flux CD resource
   */
  static async reconcile(
    kind: 'kustomization' | 'helmrelease' | 'gitrepository',
    name: string,
    namespace: string = 'flux-system',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);

    // Try flux CLI first
    const fluxCmd = `flux reconcile ${kind} ${name} -n ${namespace} ${ctxFlag}`.trim();
    const fluxOut = await ShellTool.run(fluxCmd, { timeoutMs: 30000 });

    if (!fluxOut.startsWith('Error executing command') && !fluxOut.includes('command not found')) {
      return (
        `## Flux CD Reconciliation Triggered 🚀\n` +
        `• **Resource:** \`${kind}/${name}\`\n` +
        `• **Namespace:** \`${namespace}\`\n\n` +
        `\`\`\`\n${fluxOut}\n\`\`\``
      );
    }

    // Fallback: Annotate CRD with reconcile.fluxcd.io/requestedAt timestamp
    let crdType = 'kustomizations.kustomize.toolkit.fluxcd.io';
    if (kind === 'helmrelease') crdType = 'helmreleases.helm.toolkit.fluxcd.io';
    if (kind === 'gitrepository') crdType = 'gitrepositories.source.toolkit.fluxcd.io';

    const timestamp = new Date().toISOString();
    const patchCmd = `kubectl ${ctxFlag} annotate ${crdType} ${name} -n ${namespace} reconcile.fluxcd.io/requestedAt="${timestamp}" --overwrite`.replace(/\s+/g, ' ');

    try {
      const patchOut = await ShellTool.run(patchCmd, { timeoutMs: 15000 });
      if (patchOut.startsWith('Error executing command')) {
        return `Failed to trigger Flux reconciliation for ${kind}/${name}: ${patchOut}`;
      }

      return (
        `## Flux CD Reconciliation Annotated 🚀\n` +
        `• **Resource:** \`${kind}/${name}\`\n` +
        `• **Namespace:** \`${namespace}\`\n` +
        `• **Annotation:** \`reconcile.fluxcd.io/requestedAt="${timestamp}"\`\n\n` +
        `Flux controller received notification. Verify synchronization status via \`flux_app_status\`.`
      );
    } catch (err: any) {
      return `Failed to reconcile Flux resource: ${err.message}`;
    }
  }
}
