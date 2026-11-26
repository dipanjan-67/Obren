import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, Crop, ImageUp, Loader2, X } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PdfDiagramCropModalProps {
  pdfFile: File | null;
  initialPage?: number;
  onAttachImage: (dataUrl: string) => void;
  onClose: () => void;
}

const MAX_IMAGE_DATA_URL_LEN = 230000;

export function compressCanvasToDataUrl(canvas: HTMLCanvasElement): string {
  const maxDim = 960;
  let targetCanvas = canvas;
  if (canvas.width > maxDim || canvas.height > maxDim) {
    const scale = maxDim / Math.max(canvas.width, canvas.height);
    const resized = document.createElement('canvas');
    resized.width = Math.max(1, Math.round(canvas.width * scale));
    resized.height = Math.max(1, Math.round(canvas.height * scale));
    const rCtx = resized.getContext('2d');
    if (rCtx) {
      rCtx.fillStyle = '#ffffff';
      rCtx.fillRect(0, 0, resized.width, resized.height);
      rCtx.drawImage(canvas, 0, 0, resized.width, resized.height);
      targetCanvas = resized;
    }
  }

  for (const quality of [0.85, 0.72, 0.58, 0.44]) {
    const url = targetCanvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_IMAGE_DATA_URL_LEN) {
      return url;
    }
  }
  return targetCanvas.toDataURL('image/jpeg', 0.35).slice(0, MAX_IMAGE_DATA_URL_LEN);
}

export async function compressImageFileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
  }
  bitmap.close();
  return compressCanvasToDataUrl(canvas);
}

export const PdfDiagramCropModal: React.FC<PdfDiagramCropModalProps> = ({
  pdfFile,
  initialPage = 1,
  onAttachImage,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(Math.max(1, initialPage));
  const [loadingPage, setLoadingPage] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!pdfFile) return;
    let cancelled = false;
    let activeDoc: pdfjsLib.PDFDocumentProxy | null = null;

    const render = async () => {
      setLoadingPage(true);
      setErrorMsg(null);
      try {
        const buffer = await pdfFile.arrayBuffer();
        const task = pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          verbosity: 0,
          isEvalSupported: false,
        });
        activeDoc = await task.promise;
        if (cancelled) return;
        setTotalPages(activeDoc.numPages);
        const safePage = Math.max(1, Math.min(pageNumber, activeDoc.numPages));
        if (safePage !== pageNumber) setPageNumber(safePage);

        const page = await activeDoc.getPage(safePage);
        try {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = canvasRef.current;
          if (!canvas || cancelled) return;
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        } finally {
          page.cleanup();
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Could not render PDF page for cropping.');
        }
      } finally {
        if (!cancelled) setLoadingPage(false);
        if (activeDoc) {
          await activeDoc.destroy().catch(() => {});
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [pdfFile, pageNumber]);

  const getRelativePoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const selectionRect =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          w: Math.abs(dragCurrent.x - dragStart.x),
          h: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  const handleConfirmCrop = () => {
    const source = canvasRef.current;
    if (!source || !selectionRect || selectionRect.w < 16 || selectionRect.h < 16) return;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.round(selectionRect.w);
    cropCanvas.height = Math.round(selectionRect.h);
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      source,
      selectionRect.x,
      selectionRect.y,
      selectionRect.w,
      selectionRect.h,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    );
    const dataUrl = compressCanvasToDataUrl(cropCanvas);
    onAttachImage(dataUrl);
  };

  const handleUploadImageFile = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      onAttachImage(dataUrl);
    } catch {
      setErrorMsg('Failed to read image file.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full max-h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-indigo-500" />
            <h3 className="font-bold font-display text-sm sm:text-base">
              Attach Question Diagram / Circuit / Reaction Scheme
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer">
              <ImageUp className="w-3.5 h-3.5 text-indigo-500" />
              <span>Upload Image</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleUploadImageFile(e.target.files?.[0] || null)}
              />
            </label>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {pdfFile ? (
          <>
            <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                Drag across any figure on the PDF page below to crop and attach it to this question.
              </span>
              <div className="flex items-center gap-2 font-mono tabular-nums">
                <button
                  type="button"
                  disabled={pageNumber <= 1 || loadingPage}
                  onClick={() => {
                    setDragStart(null);
                    setDragCurrent(null);
                    setPageNumber((p) => Math.max(1, p - 1));
                  }}
                  className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>
                  Page {pageNumber} / {totalPages || '?'}
                </span>
                <button
                  type="button"
                  disabled={totalPages > 0 && pageNumber >= totalPages}
                  onClick={() => {
                    setDragStart(null);
                    setDragCurrent(null);
                    setPageNumber((p) => p + 1);
                  }}
                  className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-slate-950 flex justify-center">
              {errorMsg ? (
                <div className="text-sm text-rose-600 py-8">{errorMsg}</div>
              ) : (
                <div className="relative inline-block shadow-md border border-slate-300 dark:border-slate-700 bg-white">
                  {loadingPage && (
                    <div className="absolute inset-0 bg-white/75 dark:bg-slate-900/75 flex items-center justify-center z-20">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    onMouseDown={(e) => {
                      const pt = getRelativePoint(e);
                      if (pt) {
                        setDragStart(pt);
                        setDragCurrent(pt);
                      }
                    }}
                    onMouseMove={(e) => {
                      if (!dragStart) return;
                      const pt = getRelativePoint(e);
                      if (pt) setDragCurrent(pt);
                    }}
                    onMouseUp={() => {
                      // Leave drag box visible until user confirms or clears
                    }}
                    className="max-w-full h-auto cursor-crosshair block select-none"
                  />
                  {selectionRect && canvasRef.current && (
                    <div
                      className="pointer-events-none absolute border-2 border-indigo-600 bg-indigo-500/15"
                      style={{
                        left: `${(selectionRect.x / canvasRef.current.width) * 100}%`,
                        top: `${(selectionRect.y / canvasRef.current.height) * 100}%`,
                        width: `${(selectionRect.w / canvasRef.current.width) * 100}%`,
                        height: `${(selectionRect.h / canvasRef.current.height) * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setDragStart(null);
                  setDragCurrent(null);
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Clear Selection
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectionRect || selectionRect.w < 16 || selectionRect.h < 16}
                  onClick={handleConfirmCrop}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-xs font-semibold cursor-pointer"
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>Attach Cropped Diagram</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-10 text-center space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              Select an image screenshot (.PNG / .JPG) of the circuit, graph, or organic structure, or upload a PYQ PDF first to crop directly from PDF pages.
            </p>
            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer">
              <ImageUp className="w-4 h-4" />
              <span>Choose Image File</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleUploadImageFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
