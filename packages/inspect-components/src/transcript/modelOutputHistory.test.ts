import { describe, expect, it } from "vitest";

import {
  testAssistantMessage,
  testChatCompletionChoice,
  testInfoEvent,
  testModelEvent,
  testModelOutput,
} from "@tsmono/inspect-common/testing";
import type { ModelEvent } from "@tsmono/inspect-common/types";

import {
  computeModelOutputHistory,
  earlierOutputsFor,
} from "./modelOutputHistory";

const modelEvent = (uuid: string, outputIds: string[]): ModelEvent =>
  testModelEvent({
    uuid,
    output: testModelOutput({
      choices: outputIds.map((id) =>
        testChatCompletionChoice({ message: testAssistantMessage({ id }) })
      ),
    }),
  });

describe("earlierOutputsFor", () => {
  const first = modelEvent("e1", ["out1"]);
  const second = modelEvent("e2", ["out2"]);
  const third = modelEvent("e3", []);
  const history = computeModelOutputHistory([
    first,
    testInfoEvent(),
    second,
    third,
  ]);

  it("knows only the outputs of model events before this one", () => {
    const earlier = earlierOutputsFor(history, second);
    expect(earlier?.includes("out1")).toBe(true);
    expect(earlier?.includes("out2")).toBe(false);
    expect(earlier?.includes("authored")).toBe(false);
  });

  it("reports whether any earlier call generated a message", () => {
    expect(earlierOutputsFor(history, first)?.any).toBe(false);
    expect(earlierOutputsFor(history, third)?.any).toBe(true);
  });

  it("is undefined for a model event outside the history", () => {
    expect(earlierOutputsFor(history, modelEvent("other", []))).toBeUndefined();
    expect(earlierOutputsFor(undefined, first)).toBeUndefined();
  });
});
