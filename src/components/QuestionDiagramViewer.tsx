import React, { useMemo, useState } from 'react';
import { Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

interface QuestionDiagramViewerProps {
  diagramSvg?: string;
  imageUrl?: string;
  title?: string;
  caption?: string;
  compact?: boolean;
}

const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'marker',
  'path',
  'line',
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'polyline',
  'text',
  'tspan',
  'title',
]);

const ATTR_TO_REACT_PROP: Record<string, string> = {
  viewbox: 'viewBox',
  fill: 'fill',
  'fill-opacity': 'fillOpacity',
  stroke: 'stroke',
  'stroke-width': 'strokeWidth',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-opacity': 'strokeOpacity',
  opacity: 'opacity',
  transform: 'transform',
  d: 'd',
  x: 'x',
  y: 'y',
  x1: 'x1',
  y1: 'y1',
  x2: 'x2',
  y2: 'y2',
  cx: 'cx',
  cy: 'cy',
  r: 'r',
  rx: 'rx',
  ry: 'ry',
  points: 'points',
  dx: 'dx',
  dy: 'dy',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'font-family': 'fontFamily',
  'text-anchor': 'textAnchor',
  'dominant-baseline': 'dominantBaseline',
  id: 'id',
  markerwidth: 'markerWidth',
  markerheight: 'markerHeight',
  refx: 'refX',
  refy: 'refY',
  orient: 'orient',
  'marker-end': 'markerEnd',
  'marker-start': 'markerStart',
  markerunits: 'markerUnits',
};

function renderSafeSvgNode(node: ChildNode, key: string): React.ReactNode {
  if (node.nodeType === 3) {
    return node.textContent;
  }
  if (node.nodeType !== 1) return null;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return null;

  const props: Record<string, unknown> = { key };
  for (let i = 0; i < el.attributes.length; i += 1) {
    const attr = el.attributes[i];
    const lowerName = attr.name.toLowerCase();
    const reactProp = ATTR_TO_REACT_PROP[lowerName];
    if (!reactProp) continue;
    const val = attr.value.trim();
    if (/javascript:|data:|https?:/i.test(val)) continue;
    props[reactProp] = val;
  }

  if (tag === 'svg') {
    if (!props.viewBox) props.viewBox = '0 0 460 280';
    props.className = 'w-full h-auto block select-none';
    props.role = 'img';
  }

  const children: React.ReactNode[] = [];
  el.childNodes.forEach((child, idx) => {
    const rendered = renderSafeSvgNode(child, `${key}_${idx}`);
    if (rendered !== null && rendered !== undefined) {
      children.push(rendered);
    }
  });

  return React.createElement(tag, props, children.length > 0 ? children : undefined);
}

function SafeSvgCanvas({ svgMarkup, zoom }: { svgMarkup: string; zoom: number }) {
  const renderedTree = useMemo(() => {
    if (!svgMarkup || typeof DOMParser === 'undefined') return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
      const parserErr = doc.querySelector('parsererror');
      if (parserErr) return null;
      const svgEl = doc.documentElement;
      if (!svgEl || svgEl.tagName.toLowerCase() !== 'svg') return null;
      return renderSafeSvgNode(svgEl, 'root_svg');
    } catch {
      return null;
    }
  }, [svgMarkup]);

  if (!renderedTree) return null;

  return (
    <div
      className="origin-top-left transition-transform duration-200"
      style={{
        width: `${zoom * 100}%`,
      }}
    >
      {renderedTree}
    </div>
  );
}

export const QuestionDiagramViewer: React.FC<QuestionDiagramViewerProps> = ({
  diagramSvg,
  imageUrl,
  title,
  caption,
  compact = false,
}) => {
  const [inlineZoom, setInlineZoom] = useState<number>(1);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [modalZoom, setModalZoom] = useState<number>(1.25);

  if (!diagramSvg && !imageUrl) return null;

  return (
    <>
      <div
        className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white text-slate-900 overflow-hidden shadow-xs ${
          compact ? 'max-w-md' : 'max-w-xl'
        }`}
      >
        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-600">
              Figure
            </span>
            {title && (
              <span className="text-xs font-semibold text-slate-800 ml-2 truncate">
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setInlineZoom((z) => (z >= 1.75 ? 1 : Number((z + 0.25).toFixed(2))))}
              title="Toggle inline zoom"
              className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-mono font-semibold text-slate-700 cursor-pointer"
            >
              {inlineZoom}x
            </button>
            <button
              type="button"
              onClick={() => {
                setModalZoom(1.3);
                setLightboxOpen(true);
              }}
              title="Open full-size zoomable diagram"
              className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div
          className={`p-3 bg-white overflow-auto ${compact ? 'max-h-64' : 'max-h-88'} cursor-zoom-in`}
          onClick={() => {
            setModalZoom(1.3);
            setLightboxOpen(true);
          }}
        >
          {diagramSvg ? (
            <SafeSvgCanvas svgMarkup={diagramSvg} zoom={inlineZoom} />
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={title || 'Question diagram'}
              style={{ width: `${inlineZoom * 100}%` }}
              className="max-h-72 object-contain mx-auto rounded"
            />
          ) : null}
        </div>

        {caption && (
          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 leading-snug">
            {caption}
          </div>
        )}
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="bg-white text-slate-900 rounded-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-mono font-bold uppercase text-indigo-600">
                  Interactive Diagram Zoom
                </div>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {title || 'Educational Diagram'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 cursor-pointer"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-2.5 text-xs font-mono font-bold tabular-nums">
                  {Math.round(modalZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setModalZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 cursor-pointer"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setModalZoom(1)}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 cursor-pointer"
                  title="Reset zoom"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 cursor-pointer ml-1"
                  aria-label="Close zoom viewer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-white flex items-start justify-center">
              {diagramSvg ? (
                <div className="w-full max-w-2xl">
                  <SafeSvgCanvas svgMarkup={diagramSvg} zoom={modalZoom} />
                </div>
              ) : imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title || 'Question diagram'}
                  style={{ width: `${modalZoom * 75}%` }}
                  className="object-contain rounded"
                />
              ) : null}
            </div>

            {caption && (
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
                {caption}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
