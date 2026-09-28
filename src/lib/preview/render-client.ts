import { wrap, type Remote } from "comlink";
import type { RenderApi } from "~/workers/render.worker";

export interface RenderClient {
  render(source: string): Promise<string>;
  terminate(): void;
}

let shared: RenderClient | null = null;

export function createRenderClient(): RenderClient {
  const worker = new Worker(new URL("../../workers/render.worker.ts", import.meta.url), {
    type: "module",
  });
  const remote: Remote<RenderApi> = wrap<RenderApi>(worker);
  return {
    render: (source) => remote.render(source),
    terminate: () => worker.terminate(),
  };
}

export function getRenderClient(): RenderClient {
  shared ??= createRenderClient();
  return shared;
}

export function resetRenderClient(): void {
  shared?.terminate();
  shared = null;
}
