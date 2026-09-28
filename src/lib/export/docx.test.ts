import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vite-plus/test";
import { createRenderer } from "~/lib/markdown/renderer";
import { SAMPLE_DOCUMENT } from "~/test-documents";
import { buildDocxParts, externalUrl, htmlToDocx, textRun } from "./docx";
import { parseXml } from "./docx-parts.test";

const renderer = createRenderer();

function documentOf(markdown: string) {
  const parts = buildDocxParts(renderer.render(markdown), { title: "Test" });
  return { parts, doc: parseXml(parts.document) };
}

const paragraphs = (doc: Document) => Array.from(doc.getElementsByTagName("w:p"));
const textOf = (node: Element) =>
  Array.from(node.getElementsByTagName("w:t"))
    .map((t) => t.textContent)
    .join("");
const styleOf = (p: Element) =>
  p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? null;

describe("externalUrl", () => {
  it("accepts absolute urls and rejects relative or malformed ones", () => {
    expect(externalUrl("https://example.com/a b")).toBe("https://example.com/a%20b");
    expect(externalUrl("mailto:hi@example.com")).toBe("mailto:hi@example.com");
    expect(externalUrl("/logo.svg")).toBeNull();
    expect(externalUrl("#fn1")).toBeNull();
    expect(externalUrl("http://[bad")).toBeNull();
    expect(externalUrl(null)).toBeNull();
  });
});

describe("textRun", () => {
  it("preserves spaces and turns tabs into tab marks", () => {
    expect(textRun("  a\tb")).toBe(
      '<w:r><w:t xml:space="preserve">  a</w:t><w:tab/><w:t xml:space="preserve">b</w:t></w:r>',
    );
    expect(textRun("x", { bold: true, italic: true, strike: true })).toContain(
      "<w:rPr><w:b/><w:i/><w:strike/></w:rPr>",
    );
  });
});

describe("buildDocxParts", () => {
  it("maps headings and inline formatting to Word styles and run properties", () => {
    const { doc } = documentOf(
      "# Title\n\n## Second\n\nPlain **bold** *italic* ~~gone~~ `code` ***both***.\n\n###### Six",
    );
    const all = paragraphs(doc);
    expect(styleOf(all[0])).toBe("Heading1");
    expect(textOf(all[0])).toBe("Title");
    expect(styleOf(all[1])).toBe("Heading2");
    expect(styleOf(all[3])).toBe("Heading6");
    const body = all[2];
    expect(styleOf(body)).toBeNull();
    expect(textOf(body)).toBe("Plain bold italic gone code both.");
    const runs = Array.from(body.getElementsByTagName("w:r"));
    const find = (text: string) => runs.find((run) => textOf(run) === text)!;
    expect(find("bold").getElementsByTagName("w:b")).toHaveLength(1);
    expect(find("italic").getElementsByTagName("w:i")).toHaveLength(1);
    expect(find("gone").getElementsByTagName("w:strike")).toHaveLength(1);
    expect(find("code").getElementsByTagName("w:rStyle")[0].getAttribute("w:val")).toBe("CodeChar");
    expect(find("both").getElementsByTagName("w:b")).toHaveLength(1);
    expect(find("both").getElementsByTagName("w:i")).toHaveLength(1);
    expect(find("Plain ").getElementsByTagName("w:rPr")).toHaveLength(0);
  });

  it("numbers lists per list, nests levels, and renders task items as glyphs", () => {
    const { doc, parts } = documentOf(
      "1. one\n2. two\n   - inner\n\ntext\n\n1. again\n\n- [x] done\n- [ ] todo",
    );
    const items = paragraphs(doc).filter((p) => p.getElementsByTagName("w:numPr").length > 0);
    const numbering = items.map((p) => ({
      text: textOf(p),
      numId: p.getElementsByTagName("w:numId")[0].getAttribute("w:val"),
      level: p.getElementsByTagName("w:ilvl")[0].getAttribute("w:val"),
    }));
    expect(numbering).toEqual([
      { text: "one", numId: "1", level: "0" },
      { text: "two", numId: "1", level: "0" },
      { text: "inner", numId: "2", level: "1" },
      { text: "again", numId: "3", level: "0" },
    ]);
    const nums = Array.from(parseXml(parts.numbering).getElementsByTagName("w:num"));
    expect(
      nums.map((num) => num.getElementsByTagName("w:abstractNumId")[0].getAttribute("w:val")),
    ).toEqual(["1", "0", "1", "0"]);
    const tasks = paragraphs(doc).filter((p) => /^[☐☑] /.test(textOf(p)));
    expect(tasks.map(textOf)).toEqual(["☑ done", "☐ todo"]);
    for (const task of tasks) {
      expect(task.getElementsByTagName("w:numPr")).toHaveLength(0);
      expect(task.getElementsByTagName("w:ind")[0].getAttribute("w:left")).toBe("720");
    }
  });

  it("keeps loose list continuation paragraphs indented under their item", () => {
    const { doc } = documentOf("1. first\n\n   more about first\n2. second");
    const all = paragraphs(doc).map((p) => ({
      text: textOf(p),
      numbered: p.getElementsByTagName("w:numPr").length > 0,
      indent: p.getElementsByTagName("w:ind")[0]?.getAttribute("w:left") ?? null,
    }));
    expect(all).toEqual([
      { text: "first", numbered: true, indent: null },
      { text: "more about first", numbered: false, indent: "720" },
      { text: "second", numbered: true, indent: null },
    ]);
  });

  it("renders quotes, code blocks, and rules", () => {
    const { doc } = documentOf(
      "> Quoted *words*\n>\n> Second line\n\n```ts\nconst a = 1;\n\n\tif (a) {}\n```\n\n---\n",
    );
    const all = paragraphs(doc);
    expect(styleOf(all[0])).toBe("Quote");
    expect(textOf(all[0])).toBe("Quoted words");
    expect(styleOf(all[1])).toBe("Quote");
    const code = all.filter((p) => styleOf(p) === "Code");
    expect(code.map(textOf)).toEqual(["const a = 1;", "", "if (a) {}"]);
    expect(code[2].getElementsByTagName("w:tab")).toHaveLength(1);
    const rule = all.find((p) => p.getElementsByTagName("w:pBdr").length > 0)!;
    expect(rule.getElementsByTagName("w:bottom")).toHaveLength(1);
  });

  it("builds tables with a header row, one grid column per cell, and alignment", () => {
    const { doc } = documentOf("| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 |\n");
    const table = doc.getElementsByTagName("w:tbl")[0];
    expect(table.getElementsByTagName("w:gridCol")).toHaveLength(3);
    const rows = Array.from(table.getElementsByTagName("w:tr"));
    expect(rows).toHaveLength(2);
    expect(rows[0].getElementsByTagName("w:tblHeader")).toHaveLength(1);
    const headerCells = Array.from(rows[0].getElementsByTagName("w:tc"));
    expect(headerCells.map(textOf)).toEqual(["a", "b", "c"]);
    for (const cell of headerCells) expect(cell.getElementsByTagName("w:b")).toHaveLength(1);
    expect(headerCells[1].getElementsByTagName("w:jc")[0].getAttribute("w:val")).toBe("center");
    expect(headerCells[2].getElementsByTagName("w:jc")[0].getAttribute("w:val")).toBe("right");
    expect(headerCells[0].getElementsByTagName("w:jc")).toHaveLength(0);
    const bodyCells = Array.from(rows[1].getElementsByTagName("w:tc"));
    expect(bodyCells).toHaveLength(3);
    expect(bodyCells.map(textOf)).toEqual(["1", "2", ""]);
    for (const cell of bodyCells)
      expect(cell.getElementsByTagName("w:p").length).toBeGreaterThan(0);
    const tableIndex = Array.from(doc.getElementsByTagName("w:body")[0].children).indexOf(table);
    expect(doc.getElementsByTagName("w:body")[0].children[tableIndex + 1].tagName).toBe("w:p");
  });

  it("links absolute urls, leaves relative ones as text, and describes images by alt text", () => {
    const { doc, parts } = documentOf(
      "See [the spec](https://commonmark.org/?x=1&y=2) and [local](./notes.md).\n\n![A logo](/logo.svg)\n\n![Remote](https://img.test/a.png)",
    );
    const links = Array.from(doc.getElementsByTagName("w:hyperlink"));
    expect(links.map(textOf)).toEqual(["the spec", "Remote"]);
    expect(links[0].getElementsByTagName("w:rStyle")[0].getAttribute("w:val")).toBe("Hyperlink");
    const rels = Array.from(parseXml(parts.documentRels).getElementsByTagName("Relationship"));
    const targets = links.map((link) =>
      rels
        .find((rel) => rel.getAttribute("Id") === link.getAttribute("r:id"))!
        .getAttribute("Target"),
    );
    expect(targets).toEqual(["https://commonmark.org/?x=1&y=2", "https://img.test/a.png"]);
    const all = paragraphs(doc);
    expect(textOf(all[0])).toBe("See the spec and local.");
    expect(textOf(all[1])).toBe("A logo");
    expect(all[1].getElementsByTagName("w:i")).toHaveLength(1);
  });

  it("turns footnotes into real Word footnotes", () => {
    const { doc, parts } = documentOf("Claim[^1] and again[^1].\n\n[^1]: The *source*.\n");
    const refs = Array.from(doc.getElementsByTagName("w:footnoteReference"));
    expect(refs.map((ref) => ref.getAttribute("w:id"))).toEqual(["1", "1"]);
    expect(textOf(paragraphs(doc)[0])).toBe("Claim and again.");
    expect(doc.getElementsByTagName("w:p")).toHaveLength(1);
    const footnotes = parseXml(parts.footnotes!);
    const notes = Array.from(footnotes.getElementsByTagName("w:footnote"));
    expect(notes.map((note) => note.getAttribute("w:id"))).toEqual(["-1", "0", "1"]);
    const note = notes[2];
    expect(note.getElementsByTagName("w:footnoteRef")).toHaveLength(1);
    expect(textOf(note)).toBe(" The source.");
    expect(styleOf(note.getElementsByTagName("w:p")[0])).toBe("FootnoteText");
    expect(parts.contentTypes).toContain("/word/footnotes.xml");
  });

  it("produces an empty paragraph for an empty document and no footnotes part", () => {
    const { doc, parts } = documentOf("");
    expect(doc.getElementsByTagName("w:p")).toHaveLength(1);
    expect(parts.footnotes).toBeNull();
    expect(parts.contentTypes).not.toContain("footnotes");
  });

  it("keeps every line break as typed and trims surrounding whitespace", () => {
    const { doc } = documentOf("  one\ntwo  \n\nhard  \nbreak");
    const all = paragraphs(doc);
    expect(all[0].getElementsByTagName("w:br")).toHaveLength(1);
    expect(textOf(all[0])).toBe("onetwo");
    expect(all[1].getElementsByTagName("w:br")).toHaveLength(1);
    expect(textOf(all[1])).toBe("hardbreak");
  });

  it("escapes text that would break the xml", () => {
    const { doc } = documentOf("a < b & c > \"d\" 'e'");
    expect(textOf(paragraphs(doc)[0])).toBe("a < b & c > \"d\" 'e'");
  });
});

describe("buildDocxParts fonts", () => {
  it("uses the requested body font and defaults to Arial", () => {
    const html = renderer.render("# Hi\n\n- item");
    expect(buildDocxParts(html, { title: "T" }).styles).toContain('w:ascii="Arial"');
    const parts = buildDocxParts(html, { title: "T", font: "Georgia" });
    expect(parts.styles).toContain('w:ascii="Georgia"');
    expect(parts.styles).not.toContain('w:ascii="Arial"');
    expect(parts.numbering).toContain('w:ascii="Georgia"');
  });
});

describe("htmlToDocx", () => {
  it("packages every part into a zip that round-trips", () => {
    const bytes = htmlToDocx(renderer.render(SAMPLE_DOCUMENT), {
      title: "Welcome",
      stamp: new Date("2026-09-13T00:00:00Z"),
    });
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "docProps/core.xml",
        "word/_rels/document.xml.rels",
        "word/document.xml",
        "word/footnotes.xml",
        "word/numbering.xml",
        "word/settings.xml",
        "word/styles.xml",
      ].sort(),
    );
    for (const name of Object.keys(files)) parseXml(strFromU8(files[name]));
    const document = parseXml(strFromU8(files["word/document.xml"]));
    expect(textOf(paragraphs(document)[0])).toBe("Welcome to emdy");
    expect(document.getElementsByTagName("w:tbl")).toHaveLength(1);
    expect(strFromU8(files["docProps/core.xml"])).toContain("<dc:title>Welcome</dc:title>");
  });
});
