import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditRecord } from '../types.js';
import { SecretSanitizer } from './sanitizer.js';

export class AuditLogger {
  private logPath: string;
  private encryptionKey?: Buffer;

  constructor(baseDir: string = process.cwd(), encryptionKey?: string) {
    this.logPath = path.join(baseDir, '.audit', 'audit.jsonl');
    const rawKey = encryptionKey || process.env.AUDIT_ENCRYPTION_KEY;
    if (rawKey && rawKey.trim()) {
      this.encryptionKey = createHash('sha256').update(rawKey).digest();
    }
  }

  private encryptEnvelope(plaintext: string): string {
    if (!this.encryptionKey) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return JSON.stringify({
      _enc: true,
      iv: iv.toString('hex'),
      authTag,
      ciphertext: encrypted,
    });
  }

  private decryptEnvelope(line: string): string {
    if (!this.encryptionKey) return line;
    try {
      const parsed = JSON.parse(line);
      if (parsed._enc && parsed.iv && parsed.authTag && parsed.ciphertext) {
        const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(parsed.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(parsed.authTag, 'hex'));
        let decrypted = decipher.update(parsed.ciphertext, 'hex', 'utf-8');
        decrypted += decipher.final('utf-8');
        return decrypted;
      }
    } catch {}
    return line;
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
      const recordLine = this.encryptEnvelope(JSON.stringify(sanitizedRecord));
      await fs.appendFile(this.logPath, recordLine + '\n', 'utf-8');
    } catch (err: any) {
      console.error(`[AuditLogger] Failed to write audit record: ${err.message}`);
    }

    return sanitizedRecord;
  }

  async getRecent(limit: number = 20): Promise<AuditRecord[]> {
    try {
      const data = await fs.readFile(this.logPath, 'utf-8');
      const lines = data.trim().split('\n').filter(Boolean);
      const records: AuditRecord[] = [];
      for (const line of lines) {
        try {
          const decryptedJson = this.decryptEnvelope(line);
          records.push(JSON.parse(decryptedJson) as AuditRecord);
        } catch {}
      }
      return records.slice(-limit).reverse();
    } catch {
      return [];
    }
  }
}
