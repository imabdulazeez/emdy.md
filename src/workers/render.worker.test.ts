import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("comlink", () => ({ expose: vi.fn() }));

describe("render worker", () => {
  it("exposes a render api that returns html", async () => {
    const comlink = await import("comlink");
    const { renderApi } = await import("./render.worker");
    expect(comlink.expose).toHaveBeenCalledWith(renderApi);
    expect(renderApi.render("# Hi")).toBe("<h1>Hi</h1>\n");
  });
});
