import { ShellTool } from './shell.js';
import { generateUnifiedDiff } from '../policy/diff.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class KustomizeTool {
  /**
   * Render Kustomize manifests from an overlay or base directory
   */
  static async build(targetPath: string = '.'): Promise<string> {
    const cwd = path.resolve(process.cwd(), targetPath);

    if (!fs.existsSync(cwd)) {
      return `Target directory "${targetPath}" does not exist.`;
    }

    const hasKustomization =
      fs.existsSync(path.join(cwd, 'kustomization.yaml')) ||
      fs.existsSync(path.join(cwd, 'kustomization.yml')) ||
      fs.existsSync(path.join(cwd, 'Kustomization'));

    if (!hasKustomization) {
      return `No kustomization.yaml found in directory "${targetPath}".`;
    }

    // Try standalone kustomize CLI first, fallback to kubectl kustomize
    const kustomizeBin = (await ShellTool.run('which kustomize')).includes('/kustomize')
      ? 'kustomize build'
      : 'kubectl kustomize';

    const cmd = `${kustomizeBin} "${cwd}"`.trim();

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 30000 });
      if (output.startsWith('Error executing command')) {
        return `Failed to build Kustomize overlay: ${output}`;
      }

      const manifests = output.split(/^---$/m).filter((m) => m.trim().length > 0);
      const summaryList: string[] = [];
      for (const m of manifests) {
        const kindMatch = m.match(/kind:\s*([a-zA-Z0-9]+)/);
        const nameMatch = m.match(/metadata:\s*[\r\n]+\s*name:\s*([a-zA-Z0-9.-]+)/);
        const nsMatch = m.match(/namespace:\s*([a-zA-Z0-9.-]+)/);
        if (kindMatch && nameMatch) {
          const nsStr = nsMatch ? ` (ns: ${nsMatch[1]})` : '';
          summaryList.push(`• \`${kindMatch[1]}/${nameMatch[1]}\`${nsStr}`);
        }
      }

      let report = `## Kustomize Build Report: \`${targetPath}\`\n`;
      report += `**Render Engine:** \`${kustomizeBin}\` • **Rendered Resources:** \`${manifests.length}\`\n\n`;
      report += `### Manifest Breakdown:\n${summaryList.slice(0, 20).join('\n')}\n`;
      if (summaryList.length > 20) {
        report += `\n*(...and ${summaryList.length - 20} more manifests)*\n`;
      }
      report += `\n### Rendered Manifest Preview:\n\`\`\`yaml\n${output.slice(0, 3500)}\n\`\`\``;
      return report;
    } catch (err: any) {
      return `Error building Kustomize manifests: ${err.message}`;
    }
  }

  /**
   * Compare two Kustomize targets (e.g. base vs overlay or dev vs prod) and output a unified diff
   */
  static async diff(basePath: string, overlayPath: string): Promise<string> {
    const cwdBase = path.resolve(process.cwd(), basePath);
    const cwdOverlay = path.resolve(process.cwd(), overlayPath);

    if (!fs.existsSync(cwdBase)) return `Base directory "${basePath}" does not exist.`;
    if (!fs.existsSync(cwdOverlay)) return `Overlay directory "${overlayPath}" does not exist.`;

    const kustomizeBin = (await ShellTool.run('which kustomize')).includes('/kustomize')
      ? 'kustomize build'
      : 'kubectl kustomize';

    try {
      const baseOutput = await ShellTool.run(`${kustomizeBin} "${cwdBase}"`, { timeoutMs: 30000 });
      const overlayOutput = await ShellTool.run(`${kustomizeBin} "${cwdOverlay}"`, { timeoutMs: 30000 });

      if (baseOutput.startsWith('Error') || overlayOutput.startsWith('Error')) {
        return `Failed to render manifests for diff:\nBase: ${baseOutput.slice(0, 200)}\nOverlay: ${overlayOutput.slice(0, 200)}`;
      }

      const diff = generateUnifiedDiff(basePath, overlayPath, baseOutput, overlayOutput);

      return (
        `## Kustomize Overlay Visual Diff\n` +
        `**Base:** \`${basePath}\` ➔ **Target Overlay:** \`${overlayPath}\`\n\n` +
        `\`\`\`diff\n${diff || '(No manifest changes between base and overlay)'}\n\`\`\``
      );
    } catch (err: any) {
      return `Failed to generate Kustomize diff: ${err.message}`;
    }
  }
}
