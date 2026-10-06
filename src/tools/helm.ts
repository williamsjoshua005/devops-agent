import { ShellTool } from './shell.js';

export class HelmTool {
  /**
   * Helper to format --kube-context flag
   */
  private static getContextFlag(context?: string): string {
    return context ? `--kube-context=${context}` : '';
  }

  /**
   * Generate a visual unified diff of what a Helm release upgrade would change
   */
  static async diff(
    releaseName: string,
    chartPath: string,
    namespace: string = 'default',
    valuesFile?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const valFlag = valuesFile ? `-f "${valuesFile}"` : '';

    // Check if helm-diff plugin is installed
    const pluginCheck = await ShellTool.run('helm plugin list');
    const hasDiffPlugin = pluginCheck.includes('diff');

    let cmd = '';
    if (hasDiffPlugin) {
      cmd = `helm diff upgrade ${releaseName} ${chartPath} -n ${namespace} ${valFlag} ${ctxFlag} --allow-unreleased`.trim();
    } else {
      // Fallback: render template for comparison
      cmd = `helm template ${releaseName} ${chartPath} -n ${namespace} ${valFlag} ${ctxFlag}`.trim();
    }

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 30000 });
      if (output.includes('command not found') || output.includes('helm: not found')) {
        return `Helm CLI ('helm') is not installed on this machine.\nInstall via: 'brew install helm'.`;
      }

      if (!hasDiffPlugin) {
        return (
          `## Helm Release Preview: ${releaseName} (Namespace: ${namespace})\n` +
          `*(Note: Install 'helm plugin install https://github.com/databus23/helm-diff' for live in-cluster diffs)*\n\n` +
          `### Rendered Manifest Template:\n\`\`\`yaml\n${output.slice(0, 3500)}\n\`\`\``
        );
      }

      return `## Helm Upgrade Visual Diff Preview: ${releaseName} (${namespace})\n\n\`\`\`diff\n${output || '(No manifest changes detected between deployed and target chart)'}\n\`\`\``;
    } catch (err: any) {
      return `Failed to generate Helm diff: ${err.message}`;
    }
  }

  /**
   * Query current status, revision, and resource health of a Helm release
   */
  static async status(
    releaseName: string,
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const cmd = `helm status ${releaseName} -n ${namespace} ${ctxFlag} -o json`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });
      if (output.startsWith('Error executing command')) {
        return `Helm release "${releaseName}" not found in namespace "${namespace}":\n${output}`;
      }

      try {
        const json = JSON.parse(output);
        const name = json.name || releaseName;
        const version = json.version || 'unknown';
        const chart = json.chart?.metadata?.name || 'unknown';
        const appVersion = json.chart?.metadata?.appVersion || 'unknown';
        const status = json.info?.status || 'unknown';
        const firstDeployed = json.info?.first_deployed || 'unknown';
        const lastDeployed = json.info?.last_deployed || 'unknown';
        const description = json.info?.description || 'N/A';

        return (
          `## Helm Release Status: \`${name}\`\n\n` +
          `• **Namespace:** \`${namespace}\`\n` +
          `• **Status:** \`${status.toUpperCase()}\`\n` +
          `• **Current Revision:** \`${version}\`\n` +
          `• **Chart:** \`${chart}\` (App Version: \`${appVersion}\`)\n` +
          `• **First Deployed:** \`${firstDeployed}\`\n` +
          `• **Last Deployed:** \`${lastDeployed}\`\n` +
          `• **Description / Notes:** ${description}\n`
        );
      } catch {
        return `## Helm Status for ${releaseName}:\n\`\`\`\n${output}\n\`\`\``;
      }
    } catch (err: any) {
      return `Error checking Helm status: ${err.message}`;
    }
  }

  /**
   * List historical revisions for a Helm release
   */
  static async history(
    releaseName: string,
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const cmd = `helm history ${releaseName} -n ${namespace} ${ctxFlag} --max=10`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });
      return `## Helm Revision History: \`${releaseName}\` (Namespace: ${namespace})\n\n\`\`\`\n${output}\n\`\`\``;
    } catch (err: any) {
      return `Error retrieving Helm history: ${err.message}`;
    }
  }

  /**
   * Rollback a Helm release to a previous revision
   */
  static async rollback(
    releaseName: string,
    revision?: number,
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const revFlag = revision ? String(revision) : '';
    const cmd = `helm rollback ${releaseName} ${revFlag} -n ${namespace} ${ctxFlag} --wait --timeout=5m`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 60000 });
      return (
        `## Helm Rollback Executed Successfully 🔄\n` +
        `• **Release:** \`${releaseName}\`\n` +
        `• **Target Revision:** \`${revision ? `Revision ${revision}` : 'Previous Revision'}\`\n` +
        `• **Namespace:** \`${namespace}\`\n` +
        `• **Result:** ${output || 'Rollback finished and pods verified healthy.'}`
      );
    } catch (err: any) {
      return `Failed to execute Helm rollback: ${err.message}`;
    }
  }
}
