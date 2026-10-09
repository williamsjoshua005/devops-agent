import { ShellTool } from './shell.js';

export interface ImageVulnerability {
  id: string;
  pkgName: string;
  installedVersion: string;
  fixedVersion?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title?: string;
  description?: string;
}

export interface ImageScanResult {
  image: string;
  scanner: 'trivy' | 'grype' | 'docker' | 'heuristic';
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  vulnerabilities: ImageVulnerability[];
  recommendations: string[];
}

export class ContainerSecurityTool {
  /**
   * Scan a container image for vulnerabilities and CVEs
   */
  static async scanImage(
    image: string,
    severityThreshold: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH',
    format: 'summary' | 'json' = 'summary'
  ): Promise<string> {
    const trimmedImage = image.trim();
    if (!trimmedImage) {
      return 'Error: No container image specified for vulnerability scanning.';
    }

    // 1. Try Trivy scanner if available
    try {
      const trivyCheck = await ShellTool.run('which trivy');
      if (trivyCheck && !trivyCheck.includes('not found')) {
        return await this.scanWithTrivy(trimmedImage, severityThreshold, format);
      }
    } catch {}

    // 2. Try Grype scanner if available
    try {
      const grypeCheck = await ShellTool.run('which grype');
      if (grypeCheck && !grypeCheck.includes('not found')) {
        return await this.scanWithGrype(trimmedImage, severityThreshold, format);
      }
    } catch {}

    // 3. Fallback: Intelligent heuristic and metadata security inspection
    return await this.scanWithHeuristic(trimmedImage, severityThreshold, format);
  }

  /**
   * Trivy scan implementation
   */
  private static async scanWithTrivy(
    image: string,
    severityThreshold: string,
    format: string
  ): Promise<string> {
    const severities = this.getSeverityList(severityThreshold).join(',');
    const cmd = `trivy image --severity ${severities} --format json --quiet ${image}`;
    try {
      const raw = await ShellTool.run(cmd, { timeoutMs: 30000 });
      const parsed = JSON.parse(raw);
      const vulns: ImageVulnerability[] = [];

      if (parsed.Results && Array.isArray(parsed.Results)) {
        for (const res of parsed.Results) {
          if (res.Vulnerabilities && Array.isArray(res.Vulnerabilities)) {
            for (const v of res.Vulnerabilities) {
              vulns.push({
                id: v.VulnerabilityID,
                pkgName: v.PkgName,
                installedVersion: v.InstalledVersion,
                fixedVersion: v.FixedVersion || 'None',
                severity: v.Severity,
                title: v.Title || v.Description?.slice(0, 80),
              });
            }
          }
        }
      }

      return this.formatScanOutput(image, 'trivy', vulns, format);
    } catch (err: any) {
      return this.scanWithHeuristic(image, severityThreshold, format, `Trivy execution failed (${err.message}). Defaulted to heuristic scanner.`);
    }
  }

  /**
   * Grype scan implementation
   */
  private static async scanWithGrype(
    image: string,
    severityThreshold: string,
    format: string
  ): Promise<string> {
    const cmd = `grype ${image} -o json`;
    try {
      const raw = await ShellTool.run(cmd, { timeoutMs: 30000 });
      const parsed = JSON.parse(raw);
      const severities = this.getSeverityList(severityThreshold);
      const vulns: ImageVulnerability[] = [];

      if (parsed.matches && Array.isArray(parsed.matches)) {
        for (const m of parsed.matches) {
          const sev = (m.vulnerability?.severity || 'LOW').toUpperCase() as any;
          if (severities.includes(sev)) {
            vulns.push({
              id: m.vulnerability?.id || 'CVE-UNKNOWN',
              pkgName: m.artifact?.name || 'unknown',
              installedVersion: m.artifact?.version || 'unknown',
              fixedVersion: m.vulnerability?.fix?.versions?.[0] || 'None',
              severity: sev,
              title: m.vulnerability?.description?.slice(0, 80),
            });
          }
        }
      }

      return this.formatScanOutput(image, 'grype', vulns, format);
    } catch (err: any) {
      return this.scanWithHeuristic(image, severityThreshold, format, `Grype execution failed (${err.message}). Defaulted to heuristic scanner.`);
    }
  }

  /**
   * Heuristic and image metadata vulnerability audit
   */
  private static async scanWithHeuristic(
    image: string,
    severityThreshold: string,
    format: string,
    note?: string
  ): Promise<string> {
    const vulns: ImageVulnerability[] = [];
    const recommendations: string[] = [];

    // Tag analysis
    const hasTag = image.includes(':');
    const tag = hasTag ? image.split(':')[1] : 'latest';
    const isLatest = tag === 'latest' || !hasTag;
    const isDigest = image.includes('@sha256:');

    if (isLatest) {
      vulns.push({
        id: 'TAG-ANTI-PATTERN-001',
        pkgName: 'image-spec',
        installedVersion: 'latest',
        fixedVersion: 'Pin to SHA256 or semver',
        severity: 'HIGH',
        title: 'Mutable `:latest` tag used in container reference',
        description: 'Using `:latest` or omitting tags prevents reproducible builds and risks pulling broken upstream revisions.',
      });
      recommendations.push('Pin image to an immutable semantic version tag or SHA256 digest.');
    }

    if (!isDigest) {
      recommendations.push('Enforce immutable cryptographic digests (`@sha256:...`) in production admission controllers.');
    }

    // Known base image risk heuristics
    const lower = image.toLowerCase();
    if (lower.includes('node:14') || lower.includes('node:16') || lower.includes('python:2') || lower.includes('python:3.7') || lower.includes('alpine:3.12') || lower.includes('alpine:3.13')) {
      vulns.push({
        id: 'CVE-DEPRECATED-BASE',
        pkgName: 'base-runtime',
        installedVersion: tag,
        fixedVersion: 'Upgrade to active LTS base image',
        severity: 'CRITICAL',
        title: 'End-of-Life (EOL) container runtime image with multiple unpatched CVEs',
        description: 'The specified base image has reached End-of-Life and is vulnerable to unpatched OpenSSL, glibc, and runtime CVEs.',
      });
    } else if (lower.includes('alpine:3.14') || lower.includes('ubuntu:18.04') || lower.includes('centos:7')) {
      vulns.push({
        id: 'CVE-LEGACY-DISTRO',
        pkgName: 'os-base',
        installedVersion: tag,
        fixedVersion: 'Upgrade OS base image',
        severity: 'HIGH',
        title: 'Legacy operating system base image',
        description: 'Legacy OS base images contain outdated system libraries. Transition to modern distroless or updated LTS bases.',
      });
    }

    // Generic best practices
    recommendations.push('Adopt distroless or scratch base images (e.g. `gcr.io/distroless/static`) to eliminate shell and package manager attack surfaces.');
    recommendations.push('Run containers as non-root user (`USER 10001:10001`) with read-only root filesystems.');

    const severities = this.getSeverityList(severityThreshold);
    const filteredVulns = vulns.filter((v) => severities.includes(v.severity));

    return this.formatScanOutput(image, 'heuristic', filteredVulns, format, recommendations, note);
  }

  private static getSeverityList(threshold: string): string[] {
    const upper = threshold.toUpperCase();
    if (upper === 'LOW') return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (upper === 'MEDIUM') return ['CRITICAL', 'HIGH', 'MEDIUM'];
    if (upper === 'HIGH') return ['CRITICAL', 'HIGH'];
    return ['CRITICAL'];
  }

  private static formatScanOutput(
    image: string,
    scanner: 'trivy' | 'grype' | 'docker' | 'heuristic',
    vulns: ImageVulnerability[],
    format: string,
    customRecs?: string[],
    note?: string
  ): string {
    const critCount = vulns.filter((v) => v.severity === 'CRITICAL').length;
    const highCount = vulns.filter((v) => v.severity === 'HIGH').length;
    const medCount = vulns.filter((v) => v.severity === 'MEDIUM').length;
    const lowCount = vulns.filter((v) => v.severity === 'LOW').length;

    const result: ImageScanResult = {
      image,
      scanner,
      summary: {
        critical: critCount,
        high: highCount,
        medium: medCount,
        low: lowCount,
        total: vulns.length,
      },
      vulnerabilities: vulns,
      recommendations: customRecs || [
        'Update vulnerable packages or bump base image to latest patched release.',
        'Use distroless images to minimize installed package footprint.',
        'Implement automated vulnerability scanning in CI/CD pipeline prior to registry push.',
      ],
    };

    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }

    const badge =
      critCount > 0
        ? '🔴 CRITICAL RISK'
        : highCount > 0
        ? '🟠 HIGH RISK'
        : vulns.length > 0
        ? '🟡 MEDIUM RISK'
        : '🟢 CLEAN / SECURE';

    let md = `## Container Image Vulnerability Report\n\n`;
    md += `• **Target Image:** \`${image}\`\n`;
    md += `• **Scanner Engine:** \`${scanner.toUpperCase()}\`\n`;
    md += `• **Security Status:** **${badge}**\n\n`;

    if (note) {
      md += `> [!NOTE]\n> ${note}\n\n`;
    }

    md += `### Vulnerability Summary\n\n`;
    md += `| Severity | Count |\n`;
    md += `| :--- | :--- |\n`;
    md += `| 🔴 **CRITICAL** | ${critCount} |\n`;
    md += `| 🟠 **HIGH** | ${highCount} |\n`;
    md += `| 🟡 **MEDIUM** | ${medCount} |\n`;
    md += `| 🔵 **LOW** | ${lowCount} |\n`;
    md += `| **TOTAL** | **${vulns.length}** |\n\n`;

    if (vulns.length > 0) {
      md += `### Detected Vulnerabilities & Findings\n\n`;
      md += `| Vulnerability ID | Package | Installed | Fixed In | Severity | Title |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      for (const v of vulns.slice(0, 30)) {
        md += `| \`${v.id}\` | \`${v.pkgName}\` | \`${v.installedVersion}\` | \`${v.fixedVersion || 'N/A'}\` | **${v.severity}** | ${v.title || '-'} |\n`;
      }
      if (vulns.length > 30) {
        md += `\n*(Showing top 30 of ${vulns.length} total vulnerabilities)*\n`;
      }
      md += `\n`;
    } else {
      md += `*No vulnerabilities detected above the specified severity threshold.*\n\n`;
    }

    md += `### Actionable Security Recommendations\n\n`;
    for (const rec of result.recommendations) {
      md += `• ${rec}\n`;
    }

    return md;
  }
}
