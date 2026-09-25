import { ShellTool } from './shell.js';

export class MetricsTool {
  /**
   * Query metrics from Kubernetes metrics-server or Prometheus
   */
  static async query(target: 'pods' | 'nodes' | 'prometheus', namespace?: string, promQuery?: string): Promise<string> {
    const prometheusUrl = process.env.PROMETHEUS_URL;

    // 1. If Prometheus query requested and URL configured
    if (target === 'prometheus' || (promQuery && prometheusUrl)) {
      if (!prometheusUrl) {
        return 'Prometheus URL (PROMETHEUS_URL) is not configured in environment. Falling back to Kubernetes metrics-server.';
      }

      try {
        const query = encodeURIComponent(promQuery || 'sum(rate(container_cpu_usage_seconds_total[5m])) by (namespace)');
        const url = `${prometheusUrl.replace(/\/+$/, '')}/api/v1/query?query=${query}`;
        const cmd = `curl -s "${url}"`;
        const res = await ShellTool.run(cmd);
        return `[Prometheus Metrics Result]\n${res}`;
      } catch (err: any) {
        return `Failed to query Prometheus: ${err.message}`;
      }
    }

    // 2. Query Kubernetes metrics-server (kubectl top)
    if (target === 'nodes') {
      const cmd = 'kubectl top nodes';
      return await ShellTool.run(cmd);
    } else {
      const nsFlag = namespace ? `-n ${namespace}` : '-A';
      const cmd = `kubectl top pods ${nsFlag} --sort-by=memory`;
      return await ShellTool.run(cmd);
    }
  }
}
