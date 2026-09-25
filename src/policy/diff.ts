/**
 * Lightweight unified diff generator for previews before mutating files
 */
export function generateUnifiedDiff(
  oldPath: string,
  oldText: string,
  newPath: string,
  newText: string
): string {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  let diff = `--- a/${oldPath}\n+++ b/${newPath}\n`;

  // If file is brand new
  if (oldLines.length === 0) {
    diff += `@@ -0,0 +1,${newLines.length} @@\n`;
    for (const line of newLines) {
      diff += `+${line}\n`;
    }
    return diff;
  }

  // Simple line-by-line diff
  const max = Math.max(oldLines.length, newLines.length);
  let chunk: string[] = [];
  let hasDiff = false;

  for (let i = 0; i < max; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      chunk.push(` ${oldLine ?? ''}`);
    } else {
      hasDiff = true;
      if (oldLine !== undefined) {
        chunk.push(`-${oldLine}`);
      }
      if (newLine !== undefined) {
        chunk.push(`+${newLine}`);
      }
    }
  }

  if (!hasDiff) {
    return '(No differences found)';
  }

  return diff + chunk.join('\n') + '\n';
}

/**
 * Format unified diff with ANSI colors for terminal display
 */
export function colorizeDiff(diffText: string): string {
  const lines = diffText.split('\n');
  return lines
    .map((line) => {
      if (line.startsWith('---') || line.startsWith('+++')) {
        return `\x1b[1m\x1b[37m${line}\x1b[0m`;
      }
      if (line.startsWith('@@')) {
        return `\x1b[36m${line}\x1b[0m`;
      }
      if (line.startsWith('+')) {
        return `\x1b[32m${line}\x1b[0m`;
      }
      if (line.startsWith('-')) {
        return `\x1b[31m${line}\x1b[0m`;
      }
      return `\x1b[90m${line}\x1b[0m`;
    })
    .join('\n');
}
