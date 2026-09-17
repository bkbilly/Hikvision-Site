import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Camera, RecordingSegment } from '../types';
import { api } from '../api';
import { 
  X, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Camera as CameraIcon, 
  Loader2 
} from 'lucide-react';
import { getEventTypeInfo } from '../utils/eventType';

interface PhotoViewerProps {
  camera: Camera | null;
  segment: RecordingSegment | null;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  camera,
  segment,
  onClose,
  onNext,
  onPrev,
  hasNext = false,
  hasPrev = false,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom & pan when segment changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsLoading(true);
    setHasError(false);
  }, [segment?.id, segment?.videoStart]);

  const imageUrl = segment && camera
    ? api.getPictureUrl(camera.id, segment.datadir, segment.file, segment.videoStart, segment.videoEnd)
    : '';

  const eventInfo = segment ? getEventTypeInfo(segment.record_type) : null;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        onNext();
      } else if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        onPrev();
      } else if (e.key === '+' || e.key === '=') {
        setZoom(z => Math.min(z + 0.25, 4));
      } else if (e.key === '-') {
        setZoom(z => Math.max(z - 0.25, 0.5));
      } else if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoom(z => Math.min(Math.max(z + delta, 0.5), 4));
  }, []);

  // Pan dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!segment || !camera) return null;

  const downloadFilename = `hikvision_snapshot_${camera.name.replace(/\s+/g, '_')}_${segment.start.replace(/[: ]/g, '_')}.jpg`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-xl select-none animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800/80 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <CameraIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white tracking-wide">{camera.name}</h2>
              {eventInfo && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${eventInfo.badgeClass}`}>
                  {eventInfo.label}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono">{segment.start}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-slate-800/80 rounded-xl p-1 border border-slate-700/60">
            <button
              onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono px-2 text-slate-300 w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(z + 0.25, 4))}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors ml-1 border-l border-slate-700"
              title="Reset zoom (0)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Download */}
          <a
            href={imageUrl}
            download={downloadFilename}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition-colors"
            title="Download Snapshot"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
          </a>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Display Area */}
      <div 
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`flex-1 relative flex items-center justify-center overflow-hidden cursor-${zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'}`}
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/50 backdrop-blur-sm z-10">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-400">Loading snapshot...</p>
          </div>
        )}

        {hasError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
            <CameraIcon className="w-10 h-10 text-slate-600" />
            <p className="text-sm">Failed to load picture snapshot</p>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={`${camera.name} snapshot at ${segment.start}`}
            onLoad={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setHasError(true); }}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
            className="max-h-full max-w-full object-contain pointer-events-none rounded-lg shadow-2xl"
          />
        )}

        {/* Previous / Next Floating Buttons */}
        {hasPrev && onPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-xl transition-all hover:scale-105 active:scale-95"
            title="Previous Snapshot (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {hasNext && onNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-xl transition-all hover:scale-105 active:scale-95"
            title="Next Snapshot (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Information Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 border-t border-slate-800/80 text-xs text-slate-400 z-20">
        <div className="flex items-center gap-4">
          <span>Storage: <strong className="text-slate-200 font-mono">datadir{segment.datadir} / hiv{String(segment.file).padStart(5, '0')}.pic</strong></span>
          <span className="hidden sm:inline">Offset: <strong className="text-slate-200 font-mono">{segment.videoStart.toLocaleString()}..{segment.videoEnd.toLocaleString()}</strong> ({((segment.videoEnd - segment.videoStart) / 1024).toFixed(1)} KB)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-slate-500">Use Arrow keys to navigate, +/- to zoom</span>
        </div>
      </div>
    </div>
  );
};
