import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import {
  editorApi,
  flushEditors,
  isFocusedEditor,
  liveEditor,
  registerEditorApi,
  registerLiveEditor,
  releaseEditorApi,
  resetEditorApiState,
  type EditorApi,
} from "./editor-api";

function fakeEditor(flush = vi.fn()): EditorApi {
  return {
    scrollToLine: vi.fn(),
    focus: vi.fn(),
    getText: () => "",
    flush,
    runCommand: vi.fn(),
    applyEdits: vi.fn(),
  };
}

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

  it("releases the focused editor only while it is still the registered one", () => {
    const left = fakeEditor();
    const right = fakeEditor();
    flush(() => registerEditorApi(left));
    flush(() => registerEditorApi(right));
    expect(isFocusedEditor(right)).toBe(true);
    flush(() => releaseEditorApi(left));
    expect(editorApi()).toBe(right);
    flush(() => releaseEditorApi(right));
    expect(editorApi()).toBeNull();
    expect(isFocusedEditor(right)).toBe(false);
  });

  it("finds the mounted editor showing a document", () => {
    const left = fakeEditor();
    const right = fakeEditor();
    let shown = "aaaaaa";
    const stopLeft = registerLiveEditor(left, () => shown);
    registerLiveEditor(right, () => "bbbbbb");
    expect(liveEditor("aaaaaa")).toBe(left);
    expect(liveEditor("bbbbbb")).toBe(right);
    expect(liveEditor("cccccc")).toBeNull();
    shown = "cccccc";
    expect(liveEditor("cccccc")).toBe(left);
    stopLeft();
    expect(liveEditor("cccccc")).toBeNull();
  });

  it("flushes every mounted editor once, focused or not", () => {
    const focusedFlush = vi.fn();
    const backgroundFlush = vi.fn();
    const focused = fakeEditor(focusedFlush);
    registerLiveEditor(focused, () => "aaaaaa");
    registerLiveEditor(fakeEditor(backgroundFlush), () => "bbbbbb");
    flush(() => registerEditorApi(focused));
    flushEditors();
    expect(focusedFlush).toHaveBeenCalledTimes(1);
    expect(backgroundFlush).toHaveBeenCalledTimes(1);
  });

  it("flushes a registered editor that is not listed as mounted", () => {
    const apiFlush = vi.fn();
    flush(() => registerEditorApi(fakeEditor(apiFlush)));
    flushEditors();
    expect(apiFlush).toHaveBeenCalledTimes(1);
    resetEditorApiState();
    flushEditors();
    expect(apiFlush).toHaveBeenCalledTimes(1);
  });
});
