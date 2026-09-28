import { describe, expect, it } from "vite-plus/test";
import { createRenderer } from "./renderer";

const render = (source: string) => createRenderer().render(source);

describe("createRenderer", () => {
  it("renders headings h1 to h6", () => {
    const html = render("# 1\n## 2\n### 3\n#### 4\n##### 5\n###### 6\n");
    for (let level = 1; level <= 6; level++) {
      expect(html).toContain(`<h${level}>${level}</h${level}>`);
    }
  });

  it("keeps a single line break inside a paragraph as a line break", () => {
    const html = render("Best,\nAzeez\n\nNext");
    expect(html).toContain("<p>Best,<br>\nAzeez</p>");
    expect(html).toContain("<p>Next</p>");
  });

  it("renders emphasis and inline code", () => {
    const html = render("**bold** *italic* ***both*** `code` ~~gone~~");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<em><strong>both</strong></em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<s>gone</s>");
  });

  it("renders links with safe targets for external urls", () => {
    const html = render("[site](https://example.com) [local](#anchor) [rel](docs/a.md)");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>',
    );
    expect(html).toContain('<a href="#anchor">local</a>');
    expect(html).toContain('<a href="docs/a.md">rel</a>');
  });

  it("renders images", () => {
    expect(render("![alt text](/logo.svg)")).toContain('<img src="/logo.svg" alt="alt text">');
  });

  it("does not render raw html", () => {
    expect(render("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });

  it("renders nested and ordered lists", () => {
    const html = render("1. one\n2. two\n   - nested\n");
    expect(html).toContain("<ol>");
    expect(html).toContain("<ul>");
    expect(html).toContain("nested");
  });

  it("renders task lists with disabled checkboxes", () => {
    const html = render("- [x] done\n- [ ] todo\n");
    expect(html).toContain('class="task-list-item"');
    expect(html).toContain('class="contains-task-list"');
    expect(html).toMatch(/<input class="task-list-item-checkbox"[^>]*checked[^>]*disabled/);
    expect(html.match(/type="checkbox"/g)?.length).toBe(2);
  });

  it("renders blockquotes", () => {
    expect(render("> quoted")).toContain("<blockquote>");
  });

  it("renders fenced code with a language class and data attribute", () => {
    const html = render("```ts\nconst a = 1 < 2;\n```\n");
    expect(html).toContain(
      '<pre data-lang="ts"><code class="language-ts">const a = 1 &lt; 2;\n</code></pre>',
    );
  });

  it("renders fenced code without a language", () => {
    expect(render("```\nplain\n```\n")).toContain("<pre><code>plain\n</code></pre>");
  });

  it("renders tables", () => {
    const html = render("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("renders a table whose header cells are empty", () => {
    const html = render("|     |     |\n| --- | --- |\n|     |     |\n");
    expect(html).toContain("<table>");
    expect(html).toContain("<th></th>");
    expect(html).toContain("<td></td>");
  });

  it("renders footnotes with back references", () => {
    const html = render("text[^1]\n\n[^1]: note\n");
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('class="footnotes"');
    expect(html).toContain('class="footnote-backref"');
    expect(html).toContain("note");
  });

  it("renders horizontal rules", () => {
    expect(render("a\n\n---\n\nb")).toContain("<hr>");
  });
});
