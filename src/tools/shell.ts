import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ShellExecOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}

export class ShellTool {
  static async run(command: string, options: ShellExecOptions = {}): Promise<string> {
    const cwd = options.cwd || process.cwd();
    const timeout = options.timeoutMs || 30000;
    const maxOutput = options.maxOutputChars;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += (output ? '\n[stderr]\n' : '') + stderr;

      if (!output) {
        return '(Command executed successfully with no output)';
      }

      if (maxOutput !== undefined && output.length > maxOutput) {
        return (
          output.slice(0, maxOutput) +
          `\n\n... [Output truncated: showing first ${maxOutput} characters of ${output.length}]`
        );
      }

      return output;
    } catch (err: any) {
      const message = err.message || String(err);
      const stderr = err.stderr ? `\nStderr:\n${err.stderr}` : '';
      const stdout = err.stdout ? `\nStdout:\n${err.stdout}` : '';
      return `Error executing command: ${message}${stdout}${stderr}`;
    }
  }
}
