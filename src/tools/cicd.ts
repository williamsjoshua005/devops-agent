import { ShellTool } from './shell.js';

export class CiCdTool {
  /**
   * View failed CI/CD pipeline steps, error stack traces, and workflow status (GitHub Actions & GitLab CI)
   */
  static async viewPipelineLogs(
    provider: 'github' | 'gitlab' = 'github',
    runId?: string,
    repo?: string
  ): Promise<string> {
    const repoFlag = repo ? `-R ${repo}` : '';

    if (provider === 'github') {
      try {
        if (!runId) {
          // List recent runs
          const cmd = `gh run list ${repoFlag} --limit 6`;
          const output = await ShellTool.run(cmd, { timeoutMs: 15000 });
          if (output.includes('command not found') || output.includes('gh: not found')) {
            return `GitHub CLI ('gh') is not installed.\nInstall via: 'brew install gh'`;
          }

          return (
            `## GitHub Actions: Recent Workflow Runs\n\n` +
            `\`\`\`\n${output}\n\`\`\`\n\n` +
            `**Next Step:** Pass a failed Run ID to \`ci_pipeline_logs\` (e.g. \`ci_pipeline_logs(runId: "12345678")\`) to inspect failed step logs.`
          );
        }

        // View failed logs for specific run
        const cmd = `gh run view ${runId} ${repoFlag} --log-failed`;
        const output = await ShellTool.run(cmd, { timeoutMs: 25000 });

        if (output.startsWith('Error executing command')) {
          // Fallback: view general run details
          const detailCmd = `gh run view ${runId} ${repoFlag}`;
          const detailOut = await ShellTool.run(detailCmd, { timeoutMs: 15000 });
          return `## GitHub Actions Run Triage: #${runId}\n\`\`\`\n${detailOut}\n\`\`\``;
        }

        return (
          `## GitHub Actions Failure Logs: Run #${runId}\n\n` +
          `\`\`\`\n${output.slice(0, 4000)}\n\`\`\`\n\n` +
          `**Remediation:** Review error stack trace above. Once fixed, re-trigger via \`ci_rerun_failed(runId: "${runId}")\`.`
        );
      } catch (err: any) {
        return `Failed to fetch GitHub Actions logs: ${err.message}`;
      }
    }

    if (provider === 'gitlab') {
      try {
        if (!runId) {
          const cmd = 'glab ci list --limit 6';
          const output = await ShellTool.run(cmd, { timeoutMs: 15000 });
          return `## GitLab CI: Recent Pipelines\n\`\`\`\n${output}\n\`\`\``;
        }

        const cmd = `glab ci trace ${runId}`;
        const output = await ShellTool.run(cmd, { timeoutMs: 25000 });
        return `## GitLab CI Job Failure Trace: #${runId}\n\`\`\`\n${output.slice(0, 4000)}\n\`\`\``;
      } catch (err: any) {
        return `Failed to fetch GitLab CI logs: ${err.message}`;
      }
    }

    return `Unsupported CI/CD provider: ${provider}`;
  }

  /**
   * Re-trigger failed CI/CD workflow jobs
   */
  static async rerunFailed(
    provider: 'github' | 'gitlab' = 'github',
    runId: string,
    repo?: string
  ): Promise<string> {
    const repoFlag = repo ? `-R ${repo}` : '';

    if (provider === 'github') {
      const cmd = `gh run rerun ${runId} ${repoFlag} --failed`;
      try {
        const output = await ShellTool.run(cmd, { timeoutMs: 20000 });
        return (
          `## GitHub Actions Workflow Re-Triggered 🔄\n` +
          `• **Run ID:** \`#${runId}\`\n` +
          `• **Status:** Dispatched re-run for failed jobs.\n` +
          `• **CLI Output:** ${output.trim() || 'Workflow rerun request accepted.'}`
        );
      } catch (err: any) {
        return `Failed to rerun GitHub Actions workflow: ${err.message}`;
      }
    }

    if (provider === 'gitlab') {
      const cmd = `glab ci retry ${runId}`;
      try {
        const output = await ShellTool.run(cmd, { timeoutMs: 20000 });
        return `## GitLab CI Job Re-Triggered 🔄\n${output}`;
      } catch (err: any) {
        return `Failed to retry GitLab CI job: ${err.message}`;
      }
    }

    return `Unsupported provider: ${provider}`;
  }
}
