import { strToU8, zipSync } from "fflate";
import {
  contentTypesXml,
  corePropertiesXml,
  documentRelsXml,
  documentXml,
  escapeXml,
  FIRST_HYPERLINK_ID,
  footnotesXml,
  type HyperlinkRelationship,
  LIST_HANGING,
  LIST_INDENT,
  type ListKind,
  numberingXml,
  rootRelsXml,
  settingsXml,
  stylesXml,
  TEXT_WIDTH,
} from "./docx-parts";

export interface DocxOptions {
  title: string;
  stamp?: Date;
  font?: string;
}

interface RunProps {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  underline?: boolean;
  link?: boolean;
  vertical?: "superscript" | "subscript";
}

type Run =
  | { type: "text"; text: string; props: RunProps }
  | { type: "break" }
  | { type: "footnote"; id: number };

type Inline = Run | { type: "link"; target: string; runs: Run[] };

interface ListState {
  numId: number;
  level: number;
  marker: boolean;
  task?: boolean;
}

interface BlockContext {
  list?: ListState;
  quote?: boolean;
  footnote?: { pending: boolean };
  props: RunProps;
  align?: string;
}

const FOOTNOTE_MARK =
  '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>';

const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "HR",
  "TABLE",
  "SECTION",
  "DIV",
  "FIGURE",
  "DETAILS",
]);

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;
const FOOTNOTE_ID = /^#fn(\d+)$/;
const TASK_GLYPHS = { checked: "☑", unchecked: "☐" } as const;

class DocxBuilder {
  readonly lists: ListKind[] = [];
  readonly hyperlinks: HyperlinkRelationship[] = [];
  readonly footnotes = new Map<number, string>();

  addList(kind: ListKind): number {
    this.lists.push(kind);
    return this.lists.length;
  }

  addHyperlink(target: string): string {
    const id = `rId${FIRST_HYPERLINK_ID + this.hyperlinks.length}`;
    this.hyperlinks.push({ id, target });
    return id;
  }
}

export function externalUrl(href: string | null): string | null {
  if (!href || !ABSOLUTE_URL.test(href)) return null;
  try {
    return new URL(href).href;
  } catch {
    return null;
  }
}

const collapse = (text: string) => text.replace(/\s+/g, " ");

function runProps(props: RunProps): string {
  const parts: string[] = [];
  if (props.link) parts.push('<w:rStyle w:val="Hyperlink"/>');
  else if (props.code) parts.push('<w:rStyle w:val="CodeChar"/>');
  if (props.bold) parts.push("<w:b/>");
  if (props.italic) parts.push("<w:i/>");
  if (props.strike) parts.push("<w:strike/>");
  if (props.underline) parts.push('<w:u w:val="single"/>');
  if (props.vertical) parts.push(`<w:vertAlign w:val="${props.vertical}"/>`);
  return parts.length > 0 ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

export function textRun(text: string, props: RunProps = {}): string {
  const content = text
    .split("\t")
    .map((segment) => `<w:t xml:space="preserve">${escapeXml(segment)}</w:t>`)
    .join("<w:tab/>");
  return `<w:r>${runProps(props)}${content}</w:r>`;
}

function serializeRun(run: Run): string {
  switch (run.type) {
    case "text":
      return textRun(run.text, run.props);
    case "break":
      return "<w:r><w:br/></w:r>";
    case "footnote":
      return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${run.id}"/></w:r>`;
    default:
      return "";
  }
}

function serializeInline(inline: Inline, builder: DocxBuilder): string {
  if (inline.type !== "link") return serializeRun(inline);
  const id = builder.addHyperlink(inline.target);
  const runs = inline.runs
    .map((run) => (run.type === "text" ? { ...run, props: { ...run.props, link: true } } : run))
    .map(serializeRun)
    .join("");
  return `<w:hyperlink r:id="${id}">${runs}</w:hyperlink>`;
}

function firstTextRun(items: Inline[]): Run | null {
  for (const item of items) {
    if (item.type === "link") {
      const inner = firstTextRun(item.runs);
      if (inner) return inner;
    } else if (item.type === "text") return item;
  }
  return null;
}

function lastTextRun(items: Inline[]): Run | null {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.type === "link") {
      const inner = lastTextRun(item.runs);
      if (inner) return inner;
    } else if (item.type === "text") return item;
  }
  return null;
}

function prune(items: Inline[]): Inline[] {
  const result: Inline[] = [];
  for (const item of items) {
    if (item.type === "link") {
      const runs = prune(item.runs) as Run[];
      if (runs.length > 0) result.push({ ...item, runs });
    } else if (item.type !== "text" || item.text.length > 0) {
      result.push(item);
    }
  }
  return result;
}

export function trimInlines(items: Inline[]): Inline[] {
  let result = prune(items);
  for (;;) {
    const first = firstTextRun(result);
    if (!first || first.type !== "text") break;
    const trimmed = first.text.replace(/^\s+/, "");
    if (trimmed === first.text) break;
    first.text = trimmed;
    result = prune(result);
  }
  for (;;) {
    const last = lastTextRun(result);
    if (!last || last.type !== "text") break;
    const trimmed = last.text.replace(/\s+$/, "");
    if (trimmed === last.text) break;
    last.text = trimmed;
    result = prune(result);
  }
  return result;
}

function hasContent(items: Inline[]): boolean {
  return items.some((item) =>
    item.type === "link"
      ? hasContent(item.runs)
      : item.type !== "text" || item.text.trim().length > 0,
  );
}

function footnoteIdOf(element: Element): number | null {
  const anchor = element.matches("a") ? element : element.querySelector("a");
  const match = anchor?.getAttribute("href")?.match(FOOTNOTE_ID);
  return match ? Number(match[1]) : null;
}

function collectInlines(nodes: Iterable<Node>, props: RunProps, builder: DocxBuilder): Inline[] {
  const items: Inline[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const afterBreak = items.at(-1)?.type === "break";
      const collapsed = collapse(node.textContent ?? "");
      const text = afterBreak ? collapsed.replace(/^\s+/, "") : collapsed;
      if (text.length > 0) items.push({ type: "text", text, props });
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as Element;
    const children = (next: RunProps = props) =>
      collectInlines(element.childNodes, { ...props, ...next }, builder);
    switch (element.tagName) {
      case "STRONG":
      case "B":
        items.push(...children({ bold: true }));
        break;
      case "EM":
      case "I":
        items.push(...children({ italic: true }));
        break;
      case "S":
      case "DEL":
      case "STRIKE":
        items.push(...children({ strike: true }));
        break;
      case "U":
        items.push(...children({ underline: true }));
        break;
      case "CODE":
      case "KBD":
      case "SAMP":
        items.push(...children({ code: true }));
        break;
      case "SUB":
        items.push(...children({ vertical: "subscript" }));
        break;
      case "SUP": {
        const id = element.classList.contains("footnote-ref") ? footnoteIdOf(element) : null;
        if (id !== null && builder.footnotes.has(id)) items.push({ type: "footnote", id });
        else items.push(...children({ vertical: "superscript" }));
        break;
      }
      case "BR":
        items.push({ type: "break" });
        break;
      case "INPUT":
        break;
      case "IMG": {
        const alt = element.getAttribute("alt")?.trim() || element.getAttribute("src") || "";
        if (!alt) break;
        const run: Run = { type: "text", text: collapse(alt), props: { ...props, italic: true } };
        const target = externalUrl(element.getAttribute("src"));
        items.push(target ? { type: "link", target, runs: [run] } : run);
        break;
      }
      case "A": {
        if (element.classList.contains("footnote-backref")) break;
        const target = externalUrl(element.getAttribute("href"));
        const runs = children().filter((item): item is Run => item.type !== "link");
        if (target && runs.length > 0) items.push({ type: "link", target, runs });
        else items.push(...runs);
        break;
      }
      default:
        items.push(...children());
    }
  }
  return items;
}

function paragraphProperties(ctx: BlockContext, style?: string, extra = ""): string {
  const parts: string[] = [];
  if (style) parts.push(`<w:pStyle w:val="${style}"/>`);
  let indent = "";
  if (ctx.list) {
    const left = LIST_INDENT * (ctx.list.level + 1);
    if (ctx.list.marker && ctx.list.task === undefined) {
      parts.push(
        `<w:numPr><w:ilvl w:val="${ctx.list.level}"/><w:numId w:val="${ctx.list.numId}"/></w:numPr>`,
      );
    } else if (ctx.list.marker) {
      indent = `<w:ind w:left="${left}" w:hanging="${LIST_HANGING}"/>`;
    } else {
      indent = `<w:ind w:left="${left}"/>`;
    }
    ctx.list.marker = false;
  }
  parts.push(extra, indent);
  if (ctx.align) parts.push(`<w:jc w:val="${ctx.align}"/>`);
  const joined = parts.join("");
  return joined.length > 0 ? `<w:pPr>${joined}</w:pPr>` : "";
}

function paragraph(runs: string, ctx: BlockContext, style?: string, extra = ""): string {
  const task = ctx.list?.marker && ctx.list.task !== undefined ? ctx.list.task : null;
  const properties = paragraphProperties(ctx, ctx.footnote ? "FootnoteText" : style, extra);
  let prefix =
    task === null ? "" : textRun(`${task ? TASK_GLYPHS.checked : TASK_GLYPHS.unchecked} `);
  if (ctx.footnote?.pending) {
    ctx.footnote.pending = false;
    prefix = `${FOOTNOTE_MARK}${textRun(" ")}${prefix}`;
  }
  return `<w:p>${properties}${prefix}${runs}</w:p>`;
}

function inlineParagraph(
  nodes: Node[],
  ctx: BlockContext,
  builder: DocxBuilder,
  style?: string,
): string | null {
  const items = trimInlines(collectInlines(nodes, ctx.props, builder));
  if (!hasContent(items)) return null;
  const runs = items.map((item) => serializeInline(item, builder)).join("");
  return paragraph(runs, ctx, style ?? (ctx.quote ? "Quote" : undefined));
}

function convertCode(element: Element, ctx: BlockContext): string[] {
  const source = element.textContent ?? "";
  const lines = source.replace(/\n$/, "").split("\n");
  const out = lines.map((line) => paragraph(textRun(line), { ...ctx, list: undefined }, "Code"));
  out.push(paragraph("", { ...ctx, list: undefined }));
  return out;
}

function convertList(element: Element, ctx: BlockContext, builder: DocxBuilder, out: string[]) {
  const kind: ListKind = element.tagName === "OL" ? "decimal" : "bullet";
  const numId = builder.addList(kind);
  const level = ctx.list ? ctx.list.level + 1 : 0;
  for (const item of Array.from(element.children)) {
    if (item.tagName !== "LI") continue;
    const checkbox = item.querySelector<HTMLInputElement>(
      ':scope > input[type="checkbox"], :scope > label > input[type="checkbox"]',
    );
    const list: ListState = { numId, level, marker: true };
    if (checkbox) list.task = checkbox.checked || checkbox.hasAttribute("checked");
    const itemContext: BlockContext = { ...ctx, list, quote: false };
    convertChildren(item, itemContext, builder, out);
    if (list.marker) out.push(paragraph("", itemContext));
  }
}

function cellAlignment(cell: Element): string | undefined {
  const match = cell.getAttribute("style")?.match(/text-align:\s*(left|center|right)/);
  return match && match[1] !== "left" ? match[1] : undefined;
}

function convertTable(element: Element, ctx: BlockContext, builder: DocxBuilder): string[] {
  const rows = Array.from(
    element.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr"),
  );
  const columns = Math.max(1, ...rows.map((row) => row.children.length));
  const width = Math.floor(TEXT_WIDTH / columns);
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="${width}"/>`).join("");
  const body = rows
    .map((row) => {
      const header = row.parentElement?.tagName === "THEAD";
      const cells = Array.from(row.children);
      while (cells.length < columns) cells.push(element.ownerDocument.createElement("td"));
      const content = cells
        .map((cell) => {
          const cellContext: BlockContext = {
            props: { ...ctx.props, bold: ctx.props.bold || header || cell.tagName === "TH" },
            align: cellAlignment(cell),
          };
          const blocks: string[] = [];
          convertChildren(cell, cellContext, builder, blocks);
          if (blocks.length === 0) blocks.push(paragraph("", cellContext));
          return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${blocks.join("")}</w:tc>`;
        })
        .join("");
      const rowProperties = header ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
      return `<w:tr>${rowProperties}${content}</w:tr>`;
    })
    .join("");
  return [
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/>` +
      `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
      `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`,
    paragraph("", { ...ctx, list: undefined }),
  ];
}

function convertBlock(element: Element, ctx: BlockContext, builder: DocxBuilder, out: string[]) {
  const tag = element.tagName;
  if (tag === "HR") {
    if (element.classList.contains("footnotes-sep")) return;
    out.push(
      paragraph(
        "",
        { ...ctx, list: undefined },
        undefined,
        '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BAB9B1"/></w:pBdr>',
      ),
    );
    return;
  }
  if (tag === "SECTION" && element.classList.contains("footnotes")) return;
  if (/^H[1-6]$/.test(tag)) {
    const block = inlineParagraph(Array.from(element.childNodes), ctx, builder, `Heading${tag[1]}`);
    if (block) out.push(block);
    return;
  }
  if (tag === "P") {
    const block = inlineParagraph(Array.from(element.childNodes), ctx, builder);
    if (block) out.push(block);
    return;
  }
  if (tag === "UL" || tag === "OL") {
    convertList(element, ctx, builder, out);
    return;
  }
  if (tag === "BLOCKQUOTE") {
    convertChildren(element, { ...ctx, quote: true }, builder, out);
    return;
  }
  if (tag === "PRE") {
    out.push(...convertCode(element, ctx));
    return;
  }
  if (tag === "TABLE") {
    out.push(...convertTable(element, ctx, builder));
    return;
  }
  convertChildren(element, ctx, builder, out);
}

function convertChildren(parent: Element, ctx: BlockContext, builder: DocxBuilder, out: string[]) {
  let pending: Node[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    const block = inlineParagraph(pending, ctx, builder);
    if (block) out.push(block);
    pending = [];
  };
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((child as Element).tagName)) {
      flush();
      convertBlock(child as Element, ctx, builder, out);
    } else {
      pending.push(child);
    }
  }
  flush();
}

function collectFootnotes(root: Element, builder: DocxBuilder): void {
  for (const item of Array.from(root.querySelectorAll("section.footnotes li.footnote-item"))) {
    const match = item.id.match(/^fn(\d+)$/);
    if (!match) continue;
    const id = Number(match[1]);
    const ctx: BlockContext = { props: {}, footnote: { pending: true } };
    const blocks: string[] = [];
    convertChildren(item, ctx, builder, blocks);
    if (blocks.length === 0) blocks.push(paragraph("", ctx));
    builder.footnotes.set(id, `<w:footnote w:id="${id}">${blocks.join("")}</w:footnote>`);
  }
}

export interface DocxParts {
  document: string;
  styles: string;
  numbering: string;
  settings: string;
  footnotes: string | null;
  documentRels: string;
  contentTypes: string;
  rootRels: string;
  core: string;
}

export function buildDocxParts(html: string, options: DocxOptions): DocxParts {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const builder = new DocxBuilder();
  collectFootnotes(parsed.body, builder);
  const blocks: string[] = [];
  convertChildren(parsed.body, { props: {} }, builder, blocks);
  if (blocks.length === 0) blocks.push("<w:p/>");
  const notes = Array.from(builder.footnotes.entries())
    .sort(([a], [b]) => a - b)
    .map(([, xml]) => xml);
  const hasFootnotes = notes.length > 0;
  return {
    document: documentXml(blocks.join("")),
    styles: stylesXml(options.font),
    numbering: numberingXml(builder.lists, options.font),
    settings: settingsXml(hasFootnotes),
    footnotes: hasFootnotes ? footnotesXml(notes) : null,
    documentRels: documentRelsXml(builder.hyperlinks, hasFootnotes),
    contentTypes: contentTypesXml({ footnotes: hasFootnotes }),
    rootRels: rootRelsXml(),
    core: corePropertiesXml(options.title, options.stamp ?? new Date()),
  };
}

export function htmlToDocx(html: string, options: DocxOptions): Uint8Array {
  const parts = buildDocxParts(html, options);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(parts.contentTypes),
    "_rels/.rels": strToU8(parts.rootRels),
    "docProps/core.xml": strToU8(parts.core),
    "word/document.xml": strToU8(parts.document),
    "word/styles.xml": strToU8(parts.styles),
    "word/numbering.xml": strToU8(parts.numbering),
    "word/settings.xml": strToU8(parts.settings),
    "word/_rels/document.xml.rels": strToU8(parts.documentRels),
  };
  if (parts.footnotes) files["word/footnotes.xml"] = strToU8(parts.footnotes);
  return zipSync(files, { level: 6 });
}
