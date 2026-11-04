import type { ModelEvent } from "@tsmono/inspect-common/types";

import { retryAttemptKey } from "./timeline/retryGrouping";
import type { EventType } from "./types";

/**
 * Which model event generated each output message, in sample order. Lets a
 * model event tell an assistant message in its input that an earlier call
 * generated (shown in that call's panel) from one that was authored into the
 * conversation (prefill, few-shot example, seeded history).
 */
export interface ModelOutputHistory {
  /** Position of each model event, keyed by `retryAttemptKey`. */
  position: ReadonlyMap<string, number>;
  /** Position of the model event that first generated each message id. */
  generatedAt: ReadonlyMap<string, number>;
  /** Position of the first model event that generated a message with an id. */
  firstGenerated: number;
}

/** The outputs generated before one model event. */
export interface EarlierOutputs {
  /** Whether any earlier model event generated a message with an id. */
  any: boolean;
  /** Whether an earlier model event generated the message with this id. */
  includes: (messageId: string) => boolean;
}

export function computeModelOutputHistory(
  events: readonly EventType[]
): ModelOutputHistory {
  const position = new Map<string, number>();
  const generatedAt = new Map<string, number>();
  let firstGenerated = Infinity;

  for (const event of events) {
    if (event.event !== "model") continue;
    const index = position.size;
    position.set(retryAttemptKey(event), index);
    for (const choice of event.output.choices) {
      const id = choice.message.id;
      if (id && !generatedAt.has(id)) {
        generatedAt.set(id, index);
        firstGenerated = Math.min(firstGenerated, index);
      }
    }
  }

  return { position, generatedAt, firstGenerated };
}

export function earlierOutputsFor(
  history: ModelOutputHistory | undefined,
  event: ModelEvent
): EarlierOutputs | undefined {
  const index = history?.position.get(retryAttemptKey(event));
  if (history === undefined || index === undefined) {
    return undefined;
  }
  return {
    any: history.firstGenerated < index,
    includes: (messageId) =>
      (history.generatedAt.get(messageId) ?? Infinity) < index,
  };
}
