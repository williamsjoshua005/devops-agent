import { ShellTool } from './shell.js';

export class AwsTool {
  /**
   * List AWS resources across common infrastructure services (EC2, S3, RDS, Lambda, VPC)
   */
  static async listResources(service: string = 'ec2', region?: string): Promise<string> {
    const regionFlag = region ? `--region ${region}` : '';
    const svc = service.toLowerCase().trim();

    let cmd = '';
    switch (svc) {
      case 'ec2':
      case 'instances':
        cmd = `aws ec2 describe-instances ${regionFlag} --query "Reservations[*].Instances[*].{InstanceId:InstanceId, Type:InstanceType, State:State.Name, PrivateIp:PrivateIpAddress, PublicIp:PublicIpAddress, Name:Tags[?Key=='Name'].Value|[0]}" --output table`;
        break;
      case 's3':
      case 'buckets':
        cmd = `aws s3 ls`;
        break;
      case 'rds':
      case 'databases':
        cmd = `aws rds describe-db-instances ${regionFlag} --query "DBInstances[*].{DBInstanceIdentifier:DBInstanceIdentifier, Engine:Engine, Status:DBInstanceStatus, Class:DBInstanceClass, AllocatedStorage:AllocatedStorage}" --output table`;
        break;
      case 'vpc':
      case 'subnets':
        cmd = `aws ec2 describe-vpcs ${regionFlag} --query "Vpcs[*].{VpcId:VpcId, CidrBlock:CidrBlock, IsDefault:IsDefault, State:State}" --output table`;
        break;
      case 'lambda':
      case 'functions':
        cmd = `aws lambda list-functions ${regionFlag} --query "Functions[*].{FunctionName:FunctionName, Runtime:Runtime, MemorySize:MemorySize, Timeout:Timeout}" --output table`;
        break;
      default:
        cmd = `aws ${svc} list-resources ${regionFlag}`;
    }

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 8000 });
      if (output.includes('command not found') || output.includes('aws: not found')) {
        return `AWS CLI ('aws') is not installed on this machine.\nInstall via: 'brew install awscli' or 'curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"'`;
      }
      return output;
    } catch (err: any) {
      return `Error querying AWS ${service}: ${err.message}`;
    }
  }

  /**
   * Inspect status, control plane version, endpoint, and node health of an Amazon EKS cluster
   */
  static async getEksStatus(clusterName: string, region?: string): Promise<string> {
    const regionFlag = region ? `--region ${region}` : '';
    const cmd = `aws eks describe-cluster --name ${clusterName} ${regionFlag} --query "cluster.{Name:name, Status:status, Version:version, Endpoint:endpoint, RoleArn:roleArn, PlatformVersion:platformVersion, CreatedAt:createdAt}" --output json`;

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 8000 });
      if (output.includes('command not found') || output.includes('aws: not found')) {
        return `AWS CLI ('aws') is not installed on this machine.`;
      }
      if (output.startsWith('Error executing command')) {
        return `Unable to query EKS cluster "${clusterName}": ${output}`;
      }

      // Also query nodegroups
      const ngCmd = `aws eks list-nodegroups --name ${clusterName} ${regionFlag} --output json`;
      const ngOutput = await ShellTool.run(ngCmd, { timeoutMs: 6000 });

      let nodegroups = '[]';
      if (!ngOutput.startsWith('Error') && ngOutput.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(ngOutput);
          nodegroups = JSON.stringify(parsed.nodegroups || []);
        } catch {}
      }

      return `## Amazon EKS Cluster Status: ${clusterName}\n\n` +
        `\`\`\`json\n${output}\n\`\`\`\n\n` +
        `**Associated Node Groups:** \`${nodegroups}\``;
    } catch (err: any) {
      return `Error retrieving EKS cluster status: ${err.message}`;
    }
  }

  /**
   * FinOps: Discover unattached AWS EBS volumes (state: available)
   */
  static async auditUnattachedEbsVolumes(region?: string): Promise<any[]> {
    const regionFlag = region ? `--region ${region}` : '';
    const cmd = `aws ec2 describe-volumes ${regionFlag} --filters Name=status,Values=available --query "Volumes[*].{VolumeId:VolumeId, Size:Size, VolumeType:VolumeType, AvailabilityZone:AvailabilityZone, CreateTime:CreateTime}" --output json`;

    try {
      const output = await ShellTool.run(cmd, { timeoutMs: 5000 });
      if (!output.startsWith('Error') && output.trim().startsWith('[')) {
        return JSON.parse(output);
      }
    } catch {}
    return [];
  }
}
