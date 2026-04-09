"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Star,
  Compass,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Plus,
  X,
} from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import {
  getNorthStar,
  saveNorthStar,
  guidedSynthesis,
  getNorthStarQuestions,
  deleteNorthStar,
} from "@/lib/api";
import type { NorthStar, GuidedQuestion } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Mode = "loading" | "view" | "build" | "edit" | "preview";

export default function NorthStarPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [northStar, setNorthStar] = useState<NorthStar | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState<string | null>(null);

  // Guided wizard state
  const [questions, setQuestions] = useState<GuidedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [synthesizing, setSynthesizing] = useState(false);
  const [_preview, setPreview] = useState<NorthStar | null>(null);

  // Edit state
  const [editMission, setEditMission] = useState("");
  const [editPrinciples, setEditPrinciples] = useState<
    { title: string; description: string }[]
  >([]);
  const [editVision, setEditVision] = useState("");
  const [editNonNeg, setEditNonNeg] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadNorthStar = useCallback(async (uid: string) => {
    try {
      const ns = await getNorthStar(uid);
      setNorthStar(ns);
      setMode("view");
    } catch {
      // No north star yet — show build mode
      setMode("build");
      try {
        const { questions: qs } = await getNorthStarQuestions(uid);
        setQuestions(qs);
      } catch {
        // Questions endpoint failed
      }
    }
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await loadNorthStar(user.id);
    }
    init();
  }, [loadNorthStar]);

  async function startGuidedBuild() {
    if (!userId) return;
    setMode("build");
    setCurrentStep(0);
    setAnswers({});
    try {
      const { questions: qs } = await getNorthStarQuestions(userId);
      setQuestions(qs);
    } catch {
      setError("Failed to load guided questions.");
    }
  }

  async function handleSynthesize() {
    if (!userId) return;
    setSynthesizing(true);
    setError(null);
    try {
      const result = await guidedSynthesis(userId, answers);
      setPreview(result);
      setNorthStar(result);
      setMode("view");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Synthesis failed");
    } finally {
      setSynthesizing(false);
    }
  }

  function startEdit() {
    if (!northStar) return;
    setEditMission(northStar.mission);
    setEditPrinciples([...northStar.principles]);
    setEditVision(northStar.vision || "");
    setEditNonNeg([...northStar.non_negotiables]);
    setMode("edit");
  }

  async function handleSaveEdit() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveNorthStar(userId, {
        mission: editMission,
        principles: editPrinciples,
        vision: editVision || null,
        non_negotiables: editNonNeg,
      });
      setNorthStar(result);
      setMode("view");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!userId) return;
    if (!confirm("Delete your North Star? This cannot be undone.")) return;
    try {
      await deleteNorthStar(userId);
      setNorthStar(null);
      setMode("build");
      await startGuidedBuild();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function addPrinciple() {
    setEditPrinciples([...editPrinciples, { title: "", description: "" }]);
  }

  function removePrinciple(idx: number) {
    setEditPrinciples(editPrinciples.filter((_, i) => i !== idx));
  }

  function updatePrinciple(
    idx: number,
    field: "title" | "description",
    value: string
  ) {
    const updated = [...editPrinciples];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditPrinciples(updated);
  }

  function addNonNeg() {
    setEditNonNeg([...editNonNeg, ""]);
  }

  function removeNonNeg(idx: number) {
    setEditNonNeg(editNonNeg.filter((_, i) => i !== idx));
  }

  function updateNonNeg(idx: number, value: string) {
    const updated = [...editNonNeg];
    updated[idx] = value;
    setEditNonNeg(updated);
  }

  // ---------------------------------------------------------------------------
  // View Mode
  // ---------------------------------------------------------------------------
  function renderView() {
    if (!northStar) return null;
    return (
      <div className="space-y-8">
        {/* Mission */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-500/30 bg-amber-950/20">
            <Compass className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold">{northStar.mission}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Your Mission</p>
        </div>

        {/* Principles */}
        {northStar.principles.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Guiding Principles
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {northStar.principles.map((p, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-card p-4"
                >
                  <h4 className="font-medium">{p.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {p.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vision */}
        {northStar.vision && (
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Vision
            </h3>
            <p className="rounded-lg border bg-card p-4 text-sm leading-relaxed">
              {northStar.vision}
            </p>
          </div>
        )}

        {/* Non-negotiables */}
        {northStar.non_negotiables.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Non-Negotiables
            </h3>
            <div className="flex flex-wrap gap-2">
              {northStar.non_negotiables.map((nn, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full border border-red-500/30 bg-red-950/20 px-3 py-1 text-sm font-medium text-red-300"
                >
                  {nn}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 border-t pt-6">
          <button
            onClick={startEdit}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={startGuidedBuild}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Sparkles className="h-4 w-4" />
            Re-synthesize with AI
          </button>
          <button
            onClick={handleDelete}
            className="ml-auto inline-flex items-center gap-2 rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-950/30"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Build Mode (Guided Wizard)
  // ---------------------------------------------------------------------------
  function renderBuild() {
    if (questions.length === 0) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    const question = questions[currentStep];
    const isLast = currentStep === questions.length - 1;
    const canProceed = !question.required || (answers[question.id] || "").trim().length > 0;

    return (
      <div className="mx-auto max-w-xl space-y-8">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Question {currentStep + 1} of {questions.length}
            </span>
            <span>{Math.round(((currentStep + 1) / questions.length) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-amber-500 transition-all"
              style={{
                width: `${((currentStep + 1) / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium leading-relaxed">
            {question.question}
          </h3>
          {question.context && (
            <div className="rounded-md border border-blue-500/20 bg-blue-950/10 p-3">
              <p className="text-xs text-blue-300">{question.context}</p>
            </div>
          )}
          <textarea
            value={answers[question.id] || ""}
            onChange={(e) =>
              setAnswers({ ...answers, [question.id]: e.target.value })
            }
            placeholder="Your answer..."
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          {!question.required && (
            <p className="text-xs text-muted-foreground">Optional</p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {isLast ? (
            <button
              onClick={handleSynthesize}
              disabled={!canProceed || synthesizing}
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
            >
              {synthesizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Synthesizing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Build My North Star
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!canProceed}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Back to view if North Star exists */}
        {northStar && (
          <div className="text-center">
            <button
              onClick={() => setMode("view")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel and return to your North Star
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Edit Mode
  // ---------------------------------------------------------------------------
  function renderEdit() {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h2 className="text-lg font-semibold">Edit Your North Star</h2>

        {/* Mission */}
        <div>
          <label className="mb-1 block text-sm font-medium">Mission</label>
          <textarea
            value={editMission}
            onChange={(e) => setEditMission(e.target.value)}
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        {/* Principles */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">Guiding Principles</label>
            <button
              onClick={addPrinciple}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
          <div className="space-y-3">
            {editPrinciples.map((p, i) => (
              <div key={i} className="flex gap-2 rounded-lg border bg-card p-3">
                <div className="flex-1 space-y-2">
                  <input
                    value={p.title}
                    onChange={(e) => updatePrinciple(i, "title", e.target.value)}
                    placeholder="Title"
                    className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  />
                  <textarea
                    value={p.description}
                    onChange={(e) =>
                      updatePrinciple(i, "description", e.target.value)
                    }
                    placeholder="Description"
                    rows={2}
                    className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  />
                </div>
                <button
                  onClick={() => removePrinciple(i)}
                  className="self-start text-muted-foreground hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Vision */}
        <div>
          <label className="mb-1 block text-sm font-medium">Vision</label>
          <textarea
            value={editVision}
            onChange={(e) => setEditVision(e.target.value)}
            rows={3}
            placeholder="What does success look like in 5-10 years?"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        {/* Non-negotiables */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">Non-Negotiables</label>
            <button
              onClick={addNonNeg}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
          <div className="space-y-2">
            {editNonNeg.map((nn, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={nn}
                  onChange={(e) => updateNonNeg(i, e.target.value)}
                  placeholder="A value you'd never compromise"
                  className="flex-1 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
                <button
                  onClick={() => removeNonNeg(i)}
                  className="text-muted-foreground hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t pt-4">
          <button
            onClick={handleSaveEdit}
            disabled={saving || !editMission.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save North Star"
            )}
          </button>
          <button
            onClick={() => setMode("view")}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <Star className="h-6 w-6 text-amber-400" />
            <h1 className="text-2xl font-bold">North Star</h1>
          </div>

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

          {mode === "loading" && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {mode === "view" && renderView()}
          {mode === "build" && renderBuild()}
          {mode === "edit" && renderEdit()}
        </div>
      </main>
    </div>
  );
}
