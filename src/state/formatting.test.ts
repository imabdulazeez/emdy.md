import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { EMPTY_FORMATS } from "~/lib/editor/format-state";
import { activeFormats, resetFormattingState, setActiveFormats } from "./formatting";

afterEach(() => resetFormattingState());

describe("formatting state", () => {
  it("starts empty and publishes updates", () => {
    expect(activeFormats()).toEqual(EMPTY_FORMATS);
    flush(() => setActiveFormats({ ...EMPTY_FORMATS, bold: true, heading: 2 }));
    expect(activeFormats()).toMatchObject({ bold: true, heading: 2 });
  });

  it("keeps the same object when an equal value is set", () => {
    const first = { ...EMPTY_FORMATS, italic: true };
    flush(() => setActiveFormats(first));
    flush(() => setActiveFormats({ ...EMPTY_FORMATS, italic: true }));
    expect(activeFormats()).toBe(first);
  });

  it("resets to empty", () => {
    flush(() => setActiveFormats({ ...EMPTY_FORMATS, quote: true }));
    flush(() => resetFormattingState());
    expect(activeFormats()).toEqual(EMPTY_FORMATS);
  });
});
