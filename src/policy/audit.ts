import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuditRecord } from '../types.js';
import { SecretSanitizer } from './sanitizer.js';

export class AuditLogger {
  private logPath: string;

  constructor(baseDir: string = process.cwd()) {
    this.logPath = path.join(baseDir, '.audit', 'audit.jsonl');
  }

  async record(entry: Omit<AuditRecord, 'id' | 'timestamp'>): Promise<AuditRecord> {
    // Sanitize any secrets in args, output summary, and errors
    const sanitizedRecord: AuditRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
      args: SecretSanitizer.sanitizeObject(entry.args || {}),
      outputSummary: SecretSanitizer.sanitize(entry.outputSummary || ''),
      error: entry.error ? SecretSanitizer.sanitize(entry.error) : undefined,
    };

    try {
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      await fs.appendFile(this.logPath, JSON.stringify(sanitizedRecord) + '\n', 'utf-8');
    } catch (err: any) {
      console.error(`[AuditLogger] Failed to write audit record: ${err.message}`);
    }

    return sanitizedRecord;
  }

  async getRecent(limit: number = 20): Promise<AuditRecord[]> {
    try {
      const data = await fs.readFile(this.logPath, 'utf-8');
      const lines = data.trim().split('\n').filter(Boolean);
      const records = lines.map((l) => JSON.parse(l) as AuditRecord);
      return records.slice(-limit).reverse();
    } catch {
      return [];
    }
  }
}
