import { ShellTool } from './shell.js';

export class K8sTool {
  /**
   * Helper to format --context flag
   */
  private static getContextFlag(context?: string): string {
    return context ? `--context=${context}` : '';
  }

  /**
   * List Kubernetes resources with optional namespace, label selector, and cluster context
   */
  static async getResources(
    resource: string = 'pods',
    namespace?: string,
    labelSelector?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '-A';
    const selectorFlag = labelSelector ? `-l ${labelSelector}` : '';
    const cmd = `kubectl ${ctxFlag} get ${resource} ${nsFlag} ${selectorFlag} --request-timeout=15s -o wide`.replace(/\s+/g, ' ');
    return await ShellTool.run(cmd);
  }

  /**
   * Describe a specific Kubernetes resource
   */
  static async describeResource(
    resource: string,
    name: string,
    namespace?: string,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '';
    const cmd = `kubectl ${ctxFlag} describe ${resource} ${name} ${nsFlag} --request-timeout=15s`.replace(/\s+/g, ' ');
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
    previous: boolean = false,
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const nsFlag = namespace ? `-n ${namespace}` : '';
    const containerFlag = container ? `-c ${container}` : '';
    const prevFlag = previous ? '-p' : '';
    const cmd = `kubectl ${ctxFlag} logs ${podName} ${nsFlag} ${containerFlag} --tail=${tailLines} ${prevFlag} --request-timeout=15s`.replace(/\s+/g, ' ');
    return await ShellTool.run(cmd);
  }

  /**
   * Restart a Kubernetes deployment or daemonset
   */
  static async rolloutRestart(
    name: string,
    kind: string = 'deployment',
    namespace: string = 'default',
    context?: string
  ): Promise<string> {
    const ctxFlag = this.getContextFlag(context);
    const cmd = `kubectl ${ctxFlag} rollout restart ${kind}/${name} -n ${namespace}`.replace(/\s+/g, ' ');
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
