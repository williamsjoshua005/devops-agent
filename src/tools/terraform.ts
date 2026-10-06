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
}

export class TerraformTool {
  /**
   * Run a Terraform / OpenTofu Plan and parse the proposed changes
   */
  static async plan(dirPath: string = '.', varFile?: string): Promise<string> {
    const cwd = path.resolve(process.cwd(), dirPath);

    // Verify directory exists
    if (!fs.existsSync(cwd)) {
      return `Terraform directory "${dirPath}" does not exist.`;
    }

    // Check for .tf files
    const tfFiles = fs.readdirSync(cwd).filter((f) => f.endsWith('.tf'));
    if (tfFiles.length === 0) {
      return `No Terraform configuration files (*.tf) found in directory "${dirPath}".`;
    }

    const varFlag = varFile ? `-var-file="${varFile}"` : '';
    // Prefer tofu if available, otherwise terraform
    const binary = (await ShellTool.run('which tofu')).includes('/tofu') ? 'tofu' : 'terraform';
    const cmd = `${binary} plan -no-color -detailed-exitcode ${varFlag}`.trim();

    try {
      const output = await ShellTool.run(cmd, { cwd, timeoutMs: 45000 });

      if (output.includes('command not found') || output.includes('No such file')) {
        return `Neither Terraform nor OpenTofu CLI was detected in PATH.\nInstall OpenTofu via: 'brew install opentofu' or Terraform via: 'brew install terraform'.`;
      }

      const summary = this.parsePlanOutput(output);

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

      report += `### Detailed Plan Output:\n\`\`\`hcl\n${output.slice(0, 4000)}\n\`\`\``;
      return report;
    } catch (err: any) {
      return `Failed to execute ${binary} plan: ${err.message}`;
    }
  }

  /**
   * Detect configuration drift between actual cloud state and declared state without modifying state
   */
  static async detectDrift(dirPath: string = '.'): Promise<string> {
    const cwd = path.resolve(process.cwd(), dirPath);
    const binary = (await ShellTool.run('which tofu')).includes('/tofu') ? 'tofu' : 'terraform';
    const cmd = `${binary} plan -refresh-only -no-color -detailed-exitcode`;

    try {
      const output = await ShellTool.run(cmd, { cwd, timeoutMs: 45000 });

      if (output.includes('No changes') || output.includes('Infrastructure matches the configuration')) {
        return `## IaC Drift Detection Report: ${dirPath}\n🟢 **Status: IN-SYNC**\nNo infrastructure drift detected. Live cloud resources match state file perfectly.`;
      }

      return (
        `## IaC Drift Detection Report: ${dirPath}\n` +
        `⚠️ **Status: DRIFT DETECTED**\n` +
        `Live cloud infrastructure has drifted from declared IaC configuration:\n\n` +
        `\`\`\`hcl\n${output.slice(0, 3500)}\n\`\`\``
      );
    } catch (err: any) {
      return `Failed to run drift detection: ${err.message}`;
    }
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
}
