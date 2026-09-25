import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ShellTool, ShellExecOptions } from '../tools/shell.js';

const execAsync = promisify(exec);

export interface SandboxConfig {
  enabled?: boolean;
  image?: string;
  memoryLimit?: string;
  cpuLimit?: string;
  workDir?: string;
}

export class DockerSandboxRunner {
  private static isDockerAvailable: boolean | null = null;

  /**
   * Check if Docker is installed and daemon is running
   */
  static async checkDockerAvailable(): Promise<boolean> {
    if (this.isDockerAvailable !== null) {
      return this.isDockerAvailable;
    }
    try {
      await execAsync('docker info', { timeout: 3000 });
      this.isDockerAvailable = true;
    } catch {
      this.isDockerAvailable = false;
    }
    return this.isDockerAvailable;
  }

  /**
   * Run command in an isolated ephemeral Docker container
   */
  static async run(
    command: string,
    options: ShellExecOptions = {},
    config: SandboxConfig = {}
  ): Promise<string> {
    const isDocker = await this.checkDockerAvailable();

    // Fallback to host shell if Docker is disabled or unavailable
    if (!config.enabled || !isDocker) {
      return await ShellTool.run(command, options);
    }

    const image = config.image || 'alpine:latest';
    const memory = config.memoryLimit || '512m';
    const cpus = config.cpuLimit || '1.0';
    const cwd = options.cwd || process.cwd();

    // Escape command safely for shell inside container
    const escapedCmd = command.replace(/"/g, '\\"');
    const dockerCmd = `docker run --rm --memory=${memory} --cpus=${cpus} -v "${cwd}:/workspace" -w /workspace ${image} sh -c "${escapedCmd}"`;

    try {
      const { stdout, stderr } = await execAsync(dockerCmd, {
        timeout: options.timeoutMs || 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += (output ? '\n[stderr]\n' : '') + stderr;

      return output || '(Command completed successfully in sandbox)';
    } catch (err: any) {
      // If docker run fails (e.g. image missing or permission error), fallback to host shell
      const hostOut = await ShellTool.run(command, options);
      return `[Docker Sandbox Warning: Container execution fell back to host]\n${hostOut}`;
    }
  }
}
