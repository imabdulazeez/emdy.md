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
  window.matchMedia = ((query: string) =>
    ({
      matches: mobile,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function Fixture(props: { collapsible?: "offcanvas" | "icon" | "none"; onAction?: () => void }) {
  const sidebar = useSidebar();
  return (
    <>
      <Sidebar aria-label="Sidebar" collapsible={props.collapsible}>
        <SidebarHeader>Brand</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Group</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive tooltip="First tip">
                  <span>First</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Second tip">
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
        <span data-testid="expanded">{sidebar.expanded() ? "yes" : "no"}</span>
        <button type="button">Outside</button>
      </SidebarInset>
    </>
  );
}

describe("Sidebar", () => {
  it("renders structure and toggles between expanded and collapsed", async () => {
    const user = userEvent.setup();
    render(() => (
      <SidebarProvider>
        <Fixture collapsible="icon" />
      </SidebarProvider>
    ));
    const aside = screen.getByRole("complementary", { name: "Sidebar" });
    expect(aside).toHaveAttribute("data-state", "expanded");
    expect(aside).toHaveAttribute("data-collapsible", "");
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByTestId("expanded")).toHaveTextContent("yes");

    const trigger = screen.getByRole("button", { name: "Hide sidebar" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(trigger);
    expect(aside).toHaveAttribute("data-state", "collapsed");
    expect(aside).toHaveAttribute("data-collapsible", "icon");
    expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByTestId("expanded")).toHaveTextContent("no");
  });

  it("defaults to offcanvas collapse and honours collapsible none", async () => {
    const user = userEvent.setup();
    const { unmount } = render(() => (
      <SidebarProvider defaultOpen={false}>
        <Fixture />
      </SidebarProvider>
    ));
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toHaveAttribute(
      "data-collapsible",
      "offcanvas",
    );
    unmount();

    render(() => (
      <SidebarProvider>
        <Fixture collapsible="none" />
      </SidebarProvider>
    ));
    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toHaveAttribute(
      "data-collapsible",
      "",
    );
  });

  it("supports controlled open state", async () => {
    const user = userEvent.setup();
    const [open, setOpen] = createSignal(true);
    const onOpenChange = vi.fn((next: boolean) => setOpen(next));
    render(() => (
      <SidebarProvider open={open()} onOpenChange={onOpenChange}>
        <Fixture collapsible="icon" />
      </SidebarProvider>
    ));
    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(open()).toBe(false);
    flush(() => setOpen(true));
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toHaveAttribute(
      "data-state",
      "expanded",
    );
  });

  it("marks active menu buttons and shows tooltips only when collapsed", async () => {
    const user = userEvent.setup();
    render(() => (
      <SidebarProvider>
        <Fixture collapsible="icon" />
      </SidebarProvider>
    ));
    const first = screen.getByRole("button", { name: "First" });
    expect(first).toHaveAttribute("data-active", "true");
    expect(first).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "Second" })).not.toHaveAttribute("data-active");
    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(first).toHaveAttribute("title", "First tip");
  });

  it("renders as a dismissible overlay dialog on mobile", async () => {
    mockViewport(true);
    const user = userEvent.setup();
    render(() => (
      <SidebarProvider defaultOpen={false}>
        <Fixture collapsible="icon" />
      </SidebarProvider>
    ));
    await Promise.resolve();
    flush();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("expanded")).toHaveTextContent("yes");

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

  it("lays out the mobile presentation from the first render, never the desktop rail", () => {
    mockViewport(true);
    render(() => (
      <SidebarProvider defaultOpen={false}>
        <Fixture collapsible="icon" />
      </SidebarProvider>
    ));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByTestId("expanded")).toHaveTextContent("yes");
  });

  it("renders a closed desktop sidebar collapsed from the first render", () => {
    mockViewport(false);
    render(() => (
      <SidebarProvider defaultOpen={false}>
        <Fixture collapsible="icon" />
      </SidebarProvider>
    ));
    const aside = screen.getByRole("complementary", { name: "Sidebar" });
    expect(aside).toHaveAttribute("data-state", "collapsed");
    expect(aside).toHaveAttribute("data-collapsible", "icon");
  });

  it("renders menu actions beside their menu items", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(() => (
      <SidebarProvider>
        <Fixture collapsible="icon" onAction={onAction} />
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
