import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const wrap = vi.fn();
vi.mock("comlink", () => ({ wrap: (...args: unknown[]) => wrap(...args) }));

class FakeWorker {
  static instances: FakeWorker[] = [];
  url: URL;
  options: WorkerOptions | undefined;
  terminate = vi.fn();
  constructor(url: URL, options?: WorkerOptions) {
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
  }
}

describe("render client", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    wrap.mockReset();
    wrap.mockImplementation(() => ({
      render: vi.fn(async (source: string) => `<p>${source}</p>`),
    }));
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(async () => {
    const { resetRenderClient } = await import("./render-client");
    resetRenderClient();
    vi.unstubAllGlobals();
  });

  it("creates a module worker and proxies render calls", async () => {
    const { createRenderClient } = await import("./render-client");
    const client = createRenderClient();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].options).toEqual({ type: "module" });
    expect(String(FakeWorker.instances[0].url)).toMatch(/render\.worker/);
    expect(wrap).toHaveBeenCalledWith(FakeWorker.instances[0]);
    await expect(client.render("hi")).resolves.toBe("<p>hi</p>");
    const remote = wrap.mock.results[0].value as { render: ReturnType<typeof vi.fn> };
    await client.render("table");
    expect(remote.render).toHaveBeenLastCalledWith("table");
    client.terminate();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });

  it("shares a single client until reset", async () => {
    const { getRenderClient, resetRenderClient } = await import("./render-client");
    const first = getRenderClient();
    expect(getRenderClient()).toBe(first);
    expect(FakeWorker.instances).toHaveLength(1);
    resetRenderClient();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    expect(getRenderClient()).not.toBe(first);
    expect(FakeWorker.instances).toHaveLength(2);
  });
});
