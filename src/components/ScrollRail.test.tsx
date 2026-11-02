import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vite-plus/test";
import ScrollRail from "./ScrollRail";

function setBox(element: HTMLElement, box: { scrollHeight?: number; clientHeight: number }) {
  Object.defineProperty(element, "clientHeight", { configurable: true, value: box.clientHeight });
  if (box.scrollHeight !== undefined)
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      value: box.scrollHeight,
    });
}

function renderRail(box: { scrollHeight: number; clientHeight: number }) {
  let target: HTMLDivElement | undefined;
  render(() => (
    <div>
      <div data-testid="target" ref={(el) => (target = el)} />
      <ScrollRail target={() => target} />
    </div>
  ));
  const scroller = screen.getByTestId("target");
  const rail = screen.getByTestId("scroll-rail");
  const thumb = screen.getByTestId("scroll-rail-thumb");
  setBox(scroller, box);
  setBox(rail, { clientHeight: 200 });
  fireEvent.scroll(scroller);
  return { scroller, rail, thumb };
}

describe("ScrollRail", () => {
  it("is a decorative divider that hides its thumb when nothing overflows", () => {
    const { rail } = renderRail({ scrollHeight: 250, clientHeight: 250 });
    expect(rail).toHaveAttribute("aria-hidden", "true");
    expect(rail).toHaveAttribute("data-scrollable", "false");
  });

  it("sizes the thumb to the visible fraction and follows the scroll position", () => {
    const { scroller, rail, thumb } = renderRail({ scrollHeight: 1000, clientHeight: 250 });
    expect(rail).toHaveAttribute("data-scrollable", "true");
    expect(thumb.style.height).toBe("50px");
    expect(thumb.style.transform).toBe("translateY(0px)");
    scroller.scrollTop = 375;
    fireEvent.scroll(scroller);
    expect(thumb.style.transform).toBe("translateY(75px)");
  });

  it("jumps to a clicked point on the track", () => {
    const { scroller, thumb } = renderRail({ scrollHeight: 1000, clientHeight: 250 });
    fireEvent.pointerDown(screen.getByTestId("scroll-rail"), { button: 0, clientY: 150 });
    expect(scroller.scrollTop).toBe(625);
    expect(thumb.style.transform).toBe("translateY(125px)");
  });

  it("scrolls the target while the thumb is dragged and stops on release", () => {
    const { scroller, rail } = renderRail({ scrollHeight: 1000, clientHeight: 250 });
    fireEvent.pointerDown(rail, { button: 0, clientY: 10 });
    expect(scroller.scrollTop).toBe(0);
    expect(rail).toHaveAttribute("data-dragging", "true");
    fireEvent.pointerMove(rail, { clientY: 40 });
    expect(scroller.scrollTop).toBe(150);
    fireEvent.pointerUp(rail, { clientY: 40 });
    expect(rail).not.toHaveAttribute("data-dragging");
    fireEvent.pointerMove(rail, { clientY: 100 });
    expect(scroller.scrollTop).toBe(150);
  });

  it("ignores secondary buttons", () => {
    const { scroller, rail } = renderRail({ scrollHeight: 1000, clientHeight: 250 });
    fireEvent.pointerDown(rail, { button: 2, clientY: 150 });
    expect(scroller.scrollTop).toBe(0);
    expect(rail).not.toHaveAttribute("data-dragging");
  });
});
