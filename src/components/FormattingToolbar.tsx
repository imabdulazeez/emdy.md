import type { StateCommand } from "@codemirror/state";
import { createSignal, For } from "solid-js";
import {
  insertFootnote,
  insertHorizontalRule,
  insertTable,
  insertTableWith,
  setHeading,
  toggleBlockquote,
  toggleBulletList,
  toggleCodeBlock,
  toggleOrderedList,
  toggleTaskList,
} from "~/lib/editor/block-commands";
import {
  insertImage,
  insertLink,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleStrikethrough,
} from "~/lib/editor/commands";
import type { ActiveFormats } from "~/lib/editor/format-state";
import {
  ariaKeyShortcuts,
  isMacPlatform,
  shortcutKeys,
  shortcutTitle,
  type ShortcutId,
} from "~/lib/shortcuts";
import { editorApi } from "~/state/editor-api";
import { activeFormats } from "~/state/formatting";
import { showRulers, toggleRulers } from "~/state/rulers";
import { Icon, type IconName } from "./icons";
import TableInsertPanel from "./TableInsertPanel";
import ToolbarMenu, { type ToolbarMenuItem } from "./ToolbarMenu";

export interface FormattingAction {
  /** The action's `SHORTCUTS` id; `keys` must be `shortcutKeys(id)`. */
  id: ShortcutId;
  label: string;
  icon: IconName;
  keys: string;
  command: StateCommand;
  active?: (formats: ActiveFormats) => boolean;
}

export const INLINE_ACTIONS: readonly FormattingAction[] = [
  {
    id: "bold",
    label: "Bold",
    icon: "bold",
    keys: shortcutKeys("bold"),
    command: toggleBold,
    active: (f) => f.bold,
  },
  {
    id: "italic",
    label: "Italic",
    icon: "italic",
    keys: shortcutKeys("italic"),
    command: toggleItalic,
    active: (f) => f.italic,
  },
  {
    id: "strikethrough",
    label: "Strikethrough",
    icon: "strikethrough",
    keys: shortcutKeys("strikethrough"),
    command: toggleStrikethrough,
    active: (f) => f.strikethrough,
  },
  {
    id: "inline-code",
    label: "Inline code",
    icon: "code",
    keys: shortcutKeys("inline-code"),
    command: toggleInlineCode,
    active: (f) => f.code,
  },
  {
    id: "link",
    label: "Insert link",
    icon: "link",
    keys: shortcutKeys("link"),
    command: insertLink,
  },
];

export const BLOCK_ACTIONS: readonly FormattingAction[] = [
  {
    id: "blockquote",
    label: "Blockquote",
    icon: "quote",
    keys: shortcutKeys("blockquote"),
    command: toggleBlockquote,
    active: (f) => f.quote,
  },
  {
    id: "bullet-list",
    label: "Bullet list",
    icon: "list",
    keys: shortcutKeys("bullet-list"),
    command: toggleBulletList,
    active: (f) => f.bulletList && !f.taskList,
  },
  {
    id: "ordered-list",
    label: "Numbered list",
    icon: "list-ordered",
    keys: shortcutKeys("ordered-list"),
    command: toggleOrderedList,
    active: (f) => f.orderedList && !f.taskList,
  },
  {
    id: "task-list",
    label: "Task list",
    icon: "list-checks",
    keys: shortcutKeys("task-list"),
    command: toggleTaskList,
    active: (f) => f.taskList,
  },
  {
    id: "code-block",
    label: "Code block",
    icon: "code-block",
    keys: shortcutKeys("code-block"),
    command: toggleCodeBlock,
    active: (f) => f.codeBlock,
  },
];

export interface HeadingOption {
  level: number;
  label: string;
  keys: string;
  command: StateCommand;
}

export const HEADING_OPTIONS: readonly HeadingOption[] = [
  { level: 0, label: "Paragraph", keys: shortcutKeys("paragraph"), command: setHeading(0) },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    level,
    label: `Heading ${level}`,
    keys: shortcutKeys(`heading-${level}`),
    command: setHeading(level),
  })),
];

export const INSERT_ACTIONS: readonly FormattingAction[] = [
  { id: "image", label: "Image", icon: "image", keys: shortcutKeys("image"), command: insertImage },
  { id: "table", label: "Table", icon: "table", keys: shortcutKeys("table"), command: insertTable },
  {
    id: "horizontal-rule",
    label: "Horizontal rule",
    icon: "rule",
    keys: shortcutKeys("horizontal-rule"),
    command: insertHorizontalRule,
  },
  {
    id: "footnote",
    label: "Footnote",
    icon: "footnote",
    keys: shortcutKeys("footnote"),
    command: insertFootnote,
  },
];

function Divider(props: { class?: string }) {
  return (
    <span aria-hidden="true" class={`mx-1 h-4 w-px shrink-0 bg-border ${props.class ?? ""}`} />
  );
}

function ActionButton(props: { action: FormattingAction; mac: boolean }) {
  const pressed = () => props.action.active?.(activeFormats());
  return (
    <button
      type="button"
      class="icon-button size-7"
      aria-label={props.action.label}
      aria-pressed={props.action.active ? (pressed() ? "true" : "false") : undefined}
      title={shortcutTitle(props.action.label, props.action.keys, props.mac)}
      aria-keyshortcuts={ariaKeyShortcuts(props.action.keys, props.mac)}
      disabled={editorApi() === null}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editorApi()?.runCommand(props.action.command)}
    >
      <Icon name={props.action.icon} size={15} />
    </button>
  );
}

export default function FormattingToolbar() {
  const mac = isMacPlatform();
  const [tableOpen, setTableOpen] = createSignal(false);
  const run = (command: StateCommand) => editorApi()?.runCommand(command);

  const headingItems: ToolbarMenuItem[] = HEADING_OPTIONS.map((option) => ({
    id: `heading-${option.level}`,
    label: option.label,
    keys: option.keys,
    checked: () => activeFormats().heading === option.level,
    onSelect: () => run(option.command),
  }));

  const insertItems: ToolbarMenuItem[] = INSERT_ACTIONS.map((action) => ({
    id: action.id,
    label: action.id === "table" ? `${action.label}…` : action.label,
    icon: action.icon,
    keys: action.keys,
    onSelect: () => (action.id === "table" ? setTableOpen(true) : run(action.command)),
  }));

  const headingLevel = () => activeFormats().heading;

  return (
    <div role="group" aria-label="Text formatting" class="flex items-center gap-0.5">
      <ToolbarMenu
        label="Text style"
        icon="heading"
        radio
        align="start"
        class="hidden md:block"
        title={headingLevel() > 0 ? `Heading ${headingLevel()}` : "Paragraph style"}
        text={headingLevel() > 0 ? `H${headingLevel()}` : undefined}
        active={headingLevel() > 0}
        disabled={editorApi() === null}
        items={headingItems}
      />
      <Divider class="hidden md:block" />
      <For each={INLINE_ACTIONS}>{(action) => <ActionButton action={action} mac={mac} />}</For>
      <Divider class="hidden md:block" />
      <div class="hidden items-center gap-0.5 md:flex">
        <For each={BLOCK_ACTIONS}>{(action) => <ActionButton action={action} mac={mac} />}</For>
      </div>
      <Divider />
      <div class="relative">
        <ToolbarMenu
          label="Insert"
          icon="plus"
          align="end"
          title="Insert block"
          disabled={editorApi() === null}
          items={insertItems}
        />
        <TableInsertPanel
          open={tableOpen()}
          onClose={() => setTableOpen(false)}
          onInsert={(options) => {
            setTableOpen(false);
            run(insertTableWith(options));
          }}
        />
      </div>
      <div class="hidden items-center md:flex">
        <Divider />
        <button
          type="button"
          class="icon-button size-7"
          aria-label="Line and column rulers"
          aria-pressed={showRulers() ? "true" : "false"}
          title={showRulers() ? "Hide line and column rulers" : "Show line and column rulers"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleRulers}
        >
          <Icon name="ruler" size={15} />
        </button>
      </div>
    </div>
  );
}
