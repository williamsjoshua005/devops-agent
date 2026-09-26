# Feature Spec 03: Immutable Audit Logging System

## 1. Overview & Objective
In enterprise platform engineering environments, compliance, traceability, and forensics require an immutable record of every autonomous and human-approved action. The **Immutable Audit Logging System** records every tool call, safety evaluation, operator approval, execution duration, and truncated output into a persistent, append-only JSON Lines ledger (`.audit/audit.jsonl`).

## 2. Architecture & Data Model
- **Format:** JSON Lines (`.jsonl`), ensuring append-only performance and crash resilience.
- **Location:** `.audit/audit.jsonl` in the workspace root (auto-created if absent).
- **Session Correlation:** Every multi-turn task receives a persistent `sessionId` (UUIDv4) that links all diagnostic queries and mutations together.

```mermaid
flowchart LR
    ToolExec[Tool Execution Lifecycle] --> AuditRecord[Construct AuditRecord]
    AuditRecord --> DiskAppend[(Append to .audit/audit.jsonl)]
    DiskAppend --> WebAPI[GET /api/audit]
    DiskAppend --> CLICommand[/audit CLI Command]
    DiskAppend --> WebUI[Web Console Audit Trail Table]
```

## 3. Data Interface & Schema
Located in [`src/types.ts`](file:///Users/joshua.williams/Documents/research/junior-devops-agent/src/types.ts) and [`src/policy/audit.ts`](file:///Users/joshua.williams/Documents/research/junior-devops-agent/src/policy/audit.ts):
```typescript
export interface AuditRecord {
  id: string;              // UUIDv4 unique identifier
  sessionId: string;       // Task execution session ID
  timestamp: string;       // ISO 8601 UTC timestamp
  toolName: string;        // Tool called (e.g. k8s_get_resources)
  args: Record<string, any>; // Invocation parameters
  tier: ActionTier;        // 'READ' | 'MUTATE' | 'DANGEROUS'
  isBlocked: boolean;      // True if rejected by policy
  requiresApproval: boolean; // True if approval was demanded
  approved?: boolean;      // Operator decision (true / false / undefined)
  durationMs: number;      // Milliseconds taken to execute
  outputSummary: string;   // Sanitized output snippet (first 500 chars)
}
```

## 4. Query Capabilities
- `getRecent(limit: number)`: Fetches the latest N audit entries in reverse chronological order for real-time dashboarding.
- `queryBySession(sessionId: string)`: Reconstructs the complete forensic timeline of an incident investigation.
- REST endpoint `GET /api/audit` powers the Mission Control Web Console live table.

## 5. Security & Tamper Resistance
- Uses Node.js file streams with `appendFile` to prevent overwriting existing history.
- Sensitive environment variables and secrets can be scrubbed before persisting to disk.
- `.audit/` is automatically ignored in Git to prevent accidental leakage of cluster runtime state.

## 6. Verification & Tests
Verified in [`test/smoke.test.ts`](file:///Users/joshua.williams/Documents/research/junior-devops-agent/test/smoke.test.ts):
- Test 6: Verifies audit entry creation with valid UUID, ISO timestamp, and tool execution metadata.
- Test 7: Verifies `getRecent()` properly reads and parses the JSONL log file.
