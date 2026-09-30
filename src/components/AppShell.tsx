import { createEffect, Match, onSettled, Show, Switch } from "solid-js";
import { runWhenIdle } from "~/lib/debounce";
import { hasOpenComposerMenu } from "~/lib/editor/composer";
import { getRenderClient } from "~/lib/preview/render-client";
import { startPersistenceSync } from "~/lib/storage/persisted";
import {
  ariaKeyShortcuts,
  handleGlobalShortcut,
  isMacPlatform,
  shortcutKeys,
  shortcutTitle,
} from "~/lib/shortcuts";
import { pageTitle } from "~/lib/title";
import { holdTransitions } from "~/lib/transitions";
import { startDesktopSync } from "~/state/desktop";
import { createDocument, docText, hasDocuments, title } from "~/state/document";
import { layoutMode, setLayoutMode } from "~/state/layout";
import { currentLibrary, libraryStatus, startLibrary, trackLibrary } from "~/state/library";
import { closeSettings, startHistorySync, toggleSettings, view } from "~/state/navigation";
import { updateStatsFromText } from "~/state/stats";
import { applyTheme, watchSystemTheme } from "~/state/theme";
import { displayedAppearance, displayedColors } from "~/state/theme-draft";
import { applyFontAttribute, documentFont } from "~/state/typography";
import {
  focusMode,
  requestEditorFocus,
  requestSearch,
  setFocusMode,
  setShortcutsOpen,
  setSidebarOpen,
  shortcutsOpen,
  sidebarOpen,
  toggleFocusMode,
  toggleShortcuts,
  toggleSidebar,
} from "~/state/ui";
import AppSidebar from "./AppSidebar";
import DocumentStatus from "./DocumentStatus";
import Editor from "./Editor";
import EmptyLibrary from "./EmptyLibrary";
import { Icon } from "./icons";
import LibraryGate from "./LibraryGate";
import Outline from "./Outline";
import SettingsPage from "./SettingsPage";
import ShortcutsPanel from "./ShortcutsPanel";
import TitleBar from "./TitleBar";
import StorageError from "./StorageError";
import { SidebarInset, SidebarProvider } from "./ui/sidebar";

function Workspace() {
  const mac = isMacPlatform();
  return (
    <>
      <Show when={!focusMode()}>
        <TitleBar />
      </Show>
      <main
        class="@container relative flex min-h-0 min-w-0 flex-1"
        aria-label="Document"
        data-layout={layoutMode()}
      >
        <Show when={!focusMode()}>
          <Outline />
        </Show>
        <div class="min-h-0 min-w-0 flex-1" data-testid="editor-pane">
          <Editor mode={layoutMode()} />
        </div>
        <Show when={!focusMode()}>
          <DocumentStatus />
        </Show>
        <Show when={focusMode()}>
          <button
            type="button"
            class="icon-button absolute top-3 right-3 size-8"
            aria-label="Exit focus mode"
            title={shortcutTitle("Exit focus mode", shortcutKeys("exit-focus"), mac)}
            aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("exit-focus"), mac)}
            onClick={() => setFocusMode(false)}
          >
            <Icon name="minimize" size={16} />
          </button>
        </Show>
      </main>
    </>
  );
}

function Session() {
  startHistorySync(window);
  return (
    <Show
      when={view() === "settings"}
      fallback={
        <Show when={hasDocuments()} fallback={<EmptyLibrary />}>
          <Workspace />
        </Show>
      }
    >
      <SettingsPage />
    </Show>
  );
}

export default function AppShell() {
  trackLibrary(window);
  const releaseStartupTransitions = holdTransitions();

  onSettled(() => {
    if (!currentLibrary()) void startLibrary();
    const cancelRenderWarmup = runWhenIdle(() => void getRenderClient());
    const stopPersistence = startPersistenceSync(window);
    const stopDesktopSync = startDesktopSync();
    const stopThemeWatch = watchSystemTheme(window);
    const mac = isMacPlatform();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (shortcutsOpen()) {
          event.preventDefault();
          setShortcutsOpen(false);
          return;
        }
        if (view() === "settings") {
          event.preventDefault();
          closeSettings();
          return;
        }
        if (hasOpenComposerMenu(event.target)) return;
        if (focusMode()) setFocusMode(false);
        return;
      }
      const handled = handleGlobalShortcut(
        event,
        {
          setLayout: setLayoutMode,
          toggleSidebar,
          toggleFocusMode,
          toggleShortcuts,
          toggleSettings: () => toggleSettings(),
          focusSearch: () => {
            setShortcutsOpen(false);
            setFocusMode(false);
            setSidebarOpen(true);
            requestSearch();
          },
          createDocument: () => {
            if (libraryStatus().kind !== "ready") return;
            setShortcutsOpen(false);
            closeSettings();
            createDocument();
            requestEditorFocus();
          },
        },
        mac,
      );
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelRenderWarmup();
      stopPersistence();
      stopDesktopSync();
      stopThemeWatch();
      window.removeEventListener("keydown", onKeyDown, true);
    };
  });

  createEffect(
    () => ({ appearance: displayedAppearance(), colors: displayedColors() }),
    ({ appearance, colors }) => applyTheme(appearance, colors),
  );

  createEffect(
    () => libraryStatus().kind,
    (kind) => {
      if (kind !== "loading") releaseStartupTransitions();
    },
  );

  createEffect(documentFont, (font) => applyFontAttribute(font));

  createEffect(
    () => {
      if (libraryStatus().kind !== "ready") return pageTitle(null);
      if (view() === "settings") return pageTitle("Settings");
      return pageTitle(hasDocuments() ? title() : null);
    },
    (value) => {
      document.title = value;
    },
  );

  createEffect(docText, (text) => {
    const cancel = runWhenIdle(() => updateStatsFromText(text));
    return cancel;
  });

  return (
    <SidebarProvider
      open={sidebarOpen()}
      onOpenChange={setSidebarOpen}
      class="bg-canvas text-text"
      data-focus-mode={focusMode() ? "true" : undefined}
    >
      <Show when={!focusMode()}>
        <AppSidebar />
      </Show>
      <SidebarInset
        class="p-2 pl-0 max-md:p-0 [[data-focus-mode]_&]:p-0"
        data-testid="document-inset"
      >
        <div
          class="sheet flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-md:rounded-none max-md:border-0 max-md:shadow-none [[data-focus-mode]_&]:rounded-none [[data-focus-mode]_&]:border-0 [[data-focus-mode]_&]:shadow-none"
          data-testid="document-sheet"
        >
          <StorageError />
          <Switch fallback={<LibraryGate />}>
            <Match when={libraryStatus().kind === "ready"}>
              <Session />
            </Match>
          </Switch>
        </div>
      </SidebarInset>
      <ShortcutsPanel />
    </SidebarProvider>
  );
}
