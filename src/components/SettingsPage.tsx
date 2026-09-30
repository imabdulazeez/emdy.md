import { For, onSettled } from "solid-js";
import { ariaKeyShortcuts, isMacPlatform, shortcutKeys, shortcutTitle } from "~/lib/shortcuts";
import { closeSettings } from "~/state/navigation";
import { preferences } from "~/state/preferences";
import { Icon } from "./icons";
import LibrarySettings from "./LibrarySettings";
import PreferenceField from "./PreferenceField";
import StorageSettings from "./StorageSettings";
import { SidebarTrigger } from "./ui/sidebar";

export const REPOSITORY_URL = "https://github.com/imabdulazeez/emdy.md";

export default function SettingsPage() {
  const mac = isMacPlatform();
  let backButton: HTMLButtonElement | undefined;

  onSettled(() => {
    backButton?.focus();
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col" data-testid="settings-page">
      <header
        class="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2 text-[13px]"
        aria-label="Settings toolbar"
        data-window-drag
      >
        <SidebarTrigger />
        <button
          ref={(el) => (backButton = el)}
          type="button"
          class="icon-button gap-1.5 px-2"
          aria-label="Back to document"
          title={shortcutTitle("Back to document", shortcutKeys("close-settings"), mac)}
          aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("close-settings"), mac)}
          onClick={() => closeSettings()}
        >
          <Icon name="arrow-left" size={15} />
          <span class="text-[12px]">Back</span>
        </button>
        <h1 class="min-w-0 flex-1 truncate pl-1 font-bold">Settings</h1>
      </header>
      <div class="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-8 text-[13px]">
          <section aria-labelledby="settings-preferences" class="flex flex-col gap-1">
            <h2 id="settings-preferences" class="mb-1 text-[12px] text-text-faint">
              Preferences
            </h2>
            <div class="flex flex-col divide-y divide-border">
              <For each={preferences()}>
                {(preference) => <PreferenceField preference={preference} />}
              </For>
            </div>
          </section>
          <section aria-labelledby="settings-library" class="flex flex-col gap-3">
            <h2 id="settings-library" class="text-[12px] text-text-faint">
              Library
            </h2>
            <LibrarySettings />
          </section>
          <section aria-labelledby="settings-storage" class="flex flex-col gap-3">
            <h2 id="settings-storage" class="text-[12px] text-text-faint">
              Storage
            </h2>
            <StorageSettings />
          </section>
          <section aria-labelledby="settings-about" class="flex flex-col gap-1">
            <h2 id="settings-about" class="mb-1 text-[12px] text-text-faint">
              About
            </h2>
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Source code on GitHub"
              class="group -mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Icon name="github" size={16} class="shrink-0 text-text-muted" />
              <span class="text-text">Read the code</span>
              <span class="ml-auto truncate text-text-faint">
                {REPOSITORY_URL.replace("https://github.com/", "")}
              </span>
              <Icon
                name="arrow-up-right"
                size={14}
                class="shrink-0 text-text-faint transition-colors duration-150 group-hover:text-text"
              />
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
