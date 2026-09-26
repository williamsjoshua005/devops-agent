import { PolicyEvaluation } from '../types.js';
import { SreReview } from '../harness/reviewer.js';

export class SlackBlockKitBuilder {
  /**
   * Build Slack Block Kit interactive approval message
   */
  static buildApprovalBlocks(
    evaluation: PolicyEvaluation,
    toolName: string,
    args: Record<string, any>,
    requestId: string,
    sreReview?: SreReview
  ): any {
    const isProd = evaluation.isProductionWarning ?? false;
    const headerText = isProd
      ? '🚨 *PRODUCTION APPROVAL REQUIRED*'
      : '⚠️ *Operator Approval Required*';

    const blocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: isProd ? 'PRODUCTION APPROVAL REQUIRED' : 'Operator Approval Required', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Action:*\n${evaluation.actionSummary}` },
          { type: 'mrkdwn', text: `*Tool:*\n\`${toolName}\`` },
          { type: 'mrkdwn', text: `*Environment:*\n${isProd ? '🔴 PRODUCTION' : '🟢 Non-Production'}` },
          { type: 'mrkdwn', text: `*Reason:*\n${evaluation.reason}` },
        ],
      },
    ];

    if (sreReview) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Senior SRE Review:* ${sreReview.verdict} (Blast Radius: ${sreReview.blastRadius})\n_${sreReview.critique}_`,
        },
      });
    }

    if (evaluation.diff) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Unified Diff Preview:*\n\`\`\`diff\n${evaluation.diff.slice(0, 600)}\n\`\`\``,
        },
      });
    }

    // Interactive Buttons
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve Execution', emoji: true },
          style: 'primary',
          value: JSON.stringify({ action: 'approve', requestId }),
          action_id: 'devops_approve',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject', emoji: true },
          style: 'danger',
          value: JSON.stringify({ action: 'reject', requestId }),
          action_id: 'devops_reject',
        },
      ],
    });

    return { blocks };
  }

  /**
   * Build Slack Incident Alert message
   */
  static buildIncidentBlocks(title: string, severity: string, summary: string, rca: string): any {
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🚨 Incident Report: ${title}`, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Severity:*\n${severity}` },
            { type: 'mrkdwn', text: `*Status:*\nTriage Complete` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Summary:*\n${summary}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Root Cause Analysis:*\n${rca}` },
        },
      ],
    };
  }
}
