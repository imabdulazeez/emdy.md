import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createSignal, flush } from "solid-js";
import { deriveDocumentIdentity, type DocumentIcon as DocumentIconData } from "~/lib/document-icon";
import { loadLucideIcon, loadLucideIcons, lucideRegistry, resetLucideState } from "~/state/lucide";
import DocumentIcon from "./DocumentIcon";

afterEach(() => resetLucideState());

const iconIn = (container: HTMLElement) => container.querySelector("[data-document-icon]")!;

describe("DocumentIcon", () => {
  it("generates a tinted monogram from the title when no icon is chosen", () => {
    const { container } = render(() => <DocumentIcon icon={null} title="Reading list" />);
    const icon = iconIn(container);
    expect(icon).toHaveAttribute("data-document-icon", "automatic");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    const svg = icon.querySelector("svg")!;
    expect(svg).toHaveClass(
      "icon-tile",
      `text-icon-${deriveDocumentIdentity("Reading list").color}`,
    );
    expect(svg.querySelector("text")).toHaveTextContent("RL");
    expect(svg.querySelector("text")).toHaveAttribute("textLength", "12");
  });

  it("follows title changes while automatic", () => {
    const [title, setTitle] = createSignal("Reading list");
    const { container } = render(() => <DocumentIcon icon={null} title={title()} />);
    flush(() => setTitle("Quarterly 3"));
    expect(iconIn(container).querySelector("text")).toHaveTextContent("Q3");
  });

  it("renders a chosen monogram with a narrower fit for one letter", () => {
    const { container } = render(() => (
      <DocumentIcon icon={{ kind: "monogram", text: "Z", color: "pink" }} title="Anything" />
    ));
    const text = iconIn(container).querySelector("text")!;
    expect(text).toHaveTextContent("Z");
    expect(text).toHaveAttribute("textLength", "6");
    expect(iconIn(container).querySelector("svg")).toHaveClass("text-icon-pink");
    expect(iconIn(container)).toHaveAttribute("data-document-icon", "monogram");
  });

  it("renders an emoji", () => {
    const { container } = render(() => (
      <DocumentIcon icon={{ kind: "emoji", emoji: "🌱" }} title="Garden" />
    ));
    expect(iconIn(container)).toHaveTextContent("🌱");
    expect(iconIn(container)).toHaveAttribute("data-document-icon", "emoji");
  });

  it("loads the Lucide set on demand and draws the chosen glyph in its colour", async () => {
    const { container } = render(() => (
      <DocumentIcon icon={{ kind: "lucide", name: "book-open", color: "teal" }} title="Books" />
    ));
    expect(iconIn(container).querySelector("svg")).toBeNull();
    await loadLucideIcons();
    flush();
    const svg = iconIn(container).querySelector("svg")!;
    expect(svg).toHaveClass("text-icon-teal");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("loads only the chosen glyph's group rather than the whole Lucide set", async () => {
    const { container } = render(() => (
      <DocumentIcon icon={{ kind: "lucide", name: "map-pin", color: "violet" }} title="Places" />
    ));
    await loadLucideIcon("map-pin");
    flush();
    expect(iconIn(container).querySelector("svg")).toHaveClass("text-icon-violet");
    expect(lucideRegistry()).toBeNull();
  });

  it("falls back to the generated monogram when a Lucide icon no longer exists", async () => {
    const icon: DocumentIconData = { kind: "lucide", name: "not-a-real-icon", color: "red" };
    const { container } = render(() => <DocumentIcon icon={icon} title="Reading list" />);
    await loadLucideIcons();
    flush();
    expect(iconIn(container).querySelector("text")).toHaveTextContent("RL");
  });

  it("accepts a size class", () => {
    const { container } = render(() => <DocumentIcon icon={null} title="A" class="size-9" />);
    expect(iconIn(container)).toHaveClass("size-9");
    expect(iconIn(container)).not.toHaveClass("size-4");
  });
});
