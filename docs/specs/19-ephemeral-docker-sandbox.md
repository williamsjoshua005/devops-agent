# Feature Spec 19: Ephemeral Docker Sandbox Runner

## 1. Overview & Objective
Executing untrusted scripts or running complex shell commands directly on a platform engineer's host machine creates risks of environment contamination, dependency conflicts, or accidental filesystem destruction. The **Ephemeral Docker Sandbox Runner** isolates command execution within short-lived, disposable Docker containers with enforced memory, CPU, and filesystem constraints.

## 2. Sandbox Architecture
Located in [`src/sandbox/docker.ts`](file:///Users/joshua.williams/Documents/research/junior-devops-agent/src/sandbox/docker.ts):

```mermaid
flowchart TD
    ExecReq[Command Execution Request] --> DockerCheck{Docker Daemon Active?}
    DockerCheck -- Yes --> SpawnContainer[Spawn Ephemeral Container\nImage: alpine / devops-toolbox\nFlags: --rm -m 512m --cpus 1.0]
    SpawnContainer --> MountVolume[Mount Workspace Directory: -v pwd:/workspace]
    MountVolume --> RunInSandbox[Execute Isolated Command]
    RunInSandbox --> ContainerDestroyed[Container Auto-Destroyed on Exit (--rm)]
    ContainerDestroyed --> ReturnOutput[Return Clean Output to Agent]

    DockerCheck -- No --> Fallback[Graceful Fallback: Execute on Host with Safety Audit Warning]
    Fallback --> ReturnOutput
```

## 3. Data Interface & Schema
```typescript
export interface SandboxOptions {
  image?: string;          // Default: alpine:latest or custom tooling image
  timeoutMs?: number;      // Default: 30000 ms
  memoryLimit?: string;    // Default: '512m'
  cpuLimit?: string;       // Default: '1.0'
  environmentVars?: Record<string, string>;
}

export class DockerSandbox {
  static async isAvailable(): Promise<boolean>;
  static async runInSandbox(command: string, options?: SandboxOptions): Promise<string>;
}
```

## 4. Key Security Boundaries
1. **Disposable Lifecycle (`--rm`):** Every container instance is completely wiped from disk immediately upon process termination.
2. **Resource Quotas:** Constrained by Docker memory flags (`-m 512m`) and CPU caps (`--cpus 1.0`) to prevent fork bombs or CPU runaway.
3. **Graceful Host Fallback:** If the user does not have Docker Desktop running, the sandbox detects daemon unreachability and falls back to controlled local execution without breaking agent operations.
