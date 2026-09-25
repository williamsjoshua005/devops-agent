import { FileTool } from './files.js';

export interface SecurityFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  rule: string;
  message: string;
  recommendation: string;
}

export class SecurityLinterTool {
  /**
   * Scan a Kubernetes manifest or Dockerfile for security vulnerabilities and best practices
   */
  static async scan(targetPath: string): Promise<string> {
    const content = await FileTool.read(targetPath);
    if (content.startsWith('Error reading file')) {
      return content;
    }

    const isDockerfile = targetPath.toLowerCase().includes('dockerfile') || targetPath.endsWith('.dockerfile');
    const findings: SecurityFinding[] = isDockerfile
      ? this.scanDockerfile(content)
      : this.scanKubernetesManifest(content);

    return this.formatReport(targetPath, isDockerfile ? 'Dockerfile' : 'Kubernetes Manifest', findings);
  }

  private static scanKubernetesManifest(yamlContent: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // 1. Privileged container
    if (/privileged:\s*true/i.test(yamlContent)) {
      findings.push({
        severity: 'CRITICAL',
        rule: 'K8S-SEC-001',
        message: 'Container has `privileged: true` enabled.',
        recommendation: 'Remove `privileged: true`. Grant only required Linux capabilities under `capabilities.add`.',
      });
    }

    // 2. Sensitive hostPath mounts
    if (/hostPath:\s*(\n\s+path:\s*(['"]?(\/|\/etc|\/var\/run\/docker\.sock|\/proc)['"]?))/i.test(yamlContent)) {
      findings.push({
        severity: 'CRITICAL',
        rule: 'K8S-SEC-002',
        message: 'Sensitive hostPath volume mount detected (e.g. docker.sock or root filesystem).',
        recommendation: 'Avoid mounting host paths. Use PVCs or emptyDir volumes instead.',
      });
    }

    // 3. hostNetwork or hostPID
    if (/hostNetwork:\s*true/i.test(yamlContent) || /hostPID:\s*true/i.test(yamlContent)) {
      findings.push({
        severity: 'HIGH',
        rule: 'K8S-SEC-003',
        message: 'Pod shares host network or process namespace (`hostNetwork: true` / `hostPID: true`).',
        recommendation: 'Set `hostNetwork: false` and `hostPID: false` to maintain container network isolation.',
      });
    }

    // 4. Missing runAsNonRoot
    if (!/runAsNonRoot:\s*true/i.test(yamlContent)) {
      findings.push({
        severity: 'HIGH',
        rule: 'K8S-SEC-004',
        message: 'Missing or disabled `runAsNonRoot: true` in securityContext.',
        recommendation: 'Configure `securityContext.runAsNonRoot: true` and specify a non-zero `runAsUser`.',
      });
    }

    // 5. Missing resource limits (DoS / OOM risk)
    if (!/limits:\s*(\n\s+(cpu|memory):)/i.test(yamlContent)) {
      findings.push({
        severity: 'MEDIUM',
        rule: 'K8S-SEC-005',
        message: 'Missing `resources.limits` (CPU and Memory).',
        recommendation: 'Specify `resources.limits.memory` and `resources.limits.cpu` to prevent noisy neighbor and node OOM failures.',
      });
    }

    // 6. Missing liveness or readiness probes
    if (!/livenessProbe:/i.test(yamlContent) || !/readinessProbe:/i.test(yamlContent)) {
      findings.push({
        severity: 'MEDIUM',
        rule: 'K8S-SEC-006',
        message: 'Missing `livenessProbe` or `readinessProbe`.',
        recommendation: 'Define readiness and liveness HTTP/TCP probes to ensure smooth rolling updates without dropping traffic.',
      });
    }

    // 7. Unpinned image tags
    if (/image:\s*['"]?[a-zA-Z0-9_.-]+(:latest)?['"]?\s*$/m.test(yamlContent) || /image:\s*['"]?[a-zA-Z0-9_./-]+:latest['"]?/i.test(yamlContent)) {
      findings.push({
        severity: 'LOW',
        rule: 'K8S-SEC-007',
        message: 'Container image uses mutable `:latest` tag or lacks a version pin.',
        recommendation: 'Pin image to an immutable semantic version tag (e.g. `:v1.2.3`) or SHA256 digest.',
      });
    }

    // 8. Writable root filesystem
    if (!/readOnlyRootFilesystem:\s*true/i.test(yamlContent)) {
      findings.push({
        severity: 'LOW',
        rule: 'K8S-SEC-008',
        message: 'Container filesystem is writable (`readOnlyRootFilesystem: true` omitted).',
        recommendation: 'Enforce `securityContext.readOnlyRootFilesystem: true` and mount emptyDir for temporary write paths.',
      });
    }

    return findings;
  }

  private static scanDockerfile(dockerfileContent: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // 1. Hardcoded secrets
    if (/ENV\s+(.*(SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY).*\s*=\s*.+)/i.test(dockerfileContent)) {
      findings.push({
        severity: 'CRITICAL',
        rule: 'DOCKER-SEC-001',
        message: 'Potential hardcoded secret or API token in ENV instruction.',
        recommendation: 'Do NOT embed secrets in images. Use Kubernetes Secrets or Azure KeyVault at runtime.',
      });
    }

    // 2. Running as root user
    if (!/USER\s+(?!root\b)[a-zA-Z0-9_-]+/i.test(dockerfileContent)) {
      findings.push({
        severity: 'HIGH',
        rule: 'DOCKER-SEC-002',
        message: 'No non-root `USER` directive detected (container runs as root by default).',
        recommendation: 'Add `USER appuser` (or non-root UID) before the ENTRYPOINT/CMD.',
      });
    }

    // 3. Using ADD instead of COPY
    if (/^ADD\s+/m.test(dockerfileContent)) {
      findings.push({
        severity: 'LOW',
        rule: 'DOCKER-SEC-003',
        message: 'Using `ADD` instruction instead of `COPY`.',
        recommendation: 'Use `COPY` for local files. `ADD` can auto-extract archives and fetch remote URLs unexpectedly.',
      });
    }

    // 4. Base image with latest tag
    if (/FROM\s+[a-zA-Z0-9_.-]+(:latest)?\s*$/m.test(dockerfileContent) || /FROM\s+[a-zA-Z0-9_.-]+:latest\b/i.test(dockerfileContent)) {
      findings.push({
        severity: 'MEDIUM',
        rule: 'DOCKER-SEC-004',
        message: 'Base image uses mutable `:latest` tag.',
        recommendation: 'Pin base image to a specific version or minimal digest (e.g. `node:20-alpine`).',
      });
    }

    return findings;
  }

  private static formatReport(filePath: string, type: string, findings: SecurityFinding[]): string {
    const critical = findings.filter((f) => f.severity === 'CRITICAL').length;
    const high = findings.filter((f) => f.severity === 'HIGH').length;
    const medium = findings.filter((f) => f.severity === 'MEDIUM').length;
    const low = findings.filter((f) => f.severity === 'LOW').length;

    const status = critical + high > 0 ? '❌ FAILED SECURITY AUDIT' : '✔ PASSED SECURITY AUDIT';

    let out = `## Security Audit Report: ${filePath} (${type})\n`;
    out += `**Status:** ${status}\n`;
    out += `**Summary:** ${critical} Critical | ${high} High | ${medium} Medium | ${low} Low\n\n`;

    if (findings.length === 0) {
      out += '✔ No security misconfigurations detected. Well done!';
      return out;
    }

    out += '| Severity | Rule | Finding | Recommendation |\n';
    out += '| :--- | :--- | :--- | :--- |\n';
    for (const f of findings) {
      out += `| **${f.severity}** | \`${f.rule}\` | ${f.message} | ${f.recommendation} |\n`;
    }

    return out;
  }
}
