import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vite-plus/test";
import Logo from "./Logo";

describe("Logo", () => {
  it("draws a decorative mark and caret in theme tokens", () => {
    const { container } = render(() => <Logo class="h-6" />);
    const svg = container.querySelector("svg[data-logo]")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("h-6");
    expect(svg.querySelector("rect")).toBeNull();
    expect(svg.querySelector(".stroke-text")).not.toBeNull();
    expect(svg.querySelector(".stroke-accent")).not.toBeNull();
  });
});
