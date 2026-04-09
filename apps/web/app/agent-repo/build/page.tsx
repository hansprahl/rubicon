"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  Package,
  Sparkles,
  Lock,
  Users,
  Building,
  Check,
  X,
} from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { buildCustomAgent, listTools, getWorkspaces } from "@/lib/api";
import type { RepoTool, WorkspaceWithMembers, BuildAgentPayload } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "purpose", label: "Purpose" },
  { key: "expertise", label: "Expertise" },
  { key: "tools", label: "Tools" },
  { key: "doctrine", label: "Doctrine" },
  { key: "visibility", label: "Visibility" },
  { key: "review", label: "Review" },
];

const CATEGORIES = [
  { key: "financial", label: "Financial", description: "Budgets, valuations, financial modeling" },
  { key: "strategy", label: "Strategy", description: "Frameworks, decisions, competitive analysis" },
  { key: "research", label: "Research", description: "Market research, regulatory, academic" },
  { key: "operations", label: "Operations", description: "Process optimization, project management" },
  { key: "custom", label: "Custom", description: "Something else entirely" },
];

const AGENT_ICONS = [
  "🤖", "🧠", "📊", "📈", "🔬", "🎯", "💡", "🏗️",
  "📋", "🔍", "🛡️", "⚡", "🌐", "📝", "🧮", "🔧",
];

export default function BuildAgentPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("");
  const [icon, setIcon] = useState("🤖");
  const [expertise, setExpertise] = useState<string[]>([]);
  const [expertiseInput, setExpertiseInput] = useState("");
  const [personality, setPersonality] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [doctrineConfig, setDoctrineConfig] = useState({
    confidence_scoring: true,
    knowledge_graph: false,
    approval_required: false,
    proactive: false,
  });
  const [visibility, setVisibility] = useState("cohort");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);

  // Data
  const [allTools, setAllTools] = useState<RepoTool[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembers[]>([]);
  const [toolSearch, setToolSearch] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Load tools and workspaces in parallel
      const [tools, ws] = await Promise.all([
        listTools().catch(() => []),
        getWorkspaces(user.id).catch(() => []),
      ]);
      setAllTools(tools);
      setWorkspaces(ws);
    }
    init();
  }, []);

  function addExpertise() {
    const tag = expertiseInput.trim();
    if (tag && !expertise.includes(tag)) {
      setExpertise([...expertise, tag]);
    }
    setExpertiseInput("");
  }

  function removeExpertise(tag: string) {
    setExpertise(expertise.filter((e) => e !== tag));
  }

  function toggleTool(toolName: string) {
    setSelectedTools((prev) =>
      prev.includes(toolName)
        ? prev.filter((t) => t !== toolName)
        : [...prev, toolName]
    );
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 0:
        return name.trim().length > 0 && purpose.trim().length > 0 && category.length > 0;
      case 1:
        return true; // Expertise is optional
      case 2:
        return true; // Tools are optional
      case 3:
        return true; // Doctrine config always valid
      case 4:
        return visibility !== "workspace" || selectedWorkspace !== null;
      case 5:
        return true; // Review step
      default:
        return false;
    }
  }

  async function handleCreate() {
    if (!userId) return;
    setCreating(true);
    setError(null);

    try {
      const payload: BuildAgentPayload = {
        name: name.trim(),
        purpose: purpose.trim(),
        category,
        expertise,
        tools: selectedTools,
        visibility,
        workspace_id: visibility === "workspace" ? selectedWorkspace : null,
        doctrine_config: doctrineConfig,
        icon,
      };

      const agent = await buildCustomAgent(userId, payload);
      router.push(`/agent-repo/${agent.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create agent");
      setCreating(false);
    }
  }

  // Filter tools for search
  const filteredTools = allTools.filter(
    (t) =>
      !toolSearch ||
      t.display_name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      t.description.toLowerCase().includes(toolSearch.toLowerCase())
  );

  // ── Step Renderers ──

  function renderPurpose() {
    return (
      <div className="space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Agent Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Compliance Analyst, Strategy Advisor"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            What does this agent do?
          </label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Describe the agent's purpose. What problems does it solve? What tasks does it handle?"
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Category</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-all",
                  category === cat.key
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="text-sm font-medium">{cat.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {cat.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Icon</label>
          <div className="flex flex-wrap gap-2">
            {AGENT_ICONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setIcon(emoji)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-all",
                  icon === emoji
                    ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/30"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderExpertise() {
    return (
      <div className="space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Areas of Expertise
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Add tags that describe what this agent knows about. Press Enter to
            add each tag.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={expertiseInput}
              onChange={(e) => setExpertiseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExpertise();
                }
              }}
              placeholder="e.g., regulatory compliance, financial analysis"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={addExpertise}
              disabled={!expertiseInput.trim()}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {expertise.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {expertise.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm"
                >
                  {tag}
                  <button
                    onClick={() => removeExpertise(tag)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Personality / Approach (optional)
          </label>
          <textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="Describe how this agent should interact. e.g., 'Direct and analytical' or 'Warm and collaborative'"
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    );
  }

  function renderTools() {
    return (
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Select Tools
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Choose which tools this agent can use. These come from the shared
            Tool Repository.
          </p>
          <input
            type="text"
            value={toolSearch}
            onChange={(e) => setToolSearch(e.target.value)}
            placeholder="Search tools..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {selectedTools.length > 0 && (
          <div className="rounded-md border bg-primary/5 p-3">
            <div className="text-xs font-medium text-primary mb-1.5">
              {selectedTools.length} tool{selectedTools.length !== 1 ? "s" : ""}{" "}
              selected
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedTools.map((name) => {
                const tool = allTools.find((t) => t.name === name);
                return (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {tool?.icon} {tool?.display_name || name}
                    <button onClick={() => toggleTool(name)}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 max-h-[400px] overflow-y-auto">
          {filteredTools.map((tool) => {
            const isSelected = selectedTools.includes(tool.name);
            return (
              <button
                key={tool.id}
                onClick={() => toggleTool(tool.name)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/30"
                )}
              >
                <span className="text-lg shrink-0">{tool.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {tool.display_name}
                    </span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {tool.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderDoctrine() {
    const options = [
      {
        key: "confidence_scoring" as const,
        label: "Confidence Scoring",
        description:
          "The agent reports confidence scores (0-1) with reasoning for key claims and recommendations.",
      },
      {
        key: "knowledge_graph" as const,
        label: "Knowledge Graph",
        description:
          "The agent can publish findings and entities to the shared knowledge graph for others to discover.",
      },
      {
        key: "approval_required" as const,
        label: "Approval Required",
        description:
          "Significant actions go through human approval before execution. Adds a review step.",
      },
      {
        key: "proactive" as const,
        label: "Proactive",
        description:
          "The agent can suggest actions and insights without being directly asked. More autonomous.",
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Doctrine Configuration
          </label>
          <p className="mb-4 text-xs text-muted-foreground">
            The Doctrine framework defines how your agent behaves. Toggle the
            capabilities that make sense for this agent.
          </p>
        </div>

        <div className="space-y-3">
          {options.map((opt) => (
            <div
              key={opt.key}
              className={cn(
                "flex items-center justify-between gap-4 rounded-lg border p-4 transition-all",
                doctrineConfig[opt.key]
                  ? "border-primary/40 bg-primary/5"
                  : "border-border"
              )}
            >
              <div>
                <div className="text-sm font-medium">{opt.label}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {opt.description}
                </p>
              </div>
              <button
                onClick={() =>
                  setDoctrineConfig({
                    ...doctrineConfig,
                    [opt.key]: !doctrineConfig[opt.key],
                  })
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  doctrineConfig[opt.key] ? "bg-primary" : "bg-muted"
                )}
                role="switch"
                aria-checked={doctrineConfig[opt.key]}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg transition-transform",
                    doctrineConfig[opt.key]
                      ? "translate-x-5"
                      : "translate-x-0"
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderVisibility() {
    const options = [
      {
        key: "cohort",
        label: "Cohort 84",
        description:
          "Everyone in the cohort can see and use this agent.",
        icon: Users,
      },
      {
        key: "workspace",
        label: "Workspace Only",
        description:
          "Only members of a specific workspace can see this agent.",
        icon: Building,
      },
      {
        key: "private",
        label: "Private",
        description: "Only you can see and use this agent.",
        icon: Lock,
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Visibility</label>
          <p className="mb-4 text-xs text-muted-foreground">
            Choose who can see and use this agent.
          </p>
        </div>

        <div className="space-y-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => setVisibility(opt.key)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-all",
                  visibility === opt.key
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/30"
                )}
              >
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {opt.description}
                  </p>
                </div>
                {visibility === opt.key && (
                  <Check className="ml-auto h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Workspace selector */}
        {visibility === "workspace" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Select Workspace
            </label>
            {workspaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                You are not a member of any workspaces.
              </p>
            ) : (
              <div className="space-y-2">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => setSelectedWorkspace(ws.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all",
                      selectedWorkspace === ws.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    )}
                  >
                    <Building className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{ws.name}</div>
                      {ws.description && (
                        <p className="text-xs text-muted-foreground">
                          {ws.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderReview() {
    const visLabel =
      visibility === "cohort"
        ? "Cohort 84"
        : visibility === "workspace"
        ? `Workspace: ${workspaces.find((w) => w.id === selectedWorkspace)?.name || "?"}`
        : "Private";

    return (
      <div className="space-y-6">
        <div className="text-center">
          <span className="text-4xl">{icon}</span>
          <h2 className="mt-2 text-xl font-bold">{name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{purpose}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Category
            </h4>
            <p className="text-sm capitalize">{category}</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Visibility
            </h4>
            <p className="text-sm">{visLabel}</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Expertise ({expertise.length})
            </h4>
            {expertise.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {expertise.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">None specified</p>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Tools ({selectedTools.length})
            </h4>
            {selectedTools.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selectedTools.map((name) => {
                  const tool = allTools.find((t) => t.name === name);
                  return (
                    <span
                      key={name}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {tool?.icon} {tool?.display_name || name}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">None selected</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Doctrine Configuration
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(doctrineConfig).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    val ? "bg-green-500" : "bg-gray-400"
                  )}
                />
                <span className="capitalize">
                  {key.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-blue-500/20 bg-blue-950/10 p-3">
          <p className="text-xs text-blue-300">
            Claude will synthesize a professional system prompt based on your
            specifications. The agent will be immediately available after
            creation.
          </p>
        </div>
      </div>
    );
  }

  const stepRenderers = [
    renderPurpose,
    renderExpertise,
    renderTools,
    renderDoctrine,
    renderVisibility,
    renderReview,
  ];

  return (
    <div className="flex min-h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Build an Agent</h1>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>
                Step {currentStep + 1} of {STEPS.length}:{" "}
                {STEPS[currentStep].label}
              </span>
              <span>
                {Math.round(((currentStep + 1) / STEPS.length) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{
                  width: `${((currentStep + 1) / STEPS.length) * 100}%`,
                }}
              />
            </div>
            <div className="mt-2 flex justify-between">
              {STEPS.map((step, i) => (
                <button
                  key={step.key}
                  onClick={() => {
                    if (i <= currentStep) setCurrentStep(i);
                  }}
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    i <= currentStep
                      ? "text-primary cursor-pointer"
                      : "text-muted-foreground/50 cursor-default"
                  )}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-md border border-red-500/30 bg-red-950/20 p-3">
              <p className="text-sm text-red-300">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-1 text-xs text-red-400 hover:text-red-300"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Step content */}
          {stepRenderers[currentStep]()}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between border-t pt-6">
            <button
              onClick={() => {
                if (currentStep === 0) {
                  router.push("/agent-repo");
                } else {
                  setCurrentStep(currentStep - 1);
                }
              }}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
              {currentStep === 0 ? "Cancel" : "Back"}
            </button>

            {currentStep === STEPS.length - 1 ? (
              <button
                onClick={handleCreate}
                disabled={creating || !canProceed()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Create Agent
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!canProceed()}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
