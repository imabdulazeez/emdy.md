import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { editorApi, registerEditorApi, resetEditorApiState } from "./editor-api";

afterEach(() => resetEditorApiState());

describe("editor api registry", () => {
  it("registers and clears the editor api", () => {
    expect(editorApi()).toBeNull();
    const api = {
      scrollToLine: vi.fn(),
      focus: vi.fn(),
      getText: () => "x",
      flush: vi.fn(),
      runCommand: vi.fn(),
      applyEdits: vi.fn(),
    };
    flush(() => registerEditorApi(api));
    expect(editorApi()).toBe(api);
    flush(() => registerEditorApi(null));
    expect(editorApi()).toBeNull();
  });

  it("exposes runCommand on the editor api", () => {
    const runCommand = vi.fn(() => true);
    flush(() =>
      registerEditorApi({
        scrollToLine: vi.fn(),
        focus: vi.fn(),
        getText: () => "",
        flush: vi.fn(),
        runCommand,
        applyEdits: vi.fn(),
      }),
    );
    const command = () => true;
    expect(editorApi()?.runCommand(command)).toBe(true);
    expect(runCommand).toHaveBeenCalledWith(command);
  });
});
