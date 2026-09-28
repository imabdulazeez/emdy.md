import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { cursor, resetCursorState, setCursor } from "./cursor";

afterEach(() => resetCursorState());

describe("cursor state", () => {
  it("starts at line 1 column 1", () => {
    expect(cursor()).toEqual({ line: 1, column: 1 });
  });

  it("updates the position", () => {
    flush(() => setCursor({ line: 12, column: 4 }));
    expect(cursor()).toEqual({ line: 12, column: 4 });
  });
});
