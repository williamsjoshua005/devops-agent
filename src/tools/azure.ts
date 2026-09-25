import { ShellTool } from './shell.js';

export class AzureTool {
  /**
   * List resources in a resource group or subscription
   */
  static async listResources(resourceGroup?: string, resourceType?: string): Promise<string> {
    const rgFlag = resourceGroup ? `-g ${resourceGroup}` : '';
    const typeFlag = resourceType ? `--resource-type ${resourceType}` : '';
    const cmd = `az resource list ${rgFlag} ${typeFlag} -o table`;
    return await ShellTool.run(cmd);
  }

  /**
   * Inspect status of an Azure Kubernetes Service (AKS) cluster
   */
  static async getAksStatus(clusterName: string, resourceGroup: string): Promise<string> {
    const cmd = `az aks show -n ${clusterName} -g ${resourceGroup} --query "{name:name, provisioningState:provisioningState, powerState:powerState.code, k8sVersion:kubernetesVersion, nodePools:agentPoolProfiles[*].{name:name, count:count, vmSize:vmSize, state:provisioningState}}" -o json`;
    return await ShellTool.run(cmd);
  }
}
