import { syntaxTree } from "@codemirror/language";
import {
  type EditorState,
  type Extension,
  type Range,
  RangeSet,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  gutterLineClass,
  highlightActiveLineGutter,
  lineNumbers,
  type Panel,
  showPanel,
  type ViewUpdate,
} from "@codemirror/view";

export const RULER_LABEL_INTERVAL = 10;

export interface RulerGeometry {
  left: number;
  width: number;
  charWidth: number;
  caret: number | null;
}

export function rulerColumnCount(width: number, charWidth: number): number {
  if (!(width > 0) || !(charWidth > 0)) return 0;
  return Math.floor(width / charWidth + 0.01);
}

export function rulerLabels(columns: number, interval = RULER_LABEL_INTERVAL): number[] {
  const labels: number[] = [];
  for (let column = interval; column <= columns; column += interval) labels.push(column);
  return labels;
}

function measureRuler(view: EditorView, panel: HTMLElement): RulerGeometry {
  const content = view.contentDOM;
  const style = getComputedStyle(content);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const rect = content.getBoundingClientRect();
  const textLeft = rect.left + paddingLeft;
  const coords = view.coordsAtPos(view.state.selection.main.head);
  return {
    left: textLeft - panel.getBoundingClientRect().left,
    width: rect.width - paddingLeft - paddingRight,
    charWidth: view.defaultCharacterWidth,
    caret: coords ? coords.left - textLeft : null,
  };
}

function columnRuler(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-column-ruler";
  dom.setAttribute("aria-hidden", "true");
  dom.dataset.testid = "column-ruler";
  const scale = document.createElement("div");
  scale.className = "cm-column-ruler-scale";
  const marker = document.createElement("div");
  marker.className = "cm-column-ruler-marker";
  dom.append(scale);
  let drawn = "";

  const drawLabels = (columns: number, charWidth: number) => {
    const signature = `${columns}:${charWidth}`;
    if (signature === drawn) return;
    drawn = signature;
    const labels = rulerLabels(columns).map((column) => {
      const label = document.createElement("span");
      label.className = "cm-column-ruler-label";
      label.textContent = String(column);
      label.style.left = `${(column - 0.5) * charWidth}px`;
      return label;
    });
    scale.replaceChildren(marker, ...labels);
  };

  const request = {
    key: dom,
    read: (target: EditorView) => measureRuler(target, dom),
    write: (geometry: RulerGeometry) => {
      const columns = rulerColumnCount(geometry.width, geometry.charWidth);
      scale.style.left = `${geometry.left}px`;
      scale.style.width = `${columns * geometry.charWidth}px`;
      scale.style.setProperty("--ruler-cell", `${geometry.charWidth}px`);
      drawLabels(columns, geometry.charWidth);
      const caret = geometry.caret;
      const visible = caret !== null && caret >= 0 && caret < columns * geometry.charWidth;
      marker.hidden = !visible;
      if (visible) {
        const cell = Math.floor(caret / geometry.charWidth + 0.01);
        marker.style.left = `${cell * geometry.charWidth}px`;
        marker.style.width = `${geometry.charWidth}px`;
      }
    },
  };

  return {
    dom,
    top: true,
    mount: () => view.requestMeasure(request),
    update: (update: ViewUpdate) => {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.geometryChanged ||
        update.viewportChanged
      ) {
        update.view.requestMeasure(request);
      }
    },
  };
}

class HeadingGutterMarker extends GutterMarker {
  constructor(readonly level: number) {
    super();
    this.elementClass = `cm-gutter-heading cm-gutter-h${level}`;
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof HeadingGutterMarker && other.level === this.level;
  }
}

const HEADING_MARKERS = [1, 2, 3, 4, 5, 6].map((level) => new HeadingGutterMarker(level));
const HEADING_CONTAINERS = new Set([
  "Document",
  "Blockquote",
  "BulletList",
  "OrderedList",
  "ListItem",
]);

/** Marks the gutter row of every heading line so its number can match the heading's line box. */
export function headingGutterMarkers(state: EditorState): RangeSet<GutterMarker> {
  const markers: Range<GutterMarker>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
      if (heading) {
        const line = state.doc.lineAt(node.from);
        markers.push(HEADING_MARKERS[Number(heading[1]) - 1].range(line.from));
        return false;
      }
      return HEADING_CONTAINERS.has(node.name);
    },
  });
  return RangeSet.of(markers);
}

const headingGutter = StateField.define<RangeSet<GutterMarker>>({
  create: headingGutterMarkers,
  update: (markers, transaction) =>
    transaction.docChanged || syntaxTree(transaction.state) !== syntaxTree(transaction.startState)
      ? headingGutterMarkers(transaction.state)
      : markers,
  provide: (field) => gutterLineClass.from(field),
});

export interface RulerOptions {
  columns: boolean;
}

export function rulers(options: RulerOptions): Extension {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    options.columns ? showPanel.of(columnRuler) : headingGutter,
  ];
}

export const sourceRulers = rulers({ columns: true });
export const previewRulers = rulers({ columns: false });
