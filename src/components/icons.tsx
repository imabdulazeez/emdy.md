import type { JSX } from "@solidjs/web";

export type IconName =
  | "sun"
  | "moon"
  | "monitor"
  | "panel-left"
  | "editor"
  | "preview"
  | "focus"
  | "close"
  | "keyboard"
  | "file"
  | "plus"
  | "trash"
  | "bold"
  | "italic"
  | "code"
  | "link"
  | "minimize"
  | "heading"
  | "pilcrow"
  | "strikethrough"
  | "image"
  | "quote"
  | "list"
  | "list-ordered"
  | "list-checks"
  | "code-block"
  | "table"
  | "rule"
  | "footnote"
  | "chevron-down"
  | "check"
  | "type"
  | "hash"
  | "book"
  | "settings"
  | "folder"
  | "arrow-left"
  | "search"
  | "copy"
  | "pencil"
  | "ellipsis"
  | "download"
  | "upload"
  | "printer"
  | "file-text"
  | "ruler";

// Each entry is a factory: a shared JSX node would be moved between icons that reuse it.
const PATHS: Record<IconName, () => JSX.Element> = {
  sun: () => (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  moon: () => <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  monitor: () => (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  "panel-left": () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  editor: () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h7" />
    </>
  ),
  book: () => (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </>
  ),
  preview: () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h4M7 13h10M7 16h10" />
    </>
  ),
  focus: () => (
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  ),
  close: () => <path d="M18 6 6 18M6 6l12 12" />,
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  keyboard: () => (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  file: () => (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  plus: () => <path d="M12 5v14M5 12h14" />,
  trash: () => (
    <>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  bold: () => <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />,
  italic: () => <path d="M19 4h-9M14 20H5M15 4 9 20" />,
  code: () => <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  link: () => (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  minimize: () => (
    <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
  ),
  heading: () => <path d="M6 4v16M18 4v16M6 12h12" />,
  pilcrow: () => <path d="M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />,
  strikethrough: () => <path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />,
  image: () => (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
    </>
  ),
  quote: () => <path d="M17 6H3M21 12H8M21 18H8M3 12v6" />,
  list: () => <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  "list-ordered": () => (
    <path d="M10 12h11M10 18h11M10 6h11M4 10h2M4 6h1v4M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  ),
  "list-checks": () => <path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8" />,
  "code-block": () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m10 10-2 2 2 2M14 10l2 2-2 2" />
    </>
  ),
  table: () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M10 4v16" />
    </>
  ),
  rule: () => <path d="M5 12h14" />,
  footnote: () => (
    <path d="m4 19 8-8M12 19l-8-8M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7c0-.88-.6-2-2-2s-2 1.12-2 2" />
  ),
  "chevron-down": () => <path d="m6 9 6 6 6-6" />,
  check: () => <path d="M20 6 9 17l-5-5" />,
  type: () => <path d="M4 7V4h16v3M9 20h6M12 4v16" />,
  hash: () => <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  settings: () => (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  folder: () => (
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  ),
  "arrow-left": () => <path d="m12 19-7-7 7-7M19 12H5" />,
  copy: () => (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  pencil: () => (
    <path d="M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4" />
  ),
  ellipsis: () => (
    <>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </>
  ),
  download: () => <path d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" />,
  upload: () => <path d="M12 3v12M17 8l-5-5-5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
  printer: () => (
    <>
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" />
    </>
  ),
  "file-text": () => (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M8 13h8M8 17h5" />
    </>
  ),
  ruler: () => (
    <>
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  class?: string;
}

export function Icon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      data-icon={props.name}
    >
      {PATHS[props.name]()}
    </svg>
  );
}
