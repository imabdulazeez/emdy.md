import { render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { COPY_FEEDBACK_MS } from "~/lib/clipboard";
import { parseTableSource } from "~/lib/editor/table-source";
import type { TableCopyRequest } from "~/lib/table-clipboard";
import TableCopyMenu, {
  COPY_FAILED_MESSAGE,
  createTableCopyMenu,
  placeTableMenu,
} from "./TableCopyMenu";

const GRID = parseTableSource("| Name | Qty |\n| :--- | --: |\n| Tea, green | 2 |");
const CSV = 'Name,Qty\n"Tea, green",2';
const MARKDOWN = "| Name       | Qty |\n| :--------- | --: |\n| Tea, green |   2 |";

const created: HTMLElement[] = [];

function anchorButton(): HTMLButtonElement {
  const button = document.createElement("button");
  created.push(button);
  button.textContent = "Copy table";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  document.body.append(button);
  return button;
}

function mount(overrides: Partial<TableCopyRequest> = {}, copied = true) {
  const anchor = anchorButton();
  const copy = vi.fn(async (_text: string) => copied);
  const request: TableCopyRequest = { grid: GRID, anchor, ...overrides };
  const [current, setCurrent] = createSignal<TableCopyRequest | null>(request);
  const onClose = vi.fn(() => setCurrent(null));
  render(() => <TableCopyMenu request={current()} onClose={onClose} copy={copy} />);
  return { anchor, copy, onClose, request, open: () => setCurrent(request) };
}

afterEach(() => {
  vi.useRealTimers();
  for (const element of created.splice(0)) element.remove();
});

describe("TableCopyMenu", () => {
  it("lists Markdown and CSV, focuses the first item, and marks its anchor expanded", async () => {
    const { anchor } = mount();
    const menu = await screen.findByRole("menu", { name: "Copy table" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Copy as Markdown", "Copy as CSV"]);
    expect(items.map((item) => item.querySelector("svg")?.getAttribute("data-icon"))).toEqual([
      "file",
      "table",
    ]);
    expect(items[0]).toHaveFocus();
    expect(menu).toHaveAttribute("data-table-copy-menu");
    expect(anchor).toHaveAttribute("aria-expanded", "true");
    expect(anchor).toHaveAttribute("aria-controls", menu.id);
  });

  it("copies the chosen format, confirms it, then closes and returns focus", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { anchor, copy, onClose } = mount();
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Copy as CSV" }));
    expect(copy).toHaveBeenCalledWith(CSV);
    const confirmed = await within(menu).findByRole("menuitem", { name: "Copied" });
    expect(confirmed.querySelector("svg")).toHaveAttribute("data-icon", "check");
    expect(screen.getByRole("status")).toHaveTextContent("Copied table as CSV");
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(COPY_FEEDBACK_MS);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(anchor).toHaveFocus();
    expect(anchor).toHaveAttribute("aria-expanded", "false");
    expect(anchor).not.toHaveAttribute("aria-controls");
  });

  it("copies Markdown from the keyboard", async () => {
    const user = userEvent.setup();
    const { copy } = mount();
    await screen.findByRole("menu");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(copy).toHaveBeenCalledWith(MARKDOWN);
  });

  it("moves between items with the arrow, Home and End keys", async () => {
    const user = userEvent.setup();
    mount();
    const menu = await screen.findByRole("menu");
    const [markdown, csv] = within(menu).getAllByRole("menuitem");
    await user.keyboard("{ArrowDown}");
    expect(csv).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(markdown).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(csv).toHaveFocus();
    await user.keyboard("{Home}");
    expect(markdown).toHaveFocus();
    await user.keyboard("{End}");
    expect(csv).toHaveFocus();
  });

  it("closes on Escape or Tab and returns focus through the request", async () => {
    const user = userEvent.setup();
    const restoreFocus = vi.fn();
    const { onClose, open } = mount({ restoreFocus });
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(restoreFocus).toHaveBeenCalledTimes(1);

    flush(open);
    await screen.findByRole("menu");
    await user.keyboard("{Tab}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(restoreFocus).toHaveBeenCalledTimes(2);
  });

  it("closes without taking focus back when the user clicks elsewhere", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const outside = document.createElement("button");
    created.push(outside);
    document.body.append(outside);
    const { onClose, anchor } = mount({ onDismiss });
    await screen.findByRole("menu");
    await user.click(anchor);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(outside);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(outside).toHaveFocus();
  });

  it("opens at a point and closes on any click in the element it came from", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { anchor } = mount({ point: { x: 10, y: 20 }, onDismiss });
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(menu.style.visibility).toBe("visible"));
    expect(menu.style.left).toBe("10px");
    expect(menu.style.top).toBe("24px");
    await user.click(anchor);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps the menu open and explains when the clipboard write fails", async () => {
    const user = userEvent.setup();
    const { onClose } = mount({}, false);
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Copy as Markdown" }));
    expect(await within(menu).findByRole("menuitem", { name: "Couldn't copy" })).toBeVisible();
    expect(menu).toHaveTextContent("The browser blocked clipboard access.");
    expect(screen.getByRole("status")).toHaveTextContent(COPY_FAILED_MESSAGE);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(within(menu).getByRole("menuitem", { name: "Copy as CSV" }));
    expect(within(menu).getByRole("menuitem", { name: "Copy as Markdown" })).toBeVisible();
  });

  it("renders nothing without a request", () => {
    render(() => <TableCopyMenu request={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("createTableCopyMenu", () => {
  it("opens a request and closes it when the same anchor asks again", () => {
    const menu = createTableCopyMenu();
    const anchor = anchorButton();
    const restoreFocus = vi.fn();
    const request = { grid: GRID, anchor, restoreFocus };
    flush(() => menu.open(request));
    expect(menu.request()).toBe(request);
    const other = { grid: GRID, anchor: anchorButton() };
    flush(() => menu.open(other));
    expect(menu.request()).toBe(other);
    flush(() => menu.open({ grid: GRID, anchor: other.anchor }));
    expect(menu.request()).toBeNull();
    expect(other.anchor).toHaveFocus();
    flush(() => menu.open(request));
    flush(() => menu.open(request));
    expect(menu.request()).toBeNull();
    expect(restoreFocus).toHaveBeenCalledTimes(1);
    flush(() => menu.open(request));
    flush(menu.close);
    expect(menu.request()).toBeNull();
  });
});

describe("placeTableMenu", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 80 };

  it("hangs below the anchor with right edges aligned", () => {
    const anchor = { left: 700, right: 728, top: 100, bottom: 128 };
    expect(placeTableMenu(anchor, size, viewport)).toEqual({ x: 528, y: 132 });
  });

  it("opens from a point with the left edge at the point", () => {
    const point = { left: 300, right: 300, top: 400, bottom: 400 };
    expect(placeTableMenu(point, size, viewport, "start")).toEqual({ x: 300, y: 404 });
  });

  it("flips above the anchor when there is no room below", () => {
    const anchor = { left: 700, right: 728, top: 760, bottom: 788 };
    expect(placeTableMenu(anchor, size, viewport)).toEqual({ x: 528, y: 676 });
  });

  it("keeps a margin from the viewport edges", () => {
    expect(placeTableMenu({ left: 0, right: 20, top: 0, bottom: 20 }, size, viewport)).toEqual({
      x: 8,
      y: 24,
    });
    expect(
      placeTableMenu({ left: 990, right: 990, top: 10, bottom: 10 }, size, viewport, "start"),
    ).toEqual({ x: 792, y: 14 });
    expect(
      placeTableMenu(
        { left: 0, right: 20, top: 40, bottom: 60 },
        { width: 200, height: 790 },
        viewport,
      ),
    ).toEqual({ x: 8, y: 8 });
  });
});
