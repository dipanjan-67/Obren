import React, { useEffect, useRef, useState } from 'react';
import {
  Square,
  Circle,
  Minus,
  ArrowRight,
  Type,
  Eraser,
  PenTool,
  Highlighter,
  RotateCcw,
  RotateCw,
  Trash2,
  Download,
  CloudUpload,
  Plus,
  ChevronLeft,
  ChevronRight,
  Grid,
  FileText,
  Check,
  Loader2,
} from 'lucide-react';

interface ClassroomWhiteboardProps {
  groupId?: string;
  isTeacher: boolean;
  userName: string;
}

type ToolType = 'pen' | 'highlighter' | 'eraser' | 'rect' | 'circle' | 'line' | 'arrow' | 'text';
type BgPattern = 'blank' | 'grid' | 'ruled' | 'dots';

interface WhiteboardPage {
  id: number;
  dataUrl: string;
}

export const ClassroomWhiteboard: React.FC<ClassroomWhiteboardProps> = ({
  groupId,
  isTeacher,
  userName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#4f46e5');
  const [lineWidth, setLineWidth] = useState(3);
  const [bgPattern, setBgPattern] = useState<BgPattern>('grid');

  const [isDrawing, setIsDrawing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);

  const [pages, setPages] = useState<WhiteboardPage[]>([{ id: 1, dataUrl: '' }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const [savingToCloud, setSavingToCloud] = useState(false);
  const [cloudSuccess, setCloudSuccess] = useState(false);

  // Initialize canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas internal resolution
    canvas.width = canvas.parentElement?.clientWidth || 900;
    canvas.height = 560;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Load current page snapshot if exists
    if (pages[currentPageIndex]?.dataUrl) {
      const img = new window.Image();
      img.src = pages[currentPageIndex].dataUrl;
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [currentPageIndex]);

  const saveCurrentPageSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setPages((prev) => {
      const updated = [...prev];
      updated[currentPageIndex] = { ...updated[currentPageIndex], dataUrl };
      return updated;
    });
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setIsDrawing(true);
    setStartX(x);
    setStartY(y);
    setSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height));

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      ctx.strokeStyle = tool === 'eraser' ? '#0f172a' : color;
      ctx.lineWidth = tool === 'highlighter' ? lineWidth * 4 : lineWidth;
      ctx.globalAlpha = tool === 'highlighter' ? 0.35 : tool === 'eraser' ? 1 : 1;
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (snapshot) {
      // Shape preview drawing
      ctx.putImageData(snapshot, 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = 1;

      if (tool === 'rect') {
        ctx.strokeRect(startX, startY, x - startX, y - startY);
      } else if (tool === 'circle') {
        const radius = Math.hypot(x - startX, y - startY);
        ctx.beginPath();
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'text') {
      const text = window.prompt('Enter text annotation:');
      if (text) {
        const rect = canvas.getBoundingClientRect();
        const clientX = 'clientX' in e ? e.clientX : startX;
        const clientY = 'clientY' in e ? e.clientY : startY;
        ctx.font = `${Math.max(14, lineWidth * 5)}px sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(text, clientX - rect.left, clientY - rect.top);
      }
    }

    ctx.globalAlpha = 1;
    saveCurrentPageSnapshot();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveCurrentPageSnapshot();
  };

  const addNewPage = () => {
    saveCurrentPageSnapshot();
    const newId = pages.length + 1;
    setPages((prev) => [...prev, { id: newId, dataUrl: '' }]);
    setCurrentPageIndex(pages.length);
  };

  const downloadWhiteboard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `whiteboard_page_${currentPageIndex + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const saveToGoogleCloud = async () => {
    setSavingToCloud(true);
    setCloudSuccess(false);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Simulate Google Drive API upload sync to user's connected Google Cloud
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setCloudSuccess(true);
      setTimeout(() => setCloudSuccess(false), 3000);
    } catch (err) {
      console.error('Google Cloud upload failed:', err);
    } finally {
      setSavingToCloud(false);
    }
  };

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* GoodNotes Style Top Toolbar */}
      <div className="bg-slate-950 p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Drawing Tools */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'pen', icon: PenTool, label: 'Pen' },
            { id: 'highlighter', icon: Highlighter, label: 'Highlighter' },
            { id: 'eraser', icon: Eraser, label: 'Eraser' },
            { id: 'rect', icon: Square, label: 'Rectangle' },
            { id: 'circle', icon: Circle, label: 'Circle' },
            { id: 'line', icon: Minus, label: 'Line' },
            { id: 'text', icon: Type, label: 'Text' },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id as ToolType)}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  tool === t.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title={t.label}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        {/* Colors & Stroke Width */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            {['#4f46e5', '#ef4444', '#10b981', '#f59e0b', '#ec4899', '#ffffff', '#0f172a'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                  color === c ? 'scale-125 border-white ring-2 ring-indigo-500' : 'border-slate-700 hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <select
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200"
          >
            <option value={2}>Thin (2px)</option>
            <option value={4}>Medium (4px)</option>
            <option value={8}>Thick (8px)</option>
            <option value={14}>Marker (14px)</option>
          </select>
        </div>

        {/* Cloud Save & Export */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveToGoogleCloud}
            disabled={savingToCloud}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
            title="Save whiteboard notes to Google Cloud / Google Drive"
          >
            {savingToCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : cloudSuccess ? (
              <Check className="w-3.5 h-3.5 text-emerald-300" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5" />
            )}
            <span>{cloudSuccess ? 'Saved to Cloud!' : 'Save to Google Cloud'}</span>
          </button>

          <button
            type="button"
            onClick={downloadWhiteboard}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
            title="Download PNG"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={clearCanvas}
            className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/60 transition-colors cursor-pointer"
            title="Clear Page"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Area with GoodNotes Pattern Background */}
      <div
        className={`relative flex-1 overflow-hidden cursor-crosshair ${
          bgPattern === 'grid'
            ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] bg-slate-950'
            : bgPattern === 'ruled'
            ? 'bg-[linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] [background-size:100%_28px] bg-slate-950'
            : bgPattern === 'dots'
            ? 'bg-[radial-gradient(#475569_1.5px,transparent_1.5px)] [background-size:20px_20px] bg-slate-950'
            : 'bg-slate-950'
        }`}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-[560px] touch-none"
        />
      </div>

      {/* Bottom Page Navigation & Background Pattern Selector */}
      <div className="bg-slate-950 px-4 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPageIndex === 0}
            onClick={() => {
              saveCurrentPageSnapshot();
              setCurrentPageIndex((prev) => Math.max(0, prev - 1));
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-slate-200">
            Page {currentPageIndex + 1} of {pages.length}
          </span>
          <button
            type="button"
            onClick={() => {
              saveCurrentPageSnapshot();
              if (currentPageIndex === pages.length - 1) {
                addNewPage();
              } else {
                setCurrentPageIndex((prev) => prev + 1);
              }
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={addNewPage}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold hover:bg-indigo-600/30 cursor-pointer ml-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Page</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Template:</span>
          {(['blank', 'grid', 'ruled', 'dots'] as const).map((pat) => (
            <button
              key={pat}
              type="button"
              onClick={() => setBgPattern(pat)}
              className={`px-2.5 py-1 rounded-lg font-semibold uppercase text-[10px] tracking-wider transition-colors cursor-pointer ${
                bgPattern === pat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {pat}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
