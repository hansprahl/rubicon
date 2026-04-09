"use client";

import { useState } from "react";
import {
  CheckCircle,
  XCircle,
  Pencil,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ConfidenceBadge } from "@/components/confidence-badge";
import type { ApprovalWithAgent } from "@/lib/api";

const ACTION_LABELS: Record<string, string> = {
  publish_entity: "Publish Entity",
  send_message: "Send Message",
  create_relationship: "Create Relationship",
  update_estimate: "Update Estimate",
  delete_entity: "Delete Entity",
  flag_contradiction: "Flag Contradiction",
};

interface ApprovalCardProps {
  approval: ApprovalWithAgent;
  onApprove: (id: string, note?: string) => Promise<void>;
  onReject: (id: string, note?: string) => Promise<void>;
  onEditApprove: (id: string, payload: Record<string, unknown>, note?: string) => Promise<void>;
}

export function ApprovalCard({
  approval,
  onApprove,
  onReject,
  onEditApprove,
}: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [editedPayload, setEditedPayload] = useState(
    JSON.stringify(approval.payload, null, 2)
  );
  const [loading, setLoading] = useState(false);

  const actionLabel =
    ACTION_LABELS[approval.action_type] || approval.action_type;

  async function handleApprove() {
    setLoading(true);
    try {
      await onApprove(approval.id, note || undefined);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      await onReject(approval.id, note || undefined);
    } finally {
      setLoading(false);
    }
  }

  async function handleEditApprove() {
    setLoading(true);
    try {
      const parsed = JSON.parse(editedPayload);
      await onEditApprove(approval.id, parsed, note || undefined);
    } catch {
      // JSON parse error — stay in edit mode
      setLoading(false);
    }
  }

  // Extract a human-readable summary from the payload
  const summary =
    approval.payload.summary ||
    approval.payload.name ||
    approval.payload.content ||
    actionLabel;

  const reasoning = approval.payload.reasoning || approval.payload.reason;

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
              {actionLabel}
            </span>
            {approval.confidence_score != null && (
              <ConfidenceBadge
                score={approval.confidence_score}
                reasoning={approval.confidence_reasoning || undefined}
              />
            )}
          </div>
          <h3 className="mt-2 font-medium">{String(summary)}</h3>
          {approval.agent_name && (
            <p className="mt-1 text-xs text-muted-foreground">
              Proposed by {approval.agent_name}
            </p>
          )}
          {reasoning && (
            <p className="mt-2 text-sm text-muted-foreground">
              {String(reasoning)}
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-2 rounded p-1 text-muted-foreground hover:bg-accent"
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Expanded payload preview */}
      {expanded && (
        <div className="border-t px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Payload Preview
          </p>
          {editing ? (
            <textarea
              value={editedPayload}
              onChange={(e) => setEditedPayload(e.target.value)}
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={8}
            />
          ) : (
            <pre className="overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(approval.payload, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note..."
          className="flex-1 rounded border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {editing ? (
          <button
            onClick={handleEditApprove}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Save & Approve
          </button>
        ) : (
          <>
            <button
              onClick={handleApprove}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </button>
            <button
              onClick={() => {
                setEditing(true);
                setExpanded(true);
              }}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}
