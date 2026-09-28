import { syntaxTree } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { isExternalHref, isSafeHref, LOCAL_LINK_ATTR } from "~/lib/markdown/href";
import { linkHref } from "./link-destination";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

export interface LinkHooks {
  followLocal: (href: string) => void;
  openExternal: (href: string) => void;
}

export function linkHrefAt(state: EditorState, pos: number): string | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node;) {
    if (node.name === "Link" || node.name === "Autolink") return linkHref(state, node) || null;
    node = node.parent;
  }
  return null;
}

function hrefOf(view: EditorView, target: Element): string | null {
  const link = view.state.readOnly ? target.closest(".cm-live-link") : null;
  if (link && view.contentDOM.contains(link)) return linkHrefAt(view.state, view.posAtDOM(link));
  const anchor = target.closest(`a[${LOCAL_LINK_ATTR}], a[href]`);
  if (!anchor || !view.contentDOM.contains(anchor)) return null;
  return anchor.getAttribute(LOCAL_LINK_ATTR) ?? anchor.getAttribute("href");
}

export function followLinks(hooks: LinkHooks): Extension {
  return ViewPlugin.define((view) => {
    const follow = (href: string) => {
      if (!isSafeHref(href)) return;
      if (isExternalHref(href)) hooks.openExternal(href);
      else hooks.followLocal(href);
    };
    const open = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const href = target ? hrefOf(view, target) : null;
      if (!href) return;
      if (event.type === "auxclick") {
        if (!isExternalHref(href)) event.preventDefault();
        return;
      }
      event.preventDefault();
      follow(href);
    };
    const activate = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.key !== "Enter" || !target?.matches(`.cm-live-link, a[${LOCAL_LINK_ATTR}]`)) return;
      const href = hrefOf(view, target);
      if (!href) return;
      event.preventDefault();
      follow(href);
    };
    view.contentDOM.addEventListener("click", open);
    view.contentDOM.addEventListener("auxclick", open);
    view.contentDOM.addEventListener("keydown", activate);
    return {
      destroy() {
        view.contentDOM.removeEventListener("click", open);
        view.contentDOM.removeEventListener("auxclick", open);
        view.contentDOM.removeEventListener("keydown", activate);
      },
    };
  });
}

export const readOnlyPreview: Extension = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];
