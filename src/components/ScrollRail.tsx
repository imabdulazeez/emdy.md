import { onSettled } from "solid-js";
import { scrollThumb, scrollTopForThumb, type ScrollThumb } from "~/lib/scroll-sync";
import "./scroll-rail.css";

export const SCROLL_RAIL_MIN_THUMB = 24;

export default function ScrollRail(props: { target: () => HTMLElement | undefined }) {
  let rail: HTMLDivElement | undefined;
  let thumb: HTMLDivElement | undefined;
  let current: ScrollThumb | null = null;
  let drag: { pointerY: number; offset: number } | null = null;

  const measure = () => {
    const element = props.target();
    if (!element || !rail || !thumb) return;
    current = scrollThumb({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      trackHeight: rail.clientHeight,
      minSize: SCROLL_RAIL_MIN_THUMB,
    });
    rail.dataset.scrollable = current ? "true" : "false";
    if (!current) return;
    thumb.style.height = `${current.size}px`;
    thumb.style.transform = `translateY(${current.offset}px)`;
  };

  const scrollToOffset = (offset: number) => {
    const element = props.target();
    if (!element || !rail || !current) return;
    element.scrollTop = scrollTopForThumb({
      offset,
      size: current.size,
      trackHeight: rail.clientHeight,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    });
    measure();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !rail || !current) return;
    event.preventDefault();
    const pointerOffset = event.clientY - rail.getBoundingClientRect().top;
    const onThumb =
      pointerOffset >= current.offset && pointerOffset <= current.offset + current.size;
    if (!onThumb) scrollToOffset(pointerOffset - current.size / 2);
    drag = { pointerY: event.clientY, offset: current.offset };
    rail.dataset.dragging = "true";
    if (typeof rail.setPointerCapture === "function") rail.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (drag) scrollToOffset(drag.offset + event.clientY - drag.pointerY);
  };

  const endDrag = () => {
    drag = null;
    if (rail) delete rail.dataset.dragging;
  };

  onSettled(() => {
    const element = props.target();
    if (!element) return;
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    if (rail) resize.observe(rail);
    const mutations = new MutationObserver(measure);
    mutations.observe(element, { childList: true, subtree: true });
    return () => {
      element.removeEventListener("scroll", measure);
      resize.disconnect();
      mutations.disconnect();
    };
  });

  return (
    <div
      ref={(el) => (rail = el)}
      class="scroll-rail"
      aria-hidden="true"
      data-testid="scroll-rail"
      data-scrollable="false"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      <div ref={(el) => (thumb = el)} class="scroll-rail-thumb" data-testid="scroll-rail-thumb" />
    </div>
  );
}
