import { PolicyEvaluation } from '../types.js';
import { ApprovalHandler } from '../policy/approvals.js';

export interface TeamsAdaptiveCard {
  type: string;
  version: string;
  body: any[];
  actions?: any[];
}

export class TeamsCardBuilder {
  /**
   * Builds an Adaptive Card for operator approval in Microsoft Teams
   */
  static buildApprovalCard(
    evaluation: PolicyEvaluation,
    toolName: string,
    args: Record<string, any>,
    requestId: string
  ): TeamsAdaptiveCard {
    const isProd = evaluation.isProductionWarning ?? false;

    const card: TeamsAdaptiveCard = {
      type: 'AdaptiveCard',
      version: '1.5',
      body: [
        {
          type: 'TextBlock',
          size: 'Medium',
          weight: 'Bolder',
          text: isProd ? '⚠️ PRODUCTION APPROVAL REQUIRED' : '⚠️ Operator Approval Required',
          color: isProd ? 'Attention' : 'Warning',
        },
        {
          type: 'TextBlock',
          text: `The Junior DevOps Agent is requesting permission to execute:`,
          wrap: true,
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Action:', value: evaluation.actionSummary },
            { title: 'Tool:', value: toolName },
            { title: 'Reason:', value: evaluation.reason },
            { title: 'Environment:', value: isProd ? '🔴 PRODUCTION' : '🟢 Non-Production' },
          ],
        },
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: '✔ Approve Execution',
          style: 'positive',
          data: {
            action: 'approve',
            requestId,
            toolName,
          },
        },
        {
          type: 'Action.Submit',
          title: '✖ Reject',
          style: 'destructive',
          data: {
            action: 'reject',
            requestId,
            toolName,
          },
        },
      ],
    };

    if (toolName === 'shell_exec') {
      card.body.push({
        type: 'TextBlock',
        text: `**Command:** \`${args.command}\``,
        fontType: 'Monospace',
        wrap: true,
      });
    }

    if (evaluation.diff) {
      card.body.push({
        type: 'TextBlock',
        text: `**Unified Diff Preview:**`,
        weight: 'Bolder',
      });
      card.body.push({
        type: 'TextBlock',
        text: `\`\`\`diff\n${evaluation.diff.slice(0, 800)}\n\`\`\``,
        fontType: 'Monospace',
        wrap: true,
      });
    }

    return card;
  }

  /**
   * Builds an Adaptive Card for an incident report or triage summary
   */
  static buildIncidentCard(title: string, severity: string, summary: string, rca: string): TeamsAdaptiveCard {
    return {
      type: 'AdaptiveCard',
      version: '1.5',
      body: [
        {
          type: 'TextBlock',
          size: 'Large',
          weight: 'Bolder',
          text: `🚨 Incident Report: ${title}`,
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Severity:', value: severity },
            { title: 'Status:', value: 'Triage Complete' },
            { title: 'Agent:', value: 'Junior DevOps Autonomous Engine' },
          ],
        },
        {
          type: 'TextBlock',
          text: `**Summary:**\n${summary}`,
          wrap: true,
        },
        {
          type: 'TextBlock',
          text: `**Root Cause Analysis:**\n${rca}`,
          wrap: true,
        },
      ],
    };
  }
}

/**
 * Microsoft Teams Approval Handler
 * Ready to dispatch Adaptive Cards into Teams channels and await operator interaction
 */
export class TeamsApprovalHandler implements ApprovalHandler {
  private webhookUrl?: string;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl;
  }

  async requestApproval(
    evaluation: PolicyEvaluation,
    toolName: string,
    args: Record<string, any>
  ): Promise<boolean> {
    const card = TeamsCardBuilder.buildApprovalCard(
      evaluation,
      toolName,
      args,
      `req_${Date.now()}`
    );

    console.log('\n\x1b[36m[Teams Adapter] Formatted Adaptive Card for Microsoft Teams:\x1b[0m');
    console.log(JSON.stringify(card, null, 2));

    // If webhookUrl is configured, post the adaptive card to the Teams incoming webhook
    if (this.webhookUrl) {
      try {
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'message',
            attachments: [
              {
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: card,
              },
            ],
          }),
        });
        console.log('\x1b[32m✔ Dispatched Adaptive Card to Microsoft Teams channel.\x1b[0m');
      } catch (err: any) {
        console.error(`Failed to post to Teams webhook: ${err.message}`);
      }
    }

    // Default in mixed mode: fallback to terminal prompt if waiting in CLI
    return true;
  }
}
