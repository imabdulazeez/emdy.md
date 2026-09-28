import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { createSignal, flush } from "solid-js";
import {
  anchorPoint,
  ContextMenu,
  isContextMenuKey,
  MENU_MARGIN,
  menuPoint,
  placeMenu,
  type ContextMenuItem,
  type ContextMenuState,
} from "./context-menu";

describe("placeMenu", () => {
  const viewport = { width: 800, height: 600 };
  const size = { width: 200, height: 120 };

  it("opens at the pointer when the menu fits", () => {
    expect(placeMenu({ x: 100, y: 100 }, size, viewport)).toEqual({ x: 100, y: 100 });
  });

  it("shifts left at the right edge and flips above the pointer at the bottom", () => {
    expect(placeMenu({ x: 780, y: 590 }, size, viewport)).toEqual({
      x: viewport.width - size.width - MENU_MARGIN,
      y: 590 - size.height,
    });
  });

  it("pins to the margin when the menu is taller than the space either side", () => {
    expect(placeMenu({ x: 10, y: 50 }, { width: 200, height: 580 }, viewport)).toEqual({
      x: 10,
      y: viewport.height - 580 - MENU_MARGIN,
    });
    expect(placeMenu({ x: 10, y: 50 }, { width: 900, height: 700 }, viewport)).toEqual({
      x: MENU_MARGIN,
      y: MENU_MARGIN,
    });
  });
});

describe("menuPoint", () => {
  it("uses the pointer position for a mouse right-click", () => {
    const event = new MouseEvent("contextmenu", { clientX: 40, clientY: 70 });
    expect(menuPoint(event, null)).toEqual({ x: 40, y: 70 });
  });

  it("anchors to the element when the menu was opened from the keyboard", () => {
    const anchor = document.createElement("button");
    anchor.getBoundingClientRect = () =>
      ({ left: 20, bottom: 90, top: 60, right: 200, width: 180, height: 30 }) as DOMRect;
    const event = new MouseEvent("contextmenu", { clientX: 0, clientY: 0 });
    expect(menuPoint(event, anchor)).toEqual({ x: 20 + MENU_MARGIN, y: 90 });
    expect(menuPoint(new KeyboardEvent("keydown", { key: "F10" }), anchor)).toEqual(
      anchorPoint(anchor),
    );
  });

  it("recognises the keys that open a context menu", () => {
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "ContextMenu" }))).toBe(true);
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "F10", shiftKey: true }))).toBe(
      true,
    );
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "F10" }))).toBe(false);
    const shiftF10 = new KeyboardEvent("keydown", { key: "F10", shiftKey: true });
    expect(isContextMenuKey(shiftF10, true)).toBe(true);
    expect(isContextMenuKey(shiftF10, false)).toBe(true);
    expect(
      isContextMenuKey(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, ctrlKey: true })),
    ).toBe(false);
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "Enter" }))).toBe(false);
  });
});

function setup(items?: ContextMenuItem[]) {
  const onSelect = vi.fn();
  const anchor = document.createElement("button");
  anchor.textContent = "Anchor";
  document.body.append(anchor);
  const [state, setState] = createSignal<ContextMenuState | null>(null);
  const menuItems = items ?? [
    { id: "a", label: "Alpha", icon: "plus", onSelect: () => onSelect("a") },
    { id: "b", label: "Beta", onSelect: () => onSelect("b") },
    { id: "c", label: "Delete", danger: true, separated: true, onSelect: () => onSelect("c") },
  ];
  const onClose = vi.fn(() => setState(null));
  const { container } = render(() => <ContextMenu state={state()} onClose={onClose} />);
  const open = async () => {
    flush(() => setState({ x: 30, y: 40, label: "Actions", items: menuItems, anchor }));
    await vi.waitFor(() => expect(screen.getAllByRole("menuitem")[0]).toHaveFocus());
  };
  return { onSelect, onClose, open, anchor, container };
}

describe("ContextMenu", () => {
  it("renders nothing until opened, then a labelled menu at the point", async () => {
    const { open, container } = setup();
    expect(screen.queryByRole("menu")).toBeNull();
    await open();
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(document.body).toContainElement(menu);
    expect(container).not.toContainElement(menu);
    expect(menu.style.left).toBe("30px");
    expect(menu.style.top).toBe("40px");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Alpha",
      "Beta",
      "Delete",
    ]);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute("data-danger", "true");
    expect(
      screen.getByRole("menuitem", { name: "Alpha" }).querySelector("[data-icon=plus]"),
    ).not.toBeNull();
  });

  it("focuses the first item and moves with the arrow, Home, and End keys", async () => {
    const user = userEvent.setup();
    const { open } = setup();
    await open();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Beta" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toHaveFocus();
  });

  it("closes before running the chosen action", async () => {
    const user = userEvent.setup();
    const { open, onSelect, onClose } = setup();
    await open();
    await user.click(screen.getByRole("menuitem", { name: "Beta" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("returns focus to the anchor before running an action chosen with Enter", async () => {
    const user = userEvent.setup();
    let focusedDuringAction: Element | null = null;
    const { open, anchor } = setup([
      { id: "a", label: "Alpha", onSelect: () => (focusedDuringAction = document.activeElement) },
    ]);
    await open();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(focusedDuringAction).toBe(anchor);
    expect(anchor).toHaveFocus();
  });

  it("returns focus to the anchor on Escape or Tab", async () => {
    const user = userEvent.setup();
    const { open, anchor, onSelect } = setup();
    await open();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(anchor).toHaveFocus();
    await open();
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(anchor).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes on a press outside, on scroll, and when the window loses focus", async () => {
    const user = userEvent.setup();
    const { open, onClose } = setup();
    await open();
    await user.pointer({ keys: "[MouseLeft]", target: document.body });
    expect(screen.queryByRole("menu")).toBeNull();
    await open();
    flush(() => document.dispatchEvent(new Event("scroll")));
    expect(screen.queryByRole("menu")).toBeNull();
    await open();
    flush(() => window.dispatchEvent(new Event("blur")));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps the native menu from opening on top of it", async () => {
    const { open } = setup();
    await open();
    const menu = screen.getByRole("menu");
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    menu.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
