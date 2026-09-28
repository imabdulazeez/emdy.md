import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vite-plus/test";
import { Icon, type IconName } from "./icons";

const NAMES: IconName[] = [
  "sun",
  "moon",
  "monitor",
  "panel-left",
  "editor",
  "preview",
  "focus",
  "close",
  "keyboard",
  "file",
  "plus",
  "trash",
  "bold",
  "italic",
  "code",
  "link",
  "minimize",
  "heading",
  "pilcrow",
  "strikethrough",
  "image",
  "quote",
  "list",
  "list-ordered",
  "list-checks",
  "code-block",
  "table",
  "rule",
  "footnote",
  "chevron-down",
  "check",
  "type",
  "hash",
  "book",
  "settings",
  "folder",
  "arrow-left",
  "search",
  "copy",
  "pencil",
  "ellipsis",
  "download",
  "upload",
  "printer",
  "file-text",
  "ruler",
  "github",
  "arrow-up-right",
];

describe("Icon", () => {
  it("renders every icon as decorative svg", () => {
    for (const name of NAMES) {
      const { container, unmount } = render(() => <Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      expect(svg?.getAttribute("data-icon")).toBe(name);
      expect(svg?.children.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("applies size and class", () => {
    const { container } = render(() => <Icon name="sun" size={20} class="x" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg).toHaveClass("x");
  });
});

describe("Icon reuse", () => {
  it("renders independent nodes when the same icon appears more than once", () => {
    const { container } = render(() => (
      <>
        <Icon name="editor" />
        <Icon name="editor" />
      </>
    ));
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) expect(svg.children.length).toBeGreaterThan(0);
  });
});
