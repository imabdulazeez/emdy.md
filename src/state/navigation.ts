import { createEffect, createSignal, onSettled, untrack } from "solid-js";
import { activeOutlineIndex, type OutlineEntry } from "~/lib/editor/outline";
import {
  documentHref,
  documentPath,
  headingSlugs,
  isSettingsLocation,
  parseDocumentLocation,
  SETTINGS_PATH,
  type DocumentHrefOptions,
} from "~/lib/route";
import { cursor } from "./cursor";
import { activeDocumentId, findDocument, openDocument, title } from "./document";
import { editorApi } from "./editor-api";
import { outline, outlineDocumentId } from "./stats";
import { anchorViewportLine, readingViewportLine } from "./viewport";
import { documentPosition } from "./workspace";

export type NavigationWindow = Pick<
  Window,
  "location" | "history" | "addEventListener" | "removeEventListener"
>;

interface HeadingTarget {
  id: string;
  heading: string;
}

const [pendingHeading, setPendingHeading] = createSignal<HeadingTarget | null>(null, {
  equals: (a, b) => a?.id === b?.id && a?.heading === b?.heading,
});

export type AppView = "document" | "settings";

const [view, setView] = createSignal<AppView>("document");

export { pendingHeading, view };

export function currentDocumentPath(id: string, heading: string | null = null): string {
  return documentPath({ id, title: findDocument(id)?.title ?? "" }, heading);
}

export function currentDocumentHref(id: string, options: DocumentHrefOptions = {}): string {
  if (!id) return `/${options.search ?? ""}`;
  return documentHref({ id, title: findDocument(id)?.title ?? "" }, options);
}

function locationHref(win: NavigationWindow): string {
  const { pathname, search, hash } = win.location;
  return `${pathname}${search}${hash}`;
}

function liveOutline() {
  return outlineDocumentId() === activeDocumentId() ? outline() : null;
}

export function readingLine(): number {
  return readingViewportLine() || cursor().line;
}

export function activeHeading(): string | null {
  const entries = liveOutline();
  if (!entries) return null;
  const index = activeOutlineIndex(entries, readingLine());
  return index >= 0 ? headingSlugs(entries)[index] : null;
}

function lineOfOffset(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function restoredLine(id: string): number {
  const saved = documentPosition(id);
  if (!saved) return 0;
  if (saved.line > 0) return saved.line;
  const text = findDocument(id)?.text;
  return text === undefined ? 0 : lineOfOffset(text, saved.head);
}

function restoredInSection(id: string, entries: readonly OutlineEntry[], index: number): boolean {
  const line = restoredLine(id);
  return line > 0 && activeOutlineIndex(entries, line) === index;
}

function locationHeading(): string | null {
  const pending = pendingHeading();
  return pending && pending.id === activeDocumentId() ? pending.heading : activeHeading();
}

export function openSettings(win: NavigationWindow = window): void {
  if (untrack(view) === "settings") return;
  setView("settings");
  const { pathname, search } = win.location;
  win.history.pushState(null, "", `${pathname}${search}#${SETTINGS_PATH}`);
}

export function closeSettings(win: NavigationWindow = window): void {
  if (untrack(view) !== "settings") return;
  setView("document");
  const href = currentDocumentHref(untrack(activeDocumentId), { search: win.location.search });
  if (locationHref(win) !== href) win.history.replaceState(null, "", href);
}

export function toggleSettings(win: NavigationWindow = window): void {
  if (untrack(view) === "settings") closeSettings(win);
  else openSettings(win);
}

export function syncLocation(win: NavigationWindow): void {
  if (isSettingsLocation(win.location.hash)) {
    setView("settings");
    return;
  }
  setView("document");
  const route = parseDocumentLocation(win.location.hash);
  const target = route && openDocument(route.id) ? route.id : activeDocumentId();
  const heading = route && route.id === target ? route.heading : null;
  setPendingHeading(heading ? { id: target, heading } : null);
  const href = currentDocumentHref(target, { search: win.location.search, heading });
  if (locationHref(win) !== href) win.history.replaceState(null, "", href);
}

export function resetNavigationState(): void {
  setPendingHeading(null);
  setView("document");
}

export function startHistorySync(win: NavigationWindow = window): void {
  const [ready, setReady] = createSignal(false);
  const navigate = () => syncLocation(win);

  onSettled(() => {
    navigate();
    setReady(true);
    win.addEventListener("popstate", navigate);
    win.addEventListener("hashchange", navigate);
    return () => {
      win.removeEventListener("popstate", navigate);
      win.removeEventListener("hashchange", navigate);
    };
  });

  createEffect(
    () => {
      const pending = pendingHeading();
      if (!pending) return null;
      if (pending.id !== activeDocumentId()) return { stale: true as const };
      const entries = liveOutline();
      if (!entries) return null;
      const index = headingSlugs(entries).indexOf(pending.heading);
      const api = editorApi();
      if (index === -1) return { stale: false as const, line: null, api };
      if (restoredInSection(pending.id, entries, index)) return { stale: true as const };
      return { stale: false as const, line: entries[index].line, api };
    },
    (target) => {
      if (!target) return;
      if (target.stale || target.line === null) {
        setPendingHeading(null);
        return;
      }
      if (!target.api) return;
      target.api.scrollToLine(target.line);
      anchorViewportLine(target.line);
      setPendingHeading(null);
    },
  );

  createEffect(
    () =>
      ready() && view() === "document"
        ? { id: activeDocumentId(), title: title(), heading: locationHeading() }
        : null,
    (next, previous) => {
      if (!next) return;
      const href = next.id
        ? documentHref(next, { search: win.location.search, heading: next.heading })
        : `/${win.location.search}`;
      if (locationHref(win) === href) return;
      if (previous && previous.id === next.id) win.history.replaceState(null, "", href);
      else win.history.pushState(null, "", href);
    },
  );
}
