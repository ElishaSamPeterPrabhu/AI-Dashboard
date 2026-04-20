import { create } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";

export type CanvasMode = "plan" | "execute";

export interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  mode: CanvasMode;
  selectedNodeId: string | null;
  setMode: (m: CanvasMode) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  setSelectedNodeId: (id: string | null) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  mode: "plan",
  selectedNodeId: null,

  setMode: (mode) => set({ mode }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
  onConnect: (connection) => set((s) => ({ edges: addEdge({ ...connection, animated: false }, s.edges) })),
  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  updateNodeConfig: (id, config) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...config } } : n
      ),
    })),
}));
