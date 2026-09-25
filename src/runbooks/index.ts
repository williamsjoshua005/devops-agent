export interface Runbook {
  id: string;
  name: string;
  description: string;
  steps: string[];
}

export const RUNBOOKS: Record<string, Runbook> = {
  crashloop: {
    id: 'crashloop',
    name: 'Kubernetes Pod CrashLoopBackOff Triage',
    description: 'Systematic root cause analysis for pods repeatedly terminating or crashing.',
    steps: [
      '1. Run `k8s_get_resources` to identify failing pods, status, and restart counts.',
      '2. Run `k8s_describe_resource` on the failing pod to check Exit Code, Termination Reason, and recent Events.',
      '   - Exit Code 137: Pod was OOMKilled (Out of Memory). Inspect resources.limits.memory.',
      '   - Exit Code 1/2: Application crashed on boot (bad config, missing database connection, unhandled exception).',
      '   - Exit Code 128/ContainerCannotRun: Bad image entrypoint or missing volume mount.',
      '3. Run `k8s_get_logs` with `previous=true` to view the logs output right before the crash.',
      '4. Check if required ConfigMaps or Secrets are missing or improperly bound.',
      '5. Formulate a structured RCA: Symptom, Root Cause, Recommended Fix, and Verification Step.',
    ],
  },
  bad_gateway: {
    id: 'bad_gateway',
    name: '502 / 503 Bad Gateway & Ingress Triage',
    description: 'Investigate when an HTTP endpoint returns 502/503 from an Ingress Controller.',
    steps: [
      '1. Check ingress rules: `kubectl get ingress <name> -n <ns> -o yaml` -> verify backend service and port.',
      '2. Check service endpoints: `kubectl get endpoints <service-name> -n <ns>`.',
      '   - If endpoints list is empty: The service selector does not match pod labels, or pods are failing readiness probes.',
      '3. Check pod readiness: `kubectl get pods -l <selector> -n <ns>` -> inspect Ready column (e.g. 0/1).',
      '4. Describe failing pod: Look for readiness probe failures or slow startup times.',
      '5. Verify network policies or firewall rules if pods are ready but unreachable.',
    ],
  },
  rollout_failure: {
    id: 'rollout_failure',
    name: 'Deployment Rollout Failure Triage',
    description: 'Analyze why a new release deployment is stuck or failing to progress.',
    steps: [
      '1. Check rollout status: `kubectl rollout status deployment/<name> -n <ns>`.',
      '2. Inspect ReplicaSets: `kubectl get rs -n <ns>` to see if the new ReplicaSet failed to scale pods.',
      '3. Describe deployment & new pods: check for ImagePullBackOff, ErrImagePull, or scheduling constraints (Insufficient CPU/memory).',
      '4. If image tag or config is invalid: Propose fix or suggest rolling back with `kubectl rollout undo deployment/<name> -n <ns>`.',
    ],
  },
};

export function getRunbookPrompt(): string {
  const list = Object.values(RUNBOOKS).map((rb) => {
    return `### Runbook: ${rb.name} (${rb.id})\n${rb.description}\n` + rb.steps.join('\n');
  });
  return list.join('\n\n');
}
