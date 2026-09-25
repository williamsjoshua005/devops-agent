import { LLMClient } from './llm.js';
import { AgentContext, PolicyEvaluation } from '../types.js';

export interface SreReview {
  approved: boolean;
  verdict: 'APPROVED' | 'CAUTION' | 'REJECTED';
  blastRadius: 'LOW' | 'MEDIUM' | 'HIGH';
  critique: string;
  suggestedSafeguards: string[];
}

export class SeniorSreReviewer {
  private llm?: LLMClient;

  constructor(llm?: LLMClient) {
    this.llm = llm;
  }

  /**
   * Perform senior SRE pre-flight architectural review on a proposed junior agent action
   */
  async review(
    evaluation: PolicyEvaluation,
    toolName: string,
    args: Record<string, any>,
    context: AgentContext
  ): Promise<SreReview> {
    // If LLM is available, perform intelligent SRE assessment
    if (this.llm) {
      try {
        const prompt = `You are a Senior Principal SRE and Infrastructure Architect.
A Junior DevOps Agent is proposing the following action:

- Action: ${evaluation.actionSummary}
- Tool: ${toolName}
- Target Environment: ${context.environment.toUpperCase()} (isProduction: ${context.isProduction})
- Arguments: ${JSON.stringify(args)}
- Diff: ${evaluation.diff || '(No file diff)'}
- Stated Reason: ${evaluation.reason}

Perform a rigorous pre-flight safety review:
1. Blast Radius: Assess impact on upstream/downstream services.
2. Downtime & Availability Risk.
3. Pre-flight Safeguards: What must be checked before proceeding?

Return a concise verdict in JSON format:
{
  "verdict": "APPROVED" | "CAUTION" | "REJECTED",
  "blastRadius": "LOW" | "MEDIUM" | "HIGH",
  "critique": "1-2 sentence assessment",
  "suggestedSafeguards": ["safeguard 1", "safeguard 2"]
}`;

        const res = await this.llm.chat(
          [
            { role: 'system', content: 'You are an elite Senior Staff SRE reviewer.' },
            { role: 'user', content: prompt },
          ],
          []
        );

        if (res.content) {
          const jsonMatch = res.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              approved: parsed.verdict !== 'REJECTED',
              verdict: parsed.verdict || 'APPROVED',
              blastRadius: parsed.blastRadius || 'LOW',
              critique: parsed.critique || 'Action deemed acceptable.',
              suggestedSafeguards: parsed.suggestedSafeguards || [],
            };
          }
        }
      } catch {}
    }

    // Heuristic Fallback
    const isProd = context.isProduction;
    const isRestart = toolName === 'k8s_rollout_restart';
    const isPr = toolName === 'gitops_create_pr';

    if (isPr) {
      return {
        approved: true,
        verdict: 'APPROVED',
        blastRadius: 'LOW',
        critique: 'Creating a GitOps PR is the gold standard for change management. Zero direct cluster risk.',
        suggestedSafeguards: ['Require peer review in PR before merging'],
      };
    }

    if (isProd && isRestart) {
      return {
        approved: true,
        verdict: 'CAUTION',
        blastRadius: 'MEDIUM',
        critique: 'Rolling restart in PRODUCTION. Ensure minimum available replicas prevent 503 errors during pod cycle.',
        suggestedSafeguards: ['Verify PodDisruptionBudget', 'Monitor rollout status closely'],
      };
    }

    return {
      approved: true,
      verdict: 'APPROVED',
      blastRadius: isProd ? 'MEDIUM' : 'LOW',
      critique: 'Action matches standard runbook remediation. Proceed with operator oversight.',
      suggestedSafeguards: ['Verify service health post-execution'],
    };
  }
}
