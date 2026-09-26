import { ShellTool } from './shell.js';

export interface ConnectivityResult {
  target: string;
  dnsResolved: boolean;
  tcpOpen: boolean;
  details: string;
  latencyMs?: number;
}

export class NetworkProberTool {
  /**
   * Run an in-cluster ephemeral network probe to test DNS resolution and TCP handshake
   */
  static async probe(targetHost: string, targetPort: number = 80, namespace: string = 'default'): Promise<string> {
    const probePodName = `probe-${Date.now().toString(36)}`;
    const script = `echo "=== DNS PROBE ===" && nslookup ${targetHost} && echo "=== TCP PROBE ===" && nc -z -w 3 ${targetHost} ${targetPort} && echo "TCP Handshake Success" || echo "TCP Handshake Failed"`;
    const escaped = script.replace(/"/g, '\\"');

    const cmd = `kubectl run ${probePodName} -n ${namespace} --rm -i --restart=Never --image=busybox:1.36 --command -- sh -c "${escaped}"`;

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 15000 });

      if (output.startsWith('Error executing command')) {
        // Fallback to local reachability test if cluster probe is inaccessible
        return this.localFallbackProbe(targetHost, targetPort, output);
      }

      return `## In-Cluster Network Diagnostics for ${targetHost}:${targetPort}\n**Namespace:** \`${namespace}\`\n\n\`\`\`\n${output}\n\`\`\``;
    } catch (err: any) {
      return this.localFallbackProbe(targetHost, targetPort, err.message);
    }
  }

  private static async localFallbackProbe(targetHost: string, targetPort: number, errorMsg: string): Promise<string> {
    // Run host-level nc/curl test as fallback
    const ncCmd = `nc -z -w 2 ${targetHost} ${targetPort} 2>&1 && echo "Open" || echo "Closed"`;
    const ncOut = await ShellTool.run(ncCmd);

    return (
      `## In-Cluster Network Diagnostic Report for ${targetHost}:${targetPort}\n` +
      `*(Cluster probe fell back to host runner: ${errorMsg.slice(0, 100)}...)*\n\n` +
      `• **Target:** \`${targetHost}:${targetPort}\`\n` +
      `• **TCP Port Status:** ${ncOut.includes('Open') ? '🟢 Reachable (Open)' : '🔴 Unreachable (Closed / Filtered)'}\n` +
      `• **Recommendation:** If running inside Kubernetes, verify Service selector and NetworkPolicy rules.\n`
    );
  }
}
