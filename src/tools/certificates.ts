import * as crypto from 'node:crypto';
import * as tls from 'node:tls';
import { ShellTool } from './shell.js';

export interface CertStatus {
  name: string;
  issuer: string;
  subject: string;
  validTo: string;
  daysRemaining: number;
  status: 'CRITICAL' | 'WARNING' | 'HEALTHY';
}

export class CertExpiryTool {
  /**
   * Inspect TLS certificates in Kubernetes secrets or via direct hostname
   */
  static async check(options: { namespace?: string; hostname?: string; port?: number }): Promise<string> {
    const { namespace, hostname, port } = options;

    if (hostname) {
      return await this.checkHostCert(hostname, port || 443);
    }

    return await this.checkK8sTlsSecrets(namespace);
  }

  private static async checkHostCert(hostname: string, port: number = 443): Promise<string> {
    return new Promise((resolve) => {
      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: 5000,
        },
        () => {
          try {
            const cert = socket.getPeerX509Certificate();
            socket.destroy();

            if (!cert) {
              resolve(`Unable to retrieve peer certificate from ${hostname}:${port}`);
              return;
            }

            const validTo = new Date(cert.validTo);
            const now = new Date();
            const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            const status = daysRemaining < 14 ? 'CRITICAL' : daysRemaining < 30 ? 'WARNING' : 'HEALTHY';

            const report =
              `## TLS Certificate Check for ${hostname}:${port}\n` +
              `| Subject | Issuer | Valid Until | Days Remaining | Status |\n` +
              `| :--- | :--- | :--- | :--- | :--- |\n` +
              `| ${cert.subject} | ${cert.issuer} | ${validTo.toISOString().split('T')[0]} | **${daysRemaining} days** | **${status}** |\n`;

            resolve(report);
          } catch (err: any) {
            resolve(`Error parsing certificate for ${hostname}: ${err.message}`);
          }
        }
      );

      socket.on('error', (err) => {
        resolve(`TLS connection error for ${hostname}:${port}: ${err.message}`);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(`Connection timeout checking TLS certificate for ${hostname}:${port}`);
      });
    });
  }

  private static async checkK8sTlsSecrets(namespace?: string): Promise<string> {
    const nsFlag = namespace ? `-n ${namespace}` : '-A';
    const cmd = `kubectl get secrets ${nsFlag} --field-selector type=kubernetes.io/tls -o json`;

    try {
      const output = await ShellTool.run(cmd);
      if (output.startsWith('Error executing command')) {
        return `Unable to query Kubernetes TLS secrets: ${output}`;
      }

      const json = JSON.parse(output);
      const items = json.items || [];

      if (items.length === 0) {
        return `No TLS secrets found in namespace "${namespace || 'all'}" (type=kubernetes.io/tls).`;
      }

      const statuses: CertStatus[] = [];

      for (const item of items) {
        const secretName = item.metadata?.name || 'unknown';
        const secretNs = item.metadata?.namespace || 'default';
        const certBase64 = item.data?.['tls.crt'];

        if (!certBase64) continue;

        try {
          const rawCert = Buffer.from(certBase64, 'base64').toString('utf-8');
          const x509 = new crypto.X509Certificate(rawCert);

          const validTo = new Date(x509.validTo);
          const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const status = daysRemaining < 14 ? 'CRITICAL' : daysRemaining < 30 ? 'WARNING' : 'HEALTHY';

          statuses.push({
            name: `${secretNs}/${secretName}`,
            subject: x509.subject,
            issuer: x509.issuer,
            validTo: validTo.toISOString().split('T')[0],
            daysRemaining,
            status,
          });
        } catch {}
      }

      let report = `## Kubernetes TLS Secrets Expiry Report (${statuses.length} certificates)\n`;
      report += '| Secret (Namespace/Name) | Valid To | Days Remaining | Status |\n';
      report += '| :--- | :--- | :--- | :--- |\n';

      for (const s of statuses) {
        const badge = s.status === 'CRITICAL' ? '🔴 CRITICAL' : s.status === 'WARNING' ? '🟡 WARNING' : '🟢 HEALTHY';
        report += `| \`${s.name}\` | ${s.validTo} | **${s.daysRemaining} days** | ${badge} |\n`;
      }

      return report;
    } catch (err: any) {
      return `Failed to inspect TLS secrets: ${err.message}`;
    }
  }
}
