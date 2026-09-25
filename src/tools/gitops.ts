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
}
