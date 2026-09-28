import { expose } from "comlink";
import { createRenderer } from "~/lib/markdown/renderer";

const renderer = createRenderer();

export const renderApi = {
  render(source: string): string {
    return renderer.render(source);
  },
};

export type RenderApi = typeof renderApi;

expose(renderApi);
