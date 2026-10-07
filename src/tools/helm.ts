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

  /**
   * Render Helm chart templates locally without cluster contact
   */
  static async template(
    releaseName: string,
    chartPath: string,
    namespace: string = 'default',
    valuesFile?: string,
    setValues?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const valFlag = valuesFile ? `-f "${valuesFile}"` : '';
    const setFlag = setValues ? `--set "${setValues}"` : '';
    const cmd = `helm template ${releaseName} ${chartPath} -n ${namespace} ${valFlag} ${setFlag} ${ctxFlag}`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 30000 });
      if (output.startsWith('Error executing command')) {
        return `Failed to render Helm template: ${output}`;
      }

      // Count rendered resource manifests
      const manifests = output.split(/^---$/m).filter((m) => m.trim().length > 0);
      const summaryList: string[] = [];
      for (const m of manifests) {
        const kindMatch = m.match(/kind:\s*([a-zA-Z0-9]+)/);
        const nameMatch = m.match(/metadata:\s*[\r\n]+\s*name:\s*([a-zA-Z0-9.-]+)/);
        if (kindMatch && nameMatch) {
          summaryList.push(`• \`${kindMatch[1]}/${nameMatch[1]}\``);
        }
      }

      let report = `## Helm Template Render Report: \`${releaseName}\`\n`;
      report += `**Chart:** \`${chartPath}\` • **Namespace:** \`${namespace}\`\n`;
      report += `**Rendered Resources (${manifests.length} manifests):**\n${summaryList.slice(0, 15).join('\n')}\n`;
      if (summaryList.length > 15) {
        report += `\n*(...and ${summaryList.length - 15} more manifests)*\n`;
      }
      report += `\n### Manifest Output Preview:\n\`\`\`yaml\n${output.slice(0, 3500)}\n\`\`\``;
      return report;
    } catch (err: any) {
      return `Failed to execute helm template: ${err.message}`;
    }
  }

  /**
   * Retrieve active user-supplied or computed values from a deployed Helm release
   */
  static async getValues(
    releaseName: string,
    namespace: string = 'default',
    allValues: boolean = false,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const allFlag = allValues ? '--all' : '';
    const cmd = `helm get values ${releaseName} -n ${namespace} ${allFlag} ${ctxFlag} -o yaml`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });
      if (output.startsWith('Error executing command')) {
        return `Failed to get values for release "${releaseName}" in namespace "${namespace}":\n${output}`;
      }

      return (
        `## Helm Release Values: \`${releaseName}\` (Namespace: \`${namespace}\`)\n` +
        `**Mode:** ${allValues ? 'All Computed Values (--all)' : 'User-Supplied Overrides'}\n\n` +
        `\`\`\`yaml\n${output || '(No custom values defined)'}\n\`\`\``
      );
    } catch (err: any) {
      return `Error getting Helm values: ${err.message}`;
    }
  }

  /**
   * Run helm lint on a chart directory to audit syntax and templates
   */
  static async lint(chartPath: string, valuesFile?: string): Promise<string> {
    const valFlag = valuesFile ? `-f "${valuesFile}"` : '';
    const cmd = `helm lint ${chartPath} ${valFlag}`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 20000 });
      const passed = output.includes('0 chart(s) failed');

      return (
        `## Helm Chart Lint Audit: \`${chartPath}\`\n` +
        `**Result:** ${passed ? '🟢 **PASSED (0 errors)**' : '🔴 **FAILED / WARNINGS DETECTED**'}\n\n` +
        `\`\`\`\n${output}\n\`\`\``
      );
    } catch (err: any) {
      return `Failed to lint Helm chart: ${err.message}`;
    }
  }

  /**
   * Upgrade or install a Helm release with dry-run support
   */
  static async upgradeInstall(
    releaseName: string,
    chartPath: string,
    namespace: string = 'default',
    valuesFile?: string,
    dryRun: boolean = true,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const valFlag = valuesFile ? `-f "${valuesFile}"` : '';
    const dryFlag = dryRun ? '--dry-run' : '';
    const cmd = `helm upgrade --install ${releaseName} ${chartPath} -n ${namespace} ${valFlag} ${dryFlag} ${ctxFlag}`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 45000 });
      if (output.startsWith('Error executing command')) {
        return `Helm upgrade/install failed: ${output}`;
      }

      return (
        `## Helm Upgrade/Install: \`${releaseName}\`\n` +
        `• **Namespace:** \`${namespace}\`\n` +
        `• **Dry-Run Mode:** \`${dryRun ? 'YES (Simulated Preview)' : 'NO (Live Cluster Mutation)'}\`\n\n` +
        `\`\`\`\n${output.slice(0, 3000)}\n\`\`\``
      );
    } catch (err: any) {
      return `Error in Helm upgrade/install: ${err.message}`;
    }
  }
}
