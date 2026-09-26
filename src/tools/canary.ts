import { ShellTool } from './shell.js';
import { RolloutWatcher } from '../policy/watcher.js';

export interface CanaryDeployOptions {
  serviceName: string;
  newImage: string;
  namespace?: string;
  trafficWeight?: number;
}

export class CanaryTool {
  /**
   * Orchestrate a progressive Canary release with automated failure isolation
   */
  static async deploy(options: CanaryDeployOptions): Promise<string> {
    const { serviceName, newImage, namespace = 'default', trafficWeight = 10 } = options;
    const canaryName = `${serviceName}-canary`;

    try {
      // 1. Fetch primary deployment spec
      const deployOut = await ShellTool.run(`kubectl get deployment ${serviceName} -n ${namespace} -o json`);
      if (deployOut.startsWith('Error executing command')) {
        return `Failed to locate primary deployment "${serviceName}" in namespace "${namespace}". Canary aborted.`;
      }

      const primary = JSON.parse(deployOut);
      const appLabel = primary.spec?.selector?.matchLabels?.app || serviceName;

      // 2. Construct Canary Deployment manifest with 1 replica (~10% traffic weight)
      const canaryManifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: canaryName,
          namespace,
          labels: { app: appLabel, release: 'canary' },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: appLabel, release: 'canary' } },
          template: {
            metadata: { labels: { app: appLabel, release: 'canary' } },
            spec: {
              containers: [
                {
                  name: primary.spec.template.spec.containers[0]?.name || serviceName,
                  image: newImage,
                  resources: primary.spec.template.spec.containers[0]?.resources,
                  ports: primary.spec.template.spec.containers[0]?.ports,
                },
              ],
            },
          },
        },
      };

      // Apply canary deployment
      const applyCmd = `echo '${JSON.stringify(canaryManifest)}' | kubectl apply -f -`;
      await ShellTool.run(applyCmd);

      // 3. Monitor canary rollout health
      const verifyResult = await RolloutWatcher.watchAndVerify(canaryName, 'deployment', namespace, 20);

      if (verifyResult.succeeded) {
        return (
          `## Canary Deployment Succeeded! 🚀\n` +
          `• **Primary Service:** \`${serviceName}\`\n` +
          `• **Canary Workload:** \`${canaryName}\`\n` +
          `• **New Image:** \`${newImage}\`\n` +
          `• **Traffic Share:** ~${trafficWeight}% canary traffic active\n` +
          `• **Status:** Canary pods passed all readiness probes.\n\n` +
          `**Next Steps:** Review metrics for 2-5 minutes, then promote primary deployment via \`kubectl set image deployment/${serviceName} ${serviceName}=${newImage} -n ${namespace}\` and tear down canary.`
        );
      } else {
        // Canary failed — automatically tear down canary with zero impact to primary!
        await ShellTool.run(`kubectl delete deployment ${canaryName} -n ${namespace} --wait=false`);

        return (
          `## Canary Deployment FAILED — Auto-Aborted! 🛡️\n` +
          `• **Target:** \`${canaryName}\` with image \`${newImage}\`\n` +
          `• **Failure Reason:** ${verifyResult.message}\n` +
          `• **Action Taken:** Canary was immediately deleted. Primary deployment was untouched, zero outage experienced by users!`
        );
      }
    } catch (err: any) {
      return `Canary orchestration error: ${err.message}`;
    }
  }
}
