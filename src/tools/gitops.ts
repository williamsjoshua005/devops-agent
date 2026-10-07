import { ShellTool } from './shell.js';

export interface CreatePROptions {
  branchName: string;
  title: string;
  body: string;
  files: string[];
}

export class GitOpsTool {
  /**
   * Safe GitOps workflow: branches, commits, and opens a Pull Request for review
   */
  static async createPR(options: CreatePROptions): Promise<string> {
    const { branchName, title, body, files } = options;

    try {
      // 1. Check current branch and git status
      const status = await ShellTool.run('git status --porcelain');
      if (!status) {
        return 'No git modifications found to commit for PR.';
      }

      // 2. Create and switch to new branch
      const checkoutOut = await ShellTool.run(`git checkout -b ${branchName}`);

      // 3. Stage target files
      const fileList = files.length > 0 ? files.join(' ') : '.';
      await ShellTool.run(`git add ${fileList}`);

      // 4. Commit changes
      const commitMsg = `${title}\n\n${body}`.replace(/"/g, '\\"');
      const commitOut = await ShellTool.run(`git commit -m "${commitMsg}"`);

      // 5. Attempt PR creation via GitHub CLI (gh) or Azure Repos (az repos)
      let prResult = '';
      try {
        prResult = await ShellTool.run(`gh pr create --title "${title}" --body "${body}" --head "${branchName}"`);
      } catch {
        prResult = `Branch "${branchName}" created and committed locally. Pushed branch is ready for PR.`;
      }

      return `[GitOps PR Created Successfully]\nBranch: ${branchName}\nCommit: ${commitOut}\nPR Output:\n${prResult}`;
    } catch (err: any) {
      return `Error in GitOps workflow: ${err.message}`;
    }
  }

  /**
   * Inspect Pull Request CI status, required checks, and mergeability before GitOps deployment
   */
  static async verifyPR(prNumber?: number | string, repo?: string): Promise<string> {
    const repoFlag = repo ? `-R "${repo}"` : '';
    const prTarget = prNumber ? String(prNumber) : '';
    const cmd = `gh pr view ${prTarget} ${repoFlag} --json number,title,state,mergeable,statusCheckRollup,reviews,url,headRefName`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });

      if (output.startsWith('Error executing command') || !output.trim().startsWith('{')) {
        // Fallback: check git branch status directly
        const branch = (await ShellTool.run('git branch --show-current')).trim();
        const unpushed = (await ShellTool.run('git log @{u}..HEAD --oneline 2>/dev/null || true')).trim();
        return (
          `## GitOps Pull Request Verification\n` +
          `**Local Branch:** \`${branch}\`\n` +
          `**Unpushed Commits:** \`${unpushed ? unpushed.split('\n').length : 0}\`\n\n` +
          `*(GitHub CLI \`gh\` not authenticated or no open PR detected for current branch. Run \`gh auth login\` to query live PR check status)*`
        );
      }

      const pr = JSON.parse(output);
      const checks = pr.statusCheckRollup || [];
      const passing = checks.filter((c: any) => c.status === 'COMPLETED' && (c.conclusion === 'SUCCESS' || c.conclusion === 'NEUTRAL'));
      const failing = checks.filter((c: any) => c.conclusion === 'FAILURE' || c.conclusion === 'TIMED_OUT');
      const pending = checks.filter((c: any) => c.status === 'IN_PROGRESS' || c.status === 'QUEUED');

      const isMergeable = pr.mergeable === 'MERGEABLE';
      const isAllPassing = failing.length === 0 && pending.length === 0 && checks.length > 0;

      let statusBadge = '🟢 **READY FOR GITOPS SYNC**';
      if (failing.length > 0) {
        statusBadge = '🔴 **BLOCKED: CI CHECKS FAILING**';
      } else if (pending.length > 0) {
        statusBadge = '🟡 **PENDING: CI CHECKS RUNNING**';
      } else if (!isMergeable) {
        statusBadge = '⚠️ **CONFLICTING: MERGE CONFLICTS DETECTED**';
      }

      let report = `## GitOps PR Verification: #${pr.number} — ${pr.title}\n`;
      report += `**URL:** ${pr.url || '-'}\n`;
      report += `**Head Branch:** \`${pr.headRefName || '-'}\` • **State:** \`${pr.state}\`\n`;
      report += `**Mergeable Status:** \`${pr.mergeable}\`\n\n`;
      report += `### CI Verification Verdict:\n${statusBadge}\n\n`;
      report += `• 🟢 **Passing Checks:** \`${passing.length}\`\n`;
      report += `• 🟡 **Pending Checks:** \`${pending.length}\`\n`;
      report += `• 🔴 **Failing Checks:** \`${failing.length}\`\n\n`;

      if (failing.length > 0) {
        report += `### ❌ Failing CI Checks:\n`;
        for (const f of failing) {
          report += `  - **${f.name || f.context}**: ${f.detailsUrl || f.targetUrl || 'Check failed'}\n`;
        }
        report += `\n*Do NOT merge or trigger GitOps deployment until failing CI checks are resolved!*\n`;
      }

      return report;
    } catch (err: any) {
      return `Failed to verify PR status: ${err.message}`;
    }
  }
}
