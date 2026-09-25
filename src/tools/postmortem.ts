import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { IncidentRecord, PostmortemData } from '../types.js';

export class PostmortemTool {
  private static reportsDir = path.join(process.cwd(), 'reports');
  private static kbFile = path.join(process.cwd(), 'knowledge_base', 'incidents.json');

  /**
   * Generate a formatted postmortem incident report and store in knowledge base
   */
  static async generate(data: PostmortemData): Promise<string> {
    const dateStr = new Date().toISOString().split('T')[0];
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const fileName = `postmortem-${dateStr}-${slug}.md`;
    const filePath = path.join(this.reportsDir, fileName);

    const markdown = `# Incident Postmortem: ${data.title}

| Field | Value |
| :--- | :--- |
| **Date** | ${dateStr} |
| **Severity** | ${data.severity} |
| **Service Affected** | ${data.service} |
| **Status** | Resolved |

---

## 1. Executive Summary & Impact
${data.impact}

---

## 2. Symptoms Observed
${data.symptom}

---

## 3. Root Cause Analysis (5 Whys / RCA)
${data.rootCause}

---

## 4. Remediation Taken
${data.remediation}

---

## 5. Preventative Action Items
${(data.actionItems || []).map((item, i) => `${i + 1}. [ ] ${item}`).join('\n')}
`;

    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      await fs.writeFile(filePath, markdown, 'utf-8');

      // Append to knowledge base
      await this.saveToKnowledgeBase({
        id: randomUUID(),
        title: data.title,
        symptom: data.symptom,
        rca: data.rootCause,
        fix: data.remediation,
        date: dateStr,
        tags: [data.service, data.severity, 'kubernetes'],
      });

      return `[Postmortem Generated Successfully]\nSaved Report: ${filePath}\nReport was also indexed into local incident knowledge base.`;
    } catch (err: any) {
      return `Failed to write postmortem report: ${err.message}`;
    }
  }

  /**
   * Search knowledge base for past incident solutions
   */
  static async searchKnowledgeBase(query: string): Promise<string> {
    try {
      const data = await fs.readFile(this.kbFile, 'utf-8');
      const incidents: IncidentRecord[] = JSON.parse(data);

      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = incidents.filter((inc) => {
        const fullText = `${inc.title} ${inc.symptom} ${inc.rca} ${inc.tags.join(' ')}`.toLowerCase();
        return terms.some((term) => fullText.includes(term));
      });

      if (matches.length === 0) {
        return `No past incidents found matching "${query}".`;
      }

      return (
        `[Found ${matches.length} Past Incident(s) in Knowledge Base]\n` +
        matches
          .map(
            (m) =>
              `• [${m.date}] ${m.title}\n  - Symptom: ${m.symptom}\n  - RCA: ${m.rca}\n  - Fix: ${m.fix}`
          )
          .join('\n\n')
      );
    } catch {
      return 'Knowledge base is currently empty. Run incidents and postmortems will be cataloged here automatically.';
    }
  }

  private static async saveToKnowledgeBase(record: IncidentRecord) {
    try {
      await fs.mkdir(path.dirname(this.kbFile), { recursive: true });
      let records: IncidentRecord[] = [];
      try {
        const existing = await fs.readFile(this.kbFile, 'utf-8');
        records = JSON.parse(existing);
      } catch {}

      records.push(record);
      await fs.writeFile(this.kbFile, JSON.stringify(records, null, 2), 'utf-8');
    } catch (err: any) {
      console.error(`Failed to save to knowledge base: ${err.message}`);
    }
  }
}
