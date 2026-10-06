import { ShellTool } from '../tools/shell.js';

export interface WatcherResult {
  succeeded: boolean;
  message: string;
  rolledBack: boolean;
  rollbackOutput?: string;
}

export class RolloutWatcher {
  /**
   * Monitor a Kubernetes workload rollout and automatically rollback if it fails or times out
   */
  static async watchAndVerify(
    name: string,
    kind: string = 'deployment',
    namespace: string = 'default',
    timeoutSeconds: number = 30,
    context?: string
  ): Promise<WatcherResult> {
    const ctxFlag = context ? `--context=${context} ` : '';
    console.log(`\n\x1b[36m⏳ [Rollout Watcher Active]: Monitoring ${kind}/${name} in namespace "${namespace}" (${timeoutSeconds}s timeout)... [Context: ${context || 'default'}]\x1b[0m`);

    const statusCmd = `kubectl ${ctxFlag}rollout status ${kind}/${name} -n ${namespace} --timeout=${timeoutSeconds}s`;
    const statusOutput = await ShellTool.run(statusCmd);

    const isSuccess =
      statusOutput.includes('successfully rolled out') && !statusOutput.toLowerCase().includes('error');

    if (isSuccess) {
      console.log(`\x1b[32m✔ [Rollout Verified]: ${kind}/${name} rollout completed successfully.\x1b[0m\n`);
      return {
        succeeded: true,
        message: statusOutput.trim(),
        rolledBack: false,
      };
    }

    // Rollout failed or timed out — initiate safety rollback!
    console.log(`\n\x1b[41m\x1b[37m\x1b[1m 🚨 ROLLOUT FAILURE DETECTED: Initiating Automated Safety Rollback! 🚨 \x1b[0m`);
    const undoCmd = `kubectl ${ctxFlag}rollout undo ${kind}/${name} -n ${namespace}`;
    const rollbackOutput = await ShellTool.run(undoCmd);

    const alertMsg =
      `[AUTOMATIC ROLLBACK TRIGGERED]\n` +
      `Workload ${kind}/${name} failed verification:\n${statusOutput}\n\n` +
      `Safety Action Executed: Rolled back to previous revision via "${undoCmd}".\n` +
      `Rollback result:\n${rollbackOutput}`;

    console.log(`\x1b[33m${alertMsg}\x1b[0m\n`);

    return {
      succeeded: false,
      message: statusOutput,
      rolledBack: true,
      rollbackOutput,
    };
  }
}
