export const SAMPLE_TITLE = "Welcome to emdy";

export const SAMPLE_DOCUMENT = `# Welcome to emdy

emdy is a quiet, local-first Markdown editor. Everything you type stays on this device: parsing, rendering, search, and statistics all run in your browser.

## Why local-first?

Local-first software feels *instant* because there is **no network** between you and your words. It also means your documents are ***yours***, with no account and no sync service in between.

> "Simplicity is the ultimate sophistication."
>
> Attributed to Leonardo da Vinci, and quoted[^1] more often than verified.

### Getting around

- Press \`Cmd/Ctrl+1\` or \`2\` to switch between Raw Markdown and Editable preview.
- In Editable preview, click a line to reveal its Markdown syntax and keep writing.
- Toggle the sidebar with \`Cmd/Ctrl+\\\`.
- Enter focus mode with \`Cmd/Ctrl+Shift+F\`.
- Open the shortcut reference with \`Cmd/Ctrl+/\`.

#### Nested thoughts

1. Ordered lists keep their numbers.
2. They can nest as well:
   - A bullet inside an ordered item
   - Another one, with a [link to the CommonMark spec](https://commonmark.org)
     1. Three levels deep
3. Back at the top level.

##### Things to do

- [x] Install nothing
- [x] Open the editor
- [ ] Write something worth reading
- [ ] Ship it

###### A sixth-level heading

Even the smallest heading gets its own place in the outline.

---

## Code

Inline code like \`const answer = 42\` sits comfortably in prose. Fenced blocks get syntax highlighting:

\`\`\`ts
export function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
\`\`\`

\`\`\`python
def reading_time(words: int, wpm: int = 225) -> int:
    return max(1, round(words / wpm))
\`\`\`

\`\`\`css
.prose {
  font-family: "iA Writer Quattro", serif;
  line-height: 1.65;
}
\`\`\`

## Tables

| Mode             | Shortcut     | What you see                       |
| ---------------- | ------------ | ---------------------------------- |
| Raw Markdown     | \`Cmd/Ctrl+1\` | Every Markdown marker              |
| Editable preview | \`Cmd/Ctrl+2\` | Formatted text you can edit         |

Tables and images render in place; click one to edit its Markdown. Footnotes keep their notation in the editable view.

## Images

![The emdy logo](/logo.svg)

## Footnotes

Footnote references stay alongside your text[^2], with their definitions below.

***

Thanks for reading. Now clear this out and write your own.

[^1]: The quote appears in countless design books, usually without a source.
[^2]: Like this one.
`;

export interface TestDocument {
  id: string;
  title: string;
  text: string;
}

const MEETING_NOTES = `# Weekly sync — product

**Attendees:** Ana, Priya, Tom

## Decisions

- Ship the sidebar rework this week.
- Keep the outline in the document margin.

## Action items

- [ ] Priya: write release notes
- [ ] Tom: review keyboard shortcuts
- [x] Ana: seed dummy documents

> Next sync: Thursday, same time.
`;

const READING_LIST = `# Reading list

## Now

1. *The Design of Everyday Things* — Don Norman
2. *A Philosophy of Software Design* — John Ousterhout

## Later

- [Local-first software](https://www.inkandswitch.com/local-first/)
- Anything about typography and reading rhythm

## Finished

- ~~*Refactoring UI*~~ — worth a second pass
`;

const PROJECT_IDEAS = `# Project ideas

## Small

- A **pomodoro** timer that lives in the menu bar
- Markdown table formatter

## Medium

- Offline recipe book with \`yaml\` front matter
- Personal wiki with backlinks

## Ambitious

- A local-first Markdown editor that feels instant

---

Ideas are cheap; pick one and finish it.
`;

export const TEST_DOCUMENTS: readonly TestDocument[] = [
  { id: "welcom", title: SAMPLE_TITLE, text: SAMPLE_DOCUMENT },
  { id: "weekly", title: "Weekly sync — product", text: MEETING_NOTES },
  { id: "readng", title: "Reading list", text: READING_LIST },
  { id: "ideas0", title: "Project ideas", text: PROJECT_IDEAS },
];

const PRICE_TABLE = [
  "| Item | Note | Price |",
  "| :--- | :---: | ---: |",
  '| Tea, green | says "hi" | 4 |',
  "| Pipe \\| cell |  | 12 |",
].join("\n");

/** A document whose table exercises CSV quoting, escaped pipes, empty cells, and alignment. */
export const TABLE_DOCUMENT: TestDocument = {
  id: "prices",
  title: "Price list",
  text: `Spring order\n\n${PRICE_TABLE}\n\nTotals follow.\n`,
};

/** What copying TABLE_DOCUMENT's table puts on the clipboard in each format. */
export const TABLE_DOCUMENT_COPIES = {
  source: PRICE_TABLE,
  markdown: [
    "| Item         |   Note    | Price |",
    "| :----------- | :-------: | ----: |",
    '| Tea, green   | says "hi" |     4 |',
    "| Pipe \\| cell |           |    12 |",
  ].join("\n"),
  csv: ["Item,Note,Price", '"Tea, green","says ""hi""",4', "Pipe | cell,,12"].join("\n"),
} as const;
