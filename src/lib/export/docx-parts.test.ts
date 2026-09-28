import { describe, expect, it } from "vite-plus/test";
import {
  contentTypesXml,
  corePropertiesXml,
  documentRelsXml,
  documentXml,
  escapeXml,
  footnotesXml,
  numberingXml,
  rootRelsXml,
  settingsXml,
  stripInvalidXml,
  stylesXml,
} from "./docx-parts";

export function parseXml(xml: string): Document {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const error = parsed.querySelector("parsererror");
  if (error) throw new Error(error.textContent ?? "invalid xml");
  return parsed;
}

describe("escapeXml", () => {
  it("escapes markup characters and drops characters XML forbids", () => {
    expect(escapeXml(`a < b & "c" > 'd'`)).toBe("a &lt; b &amp; &quot;c&quot; &gt; &apos;d&apos;");
    const bell = String.fromCharCode(7);
    const nul = String.fromCharCode(0);
    expect(stripInvalidXml(`tab\tnew\nline${nul}${bell}ok\u{1F600}`)).toBe(
      "tab\tnew\nlineok\u{1F600}",
    );
  });
});

describe("package parts", () => {
  it("are well-formed and list the footnotes part only when present", () => {
    for (const footnotes of [true, false]) {
      const types = parseXml(contentTypesXml({ footnotes }));
      const names = Array.from(types.getElementsByTagName("Override")).map((node) =>
        node.getAttribute("PartName"),
      );
      expect(names).toContain("/word/document.xml");
      expect(names).toContain("/word/styles.xml");
      expect(names).toContain("/word/numbering.xml");
      expect(names).toContain("/docProps/core.xml");
      expect(names.includes("/word/footnotes.xml")).toBe(footnotes);
      const rels = parseXml(
        documentRelsXml([{ id: "rId5", target: "https://x.test/?a=1&b=2" }], footnotes),
      );
      const relationships = Array.from(rels.getElementsByTagName("Relationship"));
      expect(relationships.some((node) => node.getAttribute("Target") === "footnotes.xml")).toBe(
        footnotes,
      );
      const link = relationships.find((node) => node.getAttribute("Id") === "rId5")!;
      expect(link.getAttribute("Target")).toBe("https://x.test/?a=1&b=2");
      expect(link.getAttribute("TargetMode")).toBe("External");
      expect(parseXml(settingsXml(footnotes)).getElementsByTagName("w:footnotePr")).toHaveLength(
        footnotes ? 1 : 0,
      );
    }
    parseXml(rootRelsXml());
    parseXml(stylesXml());
    parseXml(documentXml("<w:p/>"));
    parseXml(footnotesXml(['<w:footnote w:id="1"><w:p/></w:footnote>']));
  });

  it("defines heading, quote, code, hyperlink, and footnote styles Word recognises", () => {
    const styles = parseXml(stylesXml());
    const ids = Array.from(styles.getElementsByTagName("w:style")).map((node) =>
      node.getAttribute("w:styleId"),
    );
    for (const id of [
      "Normal",
      "Heading1",
      "Heading2",
      "Heading3",
      "Heading4",
      "Heading5",
      "Heading6",
      "Quote",
      "Code",
      "CodeChar",
      "Hyperlink",
      "FootnoteText",
      "FootnoteReference",
      "TableGrid",
    ])
      expect(ids).toContain(id);
    const names = Array.from(styles.getElementsByTagName("w:name")).map((node) =>
      node.getAttribute("w:val"),
    );
    expect(names).toContain("heading 1");
    expect(names).toContain("footnote text");
  });

  it("sets the body and bullet font to the chosen face and keeps code in the mono face", () => {
    const fontsOf = (xml: string) =>
      Array.from(parseXml(xml).getElementsByTagName("w:rFonts")).map((node) =>
        node.getAttribute("w:ascii"),
      );
    expect(fontsOf(stylesXml())).toEqual(["Arial", "Consolas", "Consolas"]);
    expect(fontsOf(stylesXml("Segoe Print"))).toEqual(["Segoe Print", "Consolas", "Consolas"]);
    expect(new Set(fontsOf(numberingXml(["bullet"], "Georgia")))).toEqual(new Set(["Georgia"]));
    expect(fontsOf(stylesXml('A & "B"'))[0]).toBe('A & "B"');
  });

  it("numbers each list separately so ordered lists restart at one", () => {
    const numbering = parseXml(numberingXml(["bullet", "decimal", "decimal"]));
    const nums = Array.from(numbering.getElementsByTagName("w:num"));
    expect(nums.map((node) => node.getAttribute("w:numId"))).toEqual(["1", "2", "3"]);
    expect(
      nums.map((node) => node.getElementsByTagName("w:abstractNumId")[0].getAttribute("w:val")),
    ).toEqual(["0", "1", "1"]);
    for (const num of nums) expect(num.getElementsByTagName("w:startOverride")).toHaveLength(9);
    const abstracts = Array.from(numbering.getElementsByTagName("w:abstractNum"));
    expect(abstracts).toHaveLength(2);
    const formats = abstracts.map((node) =>
      node.getElementsByTagName("w:numFmt")[0].getAttribute("w:val"),
    );
    expect(formats).toEqual(["bullet", "decimal"]);
    expect(parseXml(numberingXml([])).getElementsByTagName("w:num")).toHaveLength(0);
  });

  it("records the title and timestamp in the core properties", () => {
    const core = parseXml(corePropertiesXml("Plan <2026>", new Date("2026-09-13T10:00:00Z")));
    expect(core.getElementsByTagName("dc:title")[0].textContent).toBe("Plan <2026>");
    expect(core.getElementsByTagName("dcterms:created")[0].textContent).toBe(
      "2026-09-13T10:00:00.000Z",
    );
  });
});
