export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  output: string;
  isError?: boolean;
}

export interface Message {
  role: MessageRole;
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: any;
  items?: { type: string } | Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export type PolicyTier = 'READ' | 'MUTATE' | 'DANGEROUS';

export interface PolicyEvaluation {
  tier: PolicyTier;
  actionSummary: string;
  reason: string;
  requiresApproval: boolean;
  isBlocked: boolean;
  diff?: string;
  isProductionWarning?: boolean;
}

export interface LLMConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'kimi';
  apiKey?: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export type EnvironmentLevel = 'development' | 'staging' | 'production' | 'unknown';
export type RoleLevel = 'junior' | 'intermediate' | 'senior';

export interface CloudProviderConfig {
  aws: boolean;
  azure: boolean;
  gcp: boolean;
}

export interface AgentContext {
  cwd: string;
  kubeContext?: string;
  kubeconfig?: string;
  kubeConfigPath?: string;
  activeNamespace?: string;
  installedTools: string[];
  environment: EnvironmentLevel;
  isProduction: boolean;
  roleLevel?: RoleLevel;
  cloudProviders?: CloudProviderConfig;
  stickToKubeConfig?: boolean;
}

export interface AuditRecord {
  id: string;
  sessionId: string;
  timestamp: string;
  toolName: string;
  args: Record<string, any>;
  tier: PolicyTier;
  isBlocked: boolean;
  requiresApproval: boolean;
  approved?: boolean;
  durationMs: number;
  outputSummary: string;
  error?: string;
}

export interface IncidentRecord {
  id: string;
  title: string;
  symptom: string;
  rca: string;
  fix: string;
  date: string;
  tags: string[];
}

export interface PostmortemData {
  title: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  service: string;
  impact: string;
  symptom: string;
  rootCause: string;
  remediation: string;
  actionItems: string[];
}
