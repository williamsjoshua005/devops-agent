import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class FileTool {
  static async read(filePath: string): Promise<string> {
    const resolved = path.resolve(process.cwd(), filePath);
    try {
      const content = await fs.readFile(resolved, 'utf-8');
      return content;
    } catch (err: any) {
      return `Error reading file ${filePath}: ${err.message}`;
    }
  }

  static async write(filePath: string, content: string): Promise<string> {
    const resolved = path.resolve(process.cwd(), filePath);
    try {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, 'utf-8');
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (err: any) {
      return `Error writing file ${filePath}: ${err.message}`;
    }
  }

  static async list(dirPath: string = '.'): Promise<string> {
    const resolved = path.resolve(process.cwd(), dirPath);
    try {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const lines = entries.map((e) => `${e.isDirectory() ? '[DIR] ' : '[FILE]'} ${e.name}`);
      return lines.join('\n');
    } catch (err: any) {
      return `Error listing directory ${dirPath}: ${err.message}`;
    }
  }
}
