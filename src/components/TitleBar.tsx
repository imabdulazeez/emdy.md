import { Show } from "solid-js";
import { ariaKeyShortcuts, isMacPlatform, shortcutKeys, shortcutTitle } from "~/lib/shortcuts";
import { layoutMode, isEditable } from "~/state/layout";
import { toggleFocusMode } from "~/state/ui";
import DocumentTitle from "./DocumentTitle";
import ExportMenu from "./ExportMenu";
import FormattingToolbar from "./FormattingToolbar";
import { Icon } from "./icons";
import LastEdited from "./LastEdited";
import LayoutToggle from "./LayoutToggle";
import { SidebarTrigger } from "./ui/sidebar";

function Divider() {
  return <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 bg-border" />;
}

export default function TitleBar() {
  const mac = isMacPlatform();
  return (
    <header
      class="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2 text-[13px]"
      aria-label="Toolbar"
    >
      <SidebarTrigger />
      <div class="flex min-w-0 flex-1 items-center gap-2 pl-1">
        <DocumentTitle />
        <LastEdited />
      </div>
      <LayoutToggle />
      <Show when={isEditable(layoutMode())}>
        <Divider />
        <FormattingToolbar />
      </Show>
      <Divider />
      <ExportMenu />
      <Divider />
      <button
        type="button"
        class="icon-button hidden sm:inline-flex"
        aria-label="Enter focus mode"
        title={shortcutTitle("Focus mode", shortcutKeys("toggle-focus"), mac)}
        aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("toggle-focus"), mac)}
        onClick={toggleFocusMode}
      >
        <Icon name="focus" size={15} />
      </button>
    </header>
  );
}
