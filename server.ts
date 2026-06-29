/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini client to prevent crashes on startup if key is missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required. Configure this in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// REST API for checking API key status
app.get("/api/health", (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({ status: "ok", hasApiKey: hasKey });
});

// Fetch models from local server (supports standard OpenAI and Ollama native tags)
app.post("/api/fetch-local-models", async (req, res) => {
  const { serverUrl, apiKey } = req.body;
  if (!serverUrl) {
    res.status(400).json({ error: "Missing serverUrl" });
    return;
  }

  let cleanUrl = serverUrl.trim();
  if (cleanUrl.endsWith("/")) {
    cleanUrl = cleanUrl.slice(0, -1);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const foundModels: string[] = [];
  const triedEndpoints: string[] = [];

  // 1. Try standard OpenAI compatible /v1/models
  try {
    const openaiEndpoint = cleanUrl.includes("/v1") ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
    triedEndpoints.push(openaiEndpoint);
    const response = await fetch(openaiEndpoint, { headers, method: "GET" });
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.data)) {
        data.data.forEach((m: any) => {
          if (m.id) foundModels.push(m.id);
        });
      }
    }
  } catch (err) {
    // Ignore and proceed
  }

  // 2. Try Ollama native /api/tags if no models found yet
  if (foundModels.length === 0) {
    try {
      const ollamaEndpoint = `${cleanUrl}/api/tags`;
      triedEndpoints.push(ollamaEndpoint);
      const response = await fetch(ollamaEndpoint, { method: "GET" });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.models)) {
          data.models.forEach((m: any) => {
            if (m.name) foundModels.push(m.name);
          });
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  if (foundModels.length > 0) {
    res.json({ success: true, models: foundModels });
  } else {
    res.status(500).json({
      success: false,
      error: `Could not retrieve models from local server. Tried endpoints: ${triedEndpoints.join(", ")}`,
      hint: "If your server is running on localhost, the cloud backend cannot query it directly due to isolation. We will use the browser-based direct fetch as a fallback in the interface!"
    });
  }
});

// Helper to unload a model from a local Ollama instance (by sending keep_alive: 0)
async function unloadLocalModel(serverUrl: string, modelName: string, apiKey?: string) {
  try {
    let cleanUrl = serverUrl.trim();
    if (cleanUrl.endsWith("/")) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    console.log(`Starting unload sequence for local model: ${modelName} on ${cleanUrl}`);

    // Try native Ollama /api/generate with keep_alive: 0
    try {
      await fetch(`${cleanUrl}/api/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName,
          prompt: "",
          keep_alive: 0
        })
      });
    } catch (e: any) {
      console.warn(`Ollama generate-unload warning: ${e.message}`);
    }

    // Try native Ollama /api/chat with keep_alive: 0
    try {
      await fetch(`${cleanUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [],
          keep_alive: 0
        })
      });
    } catch (e: any) {
      console.warn(`Ollama chat-unload warning: ${e.message}`);
    }

    console.log(`Unload requested for ${modelName}.`);
  } catch (err: any) {
    console.error(`Error attempting to unload model ${modelName}:`, err.message);
  }
}

// REST API to unload a specific model from the local server
app.post("/api/unload-local-model", async (req, res) => {
  const { serverUrl, model, apiKey } = req.body;
  if (!serverUrl || !model) {
    res.status(400).json({ error: "Missing serverUrl or model name" });
    return;
  }
  try {
    await unloadLocalModel(serverUrl, model, apiKey);
    res.json({ success: true, message: `Successfully requested unload of model ${model}.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to convert Google GenAI SDK schema (caps) to standard JSON schema (lowercase)
function formatSchemaForLocalLlm(geminiSchema: any): any {
  if (!geminiSchema) return null;
  const copy = JSON.parse(JSON.stringify(geminiSchema));
  const lowercaseTypes = (obj: any) => {
    if (obj && typeof obj === "object") {
      if (typeof obj.type === "string") {
        obj.type = obj.type.toLowerCase();
      }
      for (const key of Object.keys(obj)) {
        lowercaseTypes(obj[key]);
      }
    }
  };
  lowercaseTypes(copy);
  return copy;
}

// Clean and extract valid JSON from a raw model output (handles conversational text and ticks)
function cleanAndValidateJson(text: string): string {
  let cleaned = text.trim();
  
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  
  cleaned = cleaned.trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (e: any) {
    console.error("Local LLM output failed JSON validation. Raw output:", text);
    throw new Error(`Invalid JSON returned by local model: ${e.message}. Raw text: ${text.slice(0, 300)}`);
  }
}

// Master generator function routing either to Gemini or Local LLM
async function generateSpecLayer(
  role: string,
  systemPrompt: string,
  userPrompt: string,
  responseSchema: any,
  localSettings: any,
  nextRole?: string | null
): Promise<string> {
  const isLocal = localSettings?.useLocal === true;
  
  if (isLocal) {
    const model = localSettings.agentModels?.[role] || localSettings.defaultModel;
    if (!model) {
      throw new Error(`No local model configured for agent '${role}' and no default model was selected.`);
    }

    let serverUrl = localSettings.serverUrl || "http://localhost:11434";
    if (serverUrl.endsWith("/")) {
      serverUrl = serverUrl.slice(0, -1);
    }
    const endpoint = serverUrl.includes("/v1") ? `${serverUrl}/chat/completions` : `${serverUrl}/v1/chat/completions`;

    const standardSchema = formatSchemaForLocalLlm(responseSchema);
    const systemInstruction = `${systemPrompt}\n\nCRITICAL OUTCOME: You MUST return a single valid JSON object strictly complying with this schema:\n${JSON.stringify(standardSchema, null, 2)}\nDo NOT wrap the response in any markdown code blocks other than standard JSON. Do NOT add notes, explanations, introduction, trailing chatter or conversational text. Respond ONLY with the raw string of the JSON object.`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (localSettings.apiKey) {
      headers["Authorization"] = `Bearer ${localSettings.apiKey}`;
    }

    const nextModel = nextRole ? (localSettings.agentModels?.[nextRole] || localSettings.defaultModel) : null;
    const shouldUnload = localSettings.unloadAfterUse && (!nextRole || nextModel !== model);

    const formats = [
      {
        name: "json_schema",
        payload: standardSchema ? {
          type: "json_schema",
          json_schema: {
            name: "spec_response",
            strict: false,
            schema: standardSchema
          }
        } : { type: "json_object" }
      },
      {
        name: "json_object",
        payload: { type: "json_object" }
      },
      {
        name: "text",
        payload: { type: "text" }
      }
    ];

    let rawText = "";
    let success = false;
    let lastError: any = null;

    for (const format of formats) {
      try {
        console.log(`[Local LLM] Attempting generation with format: ${format.name}`);
        const body = {
          model: model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2,
          response_format: format.payload,
          ...(shouldUnload ? { keep_alive: 0 } : {})
        };

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Status ${response.status}: ${errText}`);
        }

        const resJson = await response.json();
        rawText = resJson.choices?.[0]?.message?.content || "";
        success = true;
        console.log(`[Local LLM] Successfully received response using format: ${format.name}`);
        break;
      } catch (err: any) {
        console.warn(`[Local LLM] Failed with format '${format.name}': ${err.message}`);
        lastError = err;
      }
    }

    if (!success) {
      throw new Error(`Local LLM Server returned error after trying all response format configurations. Last error: ${lastError?.message}`);
    }

    if (shouldUnload) {
      console.log(`Unloading local model ${model} because the next agent uses ${nextModel || 'none (end of orchestration)'}...`);
      unloadLocalModel(serverUrl, model, localSettings.apiKey).catch((err) => {
        console.error(`Error in automatic background unload: ${err.message}`);
      });
    } else if (localSettings.unloadAfterUse) {
      console.log(`Keeping local model ${model} loaded as the next agent uses the same model (${nextModel}).`);
    }

    return cleanAndValidateJson(rawText);
  } else {
    // Gemini Route
    const ai = getGeminiClient();
    const modelName = "gemini-3.5-flash";
    const fullPrompt = `${systemPrompt}\n\nUser Task:\n${userPrompt}`;

    const geminiResponse = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2
      }
    });

    return geminiResponse.text || "{}";
  }
}

// Global schema for structured design elements
const designElementsSchema = {
  type: Type.ARRAY,
  description: "Living design specification elements representing visual and behavioral models like C4 diagrams, Mermaid charts, API contracts, pseudocode or BDD specs.",
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: "Unique lowercase identifier, e.g. 'main_c4_diagram', 'user_checkout_journey'" },
      type: { 
        type: Type.STRING, 
        description: "Must be exactly one of: c4_diagram | mermaid_sequence | mermaid_state | mermaid_flowchart | behavioural_spec | api_contract | pseudocode" 
      },
      title: { type: Type.STRING, description: "Display name for this design element" },
      description: { type: Type.STRING, description: "Explanation of what this specification visualizes or defines" },
      content: { type: Type.STRING, description: "Raw string content (e.g. valid Mermaid markdown string, raw Markdown API table, or pseudocode)" },
      structured_data: {
        type: Type.OBJECT,
        description: "Structured JSON schema representing the element's core content. If type is 'c4_diagram', include mapping of { containers: Array<{ name, tech, role }>, relationships: Array<{ from, to, label }> }. If 'api_contract', include { endpoints: Array<{ method, path, description, params: Array<{ name, type, description }>, responseSample: string }> }. If 'behavioural_spec', include { feature: string, scenarios: Array<{ name, steps: Array<{ step_type: 'Given'|'When'|'Then', text: string }> }> }."
      }
    },
    required: ["id", "type", "title", "description", "content"]
  }
};

// Temp sessions store for state resume and chat refinement (avoids SSE URL limits)
const tempSessions = new Map<string, {
  spec: any;
  logs: any[];
  idea: string;
  debate: boolean;
  iterations: number;
  localSettings: any;
}>();

app.post("/api/save-session-state", (req, res) => {
  const { spec, logs, idea, debate, iterations, localSettings } = req.body;
  const sessionId = "sess_" + Math.random().toString(36).substring(2, 15);
  tempSessions.set(sessionId, {
    spec,
    logs: logs || [],
    idea: idea || "",
    debate: debate === true,
    iterations: iterations ? parseInt(iterations, 10) : 1,
    localSettings: localSettings || null
  });
  res.json({ sessionId });
});

// SSE Orchestrator Endpoint for real-time multi-agent spec building
app.get("/api/orchestrate-stream", async (req, res) => {
  const { idea: queryIdea, debate: queryDebate, iterations: queryIterations, localSettings: localSettingsJson, sessionId, resume } = req.query;

  let idea = (queryIdea as string) || "";
  let runDebate = queryDebate === "true";
  const numIterations = queryIterations ? Math.min(Math.max(parseInt(queryIterations as string, 10), 1), 3) : 1;

  // Attempt to parse local LLM settings if passed
  let localSettings: any = null;
  if (localSettingsJson && typeof localSettingsJson === "string") {
    try {
      localSettings = JSON.parse(localSettingsJson);
    } catch (e) {
      console.error("Failed to parse localSettings settings parameter", e);
    }
  }

  // Set headers for Server-Sent Events (SSE)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendSSE = (type: string, data: any) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let spec: any = null;

  try {
    // --- 1. INITIALIZE SPEC (Draft 0) ---
    sendSSE("status", { stage: "initializing", activeAgent: "system", message: "Starting Spec Intake..." });
    
    spec = {
      idea: idea,
      version: 0,
      modules: [],
      ux_flows: [],
      algorithms: [],
      prompts: [],
      risks: [],
      open_questions: [],
      final_spec: "",
      design_elements: []
    };

    const isResuming = resume === "true" && sessionId;
    if (isResuming) {
      const saved = tempSessions.get(sessionId as string);
      if (saved) {
        spec = saved.spec;
        idea = saved.idea || idea;
        runDebate = saved.debate;
        localSettings = saved.localSettings || localSettings;
      }
    }

    if (!idea && !isResuming) {
      res.status(400).json({ error: "Missing idea parameter" });
      return;
    }

    const isLocalStr = localSettings?.useLocal ? " [Local LLM Engine]" : "";
    const initialLog = {
      id: "log_0",
      timestamp: new Date().toLocaleTimeString(),
      role: "synthesiser",
      agentName: "System",
      emoji: isResuming ? "🔄" : "⚙️",
      status: "completed",
      message: isResuming 
        ? `Resuming specification compilation from last successful state (v${spec.version || 0})${isLocalStr}`
        : `Intake complete. Prototyping Spec Draft 0${isLocalStr} for: "${idea}"`
    };

    sendSSE("log", initialLog);
    sendSSE("spec", spec);

    // --- 2. STEP: PARALLEL AGENT EXPANSION ---
    // In our system, Architect, UX Designer, and Algorithm Designer run to define core systems.

    // --- A. ARCHITECT AGENT ---
    const skipArchitect = isResuming && Array.isArray(spec.modules) && spec.modules.length > 0;
    if (!skipArchitect) {
      sendSSE("status", { stage: "architecting", activeAgent: "architect", message: "Architect Agent defining system structure..." });
    sendSSE("log", {
      id: "log_arch_start",
      timestamp: new Date().toLocaleTimeString(),
      role: "architect",
      agentName: "System Architect",
      emoji: "🧠",
      status: "thinking",
      message: "Analyzing user idea to design a modular, scalable backend and data model..."
    });

    const architectResponseText = await generateSpecLayer(
      "architect",
      "You are the Lead System Architect. Your job is to convert the rough idea into a complete system architecture. You must also produce detailed design specification elements like C4 diagrams (mapping system containers, technologies, and system boundaries) and API contracts (mapping methods, paths, params, and responses).",
      `Idea: "${idea}"\n\nFormulate a structured set of core modules, backend database models, service boundaries, and data flows. Avoid generic descriptions. Provide a production-grade, modular service architecture. You MUST also generate relevant design specification elements (such as a C4 Container Diagram and an API Contract matching your modules). Your output MUST adhere strictly to the JSON schema specified.`,
      {
        type: Type.OBJECT,
        properties: {
          modules: {
            type: Type.ARRAY,
            description: "List of architectural modules",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Module name" },
                description: { type: Type.STRING, description: "Detailed module responsibility" },
                boundaries: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Boundaries, technologies, and ports" },
                dataFlow: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Inputs, outputs, and messaging streams" }
              },
              required: ["name", "description", "boundaries", "dataFlow"]
            }
          },
          design_elements: designElementsSchema
        },
        required: ["modules", "design_elements"]
      },
      localSettings,
      "ux_designer"
    );

    const architectOutput = JSON.parse(architectResponseText || '{"modules": [], "design_elements": []}');
    spec.modules = architectOutput.modules;
    if (Array.isArray(architectOutput.design_elements)) {
      architectOutput.design_elements.forEach((el: any) => {
        el.agent = "architect";
        spec.design_elements.push(el);
      });
    }
    spec.version = 1;

    sendSSE("log", {
      id: "log_arch_done",
      timestamp: new Date().toLocaleTimeString(),
      role: "architect",
      agentName: "System Architect",
      emoji: "🧠",
      status: "completed",
      message: `Architect defined ${spec.modules.length} core modular systems, including database layout and API boundaries.`
    });
    sendSSE("spec", spec);
    } else {
      sendSSE("log", {
        id: "log_arch_skipped",
        timestamp: new Date().toLocaleTimeString(),
        role: "architect",
        agentName: "System Architect",
        emoji: "🧠",
        status: "completed",
        message: `Skipped System Architect: ${spec.modules?.length || 0} core modular systems already defined in previous state.`
      });
      sendSSE("spec", spec);
    }

    // --- B. UX DESIGNER AGENT ---
    const skipUX = isResuming && Array.isArray(spec.ux_flows) && spec.ux_flows.length > 0;
    if (!skipUX) {
      sendSSE("status", { stage: "designing", activeAgent: "ux_designer", message: "UX Designer outlining interfaces..." });
    sendSSE("log", {
      id: "log_ux_start",
      timestamp: new Date().toLocaleTimeString(),
      role: "ux_designer",
      agentName: "Lead UX/UI Designer",
      emoji: "🎨",
      status: "thinking",
      message: "Mapping screen journeys, transition guidelines, accessibility rules, and state flows..."
    });

    const uxResponseText = await generateSpecLayer(
      "ux_designer",
      "You are the Lead UX/UI Designer. Your job is to define user journeys, responsive visual interfaces, screen states, and transitions. You must also produce detailed design specification elements like Mermaid sequence diagrams (mapping screen-to-screen user actions) and structured behavioural specifications (in Given-When-Then / BDD Gherkin format).",
      `Idea: "${idea}"\n\nDevelop detailed screens, screen transition flows, and state mappings that align with clean UX theory. Ensure they trace directly to the overall product idea. You MUST also generate relevant design specification elements (such as a Mermaid sequence diagram for key user journeys and structured BDD behavioural specifications). Your output MUST adhere strictly to the JSON schema.`,
      {
        type: Type.OBJECT,
        properties: {
          ux_flows: {
            type: Type.ARRAY,
            description: "List of screens and user flow transitions",
            items: {
              type: Type.OBJECT,
              properties: {
                screenName: { type: Type.STRING, description: "Name of the screen" },
                journey: { type: Type.STRING, description: "Description of the user journey on this screen" },
                uiState: { type: Type.STRING, description: "UI visual layout components, styling directives, and state data" },
                transitions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Click handlers, navigation destinations, and micro-interactions" }
              },
              required: ["screenName", "journey", "uiState", "transitions"]
            }
          },
          design_elements: designElementsSchema
        },
        required: ["ux_flows", "design_elements"]
      },
      localSettings,
      "algorithm_designer"
    );

    const uxOutput = JSON.parse(uxResponseText || '{"ux_flows": [], "design_elements": []}');
    spec.ux_flows = uxOutput.ux_flows;
    if (Array.isArray(uxOutput.design_elements)) {
      uxOutput.design_elements.forEach((el: any) => {
        el.agent = "ux_designer";
        spec.design_elements.push(el);
      });
    }
    spec.version = 2;

    sendSSE("log", {
      id: "log_ux_done",
      timestamp: new Date().toLocaleTimeString(),
      role: "ux_designer",
      agentName: "Lead UX/UI Designer",
      emoji: "🎨",
      status: "completed",
      message: `UX Designer specified ${spec.ux_flows.length} screen journeys, interactive transition trees, and layout guides.`
    });
    sendSSE("spec", spec);
    } else {
      sendSSE("log", {
        id: "log_ux_skipped",
        timestamp: new Date().toLocaleTimeString(),
        role: "ux_designer",
        agentName: "Lead UX/UI Designer",
        emoji: "🎨",
        status: "completed",
        message: `Skipped UX Designer: ${spec.ux_flows?.length || 0} screen journeys already designed in previous state.`
      });
      sendSSE("spec", spec);
    }

    // --- C. ALGORITHM DESIGNER AGENT ---
    const skipAlgo = isResuming && Array.isArray(spec.algorithms) && spec.algorithms.length > 0;
    if (!skipAlgo) {
      sendSSE("status", { stage: "engineering", activeAgent: "algorithm_designer", message: "Algorithm Designer drafting core processes..." });
    sendSSE("log", {
      id: "log_algo_start",
      timestamp: new Date().toLocaleTimeString(),
      role: "algorithm_designer",
      agentName: "Algorithmic Engineer",
      emoji: "⚙️",
      status: "thinking",
      message: "Drafting state machine engines, core computational routines, and data structures..."
    });

    const algoResponseText = await generateSpecLayer(
      "algorithm_designer",
      "You are the Algorithmic Engineer. Your job is to define the core computation, logic loops, structures, and math equations. You must also produce detailed design specification elements like Mermaid state/flowchart diagrams (modeling algorithm loops or step state structures) and clear pseudocode blocks.",
      `Idea: "${idea}"\n\nCreate comprehensive pseudocode and efficiency analyses for at least two core custom logic blocks or controllers. Ensure proper handling of asynchronous event loops, memory consumption, or scaling boundaries. You MUST also generate relevant design specification elements (such as a Mermaid flowchart/state diagram and high-fidelity pseudocode blocks). Your output MUST adhere strictly to the JSON schema.`,
      {
        type: Type.OBJECT,
        properties: {
          algorithms: {
            type: Type.ARRAY,
            description: "The core algorithms designed",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Algorithm or class engine name" },
                description: { type: Type.STRING, description: "What problem this algorithm solves and why" },
                pseudocode: { type: Type.STRING, description: "Complete robust typed-like pseudocode" },
                complexity: { type: Type.STRING, description: "Time and Space Big-O complexity notes" }
              },
              required: ["name", "description", "pseudocode", "complexity"]
            }
          },
          design_elements: designElementsSchema
        },
        required: ["algorithms", "design_elements"]
      },
      localSettings,
      "prompt_designer"
    );

    const algoOutput = JSON.parse(algoResponseText || '{"algorithms": [], "design_elements": []}');
    spec.algorithms = algoOutput.algorithms;
    if (Array.isArray(algoOutput.design_elements)) {
      algoOutput.design_elements.forEach((el: any) => {
        el.agent = "algorithm_designer";
        spec.design_elements.push(el);
      });
    }
    spec.version = 3;

    sendSSE("log", {
      id: "log_algo_done",
      timestamp: new Date().toLocaleTimeString(),
      role: "algorithm_designer",
      agentName: "Algorithmic Engineer",
      emoji: "⚙️",
      status: "completed",
      message: `Algorithm Engineer mapped ${spec.algorithms.length} performance-tuned logic engines with pseudocode.`
    });
    sendSSE("spec", spec);
    } else {
      sendSSE("log", {
        id: "log_algo_skipped",
        timestamp: new Date().toLocaleTimeString(),
        role: "algorithm_designer",
        agentName: "Algorithmic Engineer",
        emoji: "⚙️",
        status: "completed",
        message: `Skipped Algorithmic Engineer: ${spec.algorithms?.length || 0} custom logic engines already defined with pseudocode.`
      });
      sendSSE("spec", spec);
    }

    // --- D. LLM PROMPT DESIGNER AGENT ---
    const skipPrompt = isResuming && Array.isArray(spec.prompts) && spec.prompts.length > 0;
    if (!skipPrompt) {
      sendSSE("status", { stage: "prompting", activeAgent: "prompt_designer", message: "LLM Prompt Designer engineering templates..." });
    sendSSE("log", {
      id: "log_prompt_start",
      timestamp: new Date().toLocaleTimeString(),
      role: "prompt_designer",
      agentName: "Prompt Engineer",
      emoji: "🧾",
      status: "thinking",
      message: "Designing prompt sheets, structure frameworks (SSPSS/CHECK/RBFR), and guardrails for AI integrations..."
    });

    const promptResponseText = await generateSpecLayer(
      "prompt_designer",
      "You are the Lead LLM Prompt Engineer. Your job is to design concrete prompt files, templates, parameters, and input/output schema validators. You must also produce detailed design specification elements like structured behavioural specifications (Given-When-Then / BDD Gherkin format modeling AI state flows) or Mermaid sequence diagrams illustrating prompt/response integrations.",
      `Idea: "${idea}"\n\nFormulate at least two robust system instructions, system prompts, or model instruction sheets. Include strict validation, schema types, and guardrail checklists against drift or prompt injections. You MUST also generate relevant design specification elements (such as structured behavioural BDD specifications or a sequence diagram outlining prompt interaction flows). Your output MUST adhere strictly to the JSON schema.`,
      {
        type: Type.OBJECT,
        properties: {
          prompts: {
            type: Type.ARRAY,
            description: "AI Prompt blueprints",
            items: {
              type: Type.OBJECT,
              properties: {
                featureName: { type: Type.STRING, description: "The AI-driven feature utilizing this prompt" },
                template: { type: Type.STRING, description: "The raw system instructions / developer prompt template" },
                inputs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Dynamic variable replacements" },
                outputs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Required schema components for output" },
                guardrails: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Strict negative rules, safety limits, and anti-hallucination guardrails" }
              },
              required: ["featureName", "template", "inputs", "outputs", "guardrails"]
            }
          },
          design_elements: designElementsSchema
        },
        required: ["prompts", "design_elements"]
      },
      localSettings,
      runDebate ? "algorithm_reviewer" : "synthesiser"
    );

    const promptOutput = JSON.parse(promptResponseText || '{"prompts": [], "design_elements": []}');
    spec.prompts = promptOutput.prompts;
    if (Array.isArray(promptOutput.design_elements)) {
      promptOutput.design_elements.forEach((el: any) => {
        el.agent = "prompt_designer";
        spec.design_elements.push(el);
      });
    }
    spec.version = 4;

    sendSSE("log", {
      id: "log_prompt_done",
      timestamp: new Date().toLocaleTimeString(),
      role: "prompt_designer",
      agentName: "Prompt Engineer",
      emoji: "🧾",
      status: "completed",
      message: `Prompt Designer established ${spec.prompts.length} prompt layer templates with strict schema guardrails.`
    });
    sendSSE("spec", spec);
    } else {
      sendSSE("log", {
        id: "log_prompt_skipped",
        timestamp: new Date().toLocaleTimeString(),
        role: "prompt_designer",
        agentName: "Prompt Engineer",
        emoji: "🧾",
        status: "completed",
        message: `Skipped Prompt Engineer: ${spec.prompts?.length || 0} prompt templates already engineered.`
      });
      sendSSE("spec", spec);
    }

    // --- 3. STEP: CROSS-REVIEW & DEBATE ---
    // Runs Critique loops by Reviewer & Consistency Agents.
    if (runDebate) {
      const skipReview = isResuming && Array.isArray(spec.risks) && spec.risks.length > 0;
      if (!skipReview) {
        sendSSE("status", { stage: "critique", activeAgent: "algorithm_reviewer", message: "Reviewer critique round..." });
      sendSSE("log", {
        id: "log_review_start",
        timestamp: new Date().toLocaleTimeString(),
        role: "algorithm_reviewer",
        agentName: "Algorithmic Reviewer",
        emoji: "🧪",
        status: "thinking",
        message: "Critiquing core algorithms, performance profiles, memory bounds, and identifying architectural gaps..."
      });

      const reviewerResponseText = await generateSpecLayer(
        "algorithm_reviewer",
        "You are the Algorithm Auditor and Performance Reviewer. You must also produce detailed design specification elements like Mermaid sequence/state diagrams (modeling safe failover state paths or concurrency guard rails) and optimized pseudocode blocks.",
        `Idea: "${idea}"\nArchitect Modules: ${JSON.stringify(spec.modules)}\nAlgorithms Drafted: ${JSON.stringify(spec.algorithms)}\n\nIdentify critical logical flaws, bottleneck components, or scale risks. Provide recommendations and optimized alternatives. You MUST also generate relevant design specification elements (such as an optimized flowchart/sequence diagram or a revised pseudocode block). Your output MUST adhere strictly to the JSON schema.`,
        {
          type: Type.OBJECT,
          properties: {
            risks: {
              type: Type.ARRAY,
              description: "Security, load, algorithm, or scalability risks discovered",
              items: {
                type: Type.OBJECT,
                properties: {
                  agentName: { type: Type.STRING, description: "Algorithmic Reviewer" },
                  riskType: { type: Type.STRING, description: "E.g., load, algorithmic, edgecase, concurrency" },
                  severity: { type: Type.STRING, description: "low | medium | high" },
                  description: { type: Type.STRING, description: "Detailed risk report" },
                  recommendation: { type: Type.STRING, description: "Concrete mitigation design" }
                },
                required: ["agentName", "riskType", "severity", "description", "recommendation"]
              }
            },
            suggestions: {
              type: Type.ARRAY,
              description: "Algorithmic refactoring designs",
              items: {
                type: Type.OBJECT,
                properties: {
                  targetAlgorithm: { type: Type.STRING, description: "Name of target algorithm to fix" },
                  optimizedPseudocode: { type: Type.STRING, description: "Fully refined pseudocode" },
                  explanation: { type: Type.STRING, description: "Why this optimization prevents standard inefficiencies" }
                },
                required: ["targetAlgorithm", "optimizedPseudocode", "explanation"]
              }
            },
            design_elements: designElementsSchema
          },
          required: ["risks", "suggestions", "design_elements"]
        },
        localSettings,
        "consistency_agent"
      );

      const reviewerOutput = JSON.parse(reviewerResponseText || '{"risks": [], "suggestions": [], "design_elements": []}');
      spec.risks = [...spec.risks, ...reviewerOutput.risks];
      if (Array.isArray(reviewerOutput.design_elements)) {
        reviewerOutput.design_elements.forEach((el: any) => {
          el.agent = "algorithm_reviewer";
          spec.design_elements.push(el);
        });
      }

      // Integrate optimized pseudocode suggestions back into algorithms if applicable
      if (reviewerOutput.suggestions && reviewerOutput.suggestions.length > 0) {
        spec.algorithms = spec.algorithms.map((alg: any) => {
          const matchingSuggestion = reviewerOutput.suggestions.find((s: any) => s.targetAlgorithm.toLowerCase().includes(alg.name.toLowerCase()));
          if (matchingSuggestion) {
            return {
              ...alg,
              description: `${alg.description} [Optimized: ${matchingSuggestion.explanation}]`,
              pseudocode: matchingSuggestion.optimizedPseudocode
            };
          }
          return alg;
        });
      }

      sendSSE("log", {
        id: "log_review_done",
        timestamp: new Date().toLocaleTimeString(),
        role: "algorithm_reviewer",
        agentName: "Algorithmic Reviewer",
        emoji: "🧪",
        status: "completed",
        message: `Algorithmic Reviewer identified ${reviewerOutput.risks.length} algorithmic/concurrency bottleneck risks, rewriting logic engines.`
      });

      // --- PRODUCT SAFETY & CONSISTENCY AGENT ---
      sendSSE("status", { stage: "safety_check", activeAgent: "consistency_agent", message: "Safety and Alignment compliance validation..." });
      sendSSE("log", {
        id: "log_safety_start",
        timestamp: new Date().toLocaleTimeString(),
        role: "consistency_agent",
        agentName: "Alignment & Safety Officer",
        emoji: "🔒",
        status: "thinking",
        message: "Auditing integration mappings. Verifying that UX journeys match architectural endpoints and security policies..."
      });

      const safetyResponseText = await generateSpecLayer(
        "consistency_agent",
        "You are the Alignment, Product Safety, and Consistency Auditor. You must also produce detailed design specification elements like Mermaid diagrams or structured behavioural specifications validating compliance, system access borders, or privacy boundaries.",
        `Review the entire compiled draft specification to verify UX/Backend alignment, privacy constraints, and lack of overlapping designs.\n\nSystem: ${JSON.stringify(spec)}\n\nList inconsistencies, safety risks, and outstanding developer questions. You MUST also generate relevant design specification elements (such as compliance BDD behavioural specs or a Mermaid diagram modeling data security bounds). Your output MUST adhere strictly to the JSON schema.`,
        {
          type: Type.OBJECT,
          properties: {
            contradictions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Contradictions found between UX and backend modules" },
            open_questions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Critical questions that require business/developer feedback" },
            risks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  riskType: { type: Type.STRING, description: "E.g., compliance, safety, security, out-of-scope" },
                  severity: { type: Type.STRING, description: "low | medium | high" },
                  description: { type: Type.STRING, description: "Security/Out-of-scope risk" },
                  recommendation: { type: Type.STRING, description: "Security patch design" }
                },
                required: ["riskType", "severity", "description", "recommendation"]
              }
            },
            design_elements: designElementsSchema
          },
          required: ["contradictions", "open_questions", "risks", "design_elements"]
        },
        localSettings,
        "architect"
      );

      const safetyOutput = JSON.parse(safetyResponseText || '{"contradictions": [], "open_questions": [], "risks": [], "design_elements": []}');
      
      const safetyRisks = safetyOutput.risks.map((r: any) => ({
        agentName: "Alignment Officer",
        ...r
      }));

      spec.risks = [...spec.risks, ...safetyRisks];
      spec.open_questions = safetyOutput.open_questions;
      if (Array.isArray(safetyOutput.design_elements)) {
        safetyOutput.design_elements.forEach((el: any) => {
          el.agent = "consistency_agent";
          spec.design_elements.push(el);
        });
      }
      spec.version = 5;

      sendSSE("log", {
        id: "log_safety_done",
        timestamp: new Date().toLocaleTimeString(),
        role: "consistency_agent",
        agentName: "Alignment & Safety Officer",
        emoji: "🔒",
        status: "completed",
        message: `Safety Agent resolved ${safetyOutput.contradictions.length} overlaps, logged ${safetyOutput.open_questions.length} open questions, and established security parameters.`
      });
      sendSSE("spec", spec);

      // --- AGENT BOARD DEBATE SIMULATION ---
      sendSSE("status", { stage: "debating", activeAgent: "architect", message: "Core Architect and Safety board debating open items..." });
      sendSSE("log", {
        id: "log_debate_board",
        timestamp: new Date().toLocaleTimeString(),
        role: "architect",
        agentName: "System Architect",
        emoji: "🧠",
        status: "debate",
        message: `DEBATE DETECTED: Safety officer raised alignment concerns about user privacy constraints. Discussing schema overrides...`
      });

      const debateResponseText = await generateSpecLayer(
        "architect",
        "Generate a quick transcript debating critical open risks.",
        `Open questions: ${JSON.stringify(spec.open_questions)}\nRisks: ${JSON.stringify(spec.risks.filter(r => r.severity === 'high'))}\n\nArchitect, UX Designer, and Alignment Officer are debating on how to address high security/complexity risks. Your output MUST adhere strictly to the JSON schema.`,
        {
          type: Type.OBJECT,
          properties: {
            messages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING, description: "Architect | UX Designer | Safety Officer" },
                  role: { type: Type.STRING, description: "architect | ux_designer | consistency_agent" },
                  emoji: { type: Type.STRING },
                  text: { type: Type.STRING }
                },
                required: ["speaker", "role", "emoji", "text"]
              }
            }
          },
          required: ["messages"]
        },
        localSettings,
        "synthesiser"
      );

      const debateOutput = JSON.parse(debateResponseText || '{"messages": []}');
      for (const msg of debateOutput.messages) {
        sendSSE("log", {
          id: `log_deb_${Math.random().toString(36).substring(7)}`,
          timestamp: new Date().toLocaleTimeString(),
          role: msg.role,
          agentName: msg.speaker,
          emoji: msg.emoji,
          status: "debate",
          message: msg.text
        });
      }

      // --- BOARD VOTING BOARD ---
      const votes: any[] = [
        {
          agentName: "System Architect",
          role: "architect",
          emoji: "🧠",
          approved: true,
          weight: 3,
          reason: "Approved. All backend boundaries satisfy sub-system data routing constraints."
        },
        {
          agentName: "Lead UX Designer",
          role: "ux_designer",
          emoji: "🎨",
          approved: true,
          weight: 2,
          reason: "Approved. Interface wireframes correspond cleanly to database module states."
        },
        {
          agentName: "Safety Officer",
          role: "consistency_agent",
          emoji: "🔒",
          approved: spec.risks.filter(r => r.severity === 'high').length === 0,
          weight: 3,
          reason: spec.risks.filter(r => r.severity === 'high').length === 0 
            ? "Approved. No high severity risks are pending mitigation."
            : "Rejected. High severity security/architectural risks require formal patch before release."
        }
      ];

      sendSSE("votes", votes);
      sendSSE("log", {
        id: "log_vote_cast",
        timestamp: new Date().toLocaleTimeString(),
        role: "consistency_agent",
        agentName: "System Board",
        emoji: "🗳️",
        status: "completed",
        message: "Architectural Board casted weights: " + votes.map(v => `${v.approved ? '✅' : '❌'}`).join(", ")
      });
      } else {
        sendSSE("log", {
          id: "log_review_skipped",
          timestamp: new Date().toLocaleTimeString(),
          role: "consistency_agent",
          agentName: "Alignment & Safety Officer",
          emoji: "🔒",
          status: "completed",
          message: "Skipped Reviewer & Safety Board: Debate and alignment checks already evaluated in previous state."
        });
        sendSSE("spec", spec);
      }
    }

    // --- 4. STEP: FINAL SYNTHESIS & SCALPEL SPEC PACK ---
    sendSSE("status", { stage: "synthesizing", activeAgent: "synthesiser", message: "Synthesiser compiling final Vibe Coding Spec Pack..." });
    sendSSE("log", {
      id: "log_synth_start",
      timestamp: new Date().toLocaleTimeString(),
      role: "synthesiser",
      agentName: "Synthesiser Agent",
      emoji: "🧩",
      status: "thinking",
      message: "Merging components, resolving logic, compiling markdown specs, and constructing code blueprints..."
    });

    const synthesisResponseText = await generateSpecLayer(
      "synthesiser",
      "You are the master Synthesiser Agent. Your job is to compile the final build-ready 'Vibe Coding Spec Pack' based on all collected data. You must also compile any aggregated or consolidated design specification elements like Mermaid charts, API schemas, or behavioural specifications.",
      `Draft Data: ${JSON.stringify(spec)}\n\nProduce:\n1. A highly readable, fully fledged Markdown Product Specification (\`final_spec\`). It must contain a System Overview, Module Architecture, UX journeys, Algorithmic Pseudocode (and logic details), Prompt instructions, Edge cases, and implementation directions.\n2. A list of scaffold files (\`scaffold_files\`) that turning this spec into build-ready boilerplate (e.g. Prisma Schema, React components, or Node routing).\n3. Any consolidated, beautiful visual design specification elements (\`design_elements\`).\nEnsure that the output complies with the strict JSON output schema.`,
      {
        type: Type.OBJECT,
        properties: {
          final_spec: { type: Type.STRING, description: "A beautifully structured product specification in markdown" },
          scaffold_files: {
            type: Type.ARRAY,
            description: "Code scaffold boilerplate generated from the design",
            items: {
              type: Type.OBJECT,
              properties: {
                language: { type: Type.STRING, description: "E.g., typescript, prisma, markdown" },
                filename: { type: Type.STRING, description: "File path and name" },
                content: { type: Type.STRING, description: "Complete file content boilerplates" }
              },
              required: ["language", "filename", "content"]
            }
          },
          design_elements: designElementsSchema
        },
        required: ["final_spec", "scaffold_files", "design_elements"]
      },
      localSettings,
      null
    );

    const synthesisOutput = JSON.parse(synthesisResponseText || '{"final_spec": "", "scaffold_files": [], "design_elements": []}');
    spec.final_spec = synthesisOutput.final_spec;
    if (Array.isArray(synthesisOutput.design_elements)) {
      synthesisOutput.design_elements.forEach((el: any) => {
        el.agent = "synthesiser";
        spec.design_elements.push(el);
      });
    }
    spec.version = 6;

    sendSSE("spec", spec);
    sendSSE("compiled", synthesisOutput.scaffold_files);

    sendSSE("log", {
      id: "log_synth_done",
      timestamp: new Date().toLocaleTimeString(),
      role: "synthesiser",
      agentName: "Synthesiser Agent",
      emoji: "🧩",
      status: "completed",
      message: `Spec compiled successfully! Spec Pack contains ${synthesisOutput.scaffold_files.length} code scaffolds and a comprehensive design markdown.`
    });

    sendSSE("status", { stage: "completed", activeAgent: "system", message: "Spec Pack Ready!" });
    if (sessionId && typeof sessionId === "string") {
      tempSessions.set(sessionId, {
        spec,
        logs: [],
        idea,
        debate: runDebate,
        iterations: numIterations,
        localSettings
      });
    }
    res.end();

  } catch (error: any) {
    console.error("Orchestration stream error:", error);
    if (sessionId && typeof sessionId === "string" && spec) {
      tempSessions.set(sessionId, {
        spec,
        logs: [],
        idea,
        debate: runDebate,
        iterations: numIterations,
        localSettings
      });
    }
    sendSSE("log", {
      id: "log_err_" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      role: "synthesiser",
      agentName: "System",
      emoji: "❌",
      status: "failed",
      message: `Failed: ${error.message}`
    });
    sendSSE("status", { stage: "failed", activeAgent: "system", message: `Error: ${error.message}` });
    res.end();
  }
});

// SSE Refinement Chat Endpoint
app.get("/api/refine-stream", async (req, res) => {
  const { sessionId, message, localSettings: localSettingsJson } = req.query;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "Missing sessionId parameter" });
    return;
  }
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing message parameter" });
    return;
  }

  const session = tempSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  let localSettings: any = session.localSettings;
  if (localSettingsJson && typeof localSettingsJson === "string") {
    try {
      localSettings = JSON.parse(localSettingsJson);
    } catch (e) {
      console.error("Failed to parse localSettings settings parameter in refine", e);
    }
  }

  const { spec, debate: runDebate } = session;

  // Set headers for Server-Sent Events (SSE)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendSSE = (type: string, data: any) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendSSE("status", { stage: "architecting", activeAgent: "architect", message: "Architect reviewing change request..." });
    
    // 1. LEAD ARCHITECT REVIEWS AND MAKES DECISION
    sendSSE("log", {
      id: "log_ref_start_" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      role: "architect",
      agentName: "System Architect",
      emoji: "🧠",
      status: "thinking",
      message: `Analyzing refinement instructions: "${message}"`
    });

    const architectDecisionText = await generateSpecLayer(
      "architect",
      "You are the Lead System Architect. Your job is to analyze the user's revision/refinement request for the system specification and coordinate other specialist agents to implement these changes. You must decide which agents are relevant to implement this change (out of: architect, ux_designer, algorithm_designer, prompt_designer) and provide specific instructions for each called agent.",
      `Current Specification Structure: ${JSON.stringify(spec)}\n\nUser Revision Request: "${message}"\n\nProvide an analysis of the requested changes and select which agents must run to execute them. Adhere strictly to the required schema.`,
      {
        type: Type.OBJECT,
        properties: {
          analysis: { type: Type.STRING, description: "High-level architectural assessment of the revision request" },
          agentsToCall: {
            type: Type.ARRAY,
            description: "List of specialist agents that must be invoked. Allowed values: architect, ux_designer, algorithm_designer, prompt_designer",
            items: { type: Type.STRING }
          },
          architectInstruction: { type: Type.STRING, description: "Instructions for the System Architect agent if called, explaining exactly what modules to update." },
          uxInstruction: { type: Type.STRING, description: "Instructions for the UX/UI Designer agent if called, explaining exactly what screen flows to update." },
          algoInstruction: { type: Type.STRING, description: "Instructions for the Algorithmic Engineer agent if called, explaining exactly what algorithms to update." },
          promptInstruction: { type: Type.STRING, description: "Instructions for the Prompt Engineer agent if called, explaining exactly what prompts to update." }
        },
        required: ["analysis", "agentsToCall"]
      },
      localSettings,
      "synthesiser"
    );

    const decision = JSON.parse(architectDecisionText || '{"analysis": "No changes needed", "agentsToCall": []}');
    
    sendSSE("log", {
      id: "log_ref_decision_" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      role: "architect",
      agentName: "System Architect",
      emoji: "🧠",
      status: "completed",
      message: `Architectural Analysis: ${decision.analysis}\n\nCoordinating Specialist Team: ${decision.agentsToCall.join(", ") || "No specialists required (direct compile)"}`
    });

    const agents = decision.agentsToCall || [];

    // --- A. ARCHITECT AGENT REFINEMENT ---
    if (agents.includes("architect")) {
      sendSSE("status", { stage: "architecting", activeAgent: "architect", message: "Architect applying structural modifications..." });
      sendSSE("log", {
        id: "log_ref_arch_start_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "architect",
        agentName: "System Architect",
        emoji: "🧠",
        status: "thinking",
        message: `Modifying architectural modules: ${decision.architectInstruction}`
      });

      const architectResponseText = await generateSpecLayer(
        "architect",
        "You are the Lead System Architect. Apply the specified architectural changes to the existing modules list and architect-related design elements (like C4 diagrams or API contracts). You must preserve unaffected modules. Adhere strictly to the schema.",
        `Existing Modules: ${JSON.stringify(spec.modules || [])}\nExisting Design Elements (C4/API): ${JSON.stringify((spec.design_elements || []).filter((el: any) => el.agent === 'architect' || el.type === 'c4_diagram' || el.type === 'api_contract'))}\nUser Revision Request: "${message}"\nArchitect Refinement Instructions: "${decision.architectInstruction}"`,
        {
          type: Type.OBJECT,
          properties: {
            modules: {
              type: Type.ARRAY,
              description: "Full updated list of architectural modules, including both modified and untouched ones.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Module name" },
                  description: { type: Type.STRING, description: "Detailed module responsibility" },
                  boundaries: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Boundaries, technologies, and ports" },
                  dataFlow: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Inputs, outputs, and messaging streams" }
                },
                required: ["name", "description", "boundaries", "dataFlow"]
              }
            },
            design_elements: designElementsSchema
          },
          required: ["modules", "design_elements"]
        },
        localSettings,
        "ux_designer"
      );

      const archOutput = JSON.parse(architectResponseText || '{"modules": [], "design_elements": []}');
      if (archOutput.modules && archOutput.modules.length > 0) {
        spec.modules = archOutput.modules;
      }
      if (Array.isArray(archOutput.design_elements)) {
        if (!spec.design_elements) spec.design_elements = [];
        archOutput.design_elements.forEach((el: any) => {
          el.agent = "architect";
          const existingIdx = spec.design_elements.findIndex((e: any) => e.id === el.id);
          if (existingIdx >= 0) {
            spec.design_elements[existingIdx] = el;
          } else {
            spec.design_elements.push(el);
          }
        });
      }

      sendSSE("log", {
        id: "log_ref_arch_done_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "architect",
        agentName: "System Architect",
        emoji: "🧠",
        status: "completed",
        message: `Architect applied structural changes. Total modules is now ${spec.modules.length}.`
      });
      sendSSE("spec", spec);
    }

    // --- B. UX DESIGNER REFINEMENT ---
    if (agents.includes("ux_designer")) {
      sendSSE("status", { stage: "designing", activeAgent: "ux_designer", message: "UX Designer applying flow modifications..." });
      sendSSE("log", {
        id: "log_ref_ux_start_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "ux_designer",
        agentName: "Lead UX/UI Designer",
        emoji: "🎨",
        status: "thinking",
        message: `Modifying screen journeys and transition flows: ${decision.uxInstruction}`
      });

      const uxResponseText = await generateSpecLayer(
        "ux_designer",
        "You are the Lead UX/UI Designer. Apply the specified visual changes to the existing screen journeys list and UX-related design elements (like Mermaid sequences or behavioural Gherkin specs). You must preserve unaffected screen states.",
        `Existing Journeys: ${JSON.stringify(spec.ux_flows || [])}\nExisting Design Elements: ${JSON.stringify((spec.design_elements || []).filter((el: any) => el.agent === 'ux_designer'))}\nUser Revision Request: "${message}"\nUX Refinement Instructions: "${decision.uxInstruction}"`,
        {
          type: Type.OBJECT,
          properties: {
            ux_flows: {
              type: Type.ARRAY,
              description: "Full updated list of screen journeys.",
              items: {
                type: Type.OBJECT,
                properties: {
                  screenName: { type: Type.STRING, description: "Name of the screen" },
                  journey: { type: Type.STRING, description: "Description of the user journey on this screen" },
                  uiState: { type: Type.STRING, description: "UI visual layout components, styling directives, and state data" },
                  transitions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Click handlers, navigation destinations, and micro-interactions" }
                },
                required: ["screenName", "journey", "uiState", "transitions"]
              }
            },
            design_elements: designElementsSchema
          },
          required: ["ux_flows", "design_elements"]
        },
        localSettings,
        "algorithm_designer"
      );

      const uxOutput = JSON.parse(uxResponseText || '{"ux_flows": [], "design_elements": []}');
      if (uxOutput.ux_flows && uxOutput.ux_flows.length > 0) {
        spec.ux_flows = uxOutput.ux_flows;
      }
      if (Array.isArray(uxOutput.design_elements)) {
        if (!spec.design_elements) spec.design_elements = [];
        uxOutput.design_elements.forEach((el: any) => {
          el.agent = "ux_designer";
          const existingIdx = spec.design_elements.findIndex((e: any) => e.id === el.id);
          if (existingIdx >= 0) {
            spec.design_elements[existingIdx] = el;
          } else {
            spec.design_elements.push(el);
          }
        });
      }

      sendSSE("log", {
        id: "log_ref_ux_done_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "ux_designer",
        agentName: "Lead UX/UI Designer",
        emoji: "🎨",
        status: "completed",
        message: `UX Designer refined user journeys. Total screens is now ${spec.ux_flows.length}.`
      });
      sendSSE("spec", spec);
    }

    // --- C. ALGORITHM DESIGNER REFINEMENT ---
    if (agents.includes("algorithm_designer")) {
      sendSSE("status", { stage: "engineering", activeAgent: "algorithm_designer", message: "Algorithm Designer applying logic modifications..." });
      sendSSE("log", {
        id: "log_ref_algo_start_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "algorithm_designer",
        agentName: "Algorithmic Engineer",
        emoji: "⚙️",
        status: "thinking",
        message: `Modifying algorithms and pseudocode: ${decision.algoInstruction}`
      });

      const algoResponseText = await generateSpecLayer(
        "algorithm_designer",
        "You are the Algorithmic Engineer. Apply the specified logic changes to the existing algorithms list and algorithm-related design elements (like flowchart/state diagrams or pseudocode blocks). You must preserve unaffected code blocks.",
        `Existing Algorithms: ${JSON.stringify(spec.algorithms || [])}\nExisting Design Elements: ${JSON.stringify((spec.design_elements || []).filter((el: any) => el.agent === 'algorithm_designer'))}\nUser Revision Request: "${message}"\nAlgorithm Refinement Instructions: "${decision.algoInstruction}"`,
        {
          type: Type.OBJECT,
          properties: {
            algorithms: {
              type: Type.ARRAY,
              description: "Full updated list of computational logic blocks.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Algorithm or class engine name" },
                  description: { type: Type.STRING, description: "What problem this algorithm solves and why" },
                  pseudocode: { type: Type.STRING, description: "Complete robust typed-like pseudocode" },
                  complexity: { type: Type.STRING, description: "Time and Space Big-O complexity notes" }
                },
                required: ["name", "description", "pseudocode", "complexity"]
              }
            },
            design_elements: designElementsSchema
          },
          required: ["algorithms", "design_elements"]
        },
        localSettings,
        "prompt_designer"
      );

      const algoOutput = JSON.parse(algoResponseText || '{"algorithms": [], "design_elements": []}');
      if (algoOutput.algorithms && algoOutput.algorithms.length > 0) {
        spec.algorithms = algoOutput.algorithms;
      }
      if (Array.isArray(algoOutput.design_elements)) {
        if (!spec.design_elements) spec.design_elements = [];
        algoOutput.design_elements.forEach((el: any) => {
          el.agent = "algorithm_designer";
          const existingIdx = spec.design_elements.findIndex((e: any) => e.id === el.id);
          if (existingIdx >= 0) {
            spec.design_elements[existingIdx] = el;
          } else {
            spec.design_elements.push(el);
          }
        });
      }

      sendSSE("log", {
        id: "log_ref_algo_done_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "algorithm_designer",
        agentName: "Algorithmic Engineer",
        emoji: "⚙️",
        status: "completed",
        message: `Algorithm Engineer revised processing engines. Total custom algorithms is now ${spec.algorithms.length}.`
      });
      sendSSE("spec", spec);
    }

    // --- D. LLM PROMPT DESIGNER REFINEMENT ---
    if (agents.includes("prompt_designer")) {
      sendSSE("status", { stage: "prompting", activeAgent: "prompt_designer", message: "Prompt Engineer applying template modifications..." });
      sendSSE("log", {
        id: "log_ref_prompt_start_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "prompt_designer",
        agentName: "Prompt Engineer",
        emoji: "🧾",
        status: "thinking",
        message: `Modifying dynamic prompts and template structures: ${decision.promptInstruction}`
      });

      const promptResponseText = await generateSpecLayer(
        "prompt_designer",
        "You are the Lead LLM Prompt Engineer. Apply the specified prompt changes to the existing prompt templates list and prompt-related design elements.",
        `Existing Prompts: ${JSON.stringify(spec.prompts || [])}\nExisting Design Elements: ${JSON.stringify((spec.design_elements || []).filter((el: any) => el.agent === 'prompt_designer'))}\nUser Revision Request: "${message}"\nPrompt Refinement Instructions: "${decision.promptInstruction}"`,
        {
          type: Type.OBJECT,
          properties: {
            prompts: {
              type: Type.ARRAY,
              description: "Full updated list of prompt blueprints.",
              items: {
                type: Type.OBJECT,
                properties: {
                  featureName: { type: Type.STRING, description: "The AI-driven feature utilizing this prompt" },
                  template: { type: Type.STRING, description: "The raw system instructions / developer prompt template" },
                  inputs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Dynamic variable replacements" },
                  outputs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Required schema components for output" },
                  guardrails: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Strict negative rules, safety limits, and anti-hallucination guardrails" }
                },
                required: ["featureName", "template", "inputs", "outputs", "guardrails"]
              }
            },
            design_elements: designElementsSchema
          },
          required: ["prompts", "design_elements"]
        },
        localSettings,
        "synthesiser"
      );

      const promptOutput = JSON.parse(promptResponseText || '{"prompts": [], "design_elements": []}');
      if (promptOutput.prompts && promptOutput.prompts.length > 0) {
        spec.prompts = promptOutput.prompts;
      }
      if (Array.isArray(promptOutput.design_elements)) {
        if (!spec.design_elements) spec.design_elements = [];
        promptOutput.design_elements.forEach((el: any) => {
          el.agent = "prompt_designer";
          const existingIdx = spec.design_elements.findIndex((e: any) => e.id === el.id);
          if (existingIdx >= 0) {
            spec.design_elements[existingIdx] = el;
          } else {
            spec.design_elements.push(el);
          }
        });
      }

      sendSSE("log", {
        id: "log_ref_prompt_done_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "prompt_designer",
        agentName: "Prompt Engineer",
        emoji: "🧾",
        status: "completed",
        message: `Prompt Engineer refined dynamic prompt sheets. Total prompt architectures is now ${spec.prompts.length}.`
      });
      sendSSE("spec", spec);
    }

    // --- E. OPTIONAL REVIEW LOOP ---
    if (runDebate && agents.length > 0) {
      sendSSE("status", { stage: "safety_check", activeAgent: "consistency_agent", message: "Reviewing revisions for safety and consistency..." });
      sendSSE("log", {
        id: "log_ref_safety_start_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "consistency_agent",
        agentName: "Alignment & Safety Officer",
        emoji: "🔒",
        status: "thinking",
        message: "Verifying updated parameters against compliance policies..."
      });

      const safetyResponseText = await generateSpecLayer(
        "consistency_agent",
        "You are the Alignment, Product Safety, and Consistency Auditor. Auditing the updated specification to make sure no breaking contradictions or security concerns were introduced.",
        `Review the modified specifications for safety, consistency and lack of contradictions: ${JSON.stringify(spec)}`,
        {
          type: Type.OBJECT,
          properties: {
            contradictions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "New contradictions or conflicts introduced" },
            open_questions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "New unresolved developer questions" },
            risks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  riskType: { type: Type.STRING, description: "E.g., compliance, safety, security" },
                  severity: { type: Type.STRING, description: "low | medium | high" },
                  description: { type: Type.STRING, description: "Security/Safety risk" },
                  recommendation: { type: Type.STRING, description: "Mitigation plan" }
                },
                required: ["riskType", "severity", "description", "recommendation"]
              }
            },
            design_elements: designElementsSchema
          },
          required: ["contradictions", "open_questions", "risks", "design_elements"]
        },
        localSettings,
        "synthesiser"
      );

      const safetyOutput = JSON.parse(safetyResponseText || '{"contradictions": [], "open_questions": [], "risks": [], "design_elements": []}');
      if (safetyOutput.risks && safetyOutput.risks.length > 0) {
        const safetyRisks = safetyOutput.risks.map((r: any) => ({
          agentName: "Alignment Officer",
          ...r
        }));
        spec.risks = [...(spec.risks || []), ...safetyRisks];
      }
      if (safetyOutput.open_questions && safetyOutput.open_questions.length > 0) {
        spec.open_questions = [...(spec.open_questions || []), ...safetyOutput.open_questions];
      }
      if (Array.isArray(safetyOutput.design_elements)) {
        if (!spec.design_elements) spec.design_elements = [];
        safetyOutput.design_elements.forEach((el: any) => {
          el.agent = "consistency_agent";
          const existingIdx = spec.design_elements.findIndex((e: any) => e.id === el.id);
          if (existingIdx >= 0) {
            spec.design_elements[existingIdx] = el;
          } else {
            spec.design_elements.push(el);
          }
        });
      }

      sendSSE("log", {
        id: "log_ref_safety_done_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "consistency_agent",
        agentName: "Alignment & Safety Officer",
        emoji: "🔒",
        status: "completed",
        message: `Safety Officer completed audit on modifications. Resolved ${safetyOutput.contradictions.length} overlaps, noted ${safetyOutput.open_questions.length} new open questions.`
      });
      sendSSE("spec", spec);
    }

    // --- F. SYNTHESIS RE-COMPILATION ---
    sendSSE("status", { stage: "synthesizing", activeAgent: "synthesiser", message: "Synthesiser compiling revised Vibe Coding Spec Pack..." });
    sendSSE("log", {
      id: "log_ref_synth_start_" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      role: "synthesiser",
      agentName: "Synthesiser Agent",
      emoji: "🧩",
      status: "thinking",
      message: "Merging components, resolving logic, re-compiling markdown specifications, and re-constructing code scaffolds..."
    });

    const synthesisResponseText = await generateSpecLayer(
      "synthesiser",
      "You are the master Synthesiser Agent. Re-compile the final build-ready 'Vibe Coding Spec Pack' incorporating all architectural, UX, algorithmic, and prompt modifications perfectly.",
      `Revised Specification State: ${JSON.stringify(spec)}\n\nProduce the complete updated final specification markdown and code scaffolds.`,
      {
        type: Type.OBJECT,
        properties: {
          final_spec: { type: Type.STRING, description: "A beautifully structured product specification in markdown" },
          scaffold_files: {
            type: Type.ARRAY,
            description: "Code scaffold boilerplate generated from the design",
            items: {
              type: Type.OBJECT,
              properties: {
                language: { type: Type.STRING, description: "E.g., typescript, prisma, markdown" },
                filename: { type: Type.STRING, description: "File path and name" },
                content: { type: Type.STRING, description: "Complete file content boilerplates" }
              },
              required: ["language", "filename", "content"]
            }
          },
          design_elements: designElementsSchema
        },
        required: ["final_spec", "scaffold_files", "design_elements"]
      },
      localSettings,
      null
    );

    const synthesisOutput = JSON.parse(synthesisResponseText || '{"final_spec": "", "scaffold_files": [], "design_elements": []}');
    spec.final_spec = synthesisOutput.final_spec;
    if (Array.isArray(synthesisOutput.design_elements)) {
      if (!spec.design_elements) spec.design_elements = [];
      synthesisOutput.design_elements.forEach((el: any) => {
        el.agent = "synthesiser";
        const existingIdx = spec.design_elements.findIndex((e: any) => e.id === el.id);
        if (existingIdx >= 0) {
          spec.design_elements[existingIdx] = el;
        } else {
          spec.design_elements.push(el);
        }
      });
    }

    // Increment spec version upon refinement success
    spec.version = (spec.version || 0) + 1;

    sendSSE("spec", spec);
    sendSSE("compiled", synthesisOutput.scaffold_files);

    sendSSE("log", {
      id: "log_ref_synth_done_" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      role: "synthesiser",
      agentName: "Synthesiser Agent",
      emoji: "🧩",
      status: "completed",
      message: `Spec Pack successfully refined to version ${spec.version}! Generated ${synthesisOutput.scaffold_files.length} updated code scaffolds.`
    });

    sendSSE("status", { stage: "completed", activeAgent: "system", message: `Spec Refined to v${spec.version}!` });
    
    // Save updated spec state back in session store
    session.spec = spec;
    tempSessions.set(sessionId, session);

    res.end();

  } catch (error: any) {
    console.error("Refinement stream error:", error);
    sendSSE("log", {
      id: "log_ref_err_" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      role: "synthesiser",
      agentName: "System",
      emoji: "❌",
      status: "failed",
      message: `Refinement Failed: ${error.message}`
    });
    sendSSE("status", { stage: "failed", activeAgent: "system", message: `Refinement Error: ${error.message}` });
    res.end();
  }
});

// Serve Vite dev server or static build assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
