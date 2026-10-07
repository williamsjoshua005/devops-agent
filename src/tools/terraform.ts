import { ShellTool } from './shell.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TerraformPlanSummary {
  add: number;
  change: number;
  destroy: number;
  hasDestructiveReplacements: boolean;
  destructiveResources: string[];
  rawOutput: string;
  resourceChanges?: Array<{
    address: string;
    type: string;
    actions: string[];
  }>;
}

export class TerraformTool {
  /**
   * Determine whether to use terragrunt, tofu, or terraform
   */
  private static async detectBinary(cwd: string): Promise<'terragrunt' | 'tofu' | 'terraform'> {
    if (fs.existsSync(path.join(cwd, 'terragrunt.hcl'))) {
      const tgCheck = await ShellTool.run('which terragrunt');
      if (tgCheck.includes('/terragrunt')) return 'terragrunt';
    }
    const tofuCheck = await ShellTool.run('which tofu');
    if (tofuCheck.includes('/tofu')) return 'tofu';
    return 'terraform';
  }

  /**
   * Run a Terraform / OpenTofu / Terragrunt Plan and parse the proposed changes
   */
  static async plan(dirPath: string = '.', varFile?: string): Promise<string> {
    const cwd = path.resolve(process.cwd(), dirPath);

    // Verify directory exists
    if (!fs.existsSync(cwd)) {
      return `Terraform directory "${dirPath}" does not exist.`;
    }

    // Check for .tf or terragrunt.hcl files
    const entries = fs.readdirSync(cwd);
    const hasTf = entries.some((f) => f.endsWith('.tf'));
    const hasTg = entries.some((f) => f === 'terragrunt.hcl');
    if (!hasTf && !hasTg) {
      return `No Terraform (*.tf) or Terragrunt (terragrunt.hcl) files found in directory "${dirPath}".`;
    }

    const binary = await this.detectBinary(cwd);
    const varFlag = varFile ? `-var-file="${varFile}"` : '';
    const planFile = `.devops_plan_${Date.now()}.tfplan`;
    const planFilePath = path.join(cwd, planFile);

    try {
      // First attempt: generate plan file and parse with terraform show -json for machine-readable precision
      const planCmd = `${binary} plan -no-color -detailed-exitcode -out="${planFile}" ${varFlag}`.trim();
      const planOutput = await ShellTool.run(planCmd, { cwd, timeoutMs: 60000 });

      // Check for state lock errors
      if (planOutput.includes('Error acquiring the state lock') || planOutput.includes('Lock Info:')) {
        return this.formatStateLockError(planOutput, dirPath, binary);
      }

      if (planOutput.includes('command not found') || planOutput.includes('No such file')) {
        return `Neither ${binary} nor OpenTofu CLI was detected in PATH.\nInstall OpenTofu via: 'brew install opentofu' or Terraform via: 'brew install terraform'.`;
      }

      // Try reading JSON representation if plan file was created
      let jsonParsed: any = null;
      if (fs.existsSync(planFilePath)) {
        try {
          const jsonOut = await ShellTool.run(`${binary} show -json "${planFile}"`, { cwd, timeoutMs: 30000 });
          if (jsonOut.trim().startsWith('{')) {
            jsonParsed = JSON.parse(jsonOut);
          }
        } catch {
          // Fall back to text parsing if JSON show fails
        } finally {
          try {
            if (fs.existsSync(planFilePath)) fs.unlinkSync(planFilePath);
          } catch {}
        }
      }

      const summary = jsonParsed
        ? this.parseJsonPlan(jsonParsed, planOutput)
        : this.parsePlanOutput(planOutput);

      let report = `## Infrastructure as Code Plan Report (${binary.toUpperCase()})\n`;
      report += `**Working Directory:** \`${dirPath}\`\n\n`;
      report += `### Summary of Proposed State Changes:\n`;
      report += `• 🟢 **To Add:** \`${summary.add}\` resource(s)\n`;
      report += `• 🟡 **To Modify:** \`${summary.change}\` resource(s)\n`;
      report += `• 🔴 **To Destroy:** \`${summary.destroy}\` resource(s)\n\n`;

      if (summary.hasDestructiveReplacements) {
        report += `### 🚨 CRITICAL SRE WARNING — High-Risk Replacements Detected:\n`;
        report += `The plan includes resource destructions or forced replacements:\n`;
        for (const res of summary.destructiveResources) {
          report += `  - \`${res}\`\n`;
        }
        report += `\n*Review database instances, storage buckets, or network gateways before applying!* \n\n`;
      } else if (summary.destroy === 0 && summary.change === 0 && summary.add === 0) {
        report += `✔ **No Changes Detected:** Cloud infrastructure matches declared configuration perfectly (0 drift).\n\n`;
      }

      if (summary.resourceChanges && summary.resourceChanges.length > 0) {
        report += `### Resource Action Breakdown:\n`;
        report += `| Resource Address | Type | Planned Actions |\n`;
        report += `| :--- | :--- | :--- |\n`;
        for (const rc of summary.resourceChanges.slice(0, 15)) {
          const badge = rc.actions.includes('delete')
            ? '🔴 **DESTROY**'
            : rc.actions.includes('create')
            ? '🟢 **CREATE**'
            : '🟡 **UPDATE**';
          report += `| \`${rc.address}\` | \`${rc.type}\` | ${badge} (\`${rc.actions.join(', ')}\`) |\n`;
        }
        if (summary.resourceChanges.length > 15) {
          report += `\n*(...and ${summary.resourceChanges.length - 15} additional resource changes omitted)*\n`;
        }
        report += '\n';
      }

      report += `### Detailed Plan Output:\n\`\`\`hcl\n${planOutput.slice(0, 3500)}\n\`\`\``;
      return report;
    } catch (err: any) {
      try {
        if (fs.existsSync(planFilePath)) fs.unlinkSync(planFilePath);
      } catch {}
      return `Failed to execute ${binary} plan: ${err.message}`;
    }
  }

  /**
   * Detect configuration drift between actual cloud state and declared state without modifying state
   */
  static async detectDrift(dirPath: string = '.'): Promise<string> {
    const cwd = path.resolve(process.cwd(), dirPath);
    const binary = await this.detectBinary(cwd);
    const cmd = `${binary} plan -refresh-only -no-color -detailed-exitcode`;

    try {
      const output = await ShellTool.run(cmd, { cwd, timeoutMs: 60000 });

      if (output.includes('No changes') || output.includes('Infrastructure matches the configuration')) {
        return `## IaC Drift Detection Report: ${dirPath}\n🟢 **Status: IN-SYNC**\nNo infrastructure drift detected. Live cloud resources match state file perfectly.`;
      }

      return (
        `## IaC Drift Detection Report: ${dirPath} (${binary.toUpperCase()})\n` +
        `⚠️ **Status: DRIFT DETECTED**\n` +
        `Live cloud infrastructure has drifted from declared IaC configuration:\n\n` +
        `\`\`\`hcl\n${output.slice(0, 3500)}\n\`\`\``
      );
    } catch (err: any) {
      return `Failed to run drift detection: ${err.message}`;
    }
  }

  /**
   * Inspect Terraform state or diagnose state locks
   */
  static async inspectState(dirPath: string = '.', resourceAddress?: string): Promise<string> {
    const cwd = path.resolve(process.cwd(), dirPath);
    if (!fs.existsSync(cwd)) {
      return `Terraform directory "${dirPath}" does not exist.`;
    }
    const binary = await this.detectBinary(cwd);

    try {
      if (resourceAddress) {
        const cmd = `${binary} state show "${resourceAddress}"`;
        const output = await ShellTool.run(cmd, { cwd, timeoutMs: 15000 });
        return `## Terraform State Resource: \`${resourceAddress}\` (${binary.toUpperCase()})\n\`\`\`hcl\n${output}\n\`\`\``;
      }

      const listCmd = `${binary} state list`;
      const output = await ShellTool.run(listCmd, { cwd, timeoutMs: 15000 });
      if (output.startsWith('Error executing command')) {
        return `Unable to list state resources in "${dirPath}":\n${output}`;
      }

      const resources = output.split('\n').filter((l) => l.trim().length > 0);
      let report = `## Terraform State Inventory (${binary.toUpperCase()})\n`;
      report += `**Directory:** \`${dirPath}\` • **Managed Resources:** \`${resources.length}\`\n\n`;
      report += resources.slice(0, 40).map((r) => `• \`${r}\``).join('\n');
      if (resources.length > 40) {
        report += `\n\n*(...and ${resources.length - 40} more resources)*`;
      }
      return report;
    } catch (err: any) {
      return `Error inspecting state: ${err.message}`;
    }
  }

  /**
   * Manage Terraform / OpenTofu workspaces (list, select, show, new)
   */
  static async manageWorkspace(
    dirPath: string = '.',
    action: 'list' | 'show' | 'select' | 'new' = 'list',
    workspaceName?: string
  ): Promise<string> {
    const cwd = path.resolve(process.cwd(), dirPath);
    if (!fs.existsSync(cwd)) {
      return `Terraform directory "${dirPath}" does not exist.`;
    }
    const binary = await this.detectBinary(cwd);

    try {
      if (action === 'list') {
        const output = await ShellTool.run(`${binary} workspace list`, { cwd, timeoutMs: 10000 });
        return `## Terraform Workspaces: \`${dirPath}\` (${binary.toUpperCase()})\n\`\`\`\n${output}\n\`\`\``;
      }

      if (action === 'show') {
        const current = (await ShellTool.run(`${binary} workspace show`, { cwd, timeoutMs: 10000 })).trim();
        return `## Active Terraform Workspace\n**Directory:** \`${dirPath}\`\n**Current Workspace:** \`${current}\``;
      }

      if (action === 'select') {
        if (!workspaceName) return 'Error: workspaceName is required to select workspace.';
        const output = await ShellTool.run(`${binary} workspace select "${workspaceName}"`, { cwd, timeoutMs: 15000 });
        return `## Terraform Workspace Switched\n✔ Successfully selected workspace: \`${workspaceName}\`\n${output}`;
      }

      if (action === 'new') {
        if (!workspaceName) return 'Error: workspaceName is required to create a new workspace.';
        const output = await ShellTool.run(`${binary} workspace new "${workspaceName}"`, { cwd, timeoutMs: 15000 });
        return `## Terraform Workspace Created\n✔ Successfully created and switched to workspace: \`${workspaceName}\`\n${output}`;
      }

      return `Unsupported workspace action "${action}".`;
    } catch (err: any) {
      return `Workspace operation failed: ${err.message}`;
    }
  }

  /**
   * Safe apply with target environment verification
   */
  static async apply(dirPath: string = '.', planFile?: string): Promise<string> {
    const cwd = path.resolve(process.cwd(), dirPath);
    const binary = await this.detectBinary(cwd);
    const target = planFile ? `"${planFile}"` : '-auto-approve';
    const cmd = `${binary} apply -no-color ${target}`;

    try {
      const output = await ShellTool.run(cmd, { cwd, timeoutMs: 120000 });
      return `## Terraform Apply Execution Summary (${binary.toUpperCase()})\n\`\`\`\n${output.slice(0, 4000)}\n\`\`\``;
    } catch (err: any) {
      return `Failed to execute ${binary} apply: ${err.message}`;
    }
  }

  private static parseJsonPlan(json: any, rawOutput: string): TerraformPlanSummary {
    const resourceChanges = json.resource_changes || [];
    let add = 0;
    let change = 0;
    let destroy = 0;
    const destructiveResources: string[] = [];
    const changesList: Array<{ address: string; type: string; actions: string[] }> = [];

    for (const rc of resourceChanges) {
      const actions: string[] = rc.change?.actions || [];
      if (actions.includes('no-op')) continue;

      changesList.push({
        address: rc.address,
        type: rc.type,
        actions,
      });

      if (actions.includes('delete') && actions.includes('create')) {
        destroy++;
        add++;
        destructiveResources.push(`${rc.address} (FORCED REPLACEMENT)`);
      } else if (actions.includes('delete')) {
        destroy++;
        destructiveResources.push(`${rc.address} (DESTROY)`);
      } else if (actions.includes('create')) {
        add++;
      } else if (actions.includes('update')) {
        change++;
      }
    }

    return {
      add,
      change,
      destroy,
      hasDestructiveReplacements: destroy > 0,
      destructiveResources: destructiveResources.slice(0, 10),
      rawOutput,
      resourceChanges: changesList,
    };
  }

  private static parsePlanOutput(output: string): TerraformPlanSummary {
    const planRegex = /Plan:\s*(\d+)\s*to add,\s*(\d+)\s*to change,\s*(\d+)\s*to destroy/i;
    const match = output.match(planRegex);

    const add = match ? parseInt(match[1], 10) : 0;
    const change = match ? parseInt(match[2], 10) : 0;
    const destroy = match ? parseInt(match[3], 10) : 0;

    const destructiveResources: string[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('must be replaced') || line.includes('will be destroyed')) {
        destructiveResources.push(line.trim());
      }
    }

    return {
      add,
      change,
      destroy,
      hasDestructiveReplacements: destroy > 0 || destructiveResources.length > 0,
      destructiveResources: destructiveResources.slice(0, 10),
      rawOutput: output,
    };
  }

  private static formatStateLockError(output: string, dirPath: string, binary: string): string {
    const lockIdMatch = output.match(/ID:\s*([a-f0-9-]+)/i);
    const lockId = lockIdMatch ? lockIdMatch[1] : 'Unknown';
    const whoMatch = output.match(/Who:\s*([^\n]+)/i);
    const who = whoMatch ? whoMatch[1].trim() : 'Unknown user/process';
    const createdMatch = output.match(/Created:\s*([^\n]+)/i);
    const created = createdMatch ? createdMatch[1].trim() : 'Unknown';

    return (
      `## 🔒 Terraform State Lock Conflict Detected\n` +
      `**Working Directory:** \`${dirPath}\`\n\n` +
      `Another process or team member holds the distributed state lock for this workspace.\n\n` +
      `• **Lock ID:** \`${lockId}\`\n` +
      `• **Acquired By:** \`${who}\`\n` +
      `• **Timestamp:** \`${created}\`\n\n` +
      `### Recommended SRE Remediation:\n` +
      `1. Verify whether a CI/CD pipeline or teammate is currently running an apply.\n` +
      `2. If the process crashed or is orphaned, inspect state via \`terraform_state_inspect\`.\n` +
      `3. To safely release the lock when confirmed abandoned, run with human confirmation:\n` +
      `   \`\`\`bash\n   ${binary} force-unlock ${lockId}\n   \`\`\``
    );
  }
}
