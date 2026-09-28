export const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const PAGE_WIDTH = 11906;
export const PAGE_HEIGHT = 16838;
export const PAGE_MARGIN = 1440;
export const TEXT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
export const LIST_INDENT = 720;
export const LIST_HANGING = 360;

export const COLORS = {
  text: "1B1B19",
  muted: "6B6B66",
  quote: "626260",
  accent: "2D4BD1",
  codeBackground: "F2F2EF",
  border: "DDDCD6",
  borderStrong: "BAB9B1",
} as const;

export const FONTS = { body: "Arial", mono: "Consolas" } as const;

export type ListKind = "bullet" | "decimal";

const isXmlCharacter = (code: number) =>
  code === 0x9 ||
  code === 0xa ||
  code === 0xd ||
  (code >= 0x20 && code !== 0xfffe && code !== 0xffff);

export function stripInvalidXml(value: string): string {
  let result = "";
  for (const character of value) {
    if (isXmlCharacter(character.codePointAt(0) ?? 0)) result += character;
  }
  return result;
}

export function escapeXml(value: string): string {
  return stripInvalidXml(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

export function contentTypesXml(parts: { footnotes: boolean }): string {
  const overrides = [
    ["/word/document.xml", "wordprocessingml.document.main+xml"],
    ["/word/styles.xml", "wordprocessingml.styles+xml"],
    ["/word/numbering.xml", "wordprocessingml.numbering+xml"],
    ["/word/settings.xml", "wordprocessingml.settings+xml"],
    ...(parts.footnotes ? [["/word/footnotes.xml", "wordprocessingml.footnotes+xml"]] : []),
  ]
    .map(
      ([name, type]) =>
        `<Override PartName="${name}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`,
    )
    .join("");
  return (
    `${XML_HEADER}<Types xmlns="${CT_NS}">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    overrides +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    "</Types>"
  );
}

export function rootRelsXml(): string {
  return (
    `${XML_HEADER}<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="word/document.xml"/>` +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    "</Relationships>"
  );
}

export interface HyperlinkRelationship {
  id: string;
  target: string;
}

export const FIRST_HYPERLINK_ID = 5;

export function documentRelsXml(
  hyperlinks: readonly HyperlinkRelationship[],
  footnotes: boolean,
): string {
  const fixed = [
    `<Relationship Id="rId1" Type="${OFFICE_REL}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId2" Type="${OFFICE_REL}/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="rId3" Type="${OFFICE_REL}/settings" Target="settings.xml"/>`,
    ...(footnotes
      ? [`<Relationship Id="rId4" Type="${OFFICE_REL}/footnotes" Target="footnotes.xml"/>`]
      : []),
  ];
  const external = hyperlinks.map(
    (link) =>
      `<Relationship Id="${link.id}" Type="${OFFICE_REL}/hyperlink" Target="${escapeXml(link.target)}" TargetMode="External"/>`,
  );
  return `${XML_HEADER}<Relationships xmlns="${REL_NS}">${[...fixed, ...external].join("")}</Relationships>`;
}

export function corePropertiesXml(title: string, stamp: Date): string {
  const time = stamp.toISOString();
  return (
    `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${time}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${time}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

export function settingsXml(footnotes: boolean): string {
  const footnotePr = footnotes
    ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>'
    : "";
  return (
    `${XML_HEADER}<w:settings xmlns:w="${W_NS}">` +
    footnotePr +
    '<w:defaultTabStop w:val="720"/>' +
    '<w:characterSpacingControl w:val="doNotCompress"/>' +
    "</w:settings>"
  );
}

const fonts = (font: string) => {
  const name = escapeXml(font);
  return `<w:rFonts w:ascii="${name}" w:hAnsi="${name}" w:eastAsia="${name}" w:cs="${name}"/>`;
};

const heading = (level: number, size: number, before: number, color: string = COLORS.text) =>
  `<w:style w:type="paragraph" w:styleId="Heading${level}">` +
  `<w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
  `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="80"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
  `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
  "</w:style>";

export function stylesXml(bodyFont: string = FONTS.body): string {
  return (
    `${XML_HEADER}<w:styles xmlns:w="${W_NS}">` +
    "<w:docDefaults>" +
    `<w:rPrDefault><w:rPr>${fonts(bodyFont)}<w:color w:val="${COLORS.text}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>` +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    "</w:docDefaults>" +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    heading(1, 40, 360) +
    heading(2, 32, 320) +
    heading(3, 28, 280) +
    heading(4, 24, 240) +
    heading(5, 22, 200) +
    heading(6, 22, 200, COLORS.muted) +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    `<w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:space="12" w:color="${COLORS.borderStrong}"/></w:pBdr><w:ind w:left="${LIST_INDENT}"/></w:pPr>` +
    `<w:rPr><w:i/><w:color w:val="${COLORS.quote}"/></w:rPr></w:style>` +
    '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/>' +
    `<w:pPr><w:keepLines/><w:shd w:val="clear" w:color="auto" w:fill="${COLORS.codeBackground}"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="240" w:right="240"/></w:pPr>` +
    `<w:rPr>${fonts(FONTS.mono)}<w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>` +
    '<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/>' +
    `<w:rPr>${fonts(FONTS.mono)}<w:shd w:val="clear" w:color="auto" w:fill="${COLORS.codeBackground}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>` +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>' +
    `<w:rPr><w:color w:val="${COLORS.accent}"/><w:u w:val="single"/></w:rPr></w:style>` +
    '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/>' +
    '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/>' +
    '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/>' +
    '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
    "<w:tblPr><w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${COLORS.border}"/>`)
      .join("") +
    "</w:tblBorders></w:tblPr></w:style>" +
    "</w:styles>"
  );
}

const BULLETS = ["•", "◦", "▪"];
const NUMBER_FORMATS = ["decimal", "lowerLetter", "lowerRoman"];

function level(index: number, kind: ListKind, bodyFont: string): string {
  const indent = LIST_INDENT * (index + 1);
  const format = kind === "bullet" ? "bullet" : NUMBER_FORMATS[index % 3];
  const text = kind === "bullet" ? BULLETS[index % 3] : `%${index + 1}.`;
  const runFonts = kind === "bullet" ? `<w:rPr>${fonts(bodyFont)}</w:rPr>` : "";
  return (
    `<w:lvl w:ilvl="${index}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>` +
    `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${indent}" w:hanging="${LIST_HANGING}"/></w:pPr>${runFonts}</w:lvl>`
  );
}

export function numberingXml(lists: readonly ListKind[], bodyFont: string = FONTS.body): string {
  const abstracts = (["bullet", "decimal"] as const)
    .map(
      (kind, index) =>
        `<w:abstractNum w:abstractNumId="${index}"><w:multiLevelType w:val="hybridMultilevel"/>` +
        Array.from({ length: 9 }, (_, levelIndex) => level(levelIndex, kind, bodyFont)).join("") +
        "</w:abstractNum>",
    )
    .join("");
  const nums = lists
    .map((kind, index) => {
      const overrides = Array.from(
        { length: 9 },
        (_, levelIndex) =>
          `<w:lvlOverride w:ilvl="${levelIndex}"><w:startOverride w:val="1"/></w:lvlOverride>`,
      ).join("");
      return `<w:num w:numId="${index + 1}"><w:abstractNumId w:val="${kind === "bullet" ? 0 : 1}"/>${overrides}</w:num>`;
    })
    .join("");
  return `${XML_HEADER}<w:numbering xmlns:w="${W_NS}">${abstracts}${nums}</w:numbering>`;
}

export function footnotesXml(notes: readonly string[]): string {
  const separator = (type: string, id: number, mark: string) =>
    `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:${mark}/></w:r></w:p></w:footnote>`;
  return (
    `${XML_HEADER}<w:footnotes xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
    separator("separator", -1, "separator") +
    separator("continuationSeparator", 0, "continuationSeparator") +
    notes.join("") +
    "</w:footnotes>"
  );
}

export function documentXml(body: string): string {
  return (
    `${XML_HEADER}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/>` +
    `<w:pgMar w:top="${PAGE_MARGIN}" w:right="${PAGE_MARGIN}" w:bottom="${PAGE_MARGIN}" w:left="${PAGE_MARGIN}" w:header="708" w:footer="708" w:gutter="0"/>` +
    "</w:sectPr></w:body></w:document>"
  );
}
