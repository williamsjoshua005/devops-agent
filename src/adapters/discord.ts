import { PolicyEvaluation } from '../types.js';
import { SreReview } from '../harness/reviewer.js';

export class DiscordEmbedBuilder {
  static buildApprovalEmbed(
    evaluation: PolicyEvaluation,
    toolName: string,
    args: Record<string, any>,
    sreReview?: SreReview
  ): any {
    const isProd = evaluation.isProductionWarning ?? false;

    const fields = [
      { name: 'Action', value: evaluation.actionSummary, inline: false },
      { name: 'Tool', value: `\`${toolName}\``, inline: true },
      { name: 'Environment', value: isProd ? '🔴 PRODUCTION' : '🟢 Non-Production', inline: true },
      { name: 'Reason', value: evaluation.reason, inline: false },
    ];

    if (sreReview) {
      fields.push({
        name: 'Senior SRE Review',
        value: `**${sreReview.verdict}** (Blast Radius: ${sreReview.blastRadius})\n${sreReview.critique}`,
        inline: false,
      });
    }

    return {
      embeds: [
        {
          title: isProd ? '🚨 PRODUCTION APPROVAL REQUIRED' : '⚠️ Operator Approval Required',
          color: isProd ? 0xff0000 : 0xffaa00,
          fields,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
