"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Loader2,
  Upload,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { AgentStatus } from "@/components/agent-status";
import { DocumentUpload } from "@/components/document-upload";
import {
  getAgentByUser,
  getOnboardingDocs,
  updateAgent,
  uploadOnboardingDoc,
  synthesizeProfile,
  getNotifications,
  getAnatomy,
} from "@/lib/api";
import type { AgentProfile, OnboardingDocData, Notification, AgentAnatomy } from "@/lib/api";
import { AnatomyDisplay } from "@/components/anatomy-display";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRealtimeAgentStatus } from "@/lib/realtime";

export default function ProfilePage() {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [docs, setDocs] = useState<OnboardingDocData[]>([]);
  const [activity, setActivity] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showReupload, setShowReupload] = useState(false);
  const [reuploadType, setReuploadType] = useState<"idp" | "ethics" | "insights" | null>(null);
  const [reuploadState, setReuploadState] = useState({ uploading: false, progress: 0, uploaded: false, fileName: "" });
  const [showActivity, setShowActivity] = useState(false);
  const [anatomy, setAnatomy] = useState<AgentAnatomy | null>(null);

  // Editable fields
  const [agentName, setAgentName] = useState("");
  const [expertise, setExpertise] = useState("");
  const [goals, setGoals] = useState("");
  const [values, setValues] = useState("");
  const [communicationStyle, setCommunicationStyle] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState(2);

  const loadProfile = useCallback(async (uid: string) => {
    try {
      const [profile, uploadedDocs, notifs, anatomyData] = await Promise.all([
        getAgentByUser(uid),
        getOnboardingDocs(uid).catch(() => []),
        getNotifications(uid, false, 20).catch(() => []),
        getAnatomy(uid).catch(() => null),
      ]);
      setAgent(profile);
      setDocs(uploadedDocs);
      setActivity(notifs);
      setAnatomy(anatomyData);

      // Populate editable fields
      setAgentName(profile.agent_name);
      setExpertise(profile.expertise.join(", "));
      setGoals(profile.goals.join(", "));
      setValues(profile.values.join(", "));
      setCommunicationStyle(profile.communication_style || "");
      setAutonomyLevel(profile.autonomy_level);
    } catch {
      // Agent may not exist
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      loadProfile(user.id);
    }
    init();
  }, [loadProfile]);

  // Live agent status
  useRealtimeAgentStatus(agent?.id || null, () => {
    if (userId) loadProfile(userId);
  });

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    try {
      const updated = await updateAgent(agent.id, {
        agent_name: agentName.trim(),
        expertise: expertise.split(",").map((s) => s.trim()).filter(Boolean),
        goals: goals.split(",").map((s) => s.trim()).filter(Boolean),
        values: values.split(",").map((s) => s.trim()).filter(Boolean),
        communication_style: communicationStyle.trim() || undefined,
        autonomy_level: autonomyLevel,
      });
      setAgent(updated);
    } catch {
      alert("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleReuploadDoc(file: File) {
    if (!userId || !reuploadType) return;

    setReuploadState({ uploading: true, progress: 10, uploaded: false, fileName: file.name });
    const interval = setInterval(() => {
      setReuploadState((prev) => ({ ...prev, progress: Math.min(prev.progress + 15, 90) }));
    }, 500);

    try {
      await uploadOnboardingDoc(userId, reuploadType, file);
      clearInterval(interval);
      setReuploadState({ uploading: false, progress: 100, uploaded: true, fileName: file.name });

      // Re-synthesize profile
      await synthesizeProfile(userId, agentName, autonomyLevel);

      // Reload profile
      await loadProfile(userId);
      setShowReupload(false);
      setReuploadType(null);
      setReuploadState({ uploading: false, progress: 0, uploaded: false, fileName: "" });
    } catch (err) {
      clearInterval(interval);
      setReuploadState({ uploading: false, progress: 0, uploaded: false, fileName: "" });
      alert(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  const docTypeLabels: Record<string, string> = {
    idp: "Individual Development Plan",
    ethics: "Ethics / Worldview Paper",
    insights: "Insights Discovery Profile",
  };

  const personality = agent?.personality as Record<string, unknown> | undefined;

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center justify-between border-b px-6 max-md:pl-14">
          <h1 className="text-lg font-semibold">Agent Profile</h1>
          {agent && (
            <AgentStatus status={agent.status} agentName={agent.agent_name} />
          )}
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading profile...
          </div>
        ) : !agent ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-muted-foreground">
              No agent profile found. Complete onboarding first.
            </p>
            <button
              onClick={() => router.push("/onboarding")}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to Onboarding
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
            {/* Agent Identity */}
            <div className="rounded-lg border bg-card p-5">
              <h2 className="font-medium">Agent Identity</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm font-medium">Agent Name</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Autonomy Level: {autonomyLevel}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={autonomyLevel}
                    onChange={(e) => setAutonomyLevel(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>1 — Ask before everything</span>
                    <span>5 — Act freely</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Anatomy */}
            {anatomy && (
              <div className="rounded-lg border bg-card p-5">
                <h2 className="mb-4 font-medium">Agent Anatomy</h2>
                <AnatomyDisplay anatomy={anatomy} />
              </div>
            )}

            {/* Extracted Profile */}
            <div className="rounded-lg border bg-card p-5">
              <h2 className="font-medium">Extracted Profile</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Comma-separated values. Edit and save to update your agent.
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm font-medium">Expertise</label>
                  <input
                    type="text"
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Goals</label>
                  <input
                    type="text"
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Values</label>
                  <input
                    type="text"
                    value={values}
                    onChange={(e) => setValues(e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Communication Style</label>
                  <input
                    type="text"
                    value={communicationStyle}
                    onChange={(e) => setCommunicationStyle(e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {/* Personality (read-only from Insights) */}
              {personality && (personality.primary_color || personality.personality_summary) && (
                <div className="mt-4 rounded-md border bg-muted/30 p-4">
                  <span className="text-xs font-medium text-muted-foreground">Personality (from Insights)</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {personality.primary_color && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Primary: {personality.primary_color as string}
                      </span>
                    )}
                    {personality.secondary_color && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                        Secondary: {personality.secondary_color as string}
                      </span>
                    )}
                  </div>
                  {personality.personality_summary && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {personality.personality_summary as string}
                    </p>
                  )}
                  {Array.isArray(personality.strengths) && (personality.strengths as string[]).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(personality.strengths as string[]).map((s, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800 dark:bg-orange-950 dark:text-orange-200"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </button>
            </div>

            {/* Re-upload Documents */}
            <div className="rounded-lg border bg-card p-5">
              <button
                onClick={() => setShowReupload(!showReupload)}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-medium">Re-upload Documents</h2>
                </div>
                {showReupload ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload updated documents to re-synthesize your agent profile.
              </p>

              {/* Currently uploaded docs */}
              {docs.length > 0 && (
                <div className="mt-3 space-y-1">
                  {docs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span className="font-medium">{docTypeLabels[doc.doc_type] || doc.doc_type}:</span>
                      <span className="truncate">{doc.file_name}</span>
                    </div>
                  ))}
                </div>
              )}

              {showReupload && (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    {(["idp", "ethics", "insights"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setReuploadType(type);
                          setReuploadState({ uploading: false, progress: 0, uploaded: false, fileName: "" });
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                          reuploadType === type
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  {reuploadType && (
                    <DocumentUpload
                      label={`Upload ${docTypeLabels[reuploadType]}`}
                      description={`Re-upload your ${reuploadType.toUpperCase()} document`}
                      accept={reuploadType === "ethics" ? ".pdf,.docx" : ".pdf"}
                      onFileSelect={(f) => handleReuploadDoc(f)}
                      uploading={reuploadState.uploading}
                      progress={reuploadState.progress}
                      uploaded={reuploadState.uploaded}
                      fileName={reuploadState.fileName}
                      onClear={() =>
                        setReuploadState({ uploading: false, progress: 0, uploaded: false, fileName: "" })
                      }
                    />
                  )}
                </div>
              )}
            </div>

            {/* Activity Log */}
            <div className="rounded-lg border bg-card p-5">
              <button
                onClick={() => setShowActivity(!showActivity)}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-medium">Activity Log</h2>
                </div>
                {showActivity ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showActivity && (
                <div className="mt-4 space-y-2">
                  {activity.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No activity yet.
                    </p>
                  ) : (
                    activity.map((notif) => (
                      <div
                        key={notif.id}
                        className="flex items-start gap-3 rounded-md border p-3"
                      >
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gray-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{notif.title}</p>
                          {notif.body && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {notif.body}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {new Date(notif.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
