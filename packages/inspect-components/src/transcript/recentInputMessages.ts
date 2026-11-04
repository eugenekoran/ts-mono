import type {
  ChatMessage,
  ChatMessageTool,
} from "@tsmono/inspect-common/types";

import type { EarlierOutputs } from "./modelOutputHistory";

export interface RecentInputMessagesOptions {
  /** Agent tool results were filtered from input (shown on AgentCard instead). */
  agentResultsFiltered: boolean;
  /** Whether the client renders tool events (tool messages hide here if so). */
  hasToolEvents: boolean | undefined;
  /** Ids of the tool events at the model event's level. When set, only a tool
   *  message whose call has one of these events hides here. */
  toolEventIds?: ReadonlySet<string>;
  /** The messages earlier model events generated. When set (and the input's
   *  assistant messages have ids that match them), the walk stops only at a
   *  generated assistant message. */
  earlierOutputs?: EarlierOutputs;
}

/**
 * The messages which immediately preceded a model call — the "recent
 * messages" panel of ModelEventView. Walks backward from the end of the
 * input, collecting messages until it reaches one an earlier model call
 * generated, since that call's panel already showed it and what came before.
 * Everything earlier is hidden behind "show all messages".
 */
export function recentInputMessages(
  input: ChatMessage[],
  options: RecentInputMessagesOptions
): ChatMessage[] {
  const result: ChatMessage[] = [];

  if (!options.agentResultsFiltered) {
    const generated = generatedBefore(input, options.earlierOutputs);

    for (let i = input.length - 1; i >= 0; i--) {
      const msg = input[i];
      if (msg === undefined) continue;
      if (msg.role === "assistant") {
        // Without output ids, fall back to treating every assistant message
        // as generated except a trailing one (prefill, compaction message).
        const isGenerated = generated ? generated(msg) : i !== input.length - 1;
        if (isGenerated) break;
        result.unshift(msg);
      } else if (
        (msg.role === "user" && !msg.tool_call_id) ||
        msg.role === "system" ||
        // tool messages are shown here unless a tool event shows them
        (msg.role === "tool" && !shownByToolEvent(msg, options))
      ) {
        result.unshift(msg);
      } else if (
        msg.role === "tool" &&
        (options.toolEventIds !== undefined || generated !== undefined)
      ) {
        // a result its tool event shows is skipped rather than ending the
        // turn: the generated message that made the call ends it, and the
        // turn's other results still show
        continue;
      } else {
        break;
      }
    }
  }

  // Multi-Agent V2 forks copy the parent's context into the child as
  // user/system messages only, so the walk above finds no assistant/tool
  // message to stop at and classifies the entire forked history as recent.
  // Only in that degenerate case (whole input consumed), fall back to the
  // real turn boundary: the last inter-agent handoff message.
  if (result.length === input.length && result.length > 0) {
    const lastHandoff = result.findLastIndex(isAgentHandoffMessage);
    if (lastHandoff > 0) {
      return result.slice(lastHandoff);
    }
  }

  return result;
}

/**
 * A test for "an earlier model call generated this assistant message", or
 * undefined when message ids can't answer it: an assistant message has no
 * id, or earlier calls generated messages but none of the input's assistant
 * messages is among them (ids not carried from output to input, as in some
 * agent bridges).
 */
const generatedBefore = (
  input: ChatMessage[],
  earlierOutputs: EarlierOutputs | undefined
): ((message: ChatMessage) => boolean) | undefined => {
  if (earlierOutputs === undefined) {
    return undefined;
  }
  const assistantIds: string[] = [];
  for (const msg of input) {
    if (msg.role !== "assistant") continue;
    if (!msg.id) return undefined;
    assistantIds.push(msg.id);
  }
  if (
    earlierOutputs.any &&
    assistantIds.length > 0 &&
    !assistantIds.some(earlierOutputs.includes)
  ) {
    return undefined;
  }
  return (message) => !!message.id && earlierOutputs.includes(message.id);
};

const shownByToolEvent = (
  message: ChatMessageTool,
  options: RecentInputMessagesOptions
): boolean => {
  if (options.hasToolEvents === false) {
    return false;
  }
  if (options.toolEventIds === undefined) {
    return true;
  }
  return (
    !!message.tool_call_id && options.toolEventIds.has(message.tool_call_id)
  );
};

/**
 * A user message the agent bridge synthesized from a Codex Multi-Agent V2
 * `agent_message` item (inter-agent handoff). The bridge preserves the raw
 * item on ContentText.internal for native replay; its presence marks the
 * message as the start of the receiving agent's turn.
 */
export function isAgentHandoffMessage(message: ChatMessage): boolean {
  if (message.role !== "user" || typeof message.content === "string") {
    return false;
  }
  return message.content.some(
    (content) =>
      content.type === "text" &&
      typeof content.internal === "object" &&
      content.internal !== null &&
      !Array.isArray(content.internal) &&
      "agent_message" in content.internal
  );
}
