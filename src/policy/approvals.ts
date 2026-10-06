import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomUUID } from 'node:crypto';
import { PolicyEvaluation } from '../types.js';
import { colorizeDiff } from './diff.js';
import { SreReview } from '../harness/reviewer.js';

export interface ApprovalHandler {
  requestApproval(
    evaluation: PolicyEvaluation,
    toolName: string,
    args: Record<string, any>,
    sreReview?: SreReview
  ): Promise<boolean>;
}

/**
 * Interactive CLI Approval Handler with Visual Diff Previews, Production Warnings, & Multi-Agent SRE Review
 */
export class CliApprovalHandler implements ApprovalHandler {
  async requestApproval(
    evaluation: PolicyEvaluation,
    toolName: string,
    args: Record<string, any>,
    sreReview?: SreReview
  ): Promise<boolean> {
    console.log('\n\x1b[33m─────────────────────────────────────────────────────────────\x1b[0m');

    if (evaluation.isProductionWarning) {
      console.log('\x1b[41m\x1b[37m\x1b[1m ⚠️  PRODUCTION ENVIRONMENT ALERT — HIGH-RISK MUTATION  \x1b[0m');
    } else {
      console.log('\x1b[1m\x1b[33m⚠️  [HUMAN-IN-THE-LOOP APPROVAL REQUIRED]\x1b[0m');
    }

    console.log(`\x1b[1mAction:\x1b[0m  ${evaluation.actionSummary}`);
    console.log(`\x1b[1mReason:\x1b[0m  ${evaluation.reason}`);

    // Show Senior SRE Peer Review verdict
    if (sreReview) {
      console.log('\n\x1b[1m\x1b[34m[Senior SRE Peer Review Assessment]:\x1b[0m');
      const badge =
        sreReview.verdict === 'APPROVED'
          ? '\x1b[32m✔ APPROVED\x1b[0m'
          : sreReview.verdict === 'CAUTION'
          ? '\x1b[33m⚠️ CAUTION ADVISED\x1b[0m'
          : '\x1b[31m⛔ REJECTED BY ARCHITECT\x1b[0m';
      console.log(`  Verdict:      ${badge} (Blast Radius: ${sreReview.blastRadius})`);
      console.log(`  Critique:     ${sreReview.critique}`);
      if (sreReview.suggestedSafeguards.length > 0) {
        console.log(`  Safeguards:   ${sreReview.suggestedSafeguards.join('; ')}`);
      }
    }

    if (toolName === 'shell_exec') {
      console.log(`\n\x1b[1mCommand:\x1b[0m \x1b[36m${args.command}\x1b[0m`);
    } else if (toolName === 'file_write') {
      console.log(`\n\x1b[1mTarget:\x1b[0m  \x1b[36m${args.path}\x1b[0m`);
      if (evaluation.diff) {
        console.log('\n\x1b[1m\x1b[35mVisual Diff Preview:\x1b[0m');
        console.log(colorizeDiff(evaluation.diff));
      }
    } else if (toolName === 'gitops_create_pr') {
      console.log(`\n\x1b[1mBranch:\x1b[0m   \x1b[36m${args.branchName}\x1b[0m`);
      console.log(`\x1b[1mTitle:\x1b[0m    ${args.title}`);
      console.log(`\x1b[1mFiles:\x1b[0m    ${(args.files || []).join(', ')}`);
    }

    console.log('\x1b[33m─────────────────────────────────────────────────────────────\x1b[0m');

    const rl = readline.createInterface({ input, output });
    try {
      const promptText = evaluation.isProductionWarning
        ? '\x1b[1m\x1b[31mConfirm execution on PRODUCTION? [y/N]: \x1b[0m'
        : '\x1b[1mApprove execution? [y/N]: \x1b[0m';

      const answer = await rl.question(promptText);
      const approved = answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
      if (approved) {
        console.log('\x1b[32m✔ Approved by operator. Executing...\x1b[0m\n');
      } else {
        console.log('\x1b[31m✖ Rejected by operator. Aborting action.\x1b[0m\n');
      }
      return approved;
    } finally {
      rl.close();
    }
  }
}

export interface PendingApproval {
  id: string;
  evaluation: PolicyEvaluation;
  toolName: string;
  args: Record<string, any>;
  sreReview?: SreReview;
  createdAt: number;
  resolve: (approved: boolean) => void;
  reject: (err: any) => void;
}

/**
 * Asynchronous Web & Dashboard Approval Handler
 * Dispatches approval requests to browser clients via SSE and awaits operator click
 */
export class WebApprovalHandler implements ApprovalHandler {
  private static pendingMap = new Map<string, PendingApproval>();
  private onRequested?: (pending: Omit<PendingApproval, 'resolve' | 'reject'>) => void;

  constructor(onRequested?: (pending: Omit<PendingApproval, 'resolve' | 'reject'>) => void) {
    this.onRequested = onRequested;
  }

  static getPending(id: string): PendingApproval | undefined {
    return this.pendingMap.get(id);
  }

  static getAllPending(): Array<Omit<PendingApproval, 'resolve' | 'reject'>> {
    const list: Array<Omit<PendingApproval, 'resolve' | 'reject'>> = [];
    for (const [id, item] of this.pendingMap.entries()) {
      list.push({
        id,
        evaluation: item.evaluation,
        toolName: item.toolName,
        args: item.args,
        sreReview: item.sreReview,
        createdAt: item.createdAt,
      });
    }
    return list;
  }

  static resolveApproval(id: string, approved: boolean): boolean {
    const item = this.pendingMap.get(id);
    if (!item) return false;
    this.pendingMap.delete(id);
    item.resolve(approved);
    return true;
  }

  requestApproval(
    evaluation: PolicyEvaluation,
    toolName: string,
    args: Record<string, any>,
    sreReview?: SreReview
  ): Promise<boolean> {
    const id = randomUUID();
    return new Promise<boolean>((resolve, reject) => {
      // 5-minute timeout fallback to prevent hung tasks
      const timeoutTimer = setTimeout(() => {
        if (WebApprovalHandler.pendingMap.has(id)) {
          WebApprovalHandler.pendingMap.delete(id);
          resolve(false);
        }
      }, 5 * 60 * 1000);

      const pending: PendingApproval = {
        id,
        evaluation,
        toolName,
        args,
        sreReview,
        createdAt: Date.now(),
        resolve: (approved) => {
          clearTimeout(timeoutTimer);
          resolve(approved);
        },
        reject: (err) => {
          clearTimeout(timeoutTimer);
          reject(err);
        },
      };

      WebApprovalHandler.pendingMap.set(id, pending);

      if (this.onRequested) {
        this.onRequested({
          id,
          evaluation,
          toolName,
          args,
          sreReview,
          createdAt: pending.createdAt,
        });
      }
    });
  }
}
