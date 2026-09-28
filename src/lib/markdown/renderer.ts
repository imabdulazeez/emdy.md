import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import { isExternalHref } from "./href";

export interface MarkdownRenderer {
  render(source: string): string;
}

export function createRenderer(): MarkdownRenderer {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
    breaks: true,
  });

  md.use(footnote);
  md.use(taskLists, { enabled: false, label: true });

  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = String(token.attrGet("href") ?? "");
    if (isExternalHref(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info.trim();
    const lang = info.split(/\s+/)[0] ?? "";
    const attrs =
      token.attrs
        ?.map(([name, value]) => ` ${name}="${md.utils.escapeHtml(String(value))}"`)
        .join("") ?? "";
    const langClass = lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : "";
    const langAttr = lang ? ` data-lang="${md.utils.escapeHtml(lang)}"` : "";
    return `<pre${attrs}${langAttr}><code${langClass}>${md.utils.escapeHtml(token.content)}</code></pre>\n`;
  };

  return {
    render(source: string) {
      return md.render(source);
    },
  };
}
