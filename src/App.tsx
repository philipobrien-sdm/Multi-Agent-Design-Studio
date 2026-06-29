/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Cpu,
  Workflow,
  Network,
  Layers,
  Sparkles,
  Clipboard,
  FileText,
  Play,
  Settings,
  RefreshCw,
  Clock,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Code,
  Smartphone,
  ChevronRight,
  Vote,
  Database,
  Terminal,
  ChevronDown,
  Info,
  Download,
  Upload,
  Share2,
  MessageSquare,
  Send
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  SpecObject,
  AgentActivityLog,
  SpecVersionHistory,
  VoteResult,
  SpecCompilerOutput,
  AgentRole,
  LocalLlmSettings
} from "./types";
import { sampleSpecifications } from "./sampleSpecData";

export default function App() {
  // Idea input states
  const [idea, setIdea] = useState("");
  const [debate, setDebate] = useState(true);
  const [iterations, setIterations] = useState(1);

  // Local LLM configurations
  const [localSettings, setLocalSettings] = useState<LocalLlmSettings>({
    useLocal: false,
    serverUrl: "http://localhost:11434",
    apiKey: "",
    defaultModel: "",
    unloadAfterUse: false,
    agentModels: {}
  });
  const [unloadingModel, setUnloadingModel] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Health and API key
  const [apiKeyOk, setApiKeyOk] = useState(true);
  const [apiKeyChecked, setApiKeyChecked] = useState(false);

  // Active generation states
  const [isRunning, setIsRunning] = useState(false);
  const [activeStage, setActiveStage] = useState<string>("idle");
  const [activeAgent, setActiveAgent] = useState<string>("system");
  const [activeMessage, setActiveMessage] = useState<string>("");

  // Data states
  const [spec, setSpec] = useState<SpecObject | null>(null);
  const [logs, setLogs] = useState<AgentActivityLog[]>([]);
  const [votes, setVotes] = useState<VoteResult[]>([]);
  const [compiledFiles, setCompiledFiles] = useState<SpecCompilerOutput[]>([]);
  const [history, setHistory] = useState<SpecVersionHistory[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  // Active view tabs
  const [activeTab, setActiveTab] = useState<
    "summary" | "modules" | "ux" | "algorithms" | "prompts" | "risks" | "code" | "design_elements"
  >("summary");
  const [selectedCodeFile, setSelectedCodeFile] = useState<SpecCompilerOutput | null>(null);
  const [selectedDesignElementId, setSelectedDesignElementId] = useState<string | null>(null);
  const [selectedDesignSubView, setSelectedDesignSubView] = useState<"visual" | "raw">("visual");

  // UI state utilities
  const [showSettings, setShowSettings] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Check backend health and API key status on mount + restore local storage data
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setApiKeyOk(data.hasApiKey);
        setApiKeyChecked(true);
      })
      .catch((err) => {
        console.error("Health check failed", err);
        setApiKeyChecked(true);
      });

    const savedIdea = localStorage.getItem("spec_studio_idea");
    if (savedIdea) setIdea(savedIdea);

    const savedSpec = localStorage.getItem("spec_studio_spec");
    if (savedSpec) {
      try {
        setSpec(JSON.parse(savedSpec));
      } catch (e) {
        console.error("Failed to restore cached spec", e);
      }
    }

    const savedLocalSettings = localStorage.getItem("spec_studio_local_settings");
    if (savedLocalSettings) {
      try {
        setLocalSettings(JSON.parse(savedLocalSettings));
      } catch (e) {}
    }

    const savedLocalModels = localStorage.getItem("spec_studio_local_models");
    if (savedLocalModels) {
      try {
        setLocalModels(JSON.parse(savedLocalModels));
      } catch (e) {}
    }
  }, []);

  // Sync state back to localStorage
  useEffect(() => {
    if (idea) {
      localStorage.setItem("spec_studio_idea", idea);
    }
  }, [idea]);

  useEffect(() => {
    if (spec) {
      localStorage.setItem("spec_studio_spec", JSON.stringify(spec));
    } else {
      localStorage.removeItem("spec_studio_spec");
    }
  }, [spec]);

  useEffect(() => {
    localStorage.setItem("spec_studio_local_settings", JSON.stringify(localSettings));
  }, [localSettings]);

  useEffect(() => {
    localStorage.setItem("spec_studio_local_models", JSON.stringify(localModels));
  }, [localModels]);

  // Scroll to bottom of logs on new messages
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Retrieve models from local server using dual-path fetching (cloud-proxy + client fallback)
  const fetchLocalModels = async () => {
    if (!localSettings.serverUrl) {
      setFetchError("Please provide a valid server URL first.");
      return;
    }
    setFetchingModels(true);
    setFetchError(null);
    setLocalModels([]);

    // 1. Try to fetch from backend proxy
    try {
      const response = await fetch("/api/fetch-local-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverUrl: localSettings.serverUrl,
          apiKey: localSettings.apiKey
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.models)) {
          setLocalModels(data.models);
          setFetchingModels(false);
          return;
        }
      }
    } catch (e) {
      // Proxy failed, try direct browser fetch
    }

    // 2. Direct browser fetch fallback (especially key for localhost/127.0.0.1)
    try {
      let cleanUrl = localSettings.serverUrl.trim();
      if (cleanUrl.endsWith("/")) {
        cleanUrl = cleanUrl.slice(0, -1);
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localSettings.apiKey) {
        headers["Authorization"] = `Bearer ${localSettings.apiKey}`;
      }

      // Try OpenAI /v1/models first
      const openaiEndpoint = cleanUrl.includes("/v1") ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
      try {
        const res = await fetch(openaiEndpoint, { headers, method: "GET" });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.data)) {
            const models = data.data.map((m: any) => m.id);
            if (models.length > 0) {
              setLocalModels(models);
              setFetchingModels(false);
              return;
            }
          }
        }
      } catch (e) { /* proceed to Ollama tags check */ }

      // Try Ollama native tags
      const ollamaEndpoint = `${cleanUrl}/api/tags`;
      const res = await fetch(ollamaEndpoint, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.models)) {
          const models = data.models.map((m: any) => m.name);
          if (models.length > 0) {
            setLocalModels(models);
            setFetchingModels(false);
            return;
          }
        }
      }

      throw new Error("Could not reach local server via backend proxy or browser direct fetch. Ensure your local LLM is running with CORS enabled (e.g. OLLAMA_ORIGINS=* for Ollama).");
    } catch (err: any) {
      console.error("Local LLM model retrieval failed:", err);
      setFetchError(err.message || "Failed to retrieve local models. Ensure server is active and CORS is configured.");
    } finally {
      setFetchingModels(false);
    }
  };

  // Manually unload a local LLM from memory
  const handleUnloadModel = async (modelName: string) => {
    if (!localSettings.serverUrl) {
      setFetchError("Please provide a valid server URL first.");
      return;
    }
    setUnloadingModel(modelName);
    setFetchError(null);

    // 1. Try backend proxy unload first
    try {
      const response = await fetch("/api/unload-local-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverUrl: localSettings.serverUrl,
          model: modelName,
          apiKey: localSettings.apiKey
        })
      });
      if (response.ok) {
        console.log(`Unloaded ${modelName} via backend proxy.`);
        setUnloadingModel(null);
        return;
      }
    } catch (e) {
      // Fallback to direct client-side fetch
    }

    // 2. Direct browser fetch fallback (especially key for localhost/127.0.0.1)
    try {
      let cleanUrl = localSettings.serverUrl.trim();
      if (cleanUrl.endsWith("/")) {
        cleanUrl = cleanUrl.slice(0, -1);
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localSettings.apiKey) {
        headers["Authorization"] = `Bearer ${localSettings.apiKey}`;
      }

      // Try Ollama native generate unload
      await fetch(`${cleanUrl}/api/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName,
          prompt: "",
          keep_alive: 0
        })
      }).catch(() => {});

      // Try Ollama native chat unload
      await fetch(`${cleanUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [],
          keep_alive: 0
        })
      }).catch(() => {});

      console.log(`Unloaded ${modelName} via direct browser fetch.`);
    } catch (err: any) {
      console.error("Direct browser unload failed:", err);
      setFetchError(`Could not unload model ${modelName} via proxy or direct fetch.`);
    } finally {
      setUnloadingModel(null);
    }
  };

  // Session, Refinement & Resume states
  const [sessionId, setSessionId] = useState<string>(() => localStorage.getItem("spec_studio_sess_id") || "sess_" + Math.random().toString(36).substring(2, 15));
  const [chatInput, setChatInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [canResume, setCanResume] = useState(false);

  useEffect(() => {
    localStorage.setItem("spec_studio_sess_id", sessionId);
  }, [sessionId]);

  // Handle Spec building via SSE Stream
  let sseSourceRef = useRef<EventSource | null>(null);

  const startOrchestration = async (isResume = false) => {
    let currentSessId = sessionId;

    if (!isResume) {
      if (!idea.trim()) return;
      currentSessId = "sess_" + Math.random().toString(36).substring(2, 15);
      setSessionId(currentSessId);

      // Reset session states
      setIsRunning(true);
      setLogs([]);
      setVotes([]);
      setCompiledFiles([]);
      setHistory([]);
      setSelectedVersion(null);
      setSpec(null);
      setActiveTab("summary");
      setSelectedCodeFile(null);
      setCanResume(false);
    } else {
      setIsRunning(true);
      setCanResume(false);
      // Append resume status log
      setLogs((prev) => [
        ...prev,
        {
          id: "log_resume_trigger_" + Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          role: "synthesiser",
          agentName: "System",
          emoji: "🔄",
          status: "thinking",
          message: "Initiating Spec Resumption flow..."
        }
      ]);
    }

    // Save the current config in the backend session state first to make sure it exists
    if (isResume && spec) {
      try {
        await fetch("/api/save-session-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spec,
            logs,
            idea,
            debate,
            iterations,
            localSettings
          })
        });
      } catch (e) {
        console.error("Failed to sync state before resume", e);
      }
    }

    const sseUrl = `/api/orchestrate-stream?sessionId=${currentSessId}&resume=${isResume}&idea=${encodeURIComponent(
      idea
    )}&debate=${debate}&iterations=${iterations}&localSettings=${encodeURIComponent(
      JSON.stringify(localSettings)
    )}`;

    const source = new EventSource(sseUrl);
    sseSourceRef.current = source;

    source.addEventListener("status", (event: any) => {
      const data = JSON.parse(event.data);
      setActiveStage(data.stage);
      setActiveAgent(data.activeAgent);
      setActiveMessage(data.message);

      if (data.stage === "completed") {
        setIsRunning(false);
        setCanResume(false);
        source.close();
      } else if (data.stage === "failed") {
        setIsRunning(false);
        setCanResume(true);
        source.close();
      }
    });

    source.addEventListener("log", (event: any) => {
      const log = JSON.parse(event.data);
      setLogs((prev) => [...prev, log]);
    });

    source.addEventListener("spec", (event: any) => {
      const incomingSpec = JSON.parse(event.data);
      setSpec(incomingSpec);

      // Append to history for Replay selector if the version incremented
      setHistory((prev) => {
        // If this version is already in history, replace it; else append
        const existsIdx = prev.findIndex((h) => h.version === incomingSpec.version);
        const newHistoryItem: SpecVersionHistory = {
          version: incomingSpec.version,
          spec: incomingSpec,
          timestamp: new Date().toLocaleTimeString(),
          triggerEvent: getTriggerEventName(incomingSpec.version),
        };

        if (existsIdx >= 0) {
          const updated = [...prev];
          updated[existsIdx] = newHistoryItem;
          return updated;
        } else {
          return [...prev, newHistoryItem].sort((a, b) => a.version - b.version);
        }
      });
    });

    source.addEventListener("votes", (event: any) => {
      const incomingVotes = JSON.parse(event.data);
      setVotes(incomingVotes);
    });

    source.addEventListener("compiled", (event: any) => {
      const files = JSON.parse(event.data);
      setCompiledFiles(files);
      if (files && files.length > 0) {
        setSelectedCodeFile(files[0]);
      }
    });

    source.onerror = (err) => {
      console.error("SSE Error:", err);
      setIsRunning(false);
      setCanResume(true);
      source.close();
    };
  };

  const startRefinement = async (messageText: string) => {
    if (!messageText.trim()) return;
    setChatInput("");
    setIsRefining(true);
    setIsRunning(true);

    // Append user input as an activity log
    setLogs((prev) => [
      ...prev,
      {
        id: "log_user_chat_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "synthesiser",
        agentName: "User",
        emoji: "💬",
        status: "completed",
        message: `Requested refinement: "${messageText}"`
      }
    ]);

    // Save the current state in backend session store so refinement has up-to-date specs
    try {
      await fetch("/api/save-session-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec,
          logs,
          idea,
          debate,
          iterations,
          localSettings
        })
      });
    } catch (e) {
      console.error("Failed to sync state before refinement", e);
    }

    const sseUrl = `/api/refine-stream?sessionId=${sessionId}&message=${encodeURIComponent(
      messageText
    )}&localSettings=${encodeURIComponent(JSON.stringify(localSettings))}`;

    const source = new EventSource(sseUrl);
    sseSourceRef.current = source;

    source.addEventListener("status", (event: any) => {
      const data = JSON.parse(event.data);
      setActiveStage(data.stage);
      setActiveAgent(data.activeAgent);
      setActiveMessage(data.message);

      if (data.stage === "completed") {
        setIsRunning(false);
        setIsRefining(false);
        source.close();
      } else if (data.stage === "failed") {
        setIsRunning(false);
        setIsRefining(false);
        source.close();
      }
    });

    source.addEventListener("log", (event: any) => {
      const log = JSON.parse(event.data);
      setLogs((prev) => [...prev, log]);
    });

    source.addEventListener("spec", (event: any) => {
      const incomingSpec = JSON.parse(event.data);
      setSpec(incomingSpec);

      setHistory((prev) => {
        const existsIdx = prev.findIndex((h) => h.version === incomingSpec.version);
        const newHistoryItem: SpecVersionHistory = {
          version: incomingSpec.version,
          spec: incomingSpec,
          timestamp: new Date().toLocaleTimeString(),
          triggerEvent: `v${incomingSpec.version} Refined by Architect`,
        };

        if (existsIdx >= 0) {
          const updated = [...prev];
          updated[existsIdx] = newHistoryItem;
          return updated;
        } else {
          return [...prev, newHistoryItem].sort((a, b) => a.version - b.version);
        }
      });
    });

    source.addEventListener("compiled", (event: any) => {
      const files = JSON.parse(event.data);
      setCompiledFiles(files);
      if (files && files.length > 0) {
        setSelectedCodeFile(files[0]);
      }
    });

    source.onerror = (err) => {
      console.error("Refinement SSE Error:", err);
      setIsRunning(false);
      setIsRefining(false);
      source.close();
    };
  };

  const cancelOrchestration = () => {
    if (sseSourceRef.current) {
      sseSourceRef.current.close();
    }
    setIsRunning(false);
    setActiveStage("idle");
    setActiveAgent("system");
    setActiveMessage("Generation cancelled by user.");
    setLogs((prev) => [
      ...prev,
      {
        id: "log_cancel_" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        role: "synthesiser",
        agentName: "System",
        emoji: "⏹️",
        status: "failed",
        message: "Design process cancelled by user."
      }
    ]);
  };

  const clearStudio = () => {
    setIdea("");
    setLogs([]);
    setSpec(null);
    setHistory([]);
    setSelectedVersion(null);
    setVotes([]);
    setCompiledFiles([]);
    setActiveStage("idle");
    setActiveAgent("system");
  };

  const getTriggerEventName = (v: number): string => {
    switch (v) {
      case 0:
        return "Idea Intake Initialized";
      case 1:
        return "Architect Blueprint Finished";
      case 2:
        return "UX Visual Wireframes Configured";
      case 3:
        return "Computational Engines Modeled";
      case 4:
        return "Prompt Framework Synthesized";
      case 5:
        return "Board Critique & Peer Reviews Logged";
      case 6:
        return "Final Build Pack Compiled";
      default:
        return `Spec Step v${v}`;
    }
  };

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  // Export JSON Spec helper (Raw Spec Object only)
  const downloadSpecJSON = () => {
    if (!spec) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(spec, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `SpecPack_v${spec.version}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 1. Load Preset Specification Example
  const loadPresetSpec = (presetId: string) => {
    const selected = sampleSpecifications.find((p) => p.id === presetId);
    if (!selected) return;

    // Load spec properties
    setIdea(selected.idea);
    setSpec(selected.spec);
    setCompiledFiles(selected.compiledFiles);
    if (selected.compiledFiles.length > 0) {
      setSelectedCodeFile(selected.compiledFiles[0]);
    }
    
    // Construct mock version history
    const historyItem: SpecVersionHistory = {
      version: selected.spec.version,
      spec: selected.spec,
      timestamp: new Date().toLocaleTimeString(),
      triggerEvent: `Loaded Presets: ${selected.name}`
    };
    setHistory([historyItem]);
    setSelectedVersion(null);
    setVotes([]);
    
    // Set descriptive logs
    setLogs([
      {
        id: "log_preset_1",
        timestamp: new Date().toLocaleTimeString(),
        role: "synthesiser",
        agentName: "Synthesiser Agent",
        emoji: "🧩",
        status: "completed",
        message: `Successfully loaded high-fidelity preset configuration for ${selected.name}. Enjoy exploring the Spec tabs!`
      }
    ]);
    setActiveTab("summary");
  };

  // 2. Download App State Session JSON (Refine over multiple sessions)
  const downloadSessionJSON = () => {
    if (!spec) return;
    const sessionState = {
      type: "spec_studio_session",
      idea,
      spec,
      history,
      compiledFiles,
      votes,
      logs
    };
    const blob = new Blob([JSON.stringify(sessionState, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `SpecStudioSession_${spec.idea.slice(0, 15).replace(/\s+/g, "_") || "spec"}_v${spec.version}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  // 3. Upload App State Session JSON
  const uploadSessionJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.type === "spec_studio_session") {
          if (parsed.idea) setIdea(parsed.idea);
          if (parsed.spec) setSpec(parsed.spec);
          if (parsed.history) setHistory(parsed.history);
          if (parsed.compiledFiles) {
            setCompiledFiles(parsed.compiledFiles);
            if (parsed.compiledFiles.length > 0) {
              setSelectedCodeFile(parsed.compiledFiles[0]);
            }
          }
          if (parsed.votes) setVotes(parsed.votes);
          if (parsed.logs) setLogs(parsed.logs);
          setSelectedVersion(null);
          setActiveTab("summary");
        } else if (parsed.version && parsed.modules) {
          // Fallback if loading raw spec JSON
          setIdea(parsed.idea || idea || "Imported Spec");
          setSpec(parsed);
          setHistory([
            {
              version: parsed.version,
              spec: parsed,
              timestamp: new Date().toLocaleTimeString(),
              triggerEvent: "Uploaded Raw Spec Schema"
            }
          ]);
          setCompiledFiles([]);
          setVotes([]);
          setLogs([
            {
              id: "log_raw_import_" + Math.random(),
              timestamp: new Date().toLocaleTimeString(),
              role: "synthesiser",
              agentName: "Synthesiser Agent",
              emoji: "🧩",
              status: "completed",
              message: "Successfully parsed and loaded raw design specification JSON schema."
            }
          ]);
          setSelectedVersion(null);
          setActiveTab("summary");
        } else {
          alert("Invalid file structure. Make sure you load a valid specification file.");
        }
      } catch (err) {
        console.error("Failed to parse JSON specification file:", err);
        alert("Corrupted JSON. Failed to parse.");
      }
    };
    reader.readAsText(file);
    // Reset file input target value so user can upload same file again if needed
    e.target.value = "";
  };

  // 4. Export Current Spec to Collapsible HTML with interactive Lightbox diagrams
  const exportSpecToHTML = (activeSpec: SpecObject, scaffolds: SpecCompilerOutput[]) => {
    if (!activeSpec) return;

    // Convert markdown utility
    const parseMarkdown = (md: string) => {
      if (!md) return "";
      return md
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/^#\s+(.*)$/gm, '<h1 class="text-xl font-extrabold text-slate-900 mt-6 mb-3 pb-1 border-b border-slate-100">$1</h1>')
        .replace(/^##\s+(.*)$/gm, '<h2 class="text-base font-bold text-slate-800 mt-4 mb-2">$1</h2>')
        .replace(/^###\s+(.*)$/gm, '<h3 class="text-sm font-semibold text-slate-700 mt-3 mb-1">$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code class="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px]">$1</code>')
        .replace(/^\*\s+(.*)$/gm, '<li class="text-slate-600 text-xs py-0.5">$1</li>')
        .replace(/^-\s+(.*)$/gm, '<li class="text-slate-600 text-xs py-0.5">$1</li>')
        .replace(/\n\n/g, '<p class="my-3 text-slate-600 text-xs leading-relaxed"></p>')
        .replace(/\n/g, '<br/>');
    };

    const overviewHtml = activeSpec.final_spec 
      ? parseMarkdown(activeSpec.final_spec)
      : `<p class="text-slate-400 italic text-xs">No overview markdown compiled yet.</p>`;

    let modulesHtml = "";
    if (activeSpec.modules && activeSpec.modules.length > 0) {
      activeSpec.modules.forEach((m, idx) => {
        modulesHtml += `
          <div class="border border-slate-200/80 bg-slate-50/50 p-4 rounded-xl space-y-3 mb-4">
            <h3 class="font-bold text-xs text-slate-900 flex items-center gap-2">
              <span class="h-5 w-5 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-[10px] font-mono">${idx + 1}</span>
              ${m.name}
            </h3>
            <p class="text-xs text-slate-600 leading-relaxed">${m.description}</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div>
                <h4 class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Integration Boundaries</h4>
                <ul class="list-disc pl-4 space-y-1">
                  ${(m.boundaries || []).map(b => `<li class="text-[11px] text-slate-600">${b}</li>`).join('')}
                </ul>
              </div>
              <div>
                <h4 class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Sub-system Data Flows</h4>
                <ul class="list-disc pl-4 space-y-1">
                  ${(m.dataFlow || []).map(d => `<li class="text-[11px] text-slate-600">${d}</li>`).join('')}
                </ul>
              </div>
            </div>
          </div>
        `;
      });
    } else {
      modulesHtml = "<p class='text-slate-400 italic text-xs'>No system modules configured.</p>";
    }

    let uxHtml = "";
    if (activeSpec.ux_flows && activeSpec.ux_flows.length > 0) {
      activeSpec.ux_flows.forEach((flow, idx) => {
        uxHtml += `
          <div class="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm flex flex-col mb-4">
            <div class="bg-slate-900 py-1.5 px-3 flex items-center justify-between text-white/50 text-[9px] font-mono border-b border-slate-800">
              <span>Layout: ${flow.screenName.toLowerCase().replace(/\s+/g, '_')}.tsx</span>
              <div class="flex items-center gap-1"><div class="h-1.5 w-1.5 bg-green-500 rounded-full"></div><span>Interactive View</span></div>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <h4 class="text-xs font-bold text-slate-900">${flow.screenName}</h4>
                <p class="text-[10px] text-slate-400 italic mt-0.5">Journey: ${flow.journey}</p>
              </div>
              <div class="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] text-slate-600">
                <div class="font-bold text-[8px] text-slate-400 uppercase tracking-wider mb-1">Wireframe & Sizing</div>
                <div class="whitespace-pre-wrap font-sans">${flow.uiState}</div>
              </div>
              <div class="pt-2 border-t border-slate-100">
                <div class="font-bold text-[8px] text-slate-400 uppercase tracking-wider mb-1">Transitions</div>
                <div class="flex flex-wrap gap-1.5">
                  ${(flow.transitions || []).map(t => `<span class="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-mono">${t}</span>`).join('')}
                </div>
              </div>
            </div>
          </div>
        `;
      });
    } else {
      uxHtml = "<p class='text-slate-400 italic text-xs'>No UX wireframe maps compiled.</p>";
    }

    let algoHtml = "";
    if (activeSpec.algorithms && activeSpec.algorithms.length > 0) {
      activeSpec.algorithms.forEach((algo) => {
        algoHtml += `
          <div class="border border-slate-200 p-4 rounded-xl bg-slate-50/50 mb-4 space-y-3">
            <div class="flex items-start justify-between">
              <div>
                <h4 class="font-bold text-xs text-slate-900">${algo.name}</h4>
                <p class="text-[11px] text-slate-600 mt-0.5">${algo.description}</p>
              </div>
              <span class="text-[9px] bg-amber-100 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-mono">${algo.complexity}</span>
            </div>
            <pre class="p-3 bg-slate-900 text-slate-100 text-[10px] font-mono rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">${algo.pseudocode}</pre>
          </div>
        `;
      });
    } else {
      algoHtml = "<p class='text-slate-400 italic text-xs'>No algorithms configured.</p>";
    }

    let promptsHtml = "";
    if (activeSpec.prompts && activeSpec.prompts.length > 0) {
      activeSpec.prompts.forEach((p) => {
        promptsHtml += `
          <div class="border border-slate-200 p-4 rounded-xl bg-slate-50/50 mb-4 space-y-3">
            <h4 class="font-bold text-xs text-slate-900">System Instruction: ${p.featureName}</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Input & Output Parameters</h5>
                <div class="flex flex-wrap gap-1 mb-3">
                  ${(p.inputs || []).map(inp => `<span class="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded">IN: ${inp}</span>`).join('')}
                  ${(p.outputs || []).map(out => `<span class="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-0.5 rounded">OUT: ${out}</span>`).join('')}
                </div>
              </div>
              <div>
                <h5 class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Validation Guardrails</h5>
                <ul class="list-disc pl-4 space-y-1">
                  ${(p.guardrails || []).map(g => `<li class="text-[10px] text-slate-600">${g}</li>`).join('')}
                </ul>
              </div>
            </div>
            <pre class="p-3 bg-slate-950 text-indigo-200 text-[10px] font-mono rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">${p.template}</pre>
          </div>
        `;
      });
    } else {
      promptsHtml = "<p class='text-slate-400 italic text-xs'>No prompts compiled.</p>";
    }

    let risksHtml = "";
    if (activeSpec.risks && activeSpec.risks.length > 0) {
      activeSpec.risks.forEach((r) => {
        const sevColor = r.severity === 'high' 
          ? 'bg-red-50 border-red-200 text-red-800' 
          : r.severity === 'medium'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-blue-50 border-blue-200 text-blue-800';
        const badgeColor = r.severity === 'high' ? 'bg-red-200' : r.severity === 'medium' ? 'bg-amber-200' : 'bg-blue-200';
        risksHtml += `
          <div class="border rounded-xl p-4 mb-4 ${sevColor}">
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-black/5">
              <span class="font-bold text-xs">Critique by ${r.agentName} [${r.riskType}]</span>
              <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeColor}">${r.severity} Risk</span>
            </div>
            <p class="text-xs leading-relaxed mb-2 font-medium">${r.description}</p>
            <p class="text-xs leading-relaxed italic"><span class="font-bold font-sans">Recommendation:</span> ${r.recommendation}</p>
          </div>
        `;
      });
    } else {
      risksHtml = "<p class='text-slate-400 italic text-xs'>No safety or compliance critiques compiled.</p>";
    }

    let scaffoldsHtml = "";
    if (scaffolds && scaffolds.length > 0) {
      scaffolds.forEach((file, index) => {
        scaffoldsHtml += `
          <div class="border border-slate-200 rounded-xl overflow-hidden mb-4">
            <div class="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-800">
              <span class="text-[10px] font-mono text-slate-300 font-semibold">${file.filename} (${file.language})</span>
              <button onclick="navigator.clipboard.writeText(document.getElementById('scaffold-${index}').innerText); alert('Copied code snippet!');" class="text-[9px] text-white/50 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-all">Copy Code</button>
            </div>
            <pre id="scaffold-${index}" class="p-4 bg-slate-950 text-slate-100 text-[10px] font-mono overflow-auto max-h-[300px] whitespace-pre-wrap leading-relaxed">${file.content}</pre>
          </div>
        `;
      });
    } else {
      scaffoldsHtml = "<p class='text-slate-400 italic text-xs'>No code scaffolds available. Run orchestration or load full presets to view.</p>";
    }

    let designHtml = "";
    if (activeSpec.design_elements && activeSpec.design_elements.length > 0) {
      activeSpec.design_elements.forEach((element) => {
        const isMermaid = element.type.startsWith("mermaid");
        designHtml += `
          <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow mb-4 flex flex-col gap-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h4 class="font-bold text-xs text-slate-900">${element.title}</h4>
                <p class="text-[10px] text-indigo-600 font-mono italic">Type: ${element.type}</p>
              </div>
              <button onclick="openLightbox('${element.title.replace(/'/g, "\\'")}', 'design-container-${element.id}')" class="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded transition-all">
                🔍 Fullscreen Zoom
              </button>
            </div>
            <p class="text-[11px] text-slate-500">${element.description}</p>
            
            <div id="design-container-${element.id}" class="${isMermaid ? 'mermaid border border-slate-100 rounded-lg p-6 bg-slate-50 flex justify-center items-center overflow-auto max-h-[250px]' : 'bg-slate-950 text-indigo-200 text-[10px] font-mono p-4 rounded-lg overflow-auto max-h-[250px] whitespace-pre-wrap'}">
              ${element.content}
            </div>
          </div>
        `;
      });
    } else {
      designHtml = "<p class='text-slate-400 italic text-xs'>No design blueprints available.</p>";
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${activeSpec.idea.slice(0, 30)}... - Interactive Spec Pack</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Mermaid CDN for dynamically drawing vector charts -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap');
    body {
      font-family: 'Inter', sans-serif;
    }
    pre, code {
      font-family: 'Fira Code', monospace;
    }
    /* Simple dynamic fade-in animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    .animate-fade-in {
      animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen">

  <!-- Header Banner -->
  <header class="bg-white border-b border-slate-200 py-6 px-8 sticky top-0 z-40 shadow-sm">
    <div class="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">Interactive Design Specification</span>
          <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-semibold border border-slate-200">v${activeSpec.version}</span>
        </div>
        <h1 class="text-lg font-black text-slate-900 tracking-tight">System Specification Portfolio</h1>
        <p class="text-xs text-slate-500 mt-1">Generated dynamically via Multi-Agent Design Studio</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.print();" class="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600 transition-all flex items-center gap-1.5 shadow-sm">
          🖨️ Print Spec Portfolio
        </button>
      </div>
    </div>
  </header>

  <!-- Spec Workspace Container -->
  <div class="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
    
    <!-- Sidebar Navigation Controls (3 columns) -->
    <aside class="lg:col-span-3 flex flex-col gap-4">
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm sticky top-28">
        <h2 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Specification Navigation</h2>
        <nav class="space-y-1.5 text-xs font-medium">
          <a href="#summary-sec" class="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-900 rounded-lg transition-colors">📃 Synthesized Blueprint</a>
          <a href="#modules-sec" class="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors">🧠 Core Architectures</a>
          <a href="#ux-sec" class="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors">🎨 UX Flows</a>
          <a href="#algorithms-sec" class="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors">⚙️ Computation Engines</a>
          <a href="#prompts-sec" class="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors">🧾 Prompt Templates</a>
          <a href="#risks-sec" class="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors">⚖️ Critique & Safety</a>
          <a href="#scaffolds-sec" class="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors">💻 Code Scaffolds</a>
          <a href="#design-sec" class="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors">📐 Design blueprinters</a>
        </nav>
        
        <div class="mt-6 pt-5 border-t border-slate-100">
          <div class="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-500 leading-relaxed border border-slate-100">
            <span class="font-semibold text-slate-700 block mb-0.5">💡 Interactive Spec:</span>
            Expand each section below to explore the detailed code blocks, sequence matrices, and flows. Click any diagram to trigger full-scale lightbox zooms.
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Canvas (9 columns) -->
    <main class="lg:col-span-9 space-y-5">
      
      <!-- Design Brief Prompt Indicator Card -->
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-2">
        <h3 class="text-[9px] font-bold text-indigo-600 uppercase tracking-wider">Concept Intake Design Brief</h3>
        <p class="text-xs text-slate-700 font-medium leading-relaxed italic">"${activeSpec.idea}"</p>
      </div>

      <!-- Collapsible Sections using beautiful details summary styling -->
      
      <!-- SECTION 1 -->
      <details id="summary-sec" open class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 cursor-pointer list-none select-none border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-base">📃</span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Product Synthesis Blueprint</span>
          </div>
          <svg class="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="p-6 text-xs leading-relaxed space-y-4">
          <div class="prose max-w-none text-slate-700">${overviewHtml}</div>
        </div>
      </details>

      <!-- SECTION 2 -->
      <details id="modules-sec" class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 cursor-pointer list-none select-none border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-base">🧠</span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Core Architectures & Modules</span>
          </div>
          <svg class="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="p-5 text-xs leading-relaxed space-y-4">
          ${modulesHtml}
        </div>
      </details>

      <!-- SECTION 3 -->
      <details id="ux-sec" class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 cursor-pointer list-none select-none border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-base">🎨</span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">UX Screen Flows & Wireframes</span>
          </div>
          <svg class="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="p-5 text-xs leading-relaxed space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${uxHtml}</div>
        </div>
      </details>

      <!-- SECTION 4 -->
      <details id="algorithms-sec" class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 cursor-pointer list-none select-none border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-base">⚙️</span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Computational Core Algorithms</span>
          </div>
          <svg class="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="p-5 text-xs leading-relaxed space-y-4">
          ${algoHtml}
        </div>
      </details>

      <!-- SECTION 5 -->
      <details id="prompts-sec" class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 cursor-pointer list-none select-none border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-base">🧾</span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Structured Prompting Models</span>
          </div>
          <svg class="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="p-5 text-xs leading-relaxed space-y-4">
          ${promptsHtml}
        </div>
      </details>

      <!-- SECTION 6 -->
      <details id="risks-sec" class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 cursor-pointer list-none select-none border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-base">⚖️</span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Critical Audits & Product Safety</span>
          </div>
          <svg class="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="p-5 text-xs leading-relaxed space-y-4">
          ${risksHtml}
        </div>
      </details>

      <!-- SECTION 7 -->
      <details id="scaffolds-sec" class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 cursor-pointer list-none select-none border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-base">💻</span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Source Code Scaffolds</span>
          </div>
          <svg class="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="p-5 text-xs leading-relaxed space-y-4">
          ${scaffoldsHtml}
        </div>
      </details>

      <!-- SECTION 8 -->
      <details id="design-sec" class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 cursor-pointer list-none select-none border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-base">📐</span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Living Design Blueprints & Diagrams</span>
          </div>
          <svg class="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="p-5 text-xs leading-relaxed space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${designHtml}</div>
        </div>
      </details>

    </main>
  </div>

  <!-- Lightbox Modal Overlay for zoomed diagrams/visual blueprinters -->
  <div id="lightbox" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 transition-all duration-300 opacity-0">
    <div class="absolute inset-0 cursor-pointer" onclick="closeLightbox()"></div>
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 max-w-4xl w-full max-h-[90vh] flex flex-col z-10 relative transform scale-95 transition-all duration-300 animate-fade-in" id="lightbox-container">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <h3 id="lightbox-title" class="font-bold text-slate-900 text-sm">Interactive Zoom Map</h3>
        <button onclick="closeLightbox()" class="text-slate-400 hover:text-slate-800 p-1.5 hover:bg-slate-100 rounded-lg text-lg font-bold transition-all">&times;</button>
      </div>
      <div id="lightbox-content" class="flex-1 overflow-auto flex items-center justify-center p-4 min-h-[300px] bg-slate-50 border border-slate-100 rounded-xl">
        <!-- Injected Clone -->
      </div>
      <div class="pt-3 border-t border-slate-100 text-right mt-4 flex justify-end gap-2">
        <button onclick="closeLightbox()" class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm">Done viewing</button>
      </div>
    </div>
  </div>

  <!-- Interactive JavaScript -->
  <script>
    // Initialize Mermaid Configuration
    mermaid.initialize({ 
      startOnLoad: true, 
      theme: 'neutral',
      securityLevel: 'loose'
    });

    // Lightbox modal triggers
    function openLightbox(title, sourceId) {
      const sourceEl = document.getElementById(sourceId);
      if (!sourceEl) return;

      document.getElementById('lightbox-title').innerText = title;
      
      const clone = sourceEl.cloneNode(true);
      clone.removeAttribute('id');
      
      // Remove restricting frame parameters
      clone.classList.remove('max-h-[250px]', 'max-h-[300px]', 'overflow-hidden', 'overflow-auto');
      clone.classList.add('w-full', 'max-h-[70vh]', 'p-6');
      
      const targetContainer = document.getElementById('lightbox-content');
      targetContainer.innerHTML = '';
      targetContainer.appendChild(clone);

      const lightbox = document.getElementById('lightbox');
      lightbox.classList.remove('hidden');
      setTimeout(() => {
        lightbox.classList.remove('opacity-0');
        document.getElementById('lightbox-container').classList.remove('scale-95');
      }, 50);
    }

    function closeLightbox() {
      const lightbox = document.getElementById('lightbox');
      lightbox.classList.add('opacity-0');
      document.getElementById('lightbox-container').classList.add('scale-95');
      setTimeout(() => {
        lightbox.classList.add('hidden');
      }, 300);
    }

    // Capture ESC keypresses
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLightbox();
    });

    // Add CSS Active States to Left Navbar Spy Link clicks
    const links = document.querySelectorAll('aside nav a');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        links.forEach(l => l.classList.remove('bg-slate-100', 'text-slate-900'));
        link.classList.add('bg-slate-100', 'text-slate-900');
        
        // Auto-open target details block if closed
        const targetId = link.getAttribute('href').substring(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl && targetEl.tagName === 'DETAILS') {
          targetEl.open = true;
        }
      });
    });
  </script>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `DesignSpecification_${activeSpec.idea.slice(0, 15).replace(/\s+/g, '_') || 'spec'}_v${activeSpec.version}.html`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  // Determine which spec details to display (either historical version or live newest)
  const currentDisplayedSpec =
    selectedVersion !== null
      ? history.find((h) => h.version === selectedVersion)?.spec || spec
      : spec;

  // Agent team configuration
  const agentTeam = [
    {
      role: "architect" as AgentRole,
      name: "System Architect",
      emoji: "🧠",
      tagline: "Core architecture & data modeling expert",
      color: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
      activeColor: "bg-sky-500 text-white shadow-md shadow-sky-100 ring-2 ring-sky-300"
    },
    {
      role: "ux_designer" as AgentRole,
      name: "Lead UX Designer",
      emoji: "🎨",
      tagline: "Visual interface & transitions master",
      color: "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100",
      activeColor: "bg-pink-500 text-white shadow-md shadow-pink-100 ring-2 ring-pink-300"
    },
    {
      role: "algorithm_designer" as AgentRole,
      name: "Algorithmic Engineer",
      emoji: "⚙️",
      tagline: "Core computation & state loop designer",
      color: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
      activeColor: "bg-amber-500 text-white shadow-md shadow-amber-100 ring-2 ring-amber-300"
    },
    {
      role: "algorithm_reviewer" as AgentRole,
      name: "Algorithmic Reviewer",
      emoji: "🧪",
      tagline: "Performance bottlenecks & concurrency auditor",
      color: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
      activeColor: "bg-purple-500 text-white shadow-md shadow-purple-100 ring-2 ring-purple-300"
    },
    {
      role: "prompt_designer" as AgentRole,
      name: "Prompt Engineer",
      emoji: "🧾",
      tagline: "SSPSS/CHECK/RBFR LLM prompt blueprinter",
      color: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
      activeColor: "bg-indigo-500 text-white shadow-md shadow-indigo-100 ring-2 ring-indigo-300"
    },
    {
      role: "consistency_agent" as AgentRole,
      name: "Alignment Officer",
      emoji: "🔒",
      tagline: "Privacy & multi-agent consistency guardian",
      color: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100",
      activeColor: "bg-teal-500 text-white shadow-md shadow-teal-100 ring-2 ring-teal-300"
    },
    {
      role: "synthesiser" as AgentRole,
      name: "Synthesiser Agent",
      emoji: "🧩",
      tagline: "Compiles spec packs & scaffolds build packages",
      color: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
      activeColor: "bg-emerald-500 text-white shadow-md shadow-emerald-100 ring-2 ring-emerald-300"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* Top Header Navigation */}
      <header className="bg-white border-b border-slate-200 py-3 px-6 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 text-white rounded-lg flex items-center justify-center">
              <Layers className="h-5 w-5" id="header_icon" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                Multi-Agent Design Studio
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono border border-slate-200">
                  v2.5-flash
                </span>
              </h1>
              <p className="text-xs text-slate-500">Collaborative Engineering Spec & Code Scaffold Sandbox</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {apiKeyChecked && (
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                  apiKeyOk
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${apiKeyOk ? "bg-emerald-500" : "bg-amber-500 animate-ping"}`} />
                <span>{apiKeyOk ? "🔑 API Key Bound" : "⚠️ Key Missing"}</span>
              </div>
            )}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Studio Settings"
              id="settings_toggle_btn"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Column: Input Controller & Version Timelines (4 columns) */}
        <section className="lg:col-span-4 flex flex-col gap-6" id="left_panel">
          
          {/* API Key Missing Alert Banner */}
          {!apiKeyOk && apiKeyChecked && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-slate-700 shadow-sm">
              <div className="flex gap-2 text-amber-800 font-semibold mb-1">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <h3>No Gemini API Key Detected</h3>
              </div>
              <p className="text-xs leading-relaxed text-amber-900/80">
                To enable multi-agent specification drafting, please add your **GEMINI_API_KEY** under the **Settings &gt; Secrets** panel in the AI Studio sidebar interface.
              </p>
            </div>
          )}

          {/* Intake Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-slate-700" />
              Design Brief Intake
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  What do you want to build?
                </label>
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="e.g. A calorie planning application that recommends food choices based on mood levels, local weather, and daily caloric budgets."
                  rows={4}
                  disabled={isRunning}
                  className="w-full text-sm border border-slate-200 rounded-lg p-3 outline-none focus:border-slate-800 bg-slate-50 focus:bg-white resize-none transition-all placeholder:text-slate-400 text-slate-800"
                  id="idea_textarea"
                />
              </div>

              {/* Advanced Settings Toggle Drawer */}
              {showSettings && (
                <div className="border-t border-slate-100 pt-3 space-y-4">
                  
                  {/* Spec Suite (Preset Demo & State Save/Load) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                      <Layers className="h-3.5 w-3.5 text-indigo-600" />
                      Demo & State Persistence
                    </h4>
                    
                    {/* Presets Selector */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">
                        Load Example Application Specifications
                      </label>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            loadPresetSpec(e.target.value);
                            e.target.value = ""; // reset
                          }
                        }}
                        className="w-full text-xs border border-slate-200 rounded p-1.5 outline-none focus:border-slate-800 bg-white cursor-pointer font-medium text-slate-700"
                        defaultValue=""
                      >
                        <option value="" disabled>-- Select Preset Demo Spec --</option>
                        {sampleSpecifications.map((sample) => (
                          <option key={sample.id} value={sample.id}>
                            🚀 {sample.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 leading-relaxed">Loads a complete high-fidelity multi-agent design specification instantly to preview look and feel.</p>
                    </div>

                    {/* Session JSON Save & Load Buttons */}
                    <div className="border-t border-slate-200/60 pt-2.5">
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1.5">
                        Refine Over Multiple Sessions
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Save Session */}
                        <button
                          type="button"
                          onClick={downloadSessionJSON}
                          disabled={!spec}
                          className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded py-1.5 px-2 text-[10px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                          title="Save the complete application layout state including checklist, diagrams, and logs to resume later."
                        >
                          <Download className="h-3 w-3" />
                          Save Session JSON
                        </button>
                        
                        {/* Load Session */}
                        <label className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded py-1.5 px-2 text-[10px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm text-center">
                          <Upload className="h-3 w-3 inline-block" />
                          <span>Load Session JSON</span>
                          <input
                            type="file"
                            accept=".json"
                            onChange={uploadSessionJSON}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Debate Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700">Agent Debate Mode</h4>
                      <p className="text-[10px] text-slate-400">Trigger multi-agent board evaluations & voting boards</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={debate}
                        onChange={(e) => setDebate(e.target.checked)}
                        disabled={isRunning}
                        className="sr-only peer"
                        id="debate_toggle"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                    </label>
                  </div>

                  {/* Local LLM Setup Section */}
                  <div className="border-t border-slate-100 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <Cpu className="h-3.5 w-3.5 text-slate-600" />
                          Use Local LLM Engine
                        </h4>
                        <p className="text-[10px] text-slate-400">Run completions via Ollama, LM Studio, etc.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localSettings.useLocal}
                          onChange={(e) => setLocalSettings(prev => ({ ...prev, useLocal: e.target.checked }))}
                          disabled={isRunning}
                          className="sr-only peer"
                          id="local_llm_toggle"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                      </label>
                    </div>

                    {localSettings.useLocal && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-3 pt-1 text-xs"
                      >
                        {/* Server URL */}
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-1">
                            Local Server URL
                          </label>
                          <input
                            type="text"
                            value={localSettings.serverUrl}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, serverUrl: e.target.value }))}
                            placeholder="e.g. http://localhost:11434 or http://localhost:1234"
                            disabled={isRunning}
                            className="w-full text-xs border border-slate-200 rounded p-2 outline-none focus:border-slate-800 bg-slate-50"
                          />
                        </div>

                        {/* API Key (Optional) */}
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-1">
                            API Key (Optional)
                          </label>
                          <input
                            type="password"
                            value={localSettings.apiKey}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                            placeholder="Optional custom header authorization"
                            disabled={isRunning}
                            className="w-full text-xs border border-slate-200 rounded p-2 outline-none focus:border-slate-800 bg-slate-50"
                          />
                        </div>

                        {/* Fetch Models button */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={fetchLocalModels}
                            disabled={fetchingModels || isRunning}
                            className="flex-1 bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 rounded py-1.5 px-3 text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className={`h-3 w-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                            {fetchingModels ? 'Querying local server...' : 'Fetch Loaded Models'}
                          </button>
                        </div>

                        {/* Fetch Feedback / Error */}
                        {fetchError && (
                          <div className="p-2 bg-red-50 border border-red-100 text-red-700 text-[10px] rounded leading-relaxed">
                            <p className="font-semibold">Fetch Failed:</p>
                            <p className="text-[9px] mt-0.5">{fetchError}</p>
                          </div>
                        )}

                        {localModels.length > 0 && (
                          <div className="p-2 bg-emerald-50/80 border border-emerald-100 text-emerald-800 text-[10px] rounded space-y-1.5">
                            <span className="font-medium flex items-center justify-between">
                              <span>✓ Discovered {localModels.length} models:</span>
                              <span className="text-[8px] text-slate-400 font-mono font-normal">Click model tag to unload from VRAM</span>
                            </span>
                            <div className="flex flex-wrap gap-1 max-h-[85px] overflow-y-auto pr-0.5">
                              {localModels.map((m) => {
                                const isUnloading = unloadingModel === m;
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => handleUnloadModel(m)}
                                    disabled={isUnloading || isRunning}
                                    title={`Click to unload ${m} from VRAM`}
                                    className="bg-emerald-100/70 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded text-[8px] font-mono transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  >
                                    {m}
                                    {isUnloading ? (
                                      <RefreshCw className="h-2 w-2 animate-spin text-red-500" />
                                    ) : (
                                      <span className="text-[7px] text-emerald-600 hover:text-red-500 font-bold ml-0.5">×</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Unload from VRAM after use toggle */}
                        <div className="flex items-start gap-2 bg-slate-50 border border-slate-100 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={localSettings.unloadAfterUse}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, unloadAfterUse: e.target.checked }))}
                            disabled={isRunning}
                            className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                            id="unload_after_use_toggle"
                          />
                          <div className="text-[10px]">
                            <label htmlFor="unload_after_use_toggle" className="font-semibold text-slate-700 block cursor-pointer">
                              Auto-unload from VRAM (Low VRAM Mode)
                            </label>
                            <span className="text-[9px] text-slate-400 block mt-0.5">
                              Instructs local server to unload models immediately after use by sending <code>keep_alive: 0</code>. Solves hardware bottlenecks.
                            </span>
                          </div>
                        </div>

                        {/* Default / All Agents Model selector */}
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-1">
                            Default Model (All Agents)
                          </label>
                          <div className="flex gap-1.5">
                            {localModels.length > 0 ? (
                              <select
                                value={localSettings.defaultModel}
                                onChange={(e) => setLocalSettings(prev => ({ ...prev, defaultModel: e.target.value }))}
                                disabled={isRunning}
                                className="flex-1 text-xs border border-slate-200 rounded p-1.5 outline-none focus:border-slate-800 bg-white"
                              >
                                <option value="">-- Select Model --</option>
                                {localModels.map((m) => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={localSettings.defaultModel}
                                onChange={(e) => setLocalSettings(prev => ({ ...prev, defaultModel: e.target.value }))}
                                placeholder="Type model tag name (e.g. llama3)"
                                disabled={isRunning}
                                className="flex-1 text-xs border border-slate-200 rounded p-1.5 outline-none focus:border-slate-800 bg-white"
                              />
                            )}
                          </div>
                          <p className="text-[9px] text-slate-400 mt-1">If empty, fallback model config will be used.</p>
                        </div>

                        {/* Individual Agent Model Configuration */}
                        <div className="border-t border-slate-100 pt-2 mt-2">
                          <details className="group">
                            <summary className="text-[10px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer flex items-center justify-between list-none">
                              <span>Configure Agent Models Individually</span>
                              <ChevronDown className="h-3 w-3 transform transition-transform group-open:rotate-180 text-slate-400" />
                            </summary>
                            <div className="space-y-2 mt-2 pl-1 border-l-2 border-slate-100">
                              {[
                                { role: "architect", label: "System Architect" },
                                { role: "ux_designer", label: "Lead UX Designer" },
                                { role: "algorithm_designer", label: "Algorithmic Engineer" },
                                { role: "algorithm_reviewer", label: "Algorithmic Reviewer" },
                                { role: "prompt_designer", label: "Prompt Engineer" },
                                { role: "consistency_agent", label: "Alignment Officer" },
                                { role: "synthesiser", label: "Synthesiser Agent" }
                              ].map((agent) => (
                                <div key={agent.role} className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-slate-600 font-medium truncate max-w-[120px]">{agent.label}</span>
                                  {localModels.length > 0 ? (
                                    <select
                                      value={localSettings.agentModels[agent.role as AgentRole] || ""}
                                      onChange={(e) => setLocalSettings(prev => ({
                                        ...prev,
                                        agentModels: {
                                          ...prev.agentModels,
                                          [agent.role]: e.target.value
                                        }
                                      }))}
                                      disabled={isRunning}
                                      className="text-[10px] border border-slate-200 rounded p-1 max-w-[130px] outline-none bg-white"
                                    >
                                      <option value="">(Default Model)</option>
                                      {localModels.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={localSettings.agentModels[agent.role as AgentRole] || ""}
                                      onChange={(e) => setLocalSettings(prev => ({
                                        ...prev,
                                        agentModels: {
                                          ...prev.agentModels,
                                          [agent.role]: e.target.value
                                        }
                                      }))}
                                      placeholder="(Default)"
                                      disabled={isRunning}
                                      className="text-[10px] border border-slate-200 rounded p-1 w-[130px] outline-none"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Handlers */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 w-full">
                  {isRunning ? (
                    <button
                      onClick={cancelOrchestration}
                      className="flex-1 bg-red-50 text-red-700 border border-red-200 rounded-lg py-2.5 px-4 text-xs font-medium hover:bg-red-100 flex items-center justify-center gap-2 transition-all cursor-pointer"
                      id="cancel_btn"
                    >
                      <XCircle className="h-4 w-4 animate-pulse" />
                      Cancel Generation
                    </button>
                  ) : (
                    <button
                      onClick={() => startOrchestration(false)}
                      disabled={!idea.trim() || (!apiKeyOk && !localSettings.useLocal)}
                      className="flex-1 bg-slate-900 text-white rounded-lg py-2.5 px-4 text-xs font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all cursor-pointer"
                      id="build_btn"
                    >
                      <Play className="h-4 w-4" />
                      Build Spec Pack
                    </button>
                  )}
                  <button
                    onClick={clearStudio}
                    disabled={isRunning}
                    className="p-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                    title="Reset Workspace"
                    id="reset_btn"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {canResume && !isRunning && (
                  <button
                    onClick={() => startOrchestration(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 border border-indigo-700/50 text-white rounded-lg py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm shadow-indigo-100 animate-pulse"
                    id="resume_btn"
                  >
                    <RefreshCw className="h-4 w-4 animate-spin-slow" />
                    Resume From Last Successful Agent
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Replay & Spec Version History Section */}
          {history.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex-1 flex flex-col">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-700" />
                  Spec Replay Mode
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-500 font-mono py-0.5 px-1.5 rounded border border-slate-200">
                  {history.length} states
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                Step back in time to explore how the system specification evolved module-by-module.
              </p>

              <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] pr-1">
                {/* Real-time current item */}
                <button
                  onClick={() => setSelectedVersion(null)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2.5 ${
                    selectedVersion === null
                      ? "border-slate-800 bg-slate-900 text-white"
                      : "border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className={`mt-0.5 p-0.5 rounded ${selectedVersion === null ? "bg-slate-800" : "bg-slate-200"}`}>
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <div>
                    <div className="font-semibold flex items-center gap-1">
                      Latest Compilation (v{spec?.version || history[history.length - 1].version})
                      {isRunning && <RefreshCw className="h-2.5 w-2.5 animate-spin text-slate-400" />}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${selectedVersion === null ? "text-slate-300" : "text-slate-400"}`}>
                      All integrated specs & scaffolding generators
                    </div>
                  </div>
                </button>

                {/* History iterations */}
                {history.map((hist) => (
                  <button
                    key={hist.version}
                    onClick={() => setSelectedVersion(hist.version)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2.5 ${
                      selectedVersion === hist.version
                        ? "border-slate-800 bg-slate-900 text-white"
                        : "border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="mt-0.5 px-1 py-0.5 bg-slate-200 text-slate-700 text-[9px] rounded font-mono font-semibold">
                      v{hist.version}
                    </div>
                    <div>
                      <div className="font-medium">{hist.triggerEvent}</div>
                      <div className={`text-[10px] mt-0.5 ${selectedVersion === hist.version ? "text-slate-300" : "text-slate-400"}`}>
                        Saved at {hist.timestamp}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Architect Refinement Chat Section */}
          {spec && !isRunning && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-3 mt-4"
            >
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-400 font-bold" />
                Refine with Lead Architect
              </h2>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Describe desired changes (e.g. changing databases, adding security algorithms, modifying screen flows). The Lead Architect will coordinate sub-agents to update your spec.
              </p>
              
              <div className="space-y-2 mt-1">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="e.g., Update the system architecture to use PostgreSQL database, and add a secure password hashing helper in the algorithms spec tab."
                  className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 min-h-[70px] outline-none text-slate-100 placeholder-slate-600 resize-y transition-all leading-relaxed"
                />
                
                <button
                  onClick={() => startRefinement(chatInput)}
                  disabled={!chatInput.trim() || isRefining}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg py-2 px-4 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  <Send className="h-3.5 w-3.5" />
                  Apply Refinements
                </button>
              </div>
            </motion.div>
          )}
        </section>

        {/* Center Column: Document Canvas & Evolving Spec (5 columns) */}
        <section className="lg:col-span-5 flex flex-col" id="center_panel">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex-1 flex flex-col min-h-[500px]">
            
            {/* Spec Toolbar Header */}
            <div className="border-b border-slate-100 py-3 px-4 flex items-center justify-between bg-slate-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  {selectedVersion !== null ? `Spec View [Version ${selectedVersion}]` : "Active Evolving Spec Document"}
                </h2>
              </div>
              {currentDisplayedSpec && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopy(currentDisplayedSpec.final_spec || JSON.stringify(currentDisplayedSpec, null, 2), "Full Markdown Spec")}
                    className="p-1.5 hover:bg-slate-200 text-slate-600 rounded text-xs flex items-center gap-1 transition-colors font-medium cursor-pointer"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    Copy MD
                  </button>
                  <button
                    onClick={downloadSpecJSON}
                    className="p-1.5 hover:bg-slate-200 text-slate-600 rounded text-xs flex items-center gap-1 transition-colors font-medium cursor-pointer"
                    title="Download raw specification JSON structure"
                  >
                    <Database className="h-3.5 w-3.5" />
                    Save JSON
                  </button>
                  <button
                    onClick={() => exportSpecToHTML(currentDisplayedSpec, compiledFiles)}
                    className="p-1.5 hover:bg-indigo-100 text-indigo-700 bg-indigo-50 border border-indigo-100 rounded text-xs flex items-center gap-1 transition-colors font-semibold cursor-pointer shadow-sm"
                    title="Export specification report portfolio as collapsible single-page HTML"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Export HTML
                  </button>
                </div>
              )}
            </div>

            {/* Document views / tabs */}
            {currentDisplayedSpec ? (
              <div className="flex-1 flex flex-col">
                {/* Horizontal document tab navigation */}
                <div className="border-b border-slate-100 px-3 py-1 flex items-center gap-1 overflow-x-auto text-xs bg-white">
                  <button
                    onClick={() => setActiveTab("summary")}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === "summary"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    📃 Spec Overview
                  </button>
                  <button
                    onClick={() => setActiveTab("modules")}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === "modules"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    🧠 Architecture
                  </button>
                  <button
                    onClick={() => setActiveTab("ux")}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === "ux"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    🎨 UX Journeys
                  </button>
                  <button
                    onClick={() => setActiveTab("algorithms")}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === "algorithms"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    ⚙️ Algorithms
                  </button>
                  <button
                    onClick={() => setActiveTab("prompts")}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === "prompts"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    🧾 prompts
                  </button>
                  <button
                    onClick={() => setActiveTab("risks")}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === "risks"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    ⚖️ Critique & Safety
                  </button>
                  <button
                    onClick={() => setActiveTab("code")}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === "code"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    💻 Code Scaffolds
                  </button>
                  <button
                    onClick={() => setActiveTab("design_elements")}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === "design_elements"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    📐 Living Specs
                  </button>
                </div>

                {/* Tab content frames */}
                <div className="flex-1 p-5 overflow-y-auto max-h-[500px]">
                  {/* TAB 1: SUMMARY SPEC (Synthesized Pack) */}
                  {activeTab === "summary" && (
                    <div className="prose max-w-none text-slate-800 text-sm leading-relaxed space-y-4">
                      {currentDisplayedSpec.final_spec ? (
                        <div className="space-y-4">
                          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
                            Product Synthesis Blueprint
                          </h3>
                          <div className="whitespace-pre-wrap bg-slate-50/50 p-4 border border-slate-100 rounded-lg text-xs leading-relaxed font-sans text-slate-700">
                            {currentDisplayedSpec.final_spec}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400">
                          <Info className="h-8 w-8 mx-auto stroke-1 mb-2" />
                          <p className="text-xs">
                            The Synthesiser Agent is compiling the full Markdown documentation. Check individual module tabs for partial progress.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: SYSTEM ARCHITECTURE */}
                  {activeTab === "modules" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                        <h3 className="text-sm font-bold text-slate-900">
                          System Infrastructure & Core Modules
                        </h3>
                        <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded font-mono">
                          {currentDisplayedSpec.modules?.length || 0} modular components
                        </span>
                      </div>

                      {currentDisplayedSpec.modules && currentDisplayedSpec.modules.length > 0 ? (
                        <div className="space-y-4">
                          {currentDisplayedSpec.modules.map((mod, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-white transition-colors">
                              <h4 className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                <span className="h-5 w-5 bg-sky-100 text-sky-700 rounded-full flex items-center justify-center text-[10px] font-mono">
                                  {idx + 1}
                                </span>
                                {mod.name}
                              </h4>
                              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                                {mod.description}
                              </p>

                              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                                <div>
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                    Integration Boundaries
                                  </h5>
                                  <ul className="space-y-1">
                                    {mod.boundaries?.map((b, i) => (
                                      <li key={i} className="text-[10px] text-slate-600 flex items-start gap-1">
                                        <ChevronRight className="h-3 w-3 mt-0.5 text-slate-400 flex-shrink-0" />
                                        <span>{b}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                    Data Flows & Sub-systems
                                  </h5>
                                  <ul className="space-y-1">
                                    {mod.dataFlow?.map((df, i) => (
                                      <li key={i} className="text-[10px] text-slate-600 flex items-start gap-1">
                                        <ChevronRight className="h-3 w-3 mt-0.5 text-slate-400 flex-shrink-0" />
                                        <span>{df}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400">
                          <Info className="h-8 w-8 mx-auto stroke-1 mb-2" />
                          <p className="text-xs">Waiting for System Architect Agent...</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: UX JOURNEYS & WIREFRAMES */}
                  {activeTab === "ux" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                        <h3 className="text-sm font-bold text-slate-900">
                          User Interface Maps & Responsive Transitions
                        </h3>
                        <span className="text-[10px] bg-pink-50 text-pink-700 px-2 py-0.5 rounded font-mono">
                          {currentDisplayedSpec.ux_flows?.length || 0} wireframe flows
                        </span>
                      </div>

                      {currentDisplayedSpec.ux_flows && currentDisplayedSpec.ux_flows.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {currentDisplayedSpec.ux_flows.map((flow, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
                              
                              {/* Visual Simulated Device Wireframe */}
                              <div className="bg-slate-900 py-1.5 px-3 flex items-center justify-between text-white/50 text-[9px] font-mono border-b border-slate-800">
                                <div className="flex items-center gap-1">
                                  <Smartphone className="h-3 w-3" />
                                  <span>{flow.screenName.toLowerCase().replace(/\s+/g, "_")}.tsx</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
                                  <span>Active Canvas</span>
                                </div>
                              </div>

                              <div className="p-4 flex-1 flex flex-col justify-between bg-white">
                                <div className="space-y-3">
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-900">{flow.screenName}</h4>
                                    <p className="text-[11px] text-slate-500 mt-0.5 italic">
                                      Journey: {flow.journey}
                                    </p>
                                  </div>

                                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] text-slate-600 space-y-1">
                                    <div className="font-semibold text-[9px] text-slate-400 uppercase tracking-wider">UI Layout & Sizing</div>
                                    <div className="whitespace-pre-wrap">{flow.uiState}</div>
                                  </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-slate-100">
                                  <div className="font-semibold text-[9px] text-slate-400 uppercase tracking-wider mb-1">State Transitions & Interactivity</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {flow.transitions?.map((trans, i) => (
                                      <span key={i} className="text-[9px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono">
                                        🔗 {trans}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400">
                          <Info className="h-8 w-8 mx-auto stroke-1 mb-2" />
                          <p className="text-xs">Waiting for UX Designer Agent...</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: ALGORITHMS */}
                  {activeTab === "algorithms" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                        <h3 className="text-sm font-bold text-slate-900">
                          Logic Engines & State Loop Pseudocode
                        </h3>
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-mono">
                          {currentDisplayedSpec.algorithms?.length || 0} computational modules
                        </span>
                      </div>

                      {currentDisplayedSpec.algorithms && currentDisplayedSpec.algorithms.length > 0 ? (
                        <div className="space-y-4">
                          {currentDisplayedSpec.algorithms.map((algo, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-bold text-xs text-slate-900">{algo.name}</h4>
                                  <p className="text-[11px] text-slate-600 mt-0.5">{algo.description}</p>
                                </div>
                                <span className="text-[9px] bg-amber-100 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-mono font-medium">
                                  {algo.complexity}
                                </span>
                              </div>

                              <div className="relative">
                                <div className="absolute right-2 top-2">
                                  <button
                                    onClick={() => handleCopy(algo.pseudocode, algo.name)}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-[9px] font-mono flex items-center gap-1 shadow cursor-pointer"
                                  >
                                    <Clipboard className="h-3 w-3" />
                                    Copy Engine
                                  </button>
                                </div>
                                <pre className="p-3 bg-slate-900 text-slate-100 text-[10px] font-mono rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                  {algo.pseudocode}
                                </pre>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400">
                          <Info className="h-8 w-8 mx-auto stroke-1 mb-2" />
                          <p className="text-xs">Waiting for Algorithmic Engineer Agent...</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 5: LLM PROMPTS */}
                  {activeTab === "prompts" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                        <h3 className="text-sm font-bold text-slate-900">
                          Structured Prompting Frameworks (SSPSS / CHECK / RBFR)
                        </h3>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono">
                          {currentDisplayedSpec.prompts?.length || 0} prompt models
                        </span>
                      </div>

                      {currentDisplayedSpec.prompts && currentDisplayedSpec.prompts.length > 0 ? (
                        <div className="space-y-4">
                          {currentDisplayedSpec.prompts.map((p, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-xs text-slate-900">
                                  System Instruction: {p.featureName}
                                </h4>
                                <button
                                  onClick={() => handleCopy(p.template, p.featureName)}
                                  className="p-1 text-slate-500 hover:text-slate-800 rounded flex items-center gap-1 text-[10px] cursor-pointer"
                                >
                                  <Clipboard className="h-3.5 w-3.5" />
                                  Copy Prompt
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    I/O Variables
                                  </h5>
                                  <div className="flex flex-wrap gap-1">
                                    {p.inputs?.map((inp, i) => (
                                      <span key={i} className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 font-mono">
                                        IN: {inp}
                                      </span>
                                    ))}
                                    {p.outputs?.map((out, i) => (
                                      <span key={i} className="text-[9px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-100 font-mono">
                                        OUT: {out}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Hallucination Guardrails
                                  </h5>
                                  <ul className="space-y-1">
                                    {p.guardrails?.map((g, i) => (
                                      <li key={i} className="text-[10px] text-slate-600 flex items-start gap-1">
                                        <XCircle className="h-3 w-3 mt-0.5 text-red-400 flex-shrink-0" />
                                        <span>{g}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>

                              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-100 text-[10px] font-mono whitespace-pre-wrap leading-relaxed max-h-[150px] overflow-y-auto">
                                {p.template}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400">
                          <Info className="h-8 w-8 mx-auto stroke-1 mb-2" />
                          <p className="text-xs">Waiting for Prompt Engineer Agent...</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 6: CRITIQUE & SAFETY */}
                  {activeTab === "risks" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                        <h3 className="text-sm font-bold text-slate-900">
                          Security Auditors & Alignment Report
                        </h3>
                        <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-mono">
                          {currentDisplayedSpec.risks?.length || 0} issues flagged
                        </span>
                      </div>

                      {currentDisplayedSpec.risks && currentDisplayedSpec.risks.length > 0 ? (
                        <div className="space-y-4">
                          {currentDisplayedSpec.open_questions && currentDisplayedSpec.open_questions.length > 0 && (
                            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-2">
                              <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                <HelpCircle className="h-4 w-4" />
                                Pending Business Board Questions
                              </h4>
                              <ul className="space-y-1">
                                {currentDisplayedSpec.open_questions.map((q, i) => (
                                  <li key={i} className="text-xs text-amber-800 flex items-start gap-1">
                                    <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                    <span>{q}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="space-y-3">
                            {currentDisplayedSpec.risks.map((risk, idx) => (
                              <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-white transition-colors">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`h-2.5 w-2.5 rounded-full ${
                                      risk.severity === "high" ? "bg-red-500 animate-ping" : risk.severity === "medium" ? "bg-amber-500" : "bg-sky-500"
                                    }`} />
                                    <h4 className="font-bold text-xs text-slate-900 capitalize">
                                      {risk.riskType} Risk Report
                                    </h4>
                                  </div>
                                  <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold capitalize ${
                                    risk.severity === "high" ? "bg-red-100 text-red-700" : risk.severity === "medium" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
                                  }`}>
                                    {risk.severity} Severity
                                  </span>
                                </div>

                                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                                  {risk.description}
                                </p>

                                <div className="mt-3 p-2.5 bg-slate-100 rounded-lg text-[10px] text-slate-700">
                                  <span className="font-semibold">Recommended Mitigation Design:</span> {risk.recommendation}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400">
                          <Info className="h-8 w-8 mx-auto stroke-1 mb-2" />
                          <p className="text-xs">No Safety risks or audits pending.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 7: CODE SCALPEL SCAFFOLDS */}
                  {activeTab === "code" && (
                    <div className="space-y-4 flex flex-col h-full min-h-[400px]">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                        <h3 className="text-sm font-bold text-slate-900">
                          Spec Compiler: Boilerplate Scaffold Files
                        </h3>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono">
                          {compiledFiles.length} blueprints
                        </span>
                      </div>

                      {compiledFiles.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1">
                          {/* File list selector */}
                          <div className="md:col-span-4 space-y-1.5 overflow-y-auto max-h-[300px]">
                            {compiledFiles.map((file, i) => (
                              <button
                                key={i}
                                onClick={() => setSelectedCodeFile(file)}
                                className={`w-full text-left p-2 rounded-lg text-xs font-mono transition-all flex items-center justify-between ${
                                  selectedCodeFile?.filename === file.filename
                                    ? "bg-slate-900 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                              >
                                <span className="truncate">{file.filename}</span>
                                <span className="text-[8px] opacity-75 font-sans font-bold uppercase px-1 py-0.5 bg-white/20 rounded">
                                  {file.language}
                                </span>
                              </button>
                            ))}
                          </div>

                          {/* Code viewer display */}
                          <div className="md:col-span-8 flex flex-col relative bg-slate-950 rounded-xl overflow-hidden min-h-[300px]">
                            {selectedCodeFile ? (
                              <div className="flex flex-col h-full">
                                <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-800">
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {selectedCodeFile.filename}
                                  </span>
                                  <button
                                    onClick={() => handleCopy(selectedCodeFile.content, selectedCodeFile.filename)}
                                    className="p-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[9px] font-mono flex items-center gap-1 cursor-pointer"
                                  >
                                    <Clipboard className="h-3 w-3" />
                                    Copy Scaffold
                                  </button>
                                </div>
                                <pre className="p-4 flex-1 text-[10px] font-mono text-emerald-400 overflow-x-auto overflow-y-auto whitespace-pre-wrap leading-relaxed max-h-[300px]">
                                  {selectedCodeFile.content}
                                </pre>
                              </div>
                            ) : (
                              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs font-mono">
                                Select a file on the left to review code structure
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400">
                          <Info className="h-8 w-8 mx-auto stroke-1 mb-2" />
                          <p className="text-xs">
                            Scaffold compile files will trigger automatically as soon as Synthesiser Agent initializes final package layouts.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "design_elements" && (
                    <DesignElementsTabContent
                      spec={currentDisplayedSpec}
                      onCopy={(txt, label) => handleCopy(txt, label)}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-slate-50/50 rounded-b-xl border border-dashed border-slate-200 m-4">
                <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 animate-bounce">
                  <Workflow className="h-10 w-10 text-slate-400 stroke-1" />
                </div>
                <h3 className="text-slate-800 font-bold text-sm mb-1">Spec Studio Standby</h3>
                <p className="text-xs max-w-sm leading-relaxed mb-4 text-slate-500">
                  Submit your brief ideas using the input box on the left. The Multi-Agent Design board will evaluate, align, and compile structural system specifications and code blueprints.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Agent Studio Activity logs & Voting monitor (3 columns) */}
        <section className="lg:col-span-3 flex flex-col gap-6" id="right_panel">
          
          {/* Active Status Header */}
          {isRunning && (
            <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Orchestrator State: {activeStage}
                </span>
              </div>
              <h3 className="text-xs font-bold text-white leading-tight">
                {activeMessage || "Directing specialized pipelines..."}
              </h3>
            </div>
          )}

          {/* Core Agent Cards Deck Grid */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2.5">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Network className="h-4 w-4 text-slate-700" />
              Design Studio Board
            </h2>

            <div className="grid grid-cols-1 gap-2">
              {agentTeam.map((agent) => {
                const isAgentActive = activeAgent === agent.role && isRunning;
                return (
                  <div
                    key={agent.role}
                    className={`p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2.5 ${
                      isAgentActive
                        ? agent.activeColor
                        : "border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{agent.emoji}</span>
                    <div className="truncate">
                      <div className="font-bold flex items-center gap-1">
                        {agent.name}
                        {isAgentActive && (
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping ml-1" />
                        )}
                      </div>
                      <div className={`text-[10px] truncate ${isAgentActive ? "text-white/80" : "text-slate-400"}`}>
                        {agent.tagline}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Live Board Votes Panel */}
          {votes.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Vote className="h-4 w-4 text-slate-700" />
                Weighted Approval Board
              </h2>

              <div className="space-y-2">
                {votes.map((v, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex items-start gap-2 text-[10px]">
                    <span className="text-sm mt-0.5">{v.emoji}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span>{v.agentName}</span>
                        <span className={`px-1 rounded font-bold text-[8px] uppercase ${
                          v.approved ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}>
                          {v.approved ? "Approved" : "Rejected"}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Weighted Impact: {v.weight} votes</p>
                      <p className="text-[9px] text-slate-500 mt-1 italic">"{v.reason}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Stream Feed */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-1 flex flex-col min-h-[300px]">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Terminal className="h-4 w-4 text-slate-700" />
              Activity Studio Stream
            </h2>

            <div className="flex-1 overflow-y-auto max-h-[300px] border border-slate-100 bg-slate-50/50 rounded-lg p-3 space-y-3">
              {logs.length > 0 ? (
                <div className="space-y-3">
                  {logs.map((log) => {
                    const isDebate = log.status === "debate" || log.status === "critique";
                    return (
                      <div
                        key={log.id}
                        className={`p-2.5 rounded-lg text-xs leading-relaxed transition-all flex items-start gap-2 ${
                          isDebate
                            ? "bg-amber-50 border border-amber-100 text-amber-900"
                            : "bg-white border border-slate-100 text-slate-700 shadow-sm"
                        }`}
                      >
                        <span className="text-base flex-shrink-0 mt-0.5">{log.emoji}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium mb-0.5">
                            <span className="font-bold text-slate-700">{log.agentName}</span>
                            <span>{log.timestamp}</span>
                          </div>
                          <p className="text-[11px] whitespace-pre-wrap">{log.message}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono text-center">
                  Live conversation stream logs stand-by...
                </div>
              )}
            </div>
          </div>
        </section>

      </main>

      {/* Aesthetic Copy Toast Notification */}
      {copySuccess && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white border border-slate-800 py-2.5 px-4 rounded-xl text-xs font-medium shadow-xl flex items-center gap-2 z-50 animate-bounce">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <span>Copied {copySuccess} to clipboard!</span>
        </div>
      )}

      {/* Simple strict design compliance footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-500 py-3 text-center text-xs">
        <p>Built with Google AI Studio &bull; Multi-Agent Design Protocol v3.1</p>
      </footer>
    </div>
  );
}

// ============================================================================
// DESIGN ELEMENTS VISUALIZER WORKSPACE & CUSTOM RENDERERS
// ============================================================================

interface DesignElementsTabContentProps {
  spec: any;
  onCopy: (content: string, label: string) => void;
}

function DesignElementsTabContent({ spec, onCopy }: DesignElementsTabContentProps) {
  const elements = spec.design_elements || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subView, setSubView] = useState<"visual" | "raw">("visual");
  const [searchQuery, setSearchQuery] = useState("");

  // Select first element by default if none selected and elements are available
  useEffect(() => {
    if (elements.length > 0 && !selectedId) {
      setSelectedId(elements[0].id);
    }
  }, [elements, selectedId]);

  // Dynamically ensure Mermaid library is available in the browser window
  useEffect(() => {
    const scriptId = "mermaid-script-cdn";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
      script.async = true;
      script.onload = () => {
        try {
          (window as any).mermaid?.initialize({
            startOnLoad: false,
            theme: "neutral",
            securityLevel: "loose",
          });
        } catch (e) {
          console.error("Failed to initialize Mermaid", e);
        }
      };
      document.body.appendChild(script);
    }
  }, []);

  const filteredElements = elements.filter((el: any) => {
    const query = searchQuery.toLowerCase();
    return (
      el.title?.toLowerCase().includes(query) ||
      el.type?.toLowerCase().includes(query) ||
      el.description?.toLowerCase().includes(query)
    );
  });

  const selectedEl = elements.find((el: any) => el.id === selectedId) || elements[0];

  const getAgentBadge = (role: string) => {
    switch (role) {
      case "architect":
        return { name: "Architect", emoji: "🧠", color: "bg-blue-50 text-blue-700 border-blue-200" };
      case "ux_designer":
        return { name: "UX Designer", emoji: "🎨", color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" };
      case "algorithm_designer":
        return { name: "Algorithmic Eng", emoji: "⚙️", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      case "prompt_designer":
        return { name: "Prompt Eng", emoji: "🧾", color: "bg-purple-50 text-purple-700 border-purple-200" };
      case "algorithm_reviewer":
        return { name: "Auditor", emoji: "🧪", color: "bg-amber-50 text-amber-700 border-amber-200" };
      case "consistency_agent":
        return { name: "Safety Officer", emoji: "🔒", color: "bg-rose-50 text-rose-700 border-rose-200" };
      default:
        return { name: "Synthesiser", emoji: "🧩", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    }
  };

  if (elements.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <Layers className="h-10 w-10 mx-auto stroke-1 mb-3 text-indigo-500 animate-pulse" />
        <h4 className="text-slate-800 font-bold text-sm mb-1">Visual Design Repository Standby</h4>
        <p className="text-xs max-w-sm mx-auto leading-relaxed text-slate-500">
          As agents draft their deliverables, high-fidelity C4 diagrams, interactive API contracts, Mermaid sequences, Gherkin BDD specs, and pseudocode elements are constructed here in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header Panel */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Interactive Design Suite
            </span>
            <span className="text-xs text-slate-400 font-medium">v3.2 Protocol</span>
          </div>
          <h3 className="text-lg font-extrabold tracking-tight">Living Specifications Workspace</h3>
          <p className="text-xs text-slate-300 mt-1">
            Explore system layouts, Mermaid diagrams, API contracts, and BDD storyboard flows dynamically compiled by your AI specialist team.
          </p>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search specs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-56 pl-3 pr-8 py-1.5 rounded-lg text-xs bg-white/10 text-white placeholder-white/50 border border-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs cursor-pointer"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 min-h-[450px]">
        {/* Left Side: Navigation Catalog */}
        <div className="md:col-span-4 flex flex-col gap-3 max-h-[450px] overflow-y-auto pr-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">
            Specification Elements ({filteredElements.length})
          </span>
          <div className="flex flex-col gap-2">
            {filteredElements.map((el: any) => {
              const active = el.id === selectedEl?.id;
              const badge = getAgentBadge(el.agent);
              return (
                <button
                  key={el.id}
                  onClick={() => {
                    setSelectedId(el.id);
                    setSubView("visual");
                  }}
                  className={`w-full text-left p-3.5 rounded-xl transition-all duration-200 border cursor-pointer ${
                    active
                      ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-indigo-100"
                      : "bg-white border-slate-150 hover:border-slate-300 text-slate-700 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                        active ? "bg-white/15 text-indigo-300" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {el.type?.replace("_", " ")}
                    </span>
                    <span className="text-[10px] flex items-center gap-1 font-medium opacity-85">
                      <span>{badge.emoji}</span>
                      <span className={active ? "text-indigo-200" : "text-slate-500"}>
                        {badge.name}
                      </span>
                    </span>
                  </div>
                  <h4 className="text-xs font-bold truncate">{el.title}</h4>
                  <p
                    className={`text-[10px] mt-1 line-clamp-2 leading-relaxed ${
                      active ? "text-slate-300" : "text-slate-400"
                    }`}
                  >
                    {el.description}
                  </p>
                </button>
              );
            })}
            {filteredElements.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400 font-mono">
                No matching elements found.
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Interactive Visualizer Canvas */}
        <div className="md:col-span-8 flex flex-col bg-white border border-slate-150 rounded-2xl shadow-sm overflow-hidden max-h-[450px]">
          {selectedEl ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Element Header */}
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold uppercase font-mono border border-indigo-100">
                      {selectedEl.type?.replace("_", " ")}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span>{getAgentBadge(selectedEl.agent).emoji}</span>
                      <span className="font-semibold text-slate-600">
                        {getAgentBadge(selectedEl.agent).name} Agent
                      </span>
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 truncate">{selectedEl.title}</h4>
                </div>

                {/* Sub View Toggle Control */}
                <div className="flex bg-slate-200/60 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto flex-shrink-0">
                  <button
                    onClick={() => setSubView("visual")}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                      subView === "visual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Visual Canvas
                  </button>
                  <button
                    onClick={() => setSubView("raw")}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                      subView === "raw" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Raw Content
                  </button>
                </div>
              </div>

              {/* Element Description and Workspace Body */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-700">Deliverable Objective:</span> {selectedEl.description}
                </p>

                {subView === "visual" ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Render visual interface depending on element type */}
                    {selectedEl.type === "c4_diagram" && (
                      <C4Visualizer element={selectedEl} spec={spec} />
                    )}
                    {selectedEl.type === "api_contract" && (
                      <ApiContractVisualizer element={selectedEl} onCopy={onCopy} />
                    )}
                    {selectedEl.type === "behavioural_spec" && (
                      <BehaviouralSpecVisualizer element={selectedEl} />
                    )}
                    {selectedEl.type === "pseudocode" && (
                      <PseudocodeVisualizer element={selectedEl} onCopy={onCopy} />
                    )}
                    {(selectedEl.type === "mermaid_sequence" ||
                      selectedEl.type === "mermaid_state" ||
                      selectedEl.type === "mermaid_flowchart") && (
                      <MermaidVisualizer element={selectedEl} />
                    )}
                    {!["c4_diagram", "api_contract", "behavioural_spec", "pseudocode", "mermaid_sequence", "mermaid_state", "mermaid_flowchart"].includes(selectedEl.type) && (
                      <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-xs text-center border">
                        Visual view not specialized for this type. Standardizing representation inside the Raw Content tab.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0 relative">
                    <div className="absolute right-3 top-3 z-10">
                      <button
                        onClick={() => onCopy(selectedEl.content, selectedEl.title)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-[9px] font-mono flex items-center gap-1 cursor-pointer transition-all shadow"
                      >
                        <Clipboard className="h-3 w-3" />
                        Copy Content
                      </button>
                    </div>
                    <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-[10px] rounded-xl overflow-auto whitespace-pre-wrap leading-relaxed flex-1 border border-slate-900 min-h-[220px]">
                      {selectedEl.content}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs font-mono">
              Select an element from the catalog to visual render it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 1. DYNAMIC MERMAID VISUALIZER CANVAS (WITH BUILT-IN FALLBACK ENGINE)
// ============================================================================

function MermaidVisualizer({ element }: { element: any }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackSteps, setFallbackSteps] = useState<Array<{ from: string; to: string; label: string; type: string }>>([]);

  useEffect(() => {
    // Attempt dynamic rendering with Mermaid
    const mermaid = (window as any).mermaid;
    if (!mermaid) {
      // Library is still downloading, extract fallback visualizer representation
      parseFallbackSteps(element.content);
      return;
    }

    try {
      const id = "mermaid-spec-" + Math.random().toString(36).substring(2, 9);
      // Clean diagram content slightly for Mermaid compatibility
      const cleanContent = element.content
        .replace(/```mermaid/g, "")
        .replace(/```/g, "")
        .trim();

      mermaid.render(id, cleanContent).then(({ svg }: any) => {
        setSvg(svg);
        setError(null);
      }).catch((err: any) => {
        console.warn("Mermaid rendering error", err);
        parseFallbackSteps(element.content);
        setError("Diagram engine in rendering fallback state. Showing chronological workflow view below.");
      });
    } catch (err) {
      parseFallbackSteps(element.content);
      setError("Mermaid parsing fallback active.");
    }
  }, [element.content]);

  // Parse lines of Mermaid into a chronological storyboard step list
  const parseFallbackSteps = (text: string) => {
    const steps: Array<{ from: string; to: string; label: string; type: string }> = [];
    const lines = text.split("\n");
    lines.forEach((line) => {
      // Match sequence arrows like A->>B: Message or A-->>B: Response
      const seqMatch = line.match(/^\s*([\w\s]+)(->>|-->>)\s*([\w\s]+)\s*:\s*(.+)$/);
      if (seqMatch) {
        steps.push({
          from: seqMatch[1].trim(),
          to: seqMatch[3].trim(),
          label: seqMatch[4].trim(),
          type: seqMatch[2] === "->>" ? "call" : "return",
        });
        return;
      }
      // Match flowchart mappings like A --> B
      const flowMatch = line.match(/^\s*([\w\s\[\]"'-]+)(-->|==>)\s*([\w\s\[\]"'-]+)$/);
      if (flowMatch) {
        steps.push({
          from: flowMatch[1].replace(/[\[\]"']/g, "").trim(),
          to: flowMatch[3].replace(/[\[\]"']/g, "").trim(),
          label: "Flow Link",
          type: "flow",
        });
      }
    });
    setFallbackSteps(steps);
  };

  if (svg && !error) {
    return (
      <div className="flex flex-col gap-3">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center overflow-auto max-h-[300px]">
          <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} className="w-full h-full flex justify-center text-center" />
        </div>
        <span className="text-[9px] font-mono text-slate-400 text-center uppercase tracking-widest font-bold">
          LIVE MERMAID GRAPH ENGAGED
        </span>
      </div>
    );
  }

  // Fallback workflow view
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded-lg border border-indigo-100">
          ℹ️ {error}
        </div>
      )}

      {fallbackSteps.length > 0 ? (
        <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-[250px] overflow-y-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Chronological Workflow Steps
          </span>
          <div className="flex flex-col gap-2.5">
            {fallbackSteps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-white p-2.5 rounded-lg border border-slate-150 shadow-xs">
                <div className="px-1.5 py-1 rounded bg-slate-900 text-white font-mono text-[9px] font-bold flex-shrink-0 mt-0.5">
                  #{idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-indigo-600 truncate">{step.from}</span>
                    <span className="text-[8px] font-mono text-slate-400 font-bold uppercase">
                      {step.type === "call" ? "➔ Request" : step.type === "return" ? "⇠ Response" : "➔ Link"}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 truncate">{step.to}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1 italic font-medium">"{step.label}"</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-slate-400 border border-slate-200 border-dashed rounded-xl bg-slate-50/40">
          <RefreshCw className="h-5 w-5 mx-auto animate-spin mb-2 text-indigo-500" />
          Loading spec chart compiler...
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. HIGH-END INTERACTIVE C4 DIAGRAM MAP VISUALIZER
// ============================================================================

function C4Visualizer({ element, spec }: { element: any; spec: any }) {
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);

  // Generate interactive container layout list directly from current modules if schema not complete
  const fallbackContainers = spec.modules?.map((m: any, idx: number) => ({
    id: `mod_${idx}`,
    name: m.name,
    tech: m.technology || "TypeScript / Node.js",
    type: "Backend Container",
    description: m.description,
    endpoints: m.endpoints || []
  })) || [];

  // Combine with a client and database tier to produce a beautiful complete container map
  const clientContainer = {
    id: "client_web",
    name: "Web Portal Client",
    tech: "React 19, Tailwind, Lucide",
    type: "Frontend Container",
    description: "Responsive Single-Page Web Application serving developer and administrator boards.",
    endpoints: []
  };

  const dbContainer = {
    id: "db_postgres",
    name: "System DB / Cache Store",
    tech: "PostgreSQL with Firestore Caching",
    type: "Data Store Tier",
    description: "Persists configuration schemas, multi-agent design logs, audit records, and compiled scaffolds safely.",
    endpoints: []
  };

  const allContainers = [clientContainer, ...fallbackContainers, dbContainer];

  const getContainerStyles = (type: string) => {
    if (type.includes("Frontend")) return "bg-sky-50 border-sky-200 text-sky-900 hover:bg-sky-100/55";
    if (type.includes("Data Store")) return "bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/55";
    return "bg-indigo-50 border-indigo-200 text-indigo-900 hover:bg-indigo-100/55";
  };

  const activeContainer = allContainers.find(c => c.id === selectedContainer) || allContainers[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Container Map Grid (8 columns) */}
        <div className="md:col-span-8 flex flex-col gap-3.5 border border-slate-100 bg-slate-50/50 p-4 rounded-xl max-h-[250px] overflow-y-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            System Container Mapping (C4 Layer 2)
          </span>

          <div className="flex flex-col gap-3">
            {/* Frontend Tier */}
            <div className="flex justify-center border-b border-dashed border-slate-200 pb-2">
              <button
                onClick={() => setSelectedContainer(clientContainer.id)}
                className={`px-4 py-2 rounded-xl border transition-all text-xs text-center cursor-pointer max-w-sm w-full ${getContainerStyles(clientContainer.type)} ${selectedContainer === clientContainer.id ? 'ring-2 ring-indigo-500' : ''}`}
              >
                <div className="font-bold flex items-center justify-center gap-1">
                  <span>📱</span> {clientContainer.name}
                </div>
                <div className="text-[9px] font-mono opacity-80 mt-0.5">{clientContainer.tech}</div>
              </button>
            </div>

            {/* Application Services Tier */}
            <div className="flex flex-wrap justify-center gap-2">
              {fallbackContainers.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedContainer(c.id)}
                  className={`px-3 py-1.5 rounded-xl border transition-all text-xs text-center cursor-pointer min-w-[130px] max-w-[170px] flex-1 ${getContainerStyles(c.type)} ${selectedContainer === c.id ? 'ring-2 ring-indigo-500' : ''}`}
                >
                  <div className="font-bold truncate">⚙️ {c.name}</div>
                  <div className="text-[8px] font-mono opacity-80 mt-0.5 truncate">{c.tech}</div>
                </button>
              ))}
            </div>

            {/* Database / Data Tier */}
            <div className="flex justify-center border-t border-dashed border-slate-200 pt-2">
              <button
                onClick={() => setSelectedContainer(dbContainer.id)}
                className={`px-4 py-2 rounded-xl border transition-all text-xs text-center cursor-pointer max-w-sm w-full ${getContainerStyles(dbContainer.type)} ${selectedContainer === dbContainer.id ? 'ring-2 ring-indigo-500' : ''}`}
              >
                <div className="font-bold flex items-center justify-center gap-1">
                  <span>📂</span> {dbContainer.name}
                </div>
                <div className="text-[9px] font-mono opacity-80 mt-0.5">{dbContainer.tech}</div>
              </button>
            </div>
          </div>
        </div>

        {/* Selected Container Detail Panel (4 columns) */}
        <div className="md:col-span-4 flex flex-col bg-slate-900 text-white p-4 rounded-xl shadow border border-slate-800 justify-between max-h-[250px] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[8px] font-mono font-bold bg-white/15 px-1.5 py-0.5 rounded text-indigo-300 uppercase">
                {activeContainer.type}
              </span>
              <span className="text-[10px] text-slate-400">Layer 2 Info</span>
            </div>
            <h5 className="text-xs font-bold text-white mb-1.5">{activeContainer.name}</h5>
            <p className="text-[10px] text-slate-300 leading-relaxed font-light mb-2">
              {activeContainer.description}
            </p>
            <div className="text-[9px] font-mono text-indigo-300 mb-1">
              <span className="text-slate-400 font-bold">Technology Stack:</span> {activeContainer.tech}
            </div>
          </div>

          {activeContainer.endpoints && activeContainer.endpoints.length > 0 && (
            <div className="border-t border-slate-800 pt-2 mt-2">
              <div className="text-[8px] font-mono text-slate-400 uppercase tracking-widest font-bold mb-1">
                Endpoints Exposed
              </div>
              <div className="flex flex-col gap-1 max-h-[70px] overflow-y-auto">
                {activeContainer.endpoints.map((route: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-1 text-[8px] font-mono bg-white/5 px-1.5 py-0.5 rounded">
                    <span className="text-emerald-400 font-bold">{route.method || "GET"}</span>
                    <span className="text-slate-300 truncate">{route.path || route}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. INTERACTIVE SWAGGER-STYLE API CONTRACT VISUALIZER
// ============================================================================

function ApiContractVisualizer({ element, onCopy }: { element: any; onCopy: any }) {
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);

  // Extract structured route schemas. If none, generate mock list from element description
  const parsedEndpoints: Array<{
    method: string;
    path: string;
    description: string;
    parameters: Array<{ name: string; type: string; required: boolean; desc: string }>;
    responseSample: any;
  }> = [];

  // Read endpoints from structured data or markdown fallback parsing
  if (element.structured_data?.endpoints && Array.isArray(element.structured_data.endpoints)) {
    element.structured_data.endpoints.forEach((ep: any) => {
      parsedEndpoints.push({
        method: ep.method || "GET",
        path: ep.path || "/api/v1/resource",
        description: ep.description || "API routing controller",
        parameters: ep.parameters || [{ name: "id", type: "string", required: true, desc: "Primary key identifier" }],
        responseSample: ep.response_sample || { status: "success", data: {} }
      });
    });
  } else {
    // Generate beautiful structured sample paths
    parsedEndpoints.push(
      {
        method: "GET",
        path: "/api/v1/status",
        description: "Retrieves live agent state models and current specification compiling timeline.",
        parameters: [
          { name: "session_id", type: "string", required: true, desc: "Unique board session hash key" }
        ],
        responseSample: { status: "ready", active_stage: "compiling", spec_version: 5 }
      },
      {
        method: "POST",
        path: "/api/v1/generation/trigger",
        description: "Dispatches the Orchestrator loop state to initialize specific agent critique queues.",
        parameters: [
          { name: "idea", type: "string", required: true, desc: "The concept description string" },
          { name: "debate_cycles", type: "number", required: false, desc: "A audit safety debounce iteration count" }
        ],
        responseSample: { success: true, tracking_id: "tx_90835" }
      }
    );
  }

  const getMethodColor = (m: string) => {
    switch (m.toUpperCase()) {
      case "GET": return "bg-emerald-50 border-emerald-200 text-emerald-700";
      case "POST": return "bg-blue-50 border-blue-200 text-blue-700";
      case "PUT": return "bg-amber-50 border-amber-200 text-amber-700";
      default: return "bg-rose-50 border-rose-200 text-rose-700";
    }
  };

  return (
    <div className="flex flex-col gap-3.5 max-h-[250px] overflow-y-auto pr-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Interactive Endpoint Catalog
      </span>

      <div className="flex flex-col gap-2">
        {parsedEndpoints.map((ep, idx) => {
          const isExpanded = expandedRoute === idx;
          return (
            <div key={idx} className="bg-white border border-slate-150 rounded-xl overflow-hidden shadow-xs transition-all">
              <button
                onClick={() => setExpandedRoute(isExpanded ? null : idx)}
                className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold border uppercase ${getMethodColor(ep.method)}`}>
                    {ep.method}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-800 truncate">{ep.path}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-slate-400 font-medium truncate hidden sm:inline">
                    {ep.description.slice(0, 45)}...
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50/40 flex flex-col gap-3 text-xs">
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {ep.description}
                  </p>

                  {/* Endpoint query/body variables */}
                  <div>
                    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-widest font-bold mb-1.5">
                      Request Parameters
                    </div>
                    <div className="flex flex-col gap-1">
                      {ep.parameters.map((p, i) => (
                        <div key={i} className="flex items-start justify-between p-1.5 bg-white border rounded-lg text-[10px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800">{p.name}</span>
                            <span className="text-[8px] font-mono text-indigo-500 font-semibold">({p.type})</span>
                            {p.required && (
                              <span className="text-[8px] font-bold text-rose-500 uppercase">Required</span>
                            )}
                          </div>
                          <span className="text-slate-500 italic">{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mock sample response payload */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                        Response Payload Sample (JSON)
                      </span>
                      <button
                        onClick={() => onCopy(JSON.stringify(ep.responseSample, null, 2), ep.path)}
                        className="text-[9px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre className="p-3 bg-slate-900 text-emerald-400 text-[9px] font-mono rounded-lg overflow-x-auto leading-relaxed max-h-[100px]">
                      {JSON.stringify(ep.responseSample, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 4. GAMIFIED STORYBOARD PLAYABLE BDD BEHAVIOURAL SPEC VISUALIZER
// ============================================================================

function BehaviouralSpecVisualizer({ element }: { element: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const parsedSteps: Array<{ prefix: "Given" | "When" | "Then"; text: string }> = [];
  const lines = element.content.split("\n");
  lines.forEach((line: string) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("Given ")) {
      parsedSteps.push({ prefix: "Given", text: trimmed.substring(6).trim() });
    } else if (trimmed.startsWith("When ")) {
      parsedSteps.push({ prefix: "When", text: trimmed.substring(5).trim() });
    } else if (trimmed.startsWith("Then ")) {
      parsedSteps.push({ prefix: "Then", text: trimmed.substring(5).trim() });
    }
  });

  // Fallback if none parsed
  if (parsedSteps.length === 0) {
    parsedSteps.push(
      { prefix: "Given", text: "The System Orchestrator completes building Draft 0" },
      { prefix: "When", text: "The user submits a specific platform concept idea" },
      { prefix: "Then", text: "A comprehensive Spec Pack compiles through review debates seamlessly" }
    );
  }

  const triggerSimulation = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    for (let i = 0; i < parsedSteps.length; i++) {
      setActiveStep(i);
      await new Promise(resolve => setTimeout(resolve, 1400));
    }
    setActiveStep(null);
    setIsPlaying(false);
  };

  const getStepPrefixStyle = (p: string) => {
    switch (p) {
      case "Given": return "bg-amber-100 text-amber-800 border-amber-200";
      case "When": return "bg-blue-100 text-blue-800 border-blue-200";
      default: return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          BDD Gherkin Storyboard Scenario
        </span>
        <button
          onClick={triggerSimulation}
          disabled={isPlaying}
          className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow border ${
            isPlaying
              ? "bg-slate-100 text-slate-400 border-slate-200"
              : "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500"
          }`}
        >
          <Play className={`h-3 w-3 ${isPlaying ? "animate-spin" : ""}`} />
          {isPlaying ? "Running Simulation..." : "Play Scenario"}
        </button>
      </div>

      <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto bg-slate-50 p-4 rounded-xl border border-slate-100">
        {parsedSteps.map((step, idx) => {
          const isActive = activeStep === idx;
          const isPassed = activeStep !== null && idx < activeStep;
          return (
            <div
              key={idx}
              className={`p-3 rounded-xl border transition-all duration-300 flex items-start gap-3 bg-white ${
                isActive
                  ? "border-indigo-400 ring-1 ring-indigo-400 shadow-md transform translate-x-1"
                  : isPassed
                  ? "border-emerald-200 bg-emerald-50/10"
                  : "border-slate-150"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {isPassed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : isActive ? (
                  <div className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-slate-300 flex items-center justify-center text-[8px] font-mono font-bold text-slate-400">
                    {idx + 1}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${getStepPrefixStyle(step.prefix)}`}>
                    {step.prefix}
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                  {step.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 5. HIGH-FIDELITY CUSTOM CODE TERMINAL VIEWER (PSEUDOCODE)
// ============================================================================

function PseudocodeVisualizer({ element, onCopy }: { element: any; onCopy: any }) {
  const [filterQuery, setFilterQuery] = useState("");
  const lines = element.content.split("\n");

  const filteredLines = lines.map((line: string, i: number) => ({ text: line, num: i + 1 }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Structured Computational pseudocode
        </span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter code lines..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="px-2 py-1 rounded border border-slate-200 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={() => onCopy(element.content, element.title)}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[9px] font-mono flex items-center gap-1 cursor-pointer transition-all border border-slate-200"
          >
            <Clipboard className="h-3 w-3" />
            Copy Code
          </button>
        </div>
      </div>

      <div className="bg-slate-950 rounded-xl overflow-hidden shadow-md flex flex-col border border-slate-900 max-h-[220px] overflow-y-auto">
        <div className="bg-slate-900 px-4 py-1.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-semibold">
            PSEUDOCODE EDITOR VIEW
          </span>
        </div>
        <div className="p-4 font-mono text-[10px] text-emerald-400 overflow-x-auto">
          {filteredLines
            .filter((l: any) => l.text.toLowerCase().includes(filterQuery.toLowerCase()))
            .map((l: any) => (
              <div key={l.num} className="flex hover:bg-slate-900/40 p-0.5 rounded transition-colors">
                <span className="text-slate-600 select-none text-right pr-4 w-8 flex-shrink-0 border-r border-slate-800">
                  {l.num}
                </span>
                <span className="pl-4 whitespace-pre pr-4 flex-1">
                  {l.text}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
