import { ariaKeyShortcuts, isMacPlatform, shortcutKeys, shortcutTitle } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import { setFocusMode } from "~/state/ui";
import { Icon } from "./icons";

export default function ExitFocusButton(props: { class?: string; size?: number }) {
  const mac = isMacPlatform();
  return (
    <button
      type="button"
      class={cn("icon-button", props.class)}
      aria-label="Exit focus mode"
      title={shortcutTitle("Exit focus mode", shortcutKeys("exit-focus"), mac)}
      aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("exit-focus"), mac)}
      onClick={() => setFocusMode(false)}
    >
      <Icon name="minimize" size={props.size ?? 16} />
    </button>
  );
}
