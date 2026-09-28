declare module "markdown-it-task-lists" {
  import type { MarkdownIt } from "markdown-it";
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const taskLists: (md: MarkdownIt, options?: TaskListsOptions) => void;
  export default taskLists;
}

declare module "markdown-it-footnote" {
  import type { MarkdownIt } from "markdown-it";
  const footnote: (md: MarkdownIt) => void;
  export default footnote;
}

declare module "idiomorph" {
  interface IdiomorphCallbacks {
    beforeNodeAdded?: (node: Node) => boolean | void;
    afterNodeAdded?: (node: Node) => void;
    beforeNodeMorphed?: (oldNode: Node, newNode: Node) => boolean | void;
    afterNodeMorphed?: (oldNode: Node, newNode: Node) => void;
    beforeNodeRemoved?: (node: Node) => boolean | void;
    afterNodeRemoved?: (node: Node) => void;
    beforeAttributeUpdated?: (
      attributeName: string,
      node: Node,
      mutationType: "update" | "remove",
    ) => boolean | void;
  }
  interface IdiomorphConfig {
    morphStyle?: "outerHTML" | "innerHTML";
    ignoreActive?: boolean;
    ignoreActiveValue?: boolean;
    restoreFocus?: boolean;
    callbacks?: IdiomorphCallbacks;
  }
  export const Idiomorph: {
    morph(
      oldNode: Element | Document,
      newContent: Element | Node | Node[] | string | null,
      config?: IdiomorphConfig,
    ): Node[] | Promise<Node[]>;
  };
}

interface FileSystemFileHandle {
  move?(name: string): Promise<void>;
}

declare module "virtual:lucide-groups" {
  type LucideNode = import("~/lib/lucide-registry").LucideNode;
  const groups: Record<string, () => Promise<{ default: Record<string, LucideNode> }>>;
  export default groups;
}
