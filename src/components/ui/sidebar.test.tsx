import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createSignal, flush } from "solid-js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./sidebar";

const originalMatchMedia = window.matchMedia;

function mockViewport(mobile: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = mobile;
  window.matchMedia = ((query: string) =>
    ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
  return (next: boolean) => {
    matches = next;
    for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
  };
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function Fixture(props: { onAction?: () => void }) {
  const sidebar = useSidebar();
  return (
    <>
      <Sidebar aria-label="Sidebar">
        <SidebarHeader>Brand</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Group</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive>
                  <span>First</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <span>Second</span>
                </SidebarMenuButton>
                <SidebarMenuAction aria-label="Remove second" onClick={props.onAction} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarSeparator />
        </SidebarContent>
        <SidebarFooter>Footer</SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
        <span data-testid="open">{sidebar.open() ? "yes" : "no"}</span>
        <button type="button">Outside</button>
      </SidebarInset>
    </>
  );
}

describe("Sidebar", () => {
  it("always shows the desktop sidebar with no way to collapse it", () => {
    mockViewport(false);
    render(() => (
      <SidebarProvider>
        <Fixture />
      </SidebarProvider>
    ));
    const aside = screen.getByRole("complementary", { name: "Sidebar" });
    expect(aside).not.toHaveAttribute("data-state");
    expect(aside).not.toHaveAttribute("data-collapsible");
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sidebar/ })).toBeNull();
  });

  it("marks active menu buttons without a collapsed tooltip", () => {
    render(() => (
      <SidebarProvider>
        <Fixture />
      </SidebarProvider>
    ));
    const first = screen.getByRole("button", { name: "First" });
    expect(first).toHaveAttribute("data-active", "true");
    expect(first).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "Second" })).not.toHaveAttribute("data-active");
  });

  it("supports a controlled drawer on mobile", async () => {
    mockViewport(true);
    const user = userEvent.setup();
    const [open, setOpen] = createSignal(false);
    const onOpenChange = vi.fn((next: boolean) => setOpen(next));
    render(() => (
      <SidebarProvider open={open()} onOpenChange={onOpenChange}>
        <Fixture />
      </SidebarProvider>
    ));
    await user.click(screen.getByRole("button", { name: "Show sidebar" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(open()).toBe(true);
    expect(await screen.findByRole("dialog", { name: "Sidebar" })).toBeInTheDocument();
    flush(() => setOpen(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shuts the drawer when the viewport widens to the desktop layout", async () => {
    const resize = mockViewport(true);
    render(() => (
      <SidebarProvider defaultOpen={true}>
        <Fixture />
      </SidebarProvider>
    ));
    await screen.findByRole("dialog", { name: "Sidebar" });
    flush(() => resize(false));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument();
    expect(screen.getByTestId("open")).toHaveTextContent("no");
    flush(() => resize(true));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeInTheDocument();
  });

  it("renders as a dismissible overlay dialog on mobile", async () => {
    mockViewport(true);
    const user = userEvent.setup();
    render(() => (
      <SidebarProvider defaultOpen={false}>
        <Fixture />
      </SidebarProvider>
    ));
    await Promise.resolve();
    flush();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("open")).toHaveTextContent("no");

    await user.click(screen.getByRole("button", { name: "Show sidebar" }));
    const dialog = await screen.findByRole("dialog", { name: "Sidebar" });
    expect(dialog).toHaveAttribute("data-mobile", "true");
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Show sidebar" }));
    await screen.findByRole("dialog", { name: "Sidebar" });
    await user.click(document.querySelector("[data-sidebar='backdrop']")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lays out the mobile presentation from the first render, never the desktop sidebar", () => {
    mockViewport(true);
    render(() => (
      <SidebarProvider>
        <Fixture />
      </SidebarProvider>
    ));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("renders menu actions beside their menu items", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(() => (
      <SidebarProvider>
        <Fixture onAction={onAction} />
      </SidebarProvider>
    ));
    const action = screen.getByRole("button", { name: "Remove second" });
    expect(action).toHaveAttribute("data-sidebar", "menu-action");
    expect(action.closest("li")).toContainElement(screen.getByRole("button", { name: "Second" }));
    await user.click(action);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab focus inside the mobile overlay", async () => {
    mockViewport(true);
    const user = userEvent.setup();
    render(() => (
      <SidebarProvider defaultOpen={true}>
        <Fixture />
      </SidebarProvider>
    ));
    await screen.findByRole("dialog", { name: "Sidebar" });
    await Promise.resolve();
    screen.getByRole("button", { name: "Remove second" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Remove second" })).toHaveFocus();
  });
});
