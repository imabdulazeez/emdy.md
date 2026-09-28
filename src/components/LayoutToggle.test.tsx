import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { layoutMode, resetLayoutState, setLayoutMode } from "~/state/layout";
import LayoutToggle from "./LayoutToggle";

afterEach(() => resetLayoutState());

describe("LayoutToggle", () => {
  it("renders a closed dropdown labelled with the current view", () => {
    render(() => <LayoutToggle />);
    const trigger = screen.getByRole("button", { name: "View: Raw Markdown" });
    expect(trigger).toHaveTextContent("Raw Markdown");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lists every view with the current one checked", async () => {
    const user = userEvent.setup();
    render(() => <LayoutToggle />);
    await user.click(screen.getByRole("button", { name: "View: Raw Markdown" }));
    await screen.findByRole("menu", { name: "View" });
    expect(screen.getByRole("menuitemradio", { name: "Raw Markdown" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Editable preview" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Read-only preview" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Raw Markdown" }).textContent).toMatch(
      /⌘1|Ctrl\+1/,
    );
    expect(screen.getByRole("menuitemradio", { name: "Read-only preview" }).textContent).toMatch(
      /⌘3|Ctrl\+3/,
    );
  });

  it("switches views when an item is selected", async () => {
    const user = userEvent.setup();
    render(() => <LayoutToggle />);
    await user.click(screen.getByRole("button", { name: "View: Raw Markdown" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Editable preview" }));
    expect(layoutMode()).toBe("preview");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "View: Editable preview" })).toHaveTextContent(
      "Editable preview",
    );
  });

  it("reflects external state changes", () => {
    render(() => <LayoutToggle />);
    flush(() => setLayoutMode("preview"));
    expect(screen.getByRole("button", { name: "View: Editable preview" })).toBeInTheDocument();
    flush(() => setLayoutMode("reader"));
    expect(screen.getByRole("button", { name: "View: Read-only preview" })).toHaveTextContent(
      "Read-only preview",
    );
  });
});
