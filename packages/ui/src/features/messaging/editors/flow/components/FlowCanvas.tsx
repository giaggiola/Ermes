"use client";

import { useCallback, useEffect, useRef, type DragEvent } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "./nodeTypes";

interface FlowCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  templates: Array<{ id: string; name: string }>;
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  onNodeSelect?: (node: Node | null) => void;
}

const getNodeId = () => `step_${crypto.randomUUID()}`;

function FlowCanvasInner({
  initialNodes,
  initialEdges,
  templates,
  onNodesChange: onNodesChangeCallback,
  onEdgesChange: onEdgesChangeCallback,
  onNodeSelect,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow();

  // Details-panel edits arrive through the parent, not through canvas events.
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges]);

  // Sync changes back to parent
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      // Measuring or selecting a node does not change the saved flow.
      if (
        !changes.some(
          (change) => change.type !== "dimensions" && change.type !== "select",
        )
      )
        return;
      // Defer callback to get updated nodes
      setTimeout(() => {
        setNodes((nds) => {
          onNodesChangeCallback(nds);
          return nds;
        });
      }, 0);
    },
    [onNodesChange, onNodesChangeCallback, setNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      if (!changes.some((change) => change.type !== "select")) return;
      setTimeout(() => {
        setEdges((eds) => {
          onEdgesChangeCallback(eds);
          return eds;
        });
      }, 0);
    },
    [onEdgesChange, onEdgesChangeCallback, setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            style: { strokeWidth: 2 },
          },
          eds,
        );
        onEdgesChangeCallback(newEdges);
        return newEdges;
      });
    },
    [setEdges, onEdgesChangeCallback],
  );

  const updateNodeData = useCallback(
    (id: string, updates: Record<string, unknown>) => {
      setNodes((nds) => {
        const newNodes = nds.map((node) => {
          if (node.id === id) {
            return { ...node, data: { ...node.data, ...updates } };
          }
          return node;
        });
        onNodesChangeCallback(newNodes);
        return newNodes;
      });
    },
    [setNodes, onNodesChangeCallback],
  );

  // Inject templates and onDataChange into node data
  const nodesWithCallbacks = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      templates,
      onDataChange: (updates: Record<string, unknown>) =>
        updateNodeData(node.id, updates),
    },
  }));

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle node click for detail panel
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeSelect?.(node);
    },
    [onNodeSelect],
  );

  // Handle pane click to deselect
  const handlePaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let data: Record<string, unknown> = {};

      switch (type) {
        case "email":
          data = { template_id: "", templates };
          break;
        case "delay":
          data = { duration: 1, unit: "days" };
          break;
        case "condition":
          data = {
            conditions: [{ field: "", operator: "equals", value: "" }],
            field: "",
            match: "all",
            operator: "equals",
            value: "",
          };
          break;
        case "discount":
          data = {
            discount_type: "percentage",
            discount_value: 10,
            code_prefix: "SAVE",
            usage_limit: 1,
          };
          break;
        case "end":
          data = {};
          break;
      }

      const newNode: Node = {
        id: getNodeId(),
        type,
        position,
        data: {
          ...data,
          onDataChange: (updates: Record<string, unknown>) =>
            updateNodeData(newNode.id, updates),
        },
      };

      setNodes((nds) => {
        const newNodes = [...nds, newNode];
        onNodesChangeCallback(newNodes);
        return newNodes;
      });
    },
    [
      screenToFlowPosition,
      templates,
      setNodes,
      onNodesChangeCallback,
      updateNodeData,
    ],
  );

  return (
    <div ref={reactFlowWrapper} className="h-full flex-1">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
          style: { strokeWidth: 2, stroke: "#6b7280" },
        }}
        style={{ backgroundColor: "#e5e7eb" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#9ca3af"
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export default FlowCanvas;
