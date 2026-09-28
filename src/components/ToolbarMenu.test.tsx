import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import ToolbarMenu, { type ToolbarMenuItem } from "./ToolbarMenu";

function items(onSelect = vi.fn()): {
  items: ToolbarMenuItem[];
  onSelect: ReturnType<typeof vi.fn>;
} {
  return {
    onSelect,
    items: [
      {
        id: "a",
        label: "Alpha",
        icon: "image",
        keys: "Mod-Shift-i",
        onSelect: () => onSelect("a"),
      },
      { id: "b", label: "Beta", onSelect: () => onSelect("b") },
      { id: "c", label: "Gamma", onSelect: () => onSelect("c") },
    ],
  };
}

describe("ToolbarMenu", () => {
  it("renders a closed menu button with popup semantics", () => {
    render(() => <ToolbarMenu label="Insert" icon="plus" items={items().items} />);
    const trigger = screen.getByRole("button", { name: "Insert" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("title", "Insert");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on click, focuses the first item, and shows shortcuts", async () => {
    const user = userEvent.setup();
    render(() => <ToolbarMenu label="Insert" icon="plus" items={items().items} />);
    await user.click(screen.getByRole("button", { name: "Insert" }));
    const menu = await screen.findByRole("menu", { name: "Insert" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert" })).toHaveAttribute("aria-expanded", "true");
    const first = screen.getByRole("menuitem", { name: "Alpha" });
    expect(first).toHaveFocus();
    expect(first.textContent).toMatch(/⌘⇧I|Ctrl\+Shift\+I/);
    expect(first).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringMatching(/^(Meta|Control)\+Shift\+I$/),
    );
    expect(screen.getByRole("menuitem", { name: "Beta" })).not.toHaveAttribute("aria-keyshortcuts");
    expect(first.querySelector("[data-icon='image']")).not.toBeNull();
  });

  it("renders a labelled trigger with an icon and its own accessible name", () => {
    render(() => (
      <ToolbarMenu
        label="View"
        triggerLabel="View: Raw Markdown"
        icon="editor"
        text="Raw Markdown"
        variant="label"
        radio
        items={items().items}
      />
    ));
    const trigger = screen.getByRole("button", { name: "View: Raw Markdown" });
    expect(trigger).toHaveTextContent("Raw Markdown");
    expect(trigger.querySelector("[data-icon='editor']")).not.toBeNull();
    expect(trigger.querySelector("[data-icon='chevron-down']")).not.toBeNull();
  });

  it("anchors the menu to the left of the trigger by default", async () => {
    const user = userEvent.setup();
    render(() => <ToolbarMenu label="Insert" icon="plus" items={items().items} />);
    await user.click(screen.getByRole("button", { name: "Insert" }));
    const menu = await screen.findByRole("menu", { name: "Insert" });
    expect(menu).toHaveClass("left-0");
    expect(menu).not.toHaveClass("right-0");
  });

  it("lets the caller reposition the menu with menuClass", async () => {
    const user = userEvent.setup();
    render(() => (
      <ToolbarMenu
        label="Insert"
        icon="plus"
        class="static"
        menuClass="right-3 left-5 min-w-0"
        items={items().items}
      />
    ));
    expect(screen.getByRole("button", { name: "Insert" }).parentElement).toHaveClass("static");
    expect(screen.getByRole("button", { name: "Insert" }).parentElement).not.toHaveClass(
      "relative",
    );
    await user.click(screen.getByRole("button", { name: "Insert" }));
    const menu = await screen.findByRole("menu", { name: "Insert" });
    expect(menu).toHaveClass("left-5");
    expect(menu).toHaveClass("right-3");
    expect(menu).not.toHaveClass("left-0");
    expect(menu).not.toHaveClass("min-w-52");
  });

  it("anchors the menu to the right of the trigger when align is end", async () => {
    const user = userEvent.setup();
    render(() => <ToolbarMenu label="Insert" icon="plus" align="end" items={items().items} />);
    await user.click(screen.getByRole("button", { name: "Insert" }));
    const menu = await screen.findByRole("menu", { name: "Insert" });
    expect(menu).toHaveClass("right-0");
    expect(menu).not.toHaveClass("left-0");
  });

  it("selects an item with the mouse and closes", async () => {
    const user = userEvent.setup();
    const { items: list, onSelect } = items();
    render(() => <ToolbarMenu label="Insert" icon="plus" items={list} />);
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await user.click(await screen.findByRole("menuitem", { name: "Beta" }));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("supports arrow key navigation, wrapping, and Enter", async () => {
    const user = userEvent.setup();
    const { items: list, onSelect } = items();
    render(() => <ToolbarMenu label="Insert" icon="plus" items={list} />);
    screen.getByRole("button", { name: "Insert" }).focus();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("menu");
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{Home}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on the last item with ArrowUp and closes on Escape restoring focus", async () => {
    const user = userEvent.setup();
    render(() => <ToolbarMenu label="Insert" icon="plus" items={items().items} />);
    const trigger = screen.getByRole("button", { name: "Insert" });
    trigger.focus();
    await user.keyboard("{ArrowUp}");
    await screen.findByRole("menu");
    expect(screen.getByRole("menuitem", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(() => (
      <>
        <ToolbarMenu label="Insert" icon="plus" items={items().items} />
        <p>outside</p>
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await screen.findByRole("menu");
    await user.click(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes when focus leaves the menu", async () => {
    const user = userEvent.setup();
    render(() => (
      <>
        <ToolbarMenu label="Insert" icon="plus" items={items().items} />
        <button type="button">after</button>
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await screen.findByRole("menu");
    await user.tab();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders radio items with checked state, active text, and a disabled trigger", async () => {
    const user = userEvent.setup();
    const list: ToolbarMenuItem[] = [
      { id: "p", label: "Paragraph", checked: () => false, onSelect: vi.fn() },
      { id: "h2", label: "Heading 2", checked: () => true, onSelect: vi.fn() },
    ];
    const { unmount } = render(() => (
      <ToolbarMenu
        label="Heading"
        icon="heading"
        radio
        text="H2"
        active
        title="Heading 2"
        items={list}
      />
    ));
    const trigger = screen.getByRole("button", { name: "Heading" });
    expect(trigger).toHaveTextContent("H2");
    expect(trigger).toHaveAttribute("data-active", "true");
    expect(trigger).toHaveAttribute("title", "Heading 2");
    expect(trigger.querySelector("[data-icon='heading']")).toBeNull();
    await user.click(trigger);
    await screen.findByRole("menu");
    expect(screen.getByRole("menuitemradio", { name: "Heading 2" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Paragraph" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(
      screen.getByRole("menuitemradio", { name: "Heading 2" }).querySelector("[data-icon='check']"),
    ).not.toBeNull();
    unmount();
    render(() => <ToolbarMenu label="Heading" icon="heading" disabled items={list} />);
    expect(screen.getByRole("button", { name: "Heading" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Heading" }).querySelector("[data-icon='heading']"),
    ).not.toBeNull();
  });
});
