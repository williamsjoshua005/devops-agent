import { ShellTool } from './shell.js';

export class GcpTool {
  /**
   * List GCP resources across Compute Engine, Cloud Storage, Cloud SQL, or VPC Networks
   */
  static async listResources(resourceType: string = 'instances', project?: string): Promise<string> {
    const projectFlag = project ? `--project ${project}` : '';
    const type = resourceType.toLowerCase().trim();

    let cmd = '';
    switch (type) {
      case 'instances':
      case 'compute':
      case 'vms':
        cmd = `gcloud compute instances list ${projectFlag} --format="table(name,zone,machineType.basename(),status,networkInterfaces[0].networkIP:label=INTERNAL_IP,networkInterfaces[0].accessConfigs[0].natIP:label=EXTERNAL_IP)"`;
        break;
      case 'storage':
      case 'buckets':
        cmd = `gcloud storage buckets list ${projectFlag} --format="table(name,location,storageClass,createTime)"`;
        break;
      case 'sql':
      case 'databases':
        cmd = `gcloud sql instances list ${projectFlag} --format="table(name,databaseVersion,region,tier,state)"`;
        break;
      case 'networks':
      case 'vpcs':
        cmd = `gcloud compute networks list ${projectFlag} --format="table(name,subnetMode,bgpRoutingMode)"`;
        break;
      default:
        cmd = `gcloud ${type} list ${projectFlag}`;
    }

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 8000 });
      if (output.includes('command not found') || output.includes('gcloud: not found')) {
        return `Google Cloud CLI ('gcloud') is not installed on this machine.\nInstall via: 'brew install --cask google-cloud-sdk' or visit https://cloud.google.com/sdk/docs/install`;
      }
      return output;
    } catch (err: any) {
      return `Error querying GCP ${resourceType}: ${err.message}`;
    }
  }

  /**
   * Inspect status, control plane version, node pools, and health of a Google Kubernetes Engine (GKE) cluster
   */
  static async getGkeStatus(clusterName: string, location?: string, project?: string): Promise<string> {
    const locFlag = location ? (location.includes('-') && location.split('-').length === 3 ? `--zone ${location}` : `--region ${location}`) : '';
    const projFlag = project ? `--project ${project}` : '';
    const cmd = `gcloud container clusters describe ${clusterName} ${locFlag} ${projFlag} --format="json(name,status,currentMasterVersion,currentNodeVersion,endpoint,location,nodePools[].name,nodePools[].config.machineType,nodePools[].initialNodeCount,nodePools[].autoscaling.enabled)"`;

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 8000 });
      if (output.includes('command not found') || output.includes('gcloud: not found')) {
        return `Google Cloud CLI ('gcloud') is not installed on this machine.`;
      }
      if (output.startsWith('Error executing command')) {
        return `Unable to query GKE cluster "${clusterName}": ${output}`;
      }

      return `## Google Kubernetes Engine (GKE) Cluster Status: ${clusterName}\n\n` +
        `\`\`\`json\n${output}\n\`\`\``;
    } catch (err: any) {
      return `Error retrieving GKE cluster status: ${err.message}`;
    }
  }

  /**
   * FinOps: Discover unattached Google Cloud Persistent Disks
   */
  static async auditOrphanDisks(project?: string): Promise<any[]> {
    const projFlag = project ? `--project ${project}` : '';
    const cmd = `gcloud compute disks list ${projFlag} --filter="-users:*" --format="json(name,zone,sizeGb,type,status)"`;

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 5000 });
      if (!output.startsWith('Error') && output.trim().startsWith('[')) {
        return JSON.parse(output);
      }
    } catch {}
    return [];
  }
}
