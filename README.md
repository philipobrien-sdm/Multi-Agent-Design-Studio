# Multi-Agent Design Studio 🚀
<img width="1301" height="784" alt="Screenshot 2026-06-29 163823" src="https://github.com/user-attachments/assets/e708792a-79ba-4664-a385-7cf5c2f21c34" />

Collaborative multi-agent system that transforms product ideas into structured, build-ready "vibe-coding" specification packs.

Designed for developer velocity, the **Multi-Agent Design Studio** orchestrates multiple specialized, cooperative AI agents (System Architect, UX Designer, Algorithmic Engineer, Prompt Engineer, and Alignment/Safety Board) to draft, review, debate, and compile clean software specifications alongside code scaffolds.

View a smple Specification here:[DesignSpecification_“Briefly”_is_a__v6.html](https://github.com/user-attachments/files/29471997/DesignSpecification_.Briefly._is_a__v6.html)


---

## 🎨 System Walkthrough & Core Capabilities

The Design Studio provides an immersive, desktop-first workspace with real-time feedback loop mechanics:

1. **Intake & Ideation**: Enter a high-level product idea or a feature prompt.
2. **Multi-Agent Orchestration**: Watch in real-time as specialized agents spin up to complete drafting phases:
   - 🧠 **System Architect**: Defines modular interfaces, database models, and API endpoints.
   - 🎨 **Lead UX/UI Designer**: Blueprints screen flows, user navigation pathways, and UI layout components.
   - ⚙️ **Algorithmic Engineer**: Maps core business logic, performance-tuned processes, and pseudocode engines.
   - 🧾 **Prompt Engineer**: Constructs production-ready LLM templates, variable inputs, and output schemas with strict negative guardrails.
3. **Cross-Review & Debate**: Optional high-safety review loops where a **Reviewer Agent** critiques the design, a **Consistency Agent** resolves conflicts, and an **Architectural Board** casts votes on alignment.
4. **Final Synthesis**: Merges agent spec sheets into a unified, beautiful product spec (in Markdown) alongside functional code scaffolding files.
5. **Interactive Refinement Chat**: Ask the **Lead Architect** to modify the specs directly (e.g., *"Change the database to PostgreSQL and add a password hashing algorithm"*). The Lead Architect automatically assesses the request, coordinates only the required specialists, and generates a refined version.
6. **State Resiliency (Resume & Recovery)**: If an agent run is interrupted or fails midway, click **"Resume From Last Successful Agent"** to pick up exactly where compilation left off without re-running previous stages.
7. **Import/Export Systems**: Export complete specification models as portable JSON session packs, or import previously saved designs to continue editing or refining.
<img width="406" height="278" alt="Screenshot 2026-06-29 163845" src="https://github.com/user-attachments/assets/82dad270-33bd-4e6d-a52b-7e5b72e99e3d" /><img width="296" height="360" alt="Screenshot 2026-06-29 162911" src="https://github.com/user-attachments/assets/79bf8f59-4b4a-445b-af50-194c971e2641" />
<img width="292" height="325" alt="Screenshot 2026-06-29 162918" src="https://github.com/user-attachments/assets/45bd9e33-d2e1-4c3e-93b5-adc37cdbda52" />


---

## 🛠️ Technology Stack

### Frontend (Client-side SPA)
- **Framework**: React 19 + TypeScript
- **Bundler**: Vite 6
- **Animations**: `motion` (Framer Motion) for fluid, physics-based UI transitions and staggered agent logs
- **Styling**: Tailwind CSS v4 (with modern `@tailwindcss/vite` plugin compilation)
- **Icons**: Lucide React for consistent vector symbols

### Backend (Full-stack Server)
- **Server**: Express.js
- **Runtime**: Node.js + `tsx` (TypeScript Execute) for developer mode
- **Compiler**: `esbuild` for ultra-fast, single-bundle backend packaging
- **AI Integration**: `@google/genai` TypeScript SDK utilizing high-performance Gemini models (such as `gemini-2.5-flash` or `gemini-2.5-pro`)
- **Streaming Protocol**: Server-Sent Events (SSE) for real-time log output and spec updates

---

## 📂 Project Architecture

```bash
├── server.ts             # Express full-stack server (handles SSE streams & Gemini orchestration)
├── package.json          # Application dependencies and build/execution scripts
├── tsconfig.json         # TypeScript configuration
├── vite.config.ts        # Vite environment and development proxy settings
├── .env.example          # Template for required environment secrets
├── metadata.json         # Applet metadata & capabilities
└── src/
    ├── main.tsx          # Client application bootstrap
    ├── index.css         # Global styles & Tailwind imports
    ├── App.tsx           # Primary React single-page workspace interface
    └── assets/           # Client-side static assets
```

---

## ⚙️ Setup & Installation

### Prerequisite: Gemini API Key
To run the full multi-agent orchestration, you will need a **Gemini API Key**.
- Obtain your key from the [Google AI Studio Console](https://aistudio.google.com/).

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd multi-agent-design-studio
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your Gemini API key:
```bash
cp .env.example .env
```
Inside your `.env` file, set:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Install Dependencies
Ensure all backend and frontend packages are populated:
```bash
npm install
```

---

## 🏃 Execution Commands

### Development Mode
Boot the full-stack server and the live asset rebuilder:
```bash
npm run dev
```
The server will start running locally. You can open and interact with the application at:
👉 **`http://localhost:3000`**

### Production Build & Launch
Compile both the React assets and the Express TypeScript server into a self-contained production bundle:
```bash
npm run build
```
Start the compiled production bundle:
```bash
npm run start
```

---

## 🧩 Architectural Design of the Multi-Agent Stream

### Real-Time Orchestration (`/api/orchestrate-stream`)
Spins up a cooperative multi-agent lifecycle that operates sequentially or recursively depending on settings. Communicates back to the React app using Server-Sent Events (SSE). The system state progresses through:
`initializing` ➔ `architecting` ➔ `designing` ➔ `engineering` ➔ `prompting` ➔ `critique` (optional) ➔ `synthesizing` ➔ `completed`.

### Specialized Layer Gen Schema (`generateSpecLayer`)
Each agent operates with structured schema guardrails configured via the Gemini JSON Schema engine to ensure output consistency:
- **System Architect**: Matches `modules` and architecture `design_elements`.
- **UX Designer**: Matches screen `ux_flows` and UX/UI diagrams.
- **Algorithm Designer**: Matches code `algorithms`, pseudocode, and performance metadata.
- **Prompt Designer**: Matches LLM template definitions and safety constraints.

### The Refinement Engine (`/api/refine-stream`)
When revisions are requested:
1. **System Architect** acts as the Dispatcher: It assesses which sub-agents must run based on the request (e.g., if you only ask to change a screen layout, it only runs the `ux_designer` and the `synthesiser`, saving API latency and token costs).
2. Specialized sub-agents perform surgical rewrites on their specific section of the spec sheet while preserving the rest of the layout.
3. **Synthesiser** compiles the final spec and scaffolds.
