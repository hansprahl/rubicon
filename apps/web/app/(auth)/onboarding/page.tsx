"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Upload, FileText, Eye, Bot, ArrowLeft, ArrowRight, Loader2, Link2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentUpload } from "@/components/document-upload";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  updateOnboardingProfile,
  uploadOnboardingDoc,
  getOnboardingDocs,
  synthesizeProfile,
  type OnboardingDocData,
} from "@/lib/api";

const STEPS = [
  { title: "Your Profile", icon: User },
  { title: "Connect Google", icon: Link2 },
  { title: "Upload IDP", icon: Upload },
  { title: "Upload Ethics Paper", icon: FileText },
  { title: "Upload Insights Profile", icon: FileText },
  { title: "Review Profile", icon: Eye },
  { title: "Deeper Context", icon: FileText },
  { title: "Name Your Agent", icon: Bot },
];

const GOOGLE_SERVICES = [
  {
    id: "drive",
    name: "Google Drive",
    icon: "📁",
    description: "Your agent can read documents you've shared or created — class materials, project files, notes. This helps it understand your work beyond the three EMBA papers.",
    detail: "Read-only access. Your agent never modifies or deletes files.",
    scope: "https://www.googleapis.com/auth/drive.readonly",
  },
  {
    id: "calendar",
    name: "Google Calendar",
    icon: "📅",
    description: "Your agent knows your schedule — when you're available, upcoming deadlines, class times. Useful when coordinating group work in shared workspaces.",
    detail: "Read-only access. Your agent never creates or changes events.",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
  },
  {
    id: "gmail",
    name: "Gmail",
    icon: "✉️",
    description: "Your agent can surface relevant emails when working in shared workspaces — threads about group projects, professor feedback, cohort communications.",
    detail: "Read-only access. Your agent never sends, deletes, or modifies emails. You can revoke access anytime.",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
  },
];

const ENRICHMENT_QUESTIONS = [
  {
    id: "current_work",
    question: "What are you building or working on right now?",
    placeholder: "Projects, ventures, research, role at work...",
  },
  {
    id: "biggest_bet",
    question: "What's your biggest professional bet or conviction?",
    placeholder: "The thing you believe that others might not...",
  },
  {
    id: "decision_framework",
    question: "How do you make important decisions?",
    placeholder: "Frameworks, gut feel, data-driven, consult others...",
  },
  {
    id: "superpower",
    question: "What do people come to you for?",
    placeholder: "The thing you're known for in your circles...",
  },
  {
    id: "blind_spot",
    question: "What's something you're actively working to improve?",
    placeholder: "A growth area you're honest about...",
  },
  {
    id: "north_star",
    question: "What does success look like for you in 5 years?",
    placeholder: "Not just career — life, impact, relationships...",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1: Profile
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Steps 2-4: Documents
  const [docs, setDocs] = useState<Record<string, { file: File | null; uploading: boolean; progress: number; uploaded: boolean; fileName: string; parsed: OnboardingDocData | null }>>({
    idp: { file: null, uploading: false, progress: 0, uploaded: false, fileName: "", parsed: null },
    ethics: { file: null, uploading: false, progress: 0, uploaded: false, fileName: "", parsed: null },
    insights: { file: null, uploading: false, progress: 0, uploaded: false, fileName: "", parsed: null },
  });

  // Step 5: Review data
  const [parsedDocs, setParsedDocs] = useState<OnboardingDocData[]>([]);

  // Step 1: Google connections
  const [googleServices, setGoogleServices] = useState<Record<string, boolean>>({
    drive: false,
    calendar: false,
    gmail: false,
  });
  const [googleConnected, setGoogleConnected] = useState<Record<string, boolean>>({});

  // Step 6: Enrichment questions
  const [enrichmentAnswers, setEnrichmentAnswers] = useState<Record<string, string>>({});

  // Step 6: Agent config
  const [agentName, setAgentName] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState(2);

  useEffect(() => {
    async function loadUser() {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      setDisplayName(user.user_metadata?.full_name || user.email?.split("@")[0] || "");
      setAvatarUrl(user.user_metadata?.avatar_url || "");
    }
    loadUser();
  }, [router]);

  async function handleUploadDoc(docType: "idp" | "ethics" | "insights", file: File) {
    if (!userId) return;

    setDocs((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], file, uploading: true, progress: 10, fileName: file.name },
    }));

    // Simulate progress while upload + parsing happens
    const interval = setInterval(() => {
      setDocs((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], progress: Math.min(prev[docType].progress + 15, 90) },
      }));
    }, 500);

    try {
      const result = await uploadOnboardingDoc(userId, docType, file);
      clearInterval(interval);
      setDocs((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], uploading: false, progress: 100, uploaded: true, parsed: result },
      }));
    } catch (err) {
      clearInterval(interval);
      setDocs((prev) => ({
        ...prev,
        [docType]: { file: null, uploading: false, progress: 0, uploaded: false, fileName: "", parsed: null },
      }));
      alert(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  function clearDoc(docType: "idp" | "ethics" | "insights") {
    setDocs((prev) => ({
      ...prev,
      [docType]: { file: null, uploading: false, progress: 0, uploaded: false, fileName: "", parsed: null },
    }));
  }

  async function handleGoToReview() {
    if (!userId) return;
    setLoading(true);
    try {
      const allDocs = await getOnboardingDocs(userId);
      setParsedDocs(allDocs);
      setStep(4);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    if (!userId || !agentName.trim()) return;
    setLoading(true);
    try {
      // Filter out empty answers
      const answers = Object.fromEntries(
        Object.entries(enrichmentAnswers).filter(([, v]) => v.trim())
      );
      await synthesizeProfile(userId, agentName.trim(), autonomyLevel, Object.keys(answers).length > 0 ? answers : undefined);
      router.push("/dashboard");
    } catch (err) {
      alert(`Failed to create agent: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileNext() {
    if (!userId || !displayName.trim()) return;
    setLoading(true);
    try {
      await updateOnboardingProfile(userId, displayName.trim(), avatarUrl || undefined);
      setAgentName(`${displayName.trim()}'s Agent`);
      setStep(1);
    } finally {
      setLoading(false);
    }
  }

  const canGoNext = () => {
    switch (step) {
      case 0: return displayName.trim().length > 0;
      case 1: return true; // Google connection is optional
      case 2: return docs.idp.uploaded;
      case 3: return docs.ethics.uploaded;
      case 4: return docs.insights.uploaded;
      case 5: return true;
      case 6: return true; // enrichment is optional
      case 7: return agentName.trim().length > 0;
      default: return false;
    }
  };

  function getParsedData(docType: string) {
    const doc = parsedDocs.find((d) => d.doc_type === docType);
    return doc?.parsed_data || {};
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Progress bar */}
      <div className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                    ? "border-2 border-primary text-primary"
                    : "border border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <span className="hidden text-xs sm:block">{s.title}</span>
              {i < STEPS.length - 1 && (
                <div className={`h-px flex-1 ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
        {/* Step 0: Display Name + Avatar */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Welcome to Rubicon</h2>
              <p className="mt-1 text-muted-foreground">
                Let&apos;s set up your profile and create your digital twin.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Avatar URL (optional)</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Connect Google */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Connect Your Google Account</h2>
              <p className="mt-1 text-muted-foreground">
                Give your agent access to your Google services so it can understand your
                work, schedule, and communications. This makes your digital twin
                significantly smarter — but it&apos;s entirely your choice.
              </p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div className="text-sm">
                  <p className="font-medium text-blue-800 dark:text-blue-200">Your data, your rules</p>
                  <p className="mt-1 text-blue-700 dark:text-blue-300">
                    All access is <strong>read-only</strong>. Your agent never modifies, sends, or deletes anything.
                    You can revoke access anytime from your profile settings. Data stays in your account —
                    it&apos;s used to give your agent context, not stored or shared with other members.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {GOOGLE_SERVICES.map((service) => (
                <div
                  key={service.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    googleServices[service.id]
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-4">
                    <input
                      type="checkbox"
                      checked={googleServices[service.id] || false}
                      onChange={(e) =>
                        setGoogleServices((prev) => ({
                          ...prev,
                          [service.id]: e.target.checked,
                        }))
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{service.icon}</span>
                        <span className="font-medium">{service.name}</span>
                        {googleConnected[service.id] && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {service.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {service.detail}
                      </p>
                    </div>
                  </label>
                </div>
              ))}
            </div>

            <p className="text-center text-xs text-muted-foreground">
              You can always connect or disconnect services later from your profile.
            </p>
          </div>
        )}

        {/* Step 2: Upload IDP */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Individual Development Plan</h2>
              <p className="mt-1 text-muted-foreground">
                Upload your IDP from Executive Leadership. We&apos;ll extract your goals,
                development areas, and leadership priorities.
              </p>
            </div>
            <DocumentUpload
              label="Upload IDP (PDF)"
              description="Your Individual Development Plan from Executive Leadership"
              accept=".pdf"
              onFileSelect={(f) => handleUploadDoc("idp", f)}
              uploading={docs.idp.uploading}
              progress={docs.idp.progress}
              uploaded={docs.idp.uploaded}
              fileName={docs.idp.fileName}
              onClear={() => clearDoc("idp")}
            />
            {docs.idp.parsed && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-medium">Extracted Data Preview</h3>
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {docs.idp.parsed.parsed_data?.goals && (
                    <p><strong>Goals:</strong> {(docs.idp.parsed.parsed_data.goals as string[]).join(", ")}</p>
                  )}
                  {docs.idp.parsed.parsed_data?.expertise && (
                    <p><strong>Expertise:</strong> {(docs.idp.parsed.parsed_data.expertise as string[]).join(", ")}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Upload Ethics Paper */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Ethics / Worldview Paper</h2>
              <p className="mt-1 text-muted-foreground">
                Upload your Ethics paper from Business Ethics. We&apos;ll extract your values,
                ethical framework, and worldview.
              </p>
            </div>
            <DocumentUpload
              label="Upload Ethics Paper (PDF or DOCX)"
              description="Your Worldview / Ethics paper from Business Ethics"
              accept=".pdf,.docx"
              onFileSelect={(f) => handleUploadDoc("ethics", f)}
              uploading={docs.ethics.uploading}
              progress={docs.ethics.progress}
              uploaded={docs.ethics.uploaded}
              fileName={docs.ethics.fileName}
              onClear={() => clearDoc("ethics")}
            />
            {docs.ethics.parsed && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-medium">Extracted Data Preview</h3>
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {docs.ethics.parsed.parsed_data?.values && (
                    <p><strong>Values:</strong> {(docs.ethics.parsed.parsed_data.values as string[]).join(", ")}</p>
                  )}
                  {docs.ethics.parsed.parsed_data?.ethical_framework && (
                    <p><strong>Framework:</strong> {docs.ethics.parsed.parsed_data.ethical_framework as string}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Upload Insights Profile */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Insights Discovery Profile</h2>
              <p className="mt-1 text-muted-foreground">
                Upload your Insights personality profile. We&apos;ll extract your color energies,
                strengths, and communication style.
              </p>
            </div>
            <DocumentUpload
              label="Upload Insights Profile (PDF)"
              description="Your Insights Discovery personality assessment"
              accept=".pdf"
              onFileSelect={(f) => handleUploadDoc("insights", f)}
              uploading={docs.insights.uploading}
              progress={docs.insights.progress}
              uploaded={docs.insights.uploaded}
              fileName={docs.insights.fileName}
              onClear={() => clearDoc("insights")}
            />
            {docs.insights.parsed && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-medium">Extracted Data Preview</h3>
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {docs.insights.parsed.parsed_data?.primary_color && (
                    <p><strong>Primary Color:</strong> {docs.insights.parsed.parsed_data.primary_color as string}</p>
                  )}
                  {docs.insights.parsed.parsed_data?.strengths && (
                    <p><strong>Strengths:</strong> {(docs.insights.parsed.parsed_data.strengths as string[]).join(", ")}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review Synthesized Profile */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Review Your Agent Profile</h2>
              <p className="mt-1 text-muted-foreground">
                Here&apos;s what we extracted from your documents. This will shape how your
                digital twin thinks and communicates.
              </p>
            </div>

            {/* IDP Section */}
            <div className="rounded-lg border bg-card p-5">
              <h3 className="font-medium">Goals &amp; Development</h3>
              <p className="mt-1 text-xs text-muted-foreground">From your Individual Development Plan</p>
              <div className="mt-3 space-y-2">
                {(getParsedData("idp") as Record<string, unknown>).goals && (
                  <div>
                    <span className="text-xs font-medium">Goals</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {((getParsedData("idp") as Record<string, unknown>).goals as string[]).map((g, i) => (
                        <span key={i} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(getParsedData("idp") as Record<string, unknown>).expertise && (
                  <div>
                    <span className="text-xs font-medium">Expertise</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {((getParsedData("idp") as Record<string, unknown>).expertise as string[]).map((e, i) => (
                        <span key={i} className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800 dark:bg-purple-950 dark:text-purple-200">{e}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ethics Section */}
            <div className="rounded-lg border bg-card p-5">
              <h3 className="font-medium">Values &amp; Worldview</h3>
              <p className="mt-1 text-xs text-muted-foreground">From your Ethics / Worldview paper</p>
              <div className="mt-3 space-y-2">
                {(getParsedData("ethics") as Record<string, unknown>).values && (
                  <div>
                    <span className="text-xs font-medium">Values</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {((getParsedData("ethics") as Record<string, unknown>).values as string[]).map((v, i) => (
                        <span key={i} className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-200">{v}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(getParsedData("ethics") as Record<string, unknown>).ethical_framework && (
                  <div>
                    <span className="text-xs font-medium">Ethical Framework</span>
                    <p className="mt-1 text-xs text-muted-foreground">{(getParsedData("ethics") as Record<string, unknown>).ethical_framework as string}</p>
                  </div>
                )}
                {(getParsedData("ethics") as Record<string, unknown>).worldview && (
                  <div>
                    <span className="text-xs font-medium">Worldview</span>
                    <p className="mt-1 text-xs text-muted-foreground">{(getParsedData("ethics") as Record<string, unknown>).worldview as string}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Insights Section */}
            <div className="rounded-lg border bg-card p-5">
              <h3 className="font-medium">Personality &amp; Communication</h3>
              <p className="mt-1 text-xs text-muted-foreground">From your Insights Discovery profile</p>
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  {(getParsedData("insights") as Record<string, unknown>).primary_color && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      Primary: {(getParsedData("insights") as Record<string, unknown>).primary_color as string}
                    </span>
                  )}
                  {(getParsedData("insights") as Record<string, unknown>).secondary_color && (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      Secondary: {(getParsedData("insights") as Record<string, unknown>).secondary_color as string}
                    </span>
                  )}
                </div>
                {(getParsedData("insights") as Record<string, unknown>).strengths && (
                  <div>
                    <span className="text-xs font-medium">Strengths</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {((getParsedData("insights") as Record<string, unknown>).strengths as string[]).map((s, i) => (
                        <span key={i} className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800 dark:bg-orange-950 dark:text-orange-200">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(getParsedData("insights") as Record<string, unknown>).communication_style && (
                  <div>
                    <span className="text-xs font-medium">Communication Style</span>
                    <p className="mt-1 text-xs text-muted-foreground">{(getParsedData("insights") as Record<string, unknown>).communication_style as string}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Enrichment Questions */}
        {step === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Tell Us More</h2>
              <p className="mt-1 text-muted-foreground">
                Your documents capture how you think and what you value. These questions
                fill in what you&apos;re doing and where you&apos;re headed. All optional — answer
                what feels right.
              </p>
            </div>
            <div className="space-y-5">
              {ENRICHMENT_QUESTIONS.map((q) => (
                <div key={q.id}>
                  <label className="text-sm font-medium">{q.question}</label>
                  <textarea
                    value={enrichmentAnswers[q.id] || ""}
                    onChange={(e) =>
                      setEnrichmentAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                    placeholder={q.placeholder}
                    rows={2}
                    className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 7: Name Agent + Autonomy */}
        {step === 7 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Name Your Agent</h2>
              <p className="mt-1 text-muted-foreground">
                Give your digital twin a name and set how independently it should operate.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Agent Name</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g., Hans's Agent"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <p className="mt-2 text-xs text-muted-foreground">
                  {autonomyLevel === 1 && "Your agent will ask for approval before every action."}
                  {autonomyLevel === 2 && "Your agent will act on routine tasks but ask for approval on important decisions."}
                  {autonomyLevel === 3 && "Your agent will handle most tasks independently, asking only for high-stakes decisions."}
                  {autonomyLevel === 4 && "Your agent will operate mostly independently, notifying you of significant actions."}
                  {autonomyLevel === 5 && "Your agent will act freely, publishing drafts and making decisions without waiting."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-auto flex items-center justify-between pt-8">
          <Button
            variant="ghost"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {step === 0 && (
            <Button onClick={handleProfileNext} disabled={!canGoNext() || loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 1 && (
            <Button onClick={() => setStep(2)}>
              {Object.values(googleServices).some(Boolean) ? "Connect & Continue" : "Skip for Now"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step >= 2 && step < 4 && (
            <Button onClick={() => setStep(step + 1)} disabled={!canGoNext() || loading}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 4 && (
            <Button onClick={handleGoToReview} disabled={!canGoNext() || loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Review Profile
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 5 && (
            <Button onClick={() => setStep(6)}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 6 && (
            <Button onClick={() => setStep(7)}>
              {Object.values(enrichmentAnswers).some((v) => v.trim()) ? "Continue" : "Skip"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 7 && (
            <Button onClick={handleFinish} disabled={!canGoNext() || loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create My Agent
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
