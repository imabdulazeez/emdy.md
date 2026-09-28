import { describe, expect, it } from "vite-plus/test";
import { getFocusable, nextFocusTarget, trapTabKey } from "./focus-trap";

function dialog(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe("getFocusable", () => {
  it("returns focusable descendants in order, skipping hidden or disabled ones", () => {
    const el = dialog(
      '<button id="a"></button><input id="b" /><button disabled id="c"></button><a id="d">x</a><a id="e" href="#">y</a><div tabindex="0" id="f"></div><div tabindex="-1" id="g"></div><button hidden id="h"></button>',
    );
    expect(getFocusable(el).map((node) => node.id)).toEqual(["a", "b", "e", "f"]);
    el.remove();
  });
});

describe("nextFocusTarget", () => {
  it("cycles forwards and backwards", () => {
    const items = ["a", "b", "c"];
    expect(nextFocusTarget(items, "a", false)).toBe("b");
    expect(nextFocusTarget(items, "c", false)).toBe("a");
    expect(nextFocusTarget(items, "a", true)).toBe("c");
    expect(nextFocusTarget(items, null, false)).toBe("a");
    expect(nextFocusTarget(items, null, true)).toBe("c");
    expect(nextFocusTarget([], null, false)).toBeNull();
  });
});

describe("trapTabKey", () => {
  it("wraps focus from last to first and first to last", () => {
    const el = dialog('<button id="first"></button><button id="last"></button>');
    const first = el.querySelector<HTMLButtonElement>("#first")!;
    const last = el.querySelector<HTMLButtonElement>("#last")!;
    last.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    expect(trapTabKey(forward, el)).toBe(true);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true });
    expect(trapTabKey(backward, el)).toBe(true);
    expect(document.activeElement).toBe(last);
    el.remove();
  });

  it("lets normal tabbing proceed inside the container", () => {
    const el = dialog(
      '<button id="first"></button><button id="mid"></button><button id="last"></button>',
    );
    el.querySelector<HTMLButtonElement>("#first")!.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    expect(trapTabKey(event, el)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    el.remove();
  });

  it("pulls focus inside when it is outside", () => {
    const el = dialog('<button id="only"></button>');
    document.body.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    expect(trapTabKey(event, el)).toBe(true);
    expect(document.activeElement?.id).toBe("only");
    el.remove();
  });

  it("ignores other keys and empty containers", () => {
    const el = dialog("<p>nothing</p>");
    expect(trapTabKey(new KeyboardEvent("keydown", { key: "a" }), el)).toBe(false);
    const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    expect(trapTabKey(tab, el)).toBe(true);
    expect(tab.defaultPrevented).toBe(true);
    el.remove();
  });
});
