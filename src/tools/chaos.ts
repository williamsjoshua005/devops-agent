import { ShellTool } from './shell.js';

export interface ChaosResult {
  action: string;
  target: string;
  passed: boolean;
  recoveryTimeSec: number;
  report: string;
}

export class ChaosTool {
  /**
   * Run a controlled chaos resilience drill on staging/dev workloads
   */
  static async drill(
    action: 'pod-kill' | 'restart-drain',
    targetWorkload: string,
    namespace: string = 'default',
    isProduction: boolean = false
  ): Promise<string> {
    // Strict safety guard
    if (isProduction) {
      return `[CHAOS BLOCKED BY POLICY]: Chaos resilience drills are strictly FORBIDDEN in PRODUCTION environments.`;
    }

    if (action === 'pod-kill') {
      return await this.podKillDrill(targetWorkload, namespace);
    }

    return `Chaos action "${action}" not recognized. Supported drills: "pod-kill".`;
  }

  private static async podKillDrill(deploymentName: string, namespace: string): Promise<string> {
    try {
      // 1. Check deployment replicas
      const deployOut = await ShellTool.run(`kubectl get deployment ${deploymentName} -n ${namespace} -o json`);
      if (deployOut.startsWith('Error')) {
        return `Failed to locate deployment "${deploymentName}" in namespace "${namespace}". Chaos drill aborted.`;
      }

      const deploy = JSON.parse(deployOut);
      const replicas = deploy.spec?.replicas ?? 1;

      if (replicas < 2) {
        return `[CHAOS ABORTED FOR SAFETY]: Deployment "${deploymentName}" has only ${replicas} replica. Chaos drills require at least 2 replicas to prevent complete outage.`;
      }

      // 2. Locate pods
      const appLabel = deploy.spec?.selector?.matchLabels?.app || deploymentName;
      const podsOut = await ShellTool.run(`kubectl get pods -l app=${appLabel} -n ${namespace} -o json`);
      const pods = JSON.parse(podsOut).items || [];

      if (pods.length === 0) {
        return `No running pods found for deployment "${deploymentName}".`;
      }

      const victimPod = pods[0].metadata.name;
      const startTime = Date.now();

      // 3. Kill victim pod
      console.log(`\n\x1b[35m⚡ [Chaos Drill Active]: Terminating pod "${victimPod}" to verify self-healing...\x1b[0m`);
      await ShellTool.run(`kubectl delete pod ${victimPod} -n ${namespace} --wait=false`);

      // 4. Measure recovery time
      let recovered = false;
      let recoveryTimeSec = 0;

      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const checkOut = await ShellTool.run(`kubectl get deployment ${deploymentName} -n ${namespace} -o json`);
        if (!checkOut.startsWith('Error')) {
          const checkJson = JSON.parse(checkOut);
          const ready = checkJson.status?.readyReplicas || 0;
          if (ready >= replicas) {
            recoveryTimeSec = Math.round((Date.now() - startTime) / 1000);
            recovered = true;
            break;
          }
        }
      }

      return (
        `## Chaos Engineering Resilience Drill Report\n` +
        `• **Drill Type:** Pod Termination (\`pod-kill\`)\n` +
        `• **Target Workload:** \`${deploymentName}\` (${replicas} replicas)\n` +
        `• **Terminated Pod:** \`${victimPod}\`\n` +
        `• **Self-Healing Result:** ${recovered ? '✔ PASSED' : '❌ FAILED (Timed out)'}\n` +
        `• **Recovery Time:** **${recoveryTimeSec} seconds**\n` +
        `• **Resilience Score:** ${recoveryTimeSec <= 10 ? '⭐⭐⭐⭐⭐ High Resilience' : '⭐⭐⭐ Adequate Resilience'}\n`
      );
    } catch (err: any) {
      return `Chaos drill failed with error: ${err.message}`;
    }
  }
}
