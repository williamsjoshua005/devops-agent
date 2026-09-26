import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { IncidentRecord } from '../types.js';

export interface ScoredIncident {
  incident: IncidentRecord;
  score: number;
}

export class SemanticKbTool {
  private static kbFile = path.join(process.cwd(), 'knowledge_base', 'incidents.json');

  /**
   * Search knowledge base using semantic term-frequency vector similarity
   */
  static async search(query: string, topK: number = 3): Promise<string> {
    try {
      const data = await fs.readFile(this.kbFile, 'utf-8');
      const incidents: IncidentRecord[] = JSON.parse(data);

      if (incidents.length === 0) {
        return 'Knowledge base is currently empty.';
      }

      const scored: ScoredIncident[] = incidents.map((inc) => {
        const docText = `${inc.title} ${inc.symptom} ${inc.rca} ${inc.fix} ${inc.tags.join(' ')}`.toLowerCase();
        const score = this.calculateSimilarity(query.toLowerCase(), docText);
        return { incident: inc, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const topMatches = scored.filter((s) => s.score > 0.05).slice(0, topK);

      if (topMatches.length === 0) {
        return `No incidents found with semantic similarity to "${query}".`;
      }

      let report = `## Semantic Incident Memory Search (Top ${topMatches.length} Matches)\n\n`;
      for (const m of topMatches) {
        const pct = Math.round(m.score * 100);
        report += `### [${pct}% Semantic Match] ${m.incident.title} (${m.incident.date})\n`;
        report += `• **Symptom:** ${m.incident.symptom}\n`;
        report += `• **Root Cause Analysis (RCA):** ${m.incident.rca}\n`;
        report += `• **Proven Remediation:** ${m.incident.fix}\n\n`;
      }

      return report;
    } catch {
      return 'Knowledge base file not found or empty.';
    }
  }

  /**
   * Cosine similarity between query bag-of-words and document text
   */
  private static calculateSimilarity(query: string, doc: string): number {
    const qTokens = query.split(/\W+/).filter((t) => t.length > 2);
    const dTokens = doc.split(/\W+/).filter((t) => t.length > 2);

    if (qTokens.length === 0 || dTokens.length === 0) return 0;

    const dFreq = new Map<string, number>();
    for (const t of dTokens) {
      dFreq.set(t, (dFreq.get(t) || 0) + 1);
    }

    let matchCount = 0;
    for (const q of qTokens) {
      if (dFreq.has(q)) {
        matchCount += 1 + Math.log(dFreq.get(q)!);
      }
    }

    // Cosine normalization
    const magQ = Math.sqrt(qTokens.length);
    const magD = Math.sqrt(dTokens.length);
    return Math.min(1.0, matchCount / (magQ * Math.min(magD, 15)));
  }
}
