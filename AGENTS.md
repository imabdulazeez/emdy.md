## About This Project

emdy is a beautiful, 100% local, and lightning-fast Markdown editor. Its design is inspired by local-first apps like jspaint: useful and instantly responsive. It is built with plain Solid 2 on the Vite+ toolchain, and ships both as a web app and as an Electron desktop app built from the same renderer (see "Desktop app").

## Core Principles

### 1. Everything runs locally

- All processing happens on the user's device. Parsing, rendering, file handling, search, and any other logic run in the renderer (in the browser or the desktop app's window) or, on the desktop, in the Electron main process. Nothing runs on a remote machine.
- No data may be sent to any server. This includes documents, file names, settings, usage data, crash reports, and telemetry of any kind.
- The one outbound request the app makes on its own is loading an image a document embeds by remote URL, because rendering the user's own Markdown faithfully requires it. It is sent with no `Referer` and carries nothing from the app. External links open only when the user follows one, in a new tab or the system browser. Do not widen either exception to any other request.
- Do not add analytics SDKs, error-reporting services, remote fonts, CDNs, or any third-party network calls. Bundle every asset with the app.
- Persist user data only on the device: local browser storage (localStorage, the Origin Private File System) through `src/lib/storage/`, and in the desktop app the user's documents folder and the main process's files in `<userData>`.
- If a feature seems to require a server, stop and find a local alternative. If none exists, do not build it.

### 2. Fast and beautiful

- Keep the UI responsive at all times. Avoid blocking the main thread; move heavy work to Web Workers.
- Prefer small, focused dependencies. Check bundle impact before adding a library.
- Respect the visual direction of the app. Match existing styles and components rather than introducing new patterns.

## UI / Styling & Theme

- Prefer Solidcn (https://solidcn.dev/) for new reusable UI primitives.
- Reuse existing components before adding new ones. Check Solidcn’s documentation for a suitable component before building a custom primitive.
- Install Solidcn components into `src/components/ui/` using `pnpm dlx solidcn@latest add <component>`. Customize the generated source to match the app.
- Build custom components when Solidcn has no suitable equivalent or its dependencies and behavior do not fit the requirement.
- Adapt Solidcn’s theme tokens to the app’s palette below. Preserve the theme state in `src/state/theme.ts` and the resolved `data-theme="light|dark"` attribute on `<html>`.
- If components require `dark:` utilities, configure the custom variant in `src/app.css` to target `[data-theme="dark"]`.
- Preserve accessibility, keyboard navigation, visible focus states, and reduced-motion support.
- Bundle all component dependencies and assets locally. Components must introduce no runtime network requests.

### Visual direction

The app is a sheet on a canvas. The sidebar sits directly on a soft stone canvas with no borders. The document is a raised white sheet with rounded corners, a hairline edge, and a soft shadow, inset from the canvas; it goes edge to edge on small screens and in focus mode. Chrome is a single 44px toolbar row. Every face is a system font; no font files are bundled. Chrome uses the native UI face (`--font-ui`: SF Pro, Segoe UI, Roboto, …), code uses the native monospace (`--font-mono`), and the document uses `--font-prose`, which follows the "Document font" preference (Sans, Serif, Mono, Handwriting) through `data-font` on `<html>`. The stacks live in `src/app.css`; the inline script in `index.html` applies `data-font` before first paint, and print and Word export carry the same choice. There is one brand colour, a cobalt ink, used sparingly for the active state, the caret, links, and the focus ring. Everything else is neutral so the text carries the page.

- Use `font-bold` or colour for hierarchy; never `font-medium` or `font-semibold`. Many system faces in the stacks (and every handwriting face) ship only regular and bold, so intermediate weights render inconsistently across platforms.
- Never add a font file, `@font-face`, or font package. When a face is missing, extend the relevant stack in `src/app.css` with native fonts from each platform, ending in a CSS generic family.
- Keep motion to responses to user action (hover, open, expand). No page-load animations.
- Structural devices (rules, indentation, markers) must encode information, not decorate.

### Colour palette

All colour comes from the tokens defined in the `@theme` block of `src/app.css`. Tailwind v4 turns each `--color-*` token into utilities (`bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`), and `[data-theme="dark"]` swaps the values, so a component styled with tokens is automatically dark-mode correct.

| Role              | Token            | Tailwind classes                          | Use for                                                                         |
| ----------------- | ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| Canvas            | `canvas`         | `bg-canvas`                               | The window background behind the sidebar and sheet                              |
| Surface           | `surface`        | `bg-surface`                              | The document sheet, menus, dialogs, checked segments                            |
| Raised surface    | `surface-raised` | `bg-surface-raised`                       | Inputs, segmented tracks, code backgrounds, labelled triggers                   |
| Border            | `border`         | `border-border`, `ring-border`            | Hairlines between regions and around popovers                                   |
| Strong border     | `border-strong`  | `border-border-strong`                    | Scrollbars, rules inside content                                                |
| Text              | `text`           | `text-text`                               | Primary text and active labels                                                  |
| Muted text        | `text-muted`     | `text-text-muted`                         | Secondary labels, idle icon buttons                                             |
| Faint text        | `text-faint`     | `text-text-faint`                         | Placeholders, excerpts, group labels                                            |
| Accent            | `accent`         | `text-accent`, `bg-accent`, `ring-accent` | Checked marks, primary buttons, focus ring, caret, links                        |
| Accent soft       | `accent-soft`    | `bg-accent-soft`                          | Tinted background behind an active or pressed control                           |
| Accent foreground | `accent-fg`      | `text-accent-fg`                          | Text on a solid accent background                                               |
| Danger            | `danger`         | `text-danger`                             | Destructive action labels only                                                  |
| Danger soft       | `danger-soft`    | `bg-danger-soft`                          | Background of a destructive confirmation                                        |
| Selection         | `selection`      | `bg-selection`                            | Text selection and search matches                                               |
| Hover             | `hover`          | `hover:bg-hover`                          | Hover wash on quiet controls                                                    |
| Strong hover      | `hover-strong`   | `hover:bg-hover-strong`                   | Hover wash on controls that already sit on a raised surface                     |
| Scrim             | `scrim`          | `bg-scrim`                                | Backdrop behind modal dialogs and the mobile sidebar                            |
| Glass             | `glass`          | `bg-glass`                                | Translucent surface for elements floating over content, with `backdrop-blur-sm` |

Elevation uses the shadow tokens `shadow-lift` (a checked segment or active list item), `shadow-sheet` (the document), and `shadow-pop` (menus and dialogs).

Rules:

- Never write a hex value, `rgba()`, or `color-mix()` in a component. If a colour is missing, add a role token to `src/app.css` in both themes and use its class.
- Colour themes live in `src/lib/themes/palettes.ts`. The values in `src/app.css` are the Paper theme and the no-script fallback; the active theme overrides each role in `THEME_ROLES` with an inline custom property on `<html>`. A new hex role token must also be added to `THEME_ROLES`, `ROLE_LABELS`, `ROLE_GROUPS`, and `derivePalette`, or themes will not reach it.
- Never use Tailwind’s default palette (`bg-gray-100`, `text-blue-600`, etc.).
- Editor and preview CSS use the same tokens through `var(--color-*)`. Syntax colours live under `--color-syntax-*`.
- Reuse the shared utilities in `src/app.css` before writing new classes: `icon-button` (quiet 28px control with hover, pressed, expanded, and disabled states), `segment-track` and `segment` (segmented controls), `popover` (menus and small dialogs), `menu-item` (a row in a toolbar or context menu, with a `data-danger` variant), `icon-tile` (the tinted square behind a monogram), `sheet` (the document container).
- Right-click menus use `ContextMenu` from `src/components/ui/context-menu.tsx`, never the native menu, for app chrome such as the sidebar. Open it from both `contextmenu` and `isContextMenuKey` (Shift+F10 or the Menu key) so keyboard users reach the same actions. Leave the native menu alone wherever text is edited, so spellcheck and paste keep working.
- Document icons come from `src/lib/document-icon.ts`. With no icon chosen, `DocumentIcon` draws a monogram and colour derived from the title. A chosen icon is a Lucide glyph, an emoji, or custom letters. Icon colours use the `--color-icon-*` tokens. The Lucide set is in `src/lib/lucide-registry.ts`, a lazy chunk that `state/lucide.ts` loads only when a Lucide icon is shown or the picker opens. Never import it statically.

## Composer menus

Typing `@` at the start of a word opens a menu of dates, other documents, headings (`@#`), and values of the open document; `/` at the start of a line opens the block menu. Both live in `src/lib/editor/composer.ts` and insert plain Markdown only, never a live token, because documents are `.md` files. They stay shut in code, links, URLs, and HTML. The document title field offers the same dates through its own small listbox in `DocumentTitle.tsx`; both surfaces share the trigger rule in `src/lib/mention-query.ts`. Dates come from the device's local calendar through `src/lib/dates.ts`; never derive a date from `toISOString()`, which is UTC.

## Keyboard shortcuts

Keyboard use is first class: every action is reachable from the keyboard, and every shortcut is declared once. `SHORTCUTS` in `src/lib/shortcuts.ts` is the registry. Each entry has an `id`, `keys` in CodeMirror notation (`Mod-Shift-f`; `Mod` is Cmd on macOS and Ctrl elsewhere), a `label`, and a panel `group`.

- **Register once, derive everywhere.** An action with a shortcut gets one `SHORTCUTS` entry, and every binding reads it with `shortcutKeys(id)`: the CodeMirror keymap in `src/lib/editor/extensions.ts`, `GLOBAL_SHORTCUTS` (run by the capture listener in `AppShell`), and `isContextMenuKey`. Never write a key string such as `"Mod-b"` in a handler or component.
- The shortcuts panel renders the registry, so a new entry needs no panel changes. A control with a shortcut sets `title` with `shortcutTitle(label, keys, mac)` and `aria-keyshortcuts` with `ariaKeyShortcuts(keys, mac)`; a menu item passes `keys` to `ToolbarMenu`. Display keys only through `formatShortcut`, never hand-written glyphs like "⌘B" or "(Esc)".
- Every new action should consider a shortcut. Choose one that is free in the registry and in the editor keymap; leave the action without one rather than take a poor key.
- Never claim browser- or OS-reserved combinations (Mod-n, Mod-t, Mod-w, Mod-q, Mod-Tab, F5, F12) or keys that text editing needs (arrows, Home, End, Backspace, Mod-a, Mod-c, Mod-v, Mod-x). Tab and Enter may only extend their editing meaning, as the list bindings do. A global shortcut runs before the editor sees the key, so it must not shadow an editor binding.
- **Desktop keys.** The desktop app has no browser to reserve keys, so an entry may add `desktopKeys` with the conventional native key when its web key is only a stand-in for a browser-reserved one (New document is `Mod-Alt-n` on the web and `Mod-n` on the desktop).
  - `shortcutKeys` and `keysFor` pick the right one through `isDesktop()`, so tooltips, `aria-keyshortcuts`, the panel, the global handler, and the desktop menu follow it.
  - `desktopKeys` may only name a browser-reserved combination. It must not shadow an editor binding or a `desktop/menu.ts` accelerator that belongs to a different action; Mod-w and Mod-q stay with the menu's Close and Quit.
  - A new or changed `desktopKeys` needs an Electron spec that presses it.
- Keep keyboard parity with the mouse. Context menus open from `isContextMenuKey` as well as `contextmenu`, menus move with the arrow keys, and dialogs and popovers close on Escape and hand focus back to their trigger.
- Widget-local keys (Enter and Escape in an input, arrows in a menu, Tab between table cells) follow platform conventions and are not registered.
- The `/` menu lists the `Blocks` group of `SHORTCUTS` and runs `BLOCK_COMMANDS` from `src/lib/editor/extensions.ts`, which the keymap also reads. A new block action gets a registry entry and a `BLOCK_COMMANDS` entry and appears in both.
- `src/lib/shortcuts.test.ts` fails when a registry entry is not bound on macOS, Windows, and Linux, when the editor binds a key the registry lacks, or when a global shortcut shadows an editor binding. `AppShell.test.tsx` fails when a control advertises an unregistered key or its tooltip disagrees with its `aria-keyshortcuts`. A new or rekeyed binding also needs a browser assertion that pressing the key performs the action (see `tests/browser/shortcuts.spec.ts`).

## Persistence and Settings

Every user-facing setting and every piece of restorable workspace state is persisted through the storage layer in `src/lib/storage/`. Nothing else may touch `localStorage`, `sessionStorage`, or IndexedDB directly.

- `src/lib/storage/key-value.ts` is the only adapter. It namespaces keys as `emdy:<area>:<name>`, swallows quota and private-mode errors, and can be swapped for a memory store in tests with `useStorage`.
- `src/lib/storage/persisted.ts` provides `createPersistedSignal`. It reads once at module init, validates with a type guard, falls back to the default on anything invalid or malformed, writes on every set (optionally debounced), follows other tabs through the `storage` event, and flushes on `pagehide`. Use `peek()` for a synchronous read; Solid 2 defers signal writes until the next flush.
- There is no versioning or migration code. When a stored shape changes, the old value fails validation and the default applies.

Two registries sit on top of the adapter and have different lifecycles:

| Registry    | Module                     | Holds                                                                                     | Settings page |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------- | ------------- |
| Preferences | `src/state/preferences.ts` | Choices the user makes deliberately: theme, view, future options                          | Yes           |
| Workspace   | `src/state/workspace.ts`   | Where the user was: last document, pinned documents, per-document cursor and reading line | No            |

Rules:

- **Every customizable setting is a preference.** Declare it once, next to the state it drives, with `definePreference({ name, label, fallback, parse, control })`. The `parse` type guard is mandatory and is what makes stored data safe to trust. `label` and `control` are what the settings page will render, so a new preference needs no page changes. Do not add ad-hoc signals for settings, and do not read or write `localStorage` in components.
- **Workspace state is not a setting.** It is restored silently and never shown on the settings page. Per-document state is keyed by document id and pruned when the document is deleted or missing at startup.
- **Transient modes stay in memory.** Focus mode, the shortcuts panel, and open menus are not persisted.
- The inline script in `index.html` reads the theme, palette, custom-theme, and document font keys before first paint to avoid a flash. The built-in palettes are injected into it at build time by `firstPaintThemesPlugin` in `src/lib/themes/first-paint.ts`. `src/state/preferences.test.ts` asserts the literal keys match `preferenceKey(...)` and that every font choice is listed; keep them in sync.
- There are no seed documents. Test fixtures with fixed ids live in `src/test-documents.ts` and are shared by both suites; the browser suite loads them through the import path with `seedLibrary`. `makeDocumentId` excludes existing ids so generated ids never collide with loaded ones.
- A new persisted value ships with a colocated test for its default, validation, and write, and with a browser assertion that it survives `page.reload()` (see the routing row of the table below).

### Document library

Documents are plain `<title>.md` files in a directory, never blobs in a database. The code that owns this lives in `src/lib/storage/` and is driven by `src/state/library.ts`.

- `directory.ts` defines the `Directory` interface and is the only place that touches handles. `createHandleDirectory` wraps a `FileSystemDirectoryHandle`, `createOriginPrivateDirectory` opens the Origin Private File System root and asks for persistence, and `createMemoryDirectory` is the test double. `desktop-directory.ts` implements the same interface over the desktop bridge.
- In the browser, the Origin Private File System is the only storage. There is no folder picker, no storage selector, and no memory fallback: `defaultDirectorySource` in `state/library.ts` opens the OPFS root at startup, and a browser that has none is an error, not a silent downgrade. In the desktop app the same function opens the user's documents folder through the bridge instead (see "Desktop app"). `useLibraryDirectory` swaps in a memory directory for tests.
- `filenames.ts` maps titles to safe filenames and back (forbidden characters, reserved names, NFC, byte cap, ` 2` suffixes). Renaming a document renames its file.
- `catalog.ts` keeps `.emdy/index.json` beside the files. It is a rebuildable cache, not a source of truth: it keeps document ids stable across renames and moves, and carries each document's chosen icon (`icon`, omitted when automatic). Losing the catalog only resets icons to automatic. An invalid stored icon is dropped rather than invalidating the catalog, and an icon-only change is written straight away without changing `modified`. `reconcile` matches files by name, then by content hash for rename detection, mints ids for new files, and drops entries whose files are gone. A folder without a catalog opens as-is; an empty folder opens as an empty library, and the workspace shows the welcome sheet until the first document is created or imported.
- `library.ts` batches writes with a 500 ms debounce, writes the catalog before the files so an interrupted commit never loses an id, and re-reads the folder on `visibilitychange` so edits from other apps appear. While the app has unsaved edits the app wins; a document changed both in the app and on disk gets a `(conflict)` copy.
- `journal.ts` stores pending edits in localStorage synchronously on `pagehide`, because the asynchronous file writes cannot be awaited during unload. The next start replays the journal, using the recorded base hashes to tell a lost write from an outside edit.
- `archive.ts` defines the export file: plain JSON (`emdy-library`, version 1) holding every document's id, title, text, catalog stamps, and chosen icon, downloaded as `emdy-<date>.json`. Import goes through `library.import`, which merges against the folder on disk rather than memory: exact duplicates (same title and text) are skipped, free ids are kept so links survive, colliding ids are re-minted, and nothing already present is ever overwritten. Both `created` and `modified` carry over: the catalog's `modified` is the last write the app knows about, and a separate `synced` field records the file mtime last seen, which is what `reconcile` compares to detect outside edits.
- Links between documents are plain relative Markdown links to the target's file (`[Title](Title%20file.md)`, `#slug` for a heading), built by `src/lib/markdown/document-links.ts`. `state/links.ts` resolves them by catalog file, then by title, and rewrites every link to a file the library renames, updating a label that still reads as the old title. The read-only preview is the editable preview's CodeMirror view locked by `readOnlyPreview`. In both previews, `followLinks` in `src/lib/editor/follow-links.ts` follows local links through the URL fragment: relative targets in table cells live in `data-href` (never `href`), read-only inline links render without an `href`, and middle-clicks on local links are prevented, so no click, middle-click, or new tab can request a path that names a document. External links keep a real `href` and open in a new tab. The Markdown-to-HTML worker now serves export only.
- Never let a storage failure pass as an empty library. When the OPFS root cannot be opened or read, `LibraryGate` blocks the workspace with the failure message and a retry rather than starting the user on documents that will not be saved.

## Desktop app

The desktop app is an Electron shell around the unchanged renderer. Its code lives in `desktop/`; the renderer only ever sees it through the bridge the preload script exposes as `window.emdyDesktop` (`src/lib/desktop/bridge.ts`). `desktopBridge()` returns `null` in the browser, so every desktop branch in `src/` must also work, and be tested, without it.

- **Loading.** The renderer is served from the privileged `app://emdy/` scheme by `protocol.handle` in `desktop/main.ts`, never from `file://` or a local server. `resolveAppRequest` in `desktop/app-url.ts` maps a request to a file and refuses anything that escapes the renderer or dictionary folders, and `appResponse` reads that file directly (Electron's `fs` reads inside `app.asar`) with an explicit content type. Never hand it to `net.fetch` as a `file://` URL: the packaged app answers "Not found" that way while the unpacked app used by the Electron specs still works. Routing stays in the URL fragment, so the app only ever loads `app://emdy/`.
- **Local-first enforcement.** `desktop/network.ts` is the desktop counterpart of the Playwright network guard: `session.webRequest` cancels every request that is not `app://emdy`, an in-memory URL, the dev server while developing, or an image the document embeds (parity with the web). The `Referer` header is stripped. Permissions are denied except clipboard writes and fullscreen. New windows are denied and `http(s)`/`mailto` links go to the system browser with `shell.openExternal`; nothing else is ever handed to the OS. The desktop build adds a Content-Security-Policy with the inline first-paint script's hash (`desktop/html.ts`); never add `'unsafe-eval'` or a remote origin to it.
- **Hardening.** Keep `contextIsolation`, `sandbox`, and `nodeIntegration: false`. IPC handlers check the sender is the app document. The Electron fuses in `electron-builder.yml` disable `RunAsNode`, `NODE_OPTIONS`, and inspector flags, and enforce asar integrity; do not relax them. DevTools and the reload item exist only in development.
- **Documents folder.** Documents are plain `.md` files in a real folder (`~/Documents/emdy` by default, `~/Documents/emdy-dev` while developing), laid out exactly like the OPFS library, including `.emdy/index.json`. The main process owns the folder path and stores it in `<userData>/desktop.json` (`desktop/config.ts`); the renderer can never name a path. `desktop/folder.ts` validates every name and path segment, writes through a staging file and rename, and maps Node errors to the DOMException names the storage layer expects (`NotFoundError` above all). Every folder call carries the session number returned by `open`; choosing another folder bumps it, so a library opened on the old folder can never write into the new one.
- **Outside edits.** `desktop/watcher.ts` watches the folder, ignores the app's own recent writes and staging files, and asks the renderer to re-read; window focus does the same. `startDesktopSync` in `state/desktop.ts` wires both to `syncLibrary`.
- **Opened files.** Markdown files (`.md`, `.markdown`) from other folders arrive through the OS (`open-file` on macOS; argv and `second-instance` on Windows and Linux; registered by the per-platform `fileAssociations` and Linux `mimeTypes` in `electron-builder.yml`), File › Open…, or a drop on the window. `desktop/opened-files.ts` owns them and keeps each file's id, path, and icon in `<userData>/opened-files.json`; the renderer only ever sees the id. A drop reaches main as `File` objects that the preload resolves with `webUtils.getPathForFile`, so page code never passes a path string, and main still accepts only existing Markdown files. A file inside the documents folder opens its library document instead. Opened files are edited in place and never copied into the documents folder: `src/lib/storage/opened-files.ts` saves them with the library's debounce through the same staged write (keeping the file's mode), keeps an outside edit that collides with an unsaved one as a `(conflict)` copy beside the file, and renames the file only when the title itself is edited (`fixedTitle` stops a heading edit from renaming someone's README). The sidebar lists them under "Other folders", where Close replaces Delete and nothing on disk is removed, and every row's context menu offers Reveal in Finder or File Explorer (`revealDocument` in `state/desktop.ts`). They are left out of library exports and have no `pagehide` journal, so the close guard is their only unload protection. The web app keeps the editor's own drop behaviour.
- **Closing.** The window's `close` is held by `desktop/close-guard.ts` until the renderer has flushed preferences and pending saves (or three seconds pass), so quitting straight after typing loses nothing. The `pagehide` journal remains as the second line of defence.
- **Spellcheck.** macOS uses the system checker. On Windows and Linux Chromium would download Hunspell dictionaries from a Google CDN; instead `desktop/scripts/stage.ts` extracts dictionaries from Electron's own release archive (verified against `node_modules/electron/checksums.json`), and the main process copies them into `<userData>/Dictionaries` before Chromium looks. `EMDY_DICTIONARIES` selects languages at build time (`en-US,fr-FR`, `all`, or `none`; English by default). "Add to dictionary" stays in Chromium's local custom dictionary.
- **Menus.** `desktop/menu.ts` gives every menu item an explicit accelerator. App actions in the menu are built with `commandItem` from `MENU_COMMANDS`: the item's id is the `SHORTCUTS` id, its accelerator is `shortcutKeys(id, true)`, and `registerAccelerator: false` leaves the key to the renderer's global handler while a click sends the command over the `menuCommand` channel. Never write an accelerator by hand for an action that has a registry entry. `desktop/menu.test.ts` fails when any other item shadows a `SHORTCUTS` entry (only Undo and Redo may overlap, because they run the same command). Right-clicks in editable text get `desktop/context-menu.ts`; app chrome keeps using `ContextMenu`.
- **Commands.** `pnpm dev:desktop` packs the main process and starts `vp dev --mode desktop`, which launches Electron on the dev server. `pnpm build:desktop` runs `vp build --mode desktop` (renderer into `out/desktop/app/renderer`), `vp pack` (main and preload from the `pack` block of `vite.config.ts`), and the staging script. `pnpm start:desktop` runs the built app. `pnpm package:desktop`, `package:mac` (DMG and zip), `package:win` (NSIS), and `package:linux` (AppImage and tar.gz) produce installers in `out/desktop/release`. `pnpm build` is still the web build.
- **Signing and release builds.** The app is unsigned, so the mac build signs it ad hoc (`identity: "-"` in `electron-builder.yml`), with hardened runtime and notarization off because both need a Developer ID team. Flipping the fuses rewrites the Electron binaries, and without that ad hoc signature Apple silicon kills the app at launch with `CODESIGNING Invalid Page`. On macOS the staging script builds `out/desktop/icon.icns` from `desktop/resources/icon-mac.png` with `sips` and `iconutil`, which the mac build uses; electron-builder's own PNG-to-icns conversion writes 16 and 32 px images that macOS draws as noise. `.github/workflows/desktop-builds.yml` builds each platform in its own job (macOS arm64 and x64, Windows x64, Linux x64) on a `v*` tag or manual dispatch and uploads the installers as artifacts.
- **Tests.** Main-process modules are plain functions with colocated `desktop/**/*.test.ts` files; keep `desktop/main.ts` to wiring so it needs no test of its own. Electron specs live in `tests/desktop/` and run with `pnpm test:desktop`; like the browser suite, agents write them but do not run them. A change to the folder, watcher, close guard, or bridge needs an Electron spec that drives the real app.

## Testing Requirements

Every piece of logic or functionality must have a unit test. This applies to UI components as well as plain functions. The only exception is an entry point that holds nothing but wiring, such as `desktop/main.ts`; move any logic out of it into a tested module.

The two suites answer different questions and neither substitutes for the other. The colocated suite runs in jsdom, where `src/test-setup.ts` stubs `getBoundingClientRect`, `getClientRects`, `elementFromPoint`, `matchMedia`, and `ResizeObserver` — each returns a zero-sized or inert result. Logic, formatting, and state transitions belong there. Anything whose correctness depends on real geometry, scrolling, focus order, navigation, or network behaviour belongs in the browser suite, because jsdom will pass a broken implementation of all five.

### Unit and component tests

- Colocate tests with the code they cover using the `*.test.ts` or `*.test.tsx` suffix (for example `src/lib/dates.ts` and `src/lib/dates.test.ts`).
- Import test APIs from `vite-plus/test`, not from `vitest` directly:

  ```ts
  import { describe, expect, it, vi } from "vite-plus/test";
  ```

- Unit and component test configuration lives in the `test` block of `vite.config.ts`. Do not create a separate `vitest.config.ts`.
- **Pure logic** (parsers, formatters, state helpers, storage adapters): test inputs, outputs, and edge cases directly.
- **UI components** (anything under `src/components`): render the component with `@solidjs/testing-library` and assert on what the user sees and does. Use `@testing-library/user-event` for interactions. Cover rendering, props, user events, and reactive state changes.
- When you add a new function or component, add its test in the same change. When you change behavior, update the tests to match.
- If the UI testing dependencies (`@solidjs/testing-library`, `@testing-library/jest-dom`, `jsdom`) are not yet installed, install them as devDependencies and wire them into the `test` block before writing UI tests.

Run tests with:

```bash
vp test
vp test watch
vp test run --coverage
```

### Real-browser integration tests

Add or update a Playwright test in the same change whenever you change one of these behaviors:

| Change                                                                               | Required browser assertion                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document startup, URL routing, or storage/recovery                                   | Reload an actual document URL and assert the resulting route, active document, content, and ability to continue editing. When adding persistence, assert that the edited content and document identity survive reload.                                                                                        |
| Debouncing, snapshot publication, or document switching                              | Edit document A, switch to B before the debounce expires, then let timers run. Assert B is unchanged and returning to A restores its edit.                                                                                                                                                                    |
| Editor state creation, history, or undo/redo commands                                | Edit A, switch to B, and undo. Assert A's history cannot alter B; then edit and undo within B to verify its own history works.                                                                                                                                                                                |
| Table/widget editing, keyboard handlers, or focus transfer                           | Enter the widget through the UI, use the affected keys, and assert the focused cell/control and resulting document content. For row/column insertion, assert the new cells are visible and do not overlap. Exercise both Raw Markdown and Editable preview when both use the changed code.                    |
| Scroll synchronization, outline navigation, sizing, or widget layout CSS             | Use a document taller than the viewport. Click an outline entry or scroll with the mouse, then assert actual scroll position, target visibility, and the outline marker. Set a viewport where the affected UI is present.                                                                                     |
| Media rendering, asset loading, workers, or dependencies that execute in the browser | Exercise the new rendering/loading path through the shared network fixture, including the content that triggers it. For features intended to work offline, load the required bundled assets, set the context offline, and perform the operation.                                                              |
| URL shape, or anything that could carry document content into a request              | Give the document a distinctive title and headings, then assert none of them — nor its id — appear in any request line, query string, or `Referer` header, and that navigations only ever request `/`. Read the `requests` fixture, which records every request the browser attempts, including blocked ones. |

- The table lists the cases that have already caused regressions; it is not exhaustive. When a change matches no row, ask whether any jsdom stub above could hide the failure. If it could, the change needs a browser test even though no row names it.
- Extend an existing scenario when it already performs the affected action. Add a separate test when the regression needs a different setup or action sequence. Keep parser/formatter edge cases and component prop variations in colocated tests unless their outcome depends on browser behavior — prefer the colocated suite whenever the outcome does not, since browser specs cost more per test and are likelier to go flaky.
- When a merge or rebase makes an existing spec fail because the behaviour it asserts was deliberately replaced, update the assertion to the new behaviour and say so. That is not weakening a test; changing an assertion to avoid a failure you cannot explain is. Establish which one you are doing before editing the spec.
- When fixing a bug involving browser layout, scrolling, focus, navigation, or requests, add a regression assertion that fails with the bug present. A passing jsdom test is insufficient for these bugs because `src/test-setup.ts` substitutes geometry and observers.
- Put browser specs in `tests/browser/*.spec.ts`. Import `test` and `expect` from `./fixtures`; importing the base Playwright test bypasses the network and browser-error checks.
- Drive edits, navigation, and focus through browser input and accessible locators. Do not dispatch CodeMirror transactions or call application state setters to perform the action under test.
- Do not import `src/test-setup.ts` or mock geometry, scrolling, or observer APIs. Read real bounding boxes and scroll positions for layout assertions. Use retrying assertions instead of fixed sleeps; use Playwright's clock when a test must hold a debounce pending.
- Keep the shared network guard enabled. Do not allow an unexpected request merely to make a test pass. New bundled assets are discovered from `dist`; navigations are permitted only for `/`, and external requests, unrecognized paths, query strings, beacons, and WebSockets must still fail. Keep service workers blocked while relying on request interception.
- Document routing lives in the URL fragment so the host only ever sees `/`. Never widen the guard's navigation rule to admit a document path — that rule is what enforces the local-first promise over the wire, and jsdom tests asserting `location.pathname` cannot catch a real leak.
- On failure, inspect the screenshot and trace in `test-results/`. Fix the failing behavior or an incorrect test assumption; do not skip the test, weaken its assertion, or add retries to conceal a failure. Do not commit generated artifacts.

### Who runs the browser suite

Agents write and update browser specs but do not run them. The user runs the browser suite manually. Every rule above about when a spec is required still applies: add or update the spec in the same change, even though you will not execute it.

- Do not run `pnpm test:browser`, `pnpm test:desktop`, or `playwright test`.
- When you finish, list the browser specs you added or changed and the behaviour each asserts, so the user knows what to run. State plainly that they have not been run.
- If a change could plausibly break an existing spec (a renamed label, a changed title, a moved control), search `tests/browser/` for the affected locator or text and update the spec rather than leaving it for the user to discover.

For reference, `pnpm test:browser` builds the app and manages a temporary preview server on `127.0.0.1:4173`. On a fresh machine, Chromium is installed with `pnpm exec playwright install chromium`.

### How often to run each suite

- **While working:** `vp test watch` for the colocated tests; agents run `vp test` instead, optionally filtered to the affected files.
- **Before every commit:** the full Definition of Done below. The `vp staged` pre-commit hook only formats and lints staged files; it runs no tests, so a hook that passes says nothing about behaviour.
- **Before every push:** the colocated suite in full against the whole working tree. The user runs the browser suite before merging.
- **In CI:** `.github/workflows/ci.yml` runs both suites on every push to `main` and every pull request. One job runs `vp check`, `vp test`, and `pnpm build:desktop`; the other installs Chromium and runs `pnpm test:browser` with `CI=true` (`forbidOnly`, two workers), uploading `test-results/` when it fails.

Do not move the browser suite into the pre-commit hook. `vp build` builds the working tree rather than the index, so it would test unstaged changes and report on code that is not part of the commit.

`retries` is deliberately unset so an intermittent geometry assertion fails loudly instead of being papered over. Fix the flake rather than adding retries.

## Definition of Done

A turn is only complete when all of the following pass with no errors:

```bash
vp check   # format + lint + type check
vp test    # unit tests
```

The browser suite is not part of an agent's Definition of Done; the user runs it manually (see "Who runs the browser suite").

- If lint, formatting, type checking, or tests fail, fix the underlying problem and re-run until everything is green. Do not disable rules, skip tests, or add ignore comments to get past a failure.
- `vp check --fix` applies safe formatting and lint fixes automatically. Use it, then verify with a clean `vp check`.
- The pre-commit hook runs `vp staged`, which executes `vp check --fix` on staged files. Code that does not pass `vp check` cannot be committed.
- Never report a task as finished while any of these commands fail.

## When Something Is Unclear

- Consult the documentation before guessing. Context7 is available for fetching current library docs (Solid.js, CodeMirror, Vitest, Vite+, Electron, and others). Use it first.
- If Context7 does not resolve the question, read the library source and type definitions directly in `node_modules`. The installed code is the source of truth for the versions in use.
- Vite+ docs are also available locally at `node_modules/vite-plus/docs`.
- Prefer verified behavior over assumptions. When APIs have changed between versions, trust the installed version.

## Project Layout

- `src/app.tsx` — root application component.
- `src/index.tsx` — browser entrypoint.
- `src/components/` — reusable UI components, each with its own test. Styling uses the Tailwind token utilities; the few CSS files there cover CodeMirror and widget styles that utilities cannot reach.
- `index.html` — static HTML document and Vite entrypoint.
- `public/` — static assets bundled with the app.
- `vite.config.ts` — Vite+ configuration (lint, fmt, test, plugins).
- `playwright.config.ts` — browser suite configuration and temporary preview server.
- `tests/browser/` — Playwright integration specs and shared network/error fixture.
- `desktop/` — Electron main process, preload bridge, build plugins, and the staging script.
- `electron-builder.yml` — desktop packaging, fuses, and installer targets.
- `playwright.desktop.config.ts` and `tests/desktop/` — Electron specs.
- `~/*` resolves to `src/*`.
