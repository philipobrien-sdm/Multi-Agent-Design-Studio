/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AgentRole =
  | "architect"
  | "ux_designer"
  | "algorithm_designer"
  | "algorithm_reviewer"
  | "prompt_designer"
  | "consistency_agent"
  | "synthesiser";

export interface AgentInfo {
  role: AgentRole;
  name: string;
  emoji: string;
  tagline: string;
  systemPrompt: string;
}

export interface ModuleInfo {
  name: string;
  description: string;
  boundaries: string[];
  dataFlow: string[];
}

export interface UXFlowInfo {
  screenName: string;
  journey: string;
  uiState: string;
  transitions: string[];
}

export interface AlgorithmInfo {
  name: string;
  description: string;
  pseudocode: string;
  complexity: string;
}

export interface PromptTemplateInfo {
  featureName: string;
  template: string;
  inputs: string[];
  outputs: string[];
  guardrails: string[];
}

export interface RiskInfo {
  agentName: string;
  riskType: string; // "architecture" | "ux" | "safety" | "algorithm"
  severity: "low" | "medium" | "high";
  description: string;
  recommendation: string;
}

export interface DesignElement {
  id: string;
  agent: AgentRole;
  type: "c4_diagram" | "mermaid_sequence" | "mermaid_state" | "mermaid_flowchart" | "behavioural_spec" | "api_contract" | "pseudocode";
  title: string;
  description: string;
  content: string; // raw code or text representation
  structured_data?: any; // optional rich nested JSON for rendering structured views
}

export interface SpecObject {
  idea: string;
  version: number;
  modules: ModuleInfo[];
  ux_flows: UXFlowInfo[];
  algorithms: AlgorithmInfo[];
  prompts: PromptTemplateInfo[];
  risks: RiskInfo[];
  open_questions: string[];
  final_spec: string; // Markdown synthesized pack
  design_elements?: DesignElement[]; // living design specification elements
}

export interface AgentActivityLog {
  id: string;
  timestamp: string;
  role: AgentRole;
  agentName: string;
  emoji: string;
  status: "thinking" | "writing" | "completed" | "debate" | "critique";
  message: string;
}

export interface SpecVersionHistory {
  version: number;
  spec: SpecObject;
  timestamp: string;
  triggerEvent: string; // e.g. "Draft 0 initialized" | "UX feedback integrated"
}

export interface VoteResult {
  agentName: string;
  role: AgentRole;
  emoji: string;
  approved: boolean;
  weight: number;
  reason: string;
}

export interface SpecCompilerOutput {
  language: string;
  filename: string;
  content: string;
}

export interface LocalLlmSettings {
  useLocal: boolean;
  serverUrl: string;
  apiKey: string;
  defaultModel: string;
  unloadAfterUse: boolean;
  agentModels: {
    architect?: string;
    ux_designer?: string;
    algorithm_designer?: string;
    algorithm_reviewer?: string;
    prompt_designer?: string;
    consistency_agent?: string;
    synthesiser?: string;
  };
}

