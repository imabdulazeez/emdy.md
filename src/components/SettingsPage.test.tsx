import { render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { createMemoryDirectory } from "~/lib/storage/directory";
import { seedDirectory } from "~/lib/storage/fixtures";
import { TEST_DOCUMENTS } from "~/test-documents";
import { clearDocumentState } from "~/state/document";
import { layoutMode, resetLayoutState } from "~/state/layout";
import { resetLibraryState, startLibrary, useLibraryDirectory } from "~/state/library";
import { openSettings, resetNavigationState, view } from "~/state/navigation";
import { resetThemeState, themePreference } from "~/state/theme";
import { resetUiState, setSidebarOpen, sidebarOpen } from "~/state/ui";
import SettingsPage, { REPOSITORY_URL } from "./SettingsPage";
import { SidebarProvider } from "./ui/sidebar";

let restore: (() => void) | undefined;

beforeEach(async () => {
  const directory = createMemoryDirectory();
  await seedDirectory(directory, TEST_DOCUMENTS);
  restore = useLibraryDirectory(async () => directory);
  await startLibrary();
  flush();
  flush(() => openSettings(window));
});

afterEach(() => {
  restore?.();
  restore = undefined;
  resetLibraryState();
  resetNavigationState();
  clearDocumentState();
  resetLayoutState();
  resetThemeState();
  resetUiState();
  window.history.replaceState(null, "", "/");
});

function mount() {
  return render(() => (
    <SidebarProvider open={sidebarOpen()} onOpenChange={setSidebarOpen}>
      <SettingsPage />
    </SidebarProvider>
  ));
}

describe("SettingsPage", () => {
  it("lists every registered preference with its control", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument();
    const prefs = screen.getByRole("region", { name: "Preferences" });
    expect(within(prefs).getByRole("radiogroup", { name: "Appearance" })).toBeInTheDocument();
    expect(within(prefs).getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    const views = within(prefs).getByRole("radiogroup", { name: "View" });
    await user.click(within(views).getByRole("radio", { name: "Read-only preview" }));
    expect(layoutMode()).toBe("reader");
    await user.click(within(prefs).getByRole("radio", { name: "Dark" }));
    expect(themePreference()).toBe("dark");
  });

  it("shows the library and storage sections and returns to the document", async () => {
    const user = userEvent.setup();
    mount();
    const library = screen.getByRole("region", { name: "Library" });
    expect(within(library).getByRole("button", { name: "Import documents…" })).toBeInTheDocument();
    expect(
      within(library).getByRole("button", { name: "Export all documents" }),
    ).toBeInTheDocument();
    expect(within(library).getByLabelText("Import documents file")).toBeInTheDocument();
    const storage = screen.getByRole("region", { name: "Storage" });
    expect(within(storage).getByTestId("storage-location")).toHaveTextContent("This browser");
    expect(screen.queryByRole("button", { name: /sidebar/ })).toBeNull();
    const back = screen.getByRole("button", { name: "Back to document" });
    await screen.findByRole("button", { name: "Back to document" });
    expect(back).toHaveFocus();
    expect(back).toHaveAttribute("title", "Back to document (Esc)");
    expect(back).toHaveAttribute("aria-keyshortcuts", "Escape");
    await user.click(back);
    expect(view()).toBe("document");
    expect(window.location.hash).toMatch(/^#\/d\//);
  });

  it("links to the source repository in a new tab", () => {
    mount();
    const about = screen.getByRole("region", { name: "About" });
    const link = within(about).getByRole("link", { name: "Source code on GitHub" });
    expect(link).toHaveTextContent("imabdulazeez/emdy.md");
    expect(link).toHaveAttribute("href", REPOSITORY_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
