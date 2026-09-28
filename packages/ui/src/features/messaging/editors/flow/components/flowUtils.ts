import type { Node, Edge } from "@xyflow/react";

export interface FlowConditionClause {
  field: string;
  operator: string;
  value: string;
}

export interface FlowStep {
  step_id?: string;
  type: "email" | "delay" | "condition" | "discount";
  // Email step fields
  template_id?: string;
  name?: string;
  step_status?: "live" | "disabled";
  subject_override?: string;
  preview_text_override?: string;
  sender_name_override?: string;
  sender_email_override?: string;
  skip_recently_emailed?: boolean;
  skip_recently_emailed_hours?: number;
  skip_if_event_types_since_start?: string[];
  skip_if_event_types_since_start_order_scoped?: boolean;
  enable_utm?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ab_test_enabled?: boolean;
  ab_test_flag?: string;
  ab_variants?: Record<string, { template_id: string; subject_override?: string }>;
  // Delay step fields
  duration?: number;
  unit?: "minutes" | "hours" | "days";
  until_time_of_day?: boolean;
  time_of_day?: string;
  until_days_of_week?: boolean;
  days_of_week?: number[];
  // Condition step fields
  field?: string;
  operator?: string;
  value?: string;
  match?: "all" | "any";
  conditions?: FlowConditionClause[];
  true_branch?: FlowStep[];
  false_branch?: FlowStep[];
  // Discount step fields
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  code_prefix?: string;
  currency_code?: string;
  usage_limit?: number;
  expires_in_days?: number;
  min_purchase?: number;
}

// Counter for generating unique node IDs
let nodeIdCounter = 0;
const getUniqueNodeId = (prefix: string) => `${prefix}_${nodeIdCounter++}`;

// Convert JSON steps to React Flow nodes and edges (supports branching)
export function stepsToFlow(triggerEvent: string, steps: FlowStep[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  nodeIdCounter = 0;

  // Add trigger node
  const triggerNode: Node = {
    id: "trigger",
    type: "trigger",
    position: { x: 400, y: 0 },
    data: { trigger_event: triggerEvent },
  };
  nodes.push(triggerNode);

  // Process steps recursively to handle branches
  const processSteps = (
    stepList: FlowStep[],
    prevNodeId: string,
    sourceHandle: string | undefined,
    startX: number,
    startY: number,
  ): { lastNodeId: string; maxY: number } => {
    const currentX = startX;
    let currentY = startY;
    let prevId = prevNodeId;

    for (const step of stepList) {
      const nodeId = step.step_id || getUniqueNodeId("legacy_step");
      const node: Node = {
        id: nodeId,
        type: step.type,
        position: { x: currentX, y: currentY },
        data: getNodeDataFromStep(step),
      };
      nodes.push(node);

      // Add edge from previous node
      const edge: Edge = {
        id: `edge_${prevId}_${nodeId}`,
        source: prevId,
        target: nodeId,
        sourceHandle: sourceHandle,
        type: "smoothstep",
        animated: true,
        style: sourceHandle === "false" ? { stroke: "#e11d48" } : sourceHandle === "true" ? { stroke: "#16a34a" } : undefined,
      };
      edges.push(edge);

      // Reset sourceHandle after first edge
      sourceHandle = undefined;
      prevId = nodeId;
      currentY += 150;

      // Handle condition branches
      if (step.type === "condition" && (step.true_branch?.length || step.false_branch?.length)) {
        let maxBranchY = currentY;

        // Process true branch (to the left)
        if (step.true_branch && step.true_branch.length > 0) {
          const trueBranchResult = processSteps(step.true_branch, nodeId, "true", currentX - 200, currentY);
          maxBranchY = Math.max(maxBranchY, trueBranchResult.maxY);
        }

        // Process false branch (to the right)
        if (step.false_branch && step.false_branch.length > 0) {
          const falseBranchResult = processSteps(step.false_branch, nodeId, "false", currentX + 200, currentY);
          maxBranchY = Math.max(maxBranchY, falseBranchResult.maxY);
        }

        currentY = maxBranchY;
      }
    }

    return { lastNodeId: prevId, maxY: currentY };
  };

  if (steps.length > 0) {
    const result = processSteps(steps, "trigger", undefined, 400, 120);

    // Add end node
    const endNodeId = "end";
    nodes.push({
      id: endNodeId,
      type: "end",
      position: { x: 400, y: result.maxY },
      data: {},
    });
    edges.push({
      id: `edge_${result.lastNodeId}_${endNodeId}`,
      source: result.lastNodeId,
      target: endNodeId,
      type: "smoothstep",
      animated: true,
    });
  }

  return { nodes, edges };
}


function normalizeConditionStep(step: FlowStep): { match: "all" | "any"; conditions: FlowConditionClause[] } {
  const conditions = Array.isArray(step.conditions) && step.conditions.length > 0
    ? step.conditions
    : [
        {
          field: step.field || "",
          operator: step.operator || "equals",
          value: step.value || "",
        },
      ];

  return {
    match: step.match === "any" ? "any" : "all",
    conditions,
  };
}

function normalizeConditionData(data: Omit<FlowStep, "type">): { match: "all" | "any"; conditions: FlowConditionClause[] } {
  const conditions = Array.isArray(data.conditions) && data.conditions.length > 0
    ? data.conditions
    : [
        {
          field: data.field || "",
          operator: data.operator || "equals",
          value: data.value || "",
        },
      ];

  return {
    match: data.match === "any" ? "any" : "all",
    conditions,
  };
}

function getNodeDataFromStep(step: FlowStep): Record<string, unknown> {
  switch (step.type) {
    case "email":
      return {
        template_id: step.template_id || "",
        name: step.name,
        step_status: step.step_status || "live",
        subject_override: step.subject_override,
        preview_text_override: step.preview_text_override,
        sender_name_override: step.sender_name_override,
        sender_email_override: step.sender_email_override,
        skip_recently_emailed: step.skip_recently_emailed ?? false,
        skip_recently_emailed_hours: step.skip_recently_emailed_hours ?? 16,
        skip_if_event_types_since_start:
          step.skip_if_event_types_since_start ?? [],
        skip_if_event_types_since_start_order_scoped:
          step.skip_if_event_types_since_start_order_scoped ?? false,
        enable_utm: step.enable_utm ?? false,
        utm_source: step.utm_source,
        utm_medium: step.utm_medium,
        utm_campaign: step.utm_campaign,
        ab_test_enabled: step.ab_test_enabled ?? false,
        ab_test_flag: step.ab_test_flag,
        ab_variants: step.ab_variants,
      };
    case "delay":
      return {
        duration: step.duration || 1,
        unit: step.unit || "days",
        until_time_of_day: step.until_time_of_day ?? false,
        time_of_day: step.time_of_day,
        until_days_of_week: step.until_days_of_week ?? false,
        days_of_week: step.days_of_week,
      };
    case "condition": {
      const group = normalizeConditionStep(step);
      const first = group.conditions[0] ?? { field: "", operator: "equals", value: "" };
      return {
        conditions: group.conditions,
        field: first.field,
        match: group.match,
        operator: first.operator,
        value: first.value,
      };
    }
    case "discount":
      return {
        discount_type: step.discount_type || "percentage",
        discount_value: step.discount_value ?? 10,
        code_prefix: step.code_prefix || "",
        currency_code: step.currency_code,
        usage_limit: step.usage_limit ?? 1,
        expires_in_days: step.expires_in_days,
        min_purchase: step.min_purchase,
      };
    default:
      return {};
  }
}

// Convert React Flow nodes and edges back to JSON steps (supports branching)
export function flowToSteps(nodes: Node[], edges: Edge[]): { triggerEvent: string; steps: FlowStep[] } {
  const triggerNode = nodes.find((n) => n.type === "trigger");
  const triggerEvent = (triggerNode?.data as { trigger_event?: string } | undefined)?.trigger_event || "newsletter.subscribed";

  // Build adjacency map with source handle info
  // Map: sourceNodeId -> { handle: targetNodeId }
  const adjacencyWithHandles = new Map<string, Map<string | undefined, string>>();
  edges.forEach((edge) => {
    if (!adjacencyWithHandles.has(edge.source)) {
      adjacencyWithHandles.set(edge.source, new Map());
    }
    adjacencyWithHandles.get(edge.source)!.set(edge.sourceHandle || undefined, edge.target);
  });

  // Track visited nodes to avoid infinite loops
  const visited = new Set<string>();

  // Recursive function to build steps from a starting node
  const buildStepsFrom = (nodeId: string): FlowStep[] => {
    const steps: FlowStep[] = [];
    let currentId: string | undefined = nodeId;

    while (currentId && !visited.has(currentId)) {
      const node = nodes.find((n) => n.id === currentId);
      if (!node || node.type === "end" || node.type === "trigger") {
        break;
      }

      visited.add(currentId);

      const step = nodeToStep(node, nodes, adjacencyWithHandles, visited);
      if (step) {
        steps.push(step);
      }

      // Get next node (default handle, not true/false)
      const nodeEdges = adjacencyWithHandles.get(currentId);
      if (nodeEdges) {
        // For condition nodes, we handle branches in nodeToStep
        // For other nodes, follow the default path
        if (node.type === "condition") {
          break; // Branch handling is done in nodeToStep
        }
        currentId = nodeEdges.get(undefined) || nodeEdges.values().next().value;
      } else {
        break;
      }
    }

    return steps;
  };

  // Start from trigger's first connected node
  const triggerEdges = adjacencyWithHandles.get(triggerNode?.id || "trigger");
  const firstNodeId = triggerEdges?.get(undefined) || triggerEdges?.values().next().value;

  const steps = firstNodeId ? buildStepsFrom(firstNodeId) : [];

  return { triggerEvent, steps };
}

function nodeToStep(
  node: Node,
  nodes: Node[],
  adjacencyWithHandles: Map<string, Map<string | undefined, string>>,
  visited: Set<string>,
): FlowStep | null {
  const data = node.data as Omit<FlowStep, "type">;

  // Helper to build branch steps
  const buildBranchSteps = (startNodeId: string | undefined): FlowStep[] => {
    if (!startNodeId) return [];

    const branchSteps: FlowStep[] = [];
    let currentId: string | undefined = startNodeId;

    while (currentId && !visited.has(currentId)) {
      const branchNode = nodes.find((n) => n.id === currentId);
      if (!branchNode || branchNode.type === "end" || branchNode.type === "trigger") {
        break;
      }

      visited.add(currentId);

      const step = nodeToStep(branchNode, nodes, adjacencyWithHandles, visited);
      if (step) {
        branchSteps.push(step);
      }

      // Get next node
      const nodeEdges = adjacencyWithHandles.get(currentId);
      if (nodeEdges) {
        if (branchNode.type === "condition") {
          break; // Nested condition handled in its own nodeToStep
        }
        currentId = nodeEdges.get(undefined) || nodeEdges.values().next().value;
      } else {
        break;
      }
    }

    return branchSteps;
  };

  switch (node.type) {
    case "email":
      return {
        step_id: node.id,
        type: "email",
        template_id: data.template_id,
        name: data.name,
        step_status: data.step_status,
        subject_override: data.subject_override,
        preview_text_override: data.preview_text_override,
        sender_name_override: data.sender_name_override,
        sender_email_override: data.sender_email_override,
        skip_recently_emailed: data.skip_recently_emailed,
        skip_recently_emailed_hours: data.skip_recently_emailed_hours,
        skip_if_event_types_since_start:
          data.skip_if_event_types_since_start,
        skip_if_event_types_since_start_order_scoped:
          data.skip_if_event_types_since_start_order_scoped,
        enable_utm: data.enable_utm,
        utm_source: data.utm_source,
        utm_medium: data.utm_medium,
        utm_campaign: data.utm_campaign,
        ab_test_enabled: data.ab_test_enabled,
        ab_test_flag: data.ab_test_flag,
        ab_variants: data.ab_variants,
      };
    case "delay":
      return {
        step_id: node.id,
        type: "delay",
        duration: data.duration,
        unit: data.unit,
        until_time_of_day: data.until_time_of_day,
        time_of_day: data.time_of_day,
        until_days_of_week: data.until_days_of_week,
        days_of_week: data.days_of_week,
      };
    case "condition": {
      // Get the true and false branch targets
      const conditionEdges = adjacencyWithHandles.get(node.id);
      const trueBranchStart = conditionEdges?.get("true");
      const falseBranchStart = conditionEdges?.get("false");
      const group = normalizeConditionData(data);
      const first = group.conditions[0] ?? { field: "", operator: "equals", value: "" };

      return {
        step_id: node.id,
        type: "condition",
        conditions: group.conditions,
        field: first.field,
        match: group.match,
        operator: first.operator,
        value: first.value,
        true_branch: buildBranchSteps(trueBranchStart),
        false_branch: buildBranchSteps(falseBranchStart),
      };
    }
    case "discount":
      return {
        step_id: node.id,
        type: "discount",
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        code_prefix: data.code_prefix,
        currency_code: data.currency_code,
        usage_limit: data.usage_limit,
        expires_in_days: data.expires_in_days,
        min_purchase: data.min_purchase,
      };
    default:
      return null;
  }
}

// Create initial nodes for a new flow
export function createInitialFlow(triggerEvent: string): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 250, y: 0 },
        data: { trigger_event: triggerEvent },
      },
    ],
    edges: [],
  };
}
