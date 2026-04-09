"use client";

import { useState } from "react";
import type { AgentAnatomy, BodySystem } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  dormant: "bg-gray-300 dark:bg-gray-600",
  developing: "bg-yellow-400 dark:bg-yellow-500",
  active: "bg-green-400 dark:bg-green-500",
  strong: "bg-emerald-500 dark:bg-emerald-400",
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  dormant: "text-gray-500 dark:text-gray-400",
  developing: "text-yellow-600 dark:text-yellow-400",
  active: "text-green-600 dark:text-green-400",
  strong: "text-emerald-600 dark:text-emerald-300",
};

const HEARTBEAT_COLORS: Record<string, string> = {
  flatline: "text-gray-400",
  weak: "text-red-500",
  steady: "text-yellow-500",
  strong: "text-green-500",
  thriving: "text-emerald-400",
};

const SYSTEM_ICONS: Record<string, string> = {
  Soul: "🧭",
  Brain: "🧠",
  Heart: "❤️",
  Voice: "🗣️",
  Gut: "🔮",
  Hands: "🤲",
  Muscle: "💪",
  "Connective Tissue": "🔗",
  Skin: "🪪",
  Blood: "🩸",
};

const SYSTEM_IMPROVE_TIPS: Record<string, string> = {
  Soul: "Define your North Star — your mission, guiding principles, vision, and non-negotiables. Go to the North Star page to build it.",
  Brain: "Upload your Individual Development Plan (IDP) to teach your agent your goals and expertise.",
  Heart: "Upload your Ethics paper to give your agent a moral compass and value system.",
  Voice: "Upload your Insights Discovery profile to match your communication style.",
  Gut: "Answer the enrichment questions on your profile page to share deeper context.",
  Hands: "Tools are built in — your agent gains hands as the platform adds capabilities.",
  Muscle: "Chat with your agent, have it publish findings, and complete tasks to build muscle.",
  "Connective Tissue": "Join workspaces and create knowledge graph relationships.",
  Skin: "Complete your profile — name, expertise, values, communication style, and autonomy level.",
  Blood: "Use your agent regularly. Send messages, trigger events, and stay active.",
};

interface AnatomyDisplayProps {
  anatomy: AgentAnatomy;
  compact?: boolean;
}

function SystemCard({ system, onSelect }: { system: BodySystem; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent"
    >
      <span className="text-xl">{SYSTEM_ICONS[system.name] || "🫁"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{system.name}</span>
          <span
            className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[system.status]}`}
          />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {system.detail}
        </p>
      </div>
      <div className="text-right">
        <span className={`text-xs font-medium ${STATUS_TEXT_COLORS[system.status]}`}>
          {Math.round(system.health * 100)}%
        </span>
      </div>
    </button>
  );
}

function SystemDetail({
  system,
  onClose,
}: {
  system: BodySystem;
  onClose: () => void;
}) {
  const tip = SYSTEM_IMPROVE_TIPS[system.name] || "";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{SYSTEM_ICONS[system.name] || "🫁"}</span>
          <h3 className="font-medium">{system.name}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_TEXT_COLORS[system.status]} ${STATUS_COLORS[system.status].replace("bg-", "bg-opacity-20 bg-")}`}
          >
            {system.status}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className={`h-2 rounded-full transition-all ${STATUS_COLORS[system.status]}`}
            style={{ width: `${system.health * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Health: {Math.round(system.health * 100)}%
        </p>
      </div>

      <p className="mt-3 text-sm">{system.detail}</p>

      {system.status !== "strong" && tip && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
          <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
            How to strengthen
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{tip}</p>
        </div>
      )}
    </div>
  );
}

function HeartbeatPulse({ status, bpm }: { status: string; bpm: number }) {
  const color = HEARTBEAT_COLORS[status] || "text-gray-400";
  const animDuration = bpm > 0 ? `${60 / bpm}s` : "0s";

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`h-8 w-8 ${color}`}
          style={
            bpm > 0
              ? {
                  animation: `pulse ${animDuration} ease-in-out infinite`,
                }
              : {}
          }
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        {bpm > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex h-3 w-3`}
          >
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${color.replace("text-", "bg-")}`}
              style={{
                animation: `ping ${animDuration} cubic-bezier(0, 0, 0.2, 1) infinite`,
              }}
            />
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${color.replace("text-", "bg-")}`}
            />
          </span>
        )}
      </div>
      <div>
        <p className={`text-sm font-semibold capitalize ${color}`}>
          {status}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {bpm > 0 ? `${bpm} bpm` : "No pulse"}
        </p>
      </div>
    </div>
  );
}

export function AnatomyDisplay({ anatomy, compact = false }: AnatomyDisplayProps) {
  const [selected, setSelected] = useState<BodySystem | null>(null);

  const systems: BodySystem[] = [
    anatomy.soul,
    anatomy.brain,
    anatomy.heart,
    anatomy.voice,
    anatomy.gut,
    anatomy.hands,
    anatomy.muscle,
    anatomy.connective_tissue,
    anatomy.skin,
    anatomy.blood,
  ];

  if (compact) {
    // Compact view for dashboard
    const activeCount = systems.filter((s) => s.status === "active" || s.status === "strong").length;
    return (
      <div className="space-y-2">
        <HeartbeatPulse
          status={anatomy.heartbeat.status}
          bpm={anatomy.heartbeat.bpm}
        />
        <div className="flex flex-wrap gap-1.5">
          {systems.map((s) => (
            <div
              key={s.name}
              title={`${s.name}: ${s.status} (${Math.round(s.health * 100)}%)`}
              className="flex items-center gap-1"
            >
              <span className="text-xs">{SYSTEM_ICONS[s.name] || "🫁"}</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[s.status]}`}
              />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {activeCount}/{systems.length} systems active
        </p>
      </div>
    );
  }

  // Full anatomy display
  return (
    <div className="space-y-4">
      {/* Heartbeat header */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <HeartbeatPulse
          status={anatomy.heartbeat.status}
          bpm={anatomy.heartbeat.bpm}
        />
        <div className="text-right">
          <p className="text-2xl font-bold">
            {Math.round(anatomy.overall_health * 100)}%
          </p>
          <p className="text-[10px] text-muted-foreground">overall health</p>
        </div>
      </div>

      {/* Selected system detail */}
      {selected && (
        <SystemDetail system={selected} onClose={() => setSelected(null)} />
      )}

      {/* Soul — the core, visually distinct */}
      {anatomy.soul && (
        <button
          onClick={() =>
            setSelected(selected?.name === "Soul" ? null : anatomy.soul)
          }
          className="flex w-full items-center gap-4 rounded-lg border-2 border-amber-500/30 bg-gradient-to-r from-amber-950/20 to-card p-4 text-left transition-colors hover:border-amber-500/50"
        >
          <span className="text-3xl">🧭</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Soul — North Star</span>
              <span
                className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[anatomy.soul.status]}`}
              />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {anatomy.soul.detail}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`text-xs font-medium ${STATUS_TEXT_COLORS[anatomy.soul.status]}`}
            >
              {Math.round(anatomy.soul.health * 100)}%
            </span>
          </div>
        </button>
      )}

      {/* System grid — all other systems (skip Soul since it's displayed above) */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {systems
          .filter((s) => s.name !== "Soul")
          .map((system) => (
            <SystemCard
              key={system.name}
              system={system}
              onSelect={() =>
                setSelected(selected?.name === system.name ? null : system)
              }
            />
          ))}
      </div>
    </div>
  );
}

export function AnatomyCompact({ anatomy }: { anatomy: AgentAnatomy }) {
  return <AnatomyDisplay anatomy={anatomy} compact />;
}
