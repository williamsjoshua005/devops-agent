import { ShellTool } from './shell.js';

export class K8sTool {
  /**
   * List Kubernetes resources with optional namespace and label selector
   */
  static async getResources(
    resource: string = 'pods',
    namespace?: string,
    labelSelector?: string
  ): Promise<string> {
    const nsFlag = namespace ? `-n ${namespace}` : '-A';
    const selectorFlag = labelSelector ? `-l ${labelSelector}` : '';
    const cmd = `kubectl get ${resource} ${nsFlag} ${selectorFlag} -o wide`;
    return await ShellTool.run(cmd);
  }

  /**
   * Describe a specific Kubernetes resource
   */
  static async describeResource(
    resource: string,
    name: string,
    namespace?: string
  ): Promise<string> {
    const nsFlag = namespace ? `-n ${namespace}` : '';
    const cmd = `kubectl describe ${resource} ${name} ${nsFlag}`;
    return await ShellTool.run(cmd);
  }

  /**
   * Fetch logs for a pod/container, with support for previous instance logs on crash
   */
  static async getLogs(
    podName: string,
    namespace?: string,
    container?: string,
    tailLines: number = 100,
    previous: boolean = false
  ): Promise<string> {
    const nsFlag = namespace ? `-n ${namespace}` : '';
    const containerFlag = container ? `-c ${container}` : '';
    const prevFlag = previous ? '-p' : '';
    const cmd = `kubectl logs ${podName} ${nsFlag} ${containerFlag} --tail=${tailLines} ${prevFlag}`;
    return await ShellTool.run(cmd);
  }

  /**
   * Restart a Kubernetes deployment or daemonset
   */
  static async rolloutRestart(
    name: string,
    kind: string = 'deployment',
    namespace: string = 'default'
  ): Promise<string> {
    const cmd = `kubectl rollout restart ${kind}/${name} -n ${namespace}`;
    return await ShellTool.run(cmd);
  }

  /**
   * List all configured Kubernetes contexts
   */
  static async listContexts(): Promise<{ current: string; contexts: string[] }> {
    const raw = await ShellTool.run('kubectl config get-contexts -o name');
    let current = '';
    try {
      current = (await ShellTool.run('kubectl config current-context')).trim();
    } catch {}
    const contexts = raw.split('\n').map((c) => c.trim()).filter(Boolean);
    return { current, contexts };
  }

  /**
   * Switch the active Kubernetes context
   */
  static async switchContext(targetContext: string): Promise<string> {
    return await ShellTool.run(`kubectl config use-context ${targetContext}`);
  }
}
