/**
 * View-model hook producing the EventNode tree and its render context from an
 * EventNodeFeed (see useTimelinePipeline).
 */

import { useMemo } from "react";

import { computeModelOutputHistory } from "../modelOutputHistory";
import { buildToolLabels, scopeMessageLabels } from "../transform/labels";
import type { EventNode, EventNodeContext, EventType } from "../types";

import { useEventNodes } from "./useEventNodes";
import type { EventNodeFeed } from "./useTimelinePipeline";

export interface EventNodeData {
  /** The EventNode tree for the transcript list and outline. */
  eventNodes: EventNode[];
  /** Node IDs collapsed by default. */
  defaultCollapsedIds: Record<string, true>;
  /** Context for event views: the caller's extras merged with derived
   *  labels and retry attempts. */
  eventNodeContext: Partial<EventNodeContext>;
}

export const useEventNodeData = (
  nodeFeed: EventNodeFeed,
  running: boolean,
  extraContext?: Partial<EventNodeContext>,
  allEvents?: readonly EventType[]
): EventNodeData => {
  const { eventNodes, defaultCollapsedIds, retryAttempts } = useEventNodes(
    nodeFeed.events,
    running,
    nodeFeed.sourceSpans,
    allEvents
  );

  const eventNodeContext = useMemo<Partial<EventNodeContext>>(() => {
    const messageLabels = scopeMessageLabels(
      nodeFeed.events,
      extraContext?.messageLabels
    );
    const toolLabels = buildToolLabels(nodeFeed.events, messageLabels);
    // From the whole sample, not just this feed: a lane's first call can
    // continue a conversation whose earlier outputs are in another lane.
    const modelOutputHistory = computeModelOutputHistory(
      allEvents ?? nodeFeed.events
    );
    return {
      ...extraContext,
      messageLabels,
      retryAttempts,
      modelOutputHistory,
      ...(toolLabels ? { toolLabels } : {}),
    };
  }, [nodeFeed.events, extraContext, retryAttempts, allEvents]);

  return { eventNodes, defaultCollapsedIds, eventNodeContext };
};
