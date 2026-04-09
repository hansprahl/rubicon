"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { X, Filter, Search } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { ConfidenceBadge } from "@/components/confidence-badge";
import {
  getWorkspaces,
  getEntities,
  getRelationships,
} from "@/lib/api";
import type {
  WorkspaceWithMembers,
  GraphEntity,
  GraphRelationship,
} from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";

// Dynamically import ForceGraph2D to avoid SSR issues with canvas
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// ---------------------------------------------------------------------------
// Types for the force graph
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  name: string;
  entityType: string;
  status: string;
  confidence: number;
  authorAgentId: string | null;
  properties: Record<string, unknown>;
  color: string;
  val: number; // node size
}

interface GraphLink {
  source: string;
  target: string;
  relationshipType: string;
  confidence: number;
  color: string;
  id: string;
}

// Color palette for agents
const AGENT_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#a855f7", // purple
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#eab308", // yellow
  "#ef4444", // red
  "#6366f1", // indigo
  "#06b6d4", // cyan
];

const UNATTRIBUTED_COLOR = "#9ca3af"; // gray

function agentColor(agentId: string | null, colorMap: Map<string, string>) {
  if (!agentId) return UNATTRIBUTED_COLOR;
  if (!colorMap.has(agentId)) {
    colorMap.set(agentId, AGENT_COLORS[colorMap.size % AGENT_COLORS.length]);
  }
  return colorMap.get(agentId)!;
}

function relColor(type: string) {
  if (type === "CONTRADICTS") return "#ef4444";
  if (type === "SUPPORTS") return "#22c55e";
  if (type === "BUILDS_ON") return "#3b82f6";
  return "#9ca3af";
}

// ---------------------------------------------------------------------------
// Detail Panel — shown when a node is clicked
// ---------------------------------------------------------------------------

function DetailPanel({
  entity,
  relationships,
  entities,
  onClose,
}: {
  entity: GraphEntity;
  relationships: GraphRelationship[];
  entities: GraphEntity[];
  onClose: () => void;
}) {
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const related = relationships.filter(
    (r) => r.source_entity_id === entity.id || r.target_entity_id === entity.id
  );

  const relColors: Record<string, string> = {
    SUPPORTS: "text-green-600",
    CONTRADICTS: "text-red-600",
    BUILDS_ON: "text-blue-600",
    RELATES_TO: "text-gray-600",
  };

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    published: "bg-green-100 text-green-700",
    disputed: "bg-red-100 text-red-700",
    archived: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-card shadow-lg sm:inset-auto sm:right-0 sm:top-0 sm:h-full sm:w-80 sm:border-l">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="text-sm font-semibold">Entity Details</h3>
        <button
          onClick={onClose}
          className="rounded p-2 text-muted-foreground hover:bg-accent"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {/* Name + type */}
        <div>
          <h4 className="text-base font-semibold">{entity.name}</h4>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {entity.entity_type}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[entity.status] || statusColors.draft}`}
            >
              {entity.status}
            </span>
          </div>
        </div>

        {/* Confidence */}
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Confidence
          </span>
          <div className="mt-1">
            <ConfidenceBadge score={entity.confidence_score} />
          </div>
        </div>

        {/* Properties */}
        {Object.keys(entity.properties).length > 0 && (
          <div>
            <span className="text-xs font-medium text-muted-foreground">
              Properties
            </span>
            <div className="mt-1 space-y-1">
              {Object.entries(entity.properties).map(([key, val]) => (
                <div key={key} className="text-sm">
                  <span className="font-medium">{key}:</span>{" "}
                  <span className="text-muted-foreground">
                    {typeof val === "string" ? val : JSON.stringify(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Relationships */}
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Relationships ({related.length})
          </span>
          {related.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">None</p>
          ) : (
            <div className="mt-1 space-y-2">
              {related.map((rel) => {
                const isSource = rel.source_entity_id === entity.id;
                const otherId = isSource
                  ? rel.target_entity_id
                  : rel.source_entity_id;
                const other = entityMap.get(otherId);
                return (
                  <div
                    key={rel.id}
                    className="flex items-center gap-1 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {isSource ? "\u2192" : "\u2190"}
                    </span>
                    <span
                      className={`font-semibold ${relColors[rel.relationship_type] || relColors.RELATES_TO}`}
                    >
                      {rel.relationship_type}
                    </span>
                    <span className="font-medium">
                      {other?.name || otherId.slice(0, 8)}
                    </span>
                    <span className="ml-auto">
                      <ConfidenceBadge score={rel.confidence_score} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="text-xs text-muted-foreground">
          <p>Created: {new Date(entity.created_at).toLocaleString()}</p>
          <p>Updated: {new Date(entity.updated_at).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Graph Explorer
// ---------------------------------------------------------------------------

export default function GraphExplorerPage() {
  const [_userId, setUserId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembers[]>([]);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [relationships, setRelationships] = useState<GraphRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null);

  // Filters
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [filterEntityType, setFilterEntityType] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [minConfidence, setMinConfidence] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const [agentColorMap] = useState(() => new Map<string, string>());
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Load workspaces on mount
  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      try {
        const ws = await getWorkspaces(user.id);
        setWorkspaces(ws);
      } catch {
        // ignore
      }
    }
    init();
  }, []);

  // Load graph data when workspace filter changes
  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedWorkspace === "all") {
        // Load entities from all user workspaces
        const allEnts: GraphEntity[] = [];
        const allRels: GraphRelationship[] = [];
        await Promise.all(
          workspaces.map(async (ws) => {
            const [ents, rels] = await Promise.all([
              getEntities(ws.id),
              getRelationships(ws.id),
            ]);
            allEnts.push(...ents);
            allRels.push(...rels);
          })
        );
        setEntities(allEnts);
        setRelationships(allRels);
      } else {
        const [ents, rels] = await Promise.all([
          getEntities(selectedWorkspace),
          getRelationships(selectedWorkspace),
        ]);
        setEntities(ents);
        setRelationships(rels);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspace, workspaces]);

  useEffect(() => {
    if (workspaces.length > 0) loadGraph();
  }, [loadGraph, workspaces]);

  // Derive unique entity types and authors
  const entityTypes = useMemo(
    () => Array.from(new Set(entities.map((e) => e.entity_type))),
    [entities]
  );
  const authorIds = useMemo(
    () =>
      Array.from(
        new Set(
          entities.map((e) => e.author_agent_id).filter(Boolean) as string[]
        )
      ),
    [entities]
  );

  // Apply filters
  const filteredEntities = useMemo(() => {
    return entities.filter((e) => {
      if (filterEntityType !== "all" && e.entity_type !== filterEntityType)
        return false;
      if (filterAuthor !== "all" && e.author_agent_id !== filterAuthor)
        return false;
      if (e.confidence_score < minConfidence) return false;
      if (
        searchQuery &&
        !e.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
  }, [entities, filterEntityType, filterAuthor, minConfidence, searchQuery]);

  const filteredEntityIds = useMemo(
    () => new Set(filteredEntities.map((e) => e.id)),
    [filteredEntities]
  );

  const filteredRelationships = useMemo(
    () =>
      relationships.filter(
        (r) =>
          filteredEntityIds.has(r.source_entity_id) &&
          filteredEntityIds.has(r.target_entity_id)
      ),
    [relationships, filteredEntityIds]
  );

  // Build graph data
  const graphData = useMemo(() => {
    const nodes: GraphNode[] = filteredEntities.map((e) => ({
      id: e.id,
      name: e.name,
      entityType: e.entity_type,
      status: e.status,
      confidence: e.confidence_score,
      authorAgentId: e.author_agent_id,
      properties: e.properties,
      color: agentColor(e.author_agent_id, agentColorMap),
      val: 2 + e.confidence_score * 8, // size 2-10 based on confidence
    }));

    const links: GraphLink[] = filteredRelationships.map((r) => ({
      source: r.source_entity_id,
      target: r.target_entity_id,
      relationshipType: r.relationship_type,
      confidence: r.confidence_score,
      color: relColor(r.relationship_type),
      id: r.id,
    }));

    return { nodes, links };
  }, [filteredEntities, filteredRelationships, agentColorMap]);

  // Node click handler
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const entity = entities.find((e) => e.id === node.id);
      if (entity) setSelectedEntity(entity);
    },
    [entities]
  );

  // Custom node rendering
  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = (node as unknown as { x: number }).x;
      const y = (node as unknown as { y: number }).y;
      const radius = Math.sqrt(node.val) * 3;
      const fontSize = Math.max(10 / globalScale, 1.5);

      // Draw circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Selection ring
      if (selectedEntity?.id === node.id) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Disputed = dashed border
      if (node.status === "disputed") {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1.5 / globalScale;
        ctx.setLineDash([3 / globalScale, 3 / globalScale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#e5e7eb";
      ctx.fillText(node.name, x, y + radius + 2);
    },
    [selectedEntity]
  );

  // Custom link rendering
  const paintLink = useCallback(
    (
      link: GraphLink,
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => {
      const source = link.source as unknown as { x: number; y: number };
      const target = link.target as unknown as { x: number; y: number };
      if (!source.x || !target.x) return;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = link.color;
      ctx.lineWidth = Math.max(0.5, link.confidence * 2) / globalScale;

      if (link.relationshipType === "CONTRADICTS") {
        ctx.setLineDash([4 / globalScale, 4 / globalScale]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const fontSize = Math.max(8 / globalScale, 1);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = link.color;
      ctx.fillText(link.relationshipType, midX, midY);
    },
    []
  );

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center gap-4 border-b px-6 max-md:pl-14">
          <h1 className="text-lg font-semibold">Knowledge Graph</h1>
          <span className="text-xs text-muted-foreground">
            {filteredEntities.length} entities, {filteredRelationships.length}{" "}
            relationships
          </span>
        </header>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 sm:gap-3 sm:px-6">
          <Filter className="h-4 w-4 text-muted-foreground" />

          {/* Workspace */}
          <select
            value={selectedWorkspace}
            onChange={(e) => setSelectedWorkspace(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="all">All workspaces</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>

          {/* Entity type */}
          <select
            value={filterEntityType}
            onChange={(e) => setFilterEntityType(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="all">All types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Author agent */}
          <select
            value={filterAuthor}
            onChange={(e) => setFilterAuthor(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="all">All agents</option>
            {authorIds.map((id) => (
              <option key={id} value={id}>
                Agent {id.slice(0, 8)}
              </option>
            ))}
          </select>

          {/* Confidence slider */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Min confidence:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-xs font-medium">
              {(minConfidence * 100).toFixed(0)}%
            </span>
          </div>

          {/* Search */}
          <div className="relative w-full sm:ml-auto sm:w-auto">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring sm:w-auto sm:py-1 sm:text-xs"
            />
          </div>
        </div>

        {/* Graph + detail panel */}
        <div className="relative flex-1" ref={containerRef}>
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading graph...
            </div>
          ) : graphData.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No entities match the current filters.
            </div>
          ) : (
            <ForceGraph2D
              width={dimensions.width - (selectedEntity && dimensions.width >= 640 ? 320 : 0)}
              height={dimensions.height}
              graphData={graphData}
              nodeCanvasObject={paintNode as never}
              linkCanvasObject={paintLink as never}
              onNodeClick={handleNodeClick as never}
              nodeId="id"
              linkSource="source"
              linkTarget="target"
              backgroundColor="#09090b"
              cooldownTime={3000}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
            />
          )}

          {/* Detail panel */}
          {selectedEntity && (
            <DetailPanel
              entity={selectedEntity}
              relationships={relationships}
              entities={entities}
              onClose={() => setSelectedEntity(null)}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-[10px] sm:gap-4 sm:px-6">
          <span className="text-muted-foreground">Edges:</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-green-500" /> SUPPORTS
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-red-500" />{" "}
            CONTRADICTS
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-blue-500" /> BUILDS_ON
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-gray-400" /> RELATES_TO
          </span>
          <span className="ml-4 text-muted-foreground">
            Node size = confidence | Node color = authoring agent
          </span>
        </div>
      </main>
    </div>
  );
}
