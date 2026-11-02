import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { TEST_DOCUMENTS } from "~/test-documents";
import {
  activeDocumentId,
  clearDocumentState,
  createDocument,
  openDocument,
  resetDocumentState,
} from "./document";
import {
  arrangePanes,
  closePane,
  closeSplit,
  focusPane,
  isSplit,
  openInSplit,
  panes,
  showsInOtherPane,
  switchPane,
  type Pane,
} from "./split";
import { lastDocumentId, resetWorkspaceState, splitLayout } from "./workspace";

const [first, second, third] = TEST_DOCUMENTS;

beforeEach(() => resetDocumentState(TEST_DOCUMENTS));

afterEach(() => {
  clearDocumentState();
  resetWorkspaceState();
});

const shown = () => panes().map((pane) => [pane.documentId, pane.active]);

describe("arrangePanes", () => {
  it("shows the active document alone without a split", () => {
    expect(arrangePanes("aaaaaa", null)).toEqual([
      { slot: "a", documentId: "aaaaaa", active: true },
    ]);
  });

  it("puts the focused document on its side", () => {
    expect(arrangePanes("aaaaaa", { other: "bbbbbb", side: "right" })).toEqual([
      { slot: "a", documentId: "bbbbbb", active: false },
      { slot: "b", documentId: "aaaaaa", active: true },
    ]);
    expect(arrangePanes("aaaaaa", { other: "bbbbbb", side: "left" })).toEqual([
      { slot: "a", documentId: "aaaaaa", active: true },
      { slot: "b", documentId: "bbbbbb", active: false },
    ]);
  });

  it("keeps a pane's slot while it shows the same document", () => {
    const split: Pane[] = [
      { slot: "a", documentId: "aaaaaa", active: false },
      { slot: "b", documentId: "bbbbbb", active: true },
    ];
    expect(arrangePanes("bbbbbb", null, split)).toEqual([
      { slot: "b", documentId: "bbbbbb", active: true },
    ]);
    const alone: Pane[] = [{ slot: "b", documentId: "bbbbbb", active: true }];
    expect(arrangePanes("cccccc", { other: "bbbbbb", side: "right" }, alone)).toEqual([
      { slot: "b", documentId: "bbbbbb", active: false },
      { slot: "a", documentId: "cccccc", active: true },
    ]);
  });

  it("keeps the unchanged pane's slot when the other pane changes document", () => {
    const split: Pane[] = [
      { slot: "a", documentId: "aaaaaa", active: true },
      { slot: "b", documentId: "bbbbbb", active: false },
    ];
    expect(arrangePanes("cccccc", { other: "bbbbbb", side: "left" }, split)).toEqual([
      { slot: "a", documentId: "cccccc", active: true },
      { slot: "b", documentId: "bbbbbb", active: false },
    ]);
  });

  it("reuses the lead slot when nothing carries over", () => {
    const alone: Pane[] = [{ slot: "b", documentId: "bbbbbb", active: true }];
    expect(arrangePanes("cccccc", null, alone)).toEqual([
      { slot: "b", documentId: "cccccc", active: true },
    ]);
  });
});

describe("split view", () => {
  it("opens a document beside the active one and focuses it", () => {
    expect(isSplit()).toBe(false);
    expect(openInSplit(second.id)).toBe(true);
    flush();
    expect(isSplit()).toBe(true);
    expect(activeDocumentId()).toBe(second.id);
    expect(splitLayout()).toEqual({ other: first.id, side: "right" });
    expect(shown()).toEqual([
      [first.id, false],
      [second.id, true],
    ]);
    expect(lastDocumentId()).toBe(second.id);
  });

  it("refuses to split the active document or an unknown one", () => {
    expect(openInSplit(first.id)).toBe(false);
    expect(openInSplit("gone00")).toBe(false);
    expect(isSplit()).toBe(false);
  });

  it("replaces the pane that is not focused when a split is already open", () => {
    flush(() => openInSplit(second.id));
    flush(() => openInSplit(third.id));
    expect(activeDocumentId()).toBe(third.id);
    expect(shown()).toEqual([
      [third.id, true],
      [second.id, false],
    ]);
  });

  it("moves focus instead of showing a document twice", () => {
    flush(() => openInSplit(second.id));
    expect(showsInOtherPane(first.id)).toBe(true);
    flush(() => openDocument(first.id));
    expect(activeDocumentId()).toBe(first.id);
    expect(splitLayout()).toEqual({ other: second.id, side: "left" });
    expect(shown()).toEqual([
      [first.id, true],
      [second.id, false],
    ]);
    flush(() => openInSplit(second.id));
    expect(shown()).toEqual([
      [first.id, false],
      [second.id, true],
    ]);
  });

  it("opens other documents in the focused pane", () => {
    flush(() => openInSplit(second.id));
    flush(() => openDocument(third.id));
    expect(shown()).toEqual([
      [first.id, false],
      [third.id, true],
    ]);
    flush(() => createDocument("Fresh"));
    expect(panes()[0].documentId).toBe(first.id);
    expect(panes()[1]).toMatchObject({ documentId: activeDocumentId(), active: true });
  });

  it("switches and focuses panes without moving them", () => {
    expect(switchPane()).toBe(false);
    flush(() => openInSplit(second.id));
    const slots = panes().map((pane) => pane.slot);
    expect(switchPane()).toBe(true);
    flush();
    expect(activeDocumentId()).toBe(first.id);
    expect(focusPane(first.id)).toBe(false);
    expect(focusPane(second.id)).toBe(true);
    flush();
    expect(activeDocumentId()).toBe(second.id);
    expect(panes().map((pane) => pane.slot)).toEqual(slots);
  });

  it("closes the other pane and keeps the focused document in its slot", () => {
    expect(closeSplit()).toBe(false);
    flush(() => openInSplit(second.id));
    const slot = panes()[1].slot;
    expect(closeSplit()).toBe(true);
    flush();
    expect(isSplit()).toBe(false);
    expect(activeDocumentId()).toBe(second.id);
    expect(panes()).toEqual([{ slot, documentId: second.id, active: true }]);
  });

  it("closes either pane by its document", () => {
    flush(() => openInSplit(second.id));
    const left = panes()[0].slot;
    expect(closePane(third.id)).toBe(false);
    expect(closePane(second.id)).toBe(true);
    flush();
    expect(isSplit()).toBe(false);
    expect(activeDocumentId()).toBe(first.id);
    expect(panes()).toEqual([{ slot: left, documentId: first.id, active: true }]);
    flush(() => openInSplit(third.id));
    expect(closePane(first.id)).toBe(true);
    flush();
    expect(activeDocumentId()).toBe(third.id);
    expect(closePane(third.id)).toBe(false);
  });
});
