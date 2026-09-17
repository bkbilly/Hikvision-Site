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
  Loader2,
  Maximize2,
  Minimize2,
  Bookmark,
  BookmarkCheck,
  SkipBack,
  SkipForward
} from 'lucide-react';
import { getEventTypeInfo } from '../utils/eventType';

interface PhotoViewerProps {
  camera: Camera | null;
  segment: RecordingSegment | null;
  onClose: () => void;
  onNextEvent?: () => void;
  onPrevEvent?: () => void;
  hasNextEvent?: boolean;
  hasPrevEvent?: boolean;
  onOpenShortcuts?: () => void;
  onOpenSaveBookmark?: () => void;
  isBookmarked?: boolean;
}

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  camera,
  segment,
  onClose,
  onNextEvent,
  onPrevEvent,
  hasNextEvent = false,
  hasPrevEvent = false,
  onOpenShortcuts,
  onOpenSaveBookmark,
  isBookmarked,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panInitialOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedPanRef = useRef<boolean>(false);

  // Mobile Touch Gestures state
  const touchStartDistRef = useRef<number>(0);
  const touchStartZoomRef = useRef<number>(1);
  const touchMidpointStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapTimeRef = useRef<number>(0);
  const touchStartPosRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });

  // Reset zoom & pan when segment changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsLoading(true);
    setHasError(false);
  }, [segment?.id, segment?.videoStart, segment?.camera_id]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    const container = containerRef.current;
    if (!document.fullscreenElement) {
      if (container?.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      }
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
  }, []);

  const changeZoom = useCallback((delta: number) => {
    setZoom((prev) => {
      const next = Math.max(1, Math.min(4, Math.round((prev + delta) * 100) / 100));
      if (next === 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const cycleZoom = useCallback(() => {
    setZoom((prev) => {
      if (prev <= 1) return 2;
      if (prev <= 2) return 3;
      setPan({ x: 0, y: 0 });
      return 1;
    });
  }, []);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'Escape') {
        if (zoom > 1) {
          resetZoom();
        } else {
          onClose();
        }
      } else if (e.code === 'ArrowRight' || e.code === 'BracketRight') {
        e.preventDefault();
        if (hasNextEvent && onNextEvent) onNextEvent();
      } else if (e.code === 'ArrowLeft' || e.code === 'BracketLeft') {
        e.preventDefault();
        if (hasPrevEvent && onPrevEvent) onPrevEvent();
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') {
        e.preventDefault();
        changeZoom(0.5);
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') {
        e.preventDefault();
        changeZoom(-0.5);
      } else if (e.code === 'KeyZ') {
        e.preventDefault();
        cycleZoom();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        handleFullscreenToggle();
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        if (onOpenSaveBookmark) onOpenSaveBookmark();
      } else if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        if (onOpenShortcuts) onOpenShortcuts();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNextEvent, onPrevEvent, hasNextEvent, hasPrevEvent, zoom, changeZoom, cycleZoom, resetZoom, handleFullscreenToggle, onOpenSaveBookmark, onOpenShortcuts]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    changeZoom(delta);
  }, [changeZoom]);

  // Desktop Mouse pointer drag-to-pan
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (e.button !== 0) return;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panInitialOffsetRef.current = { ...panOffset };
    hasMovedPanRef.current = false;
    if (zoom > 1) {
      setIsPanning(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const panOffset = pan;
  const setPanOffset = setPan;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedPanRef.current = true;
    }
    if (zoom > 1 && isPanning) {
      const maxPanX = (zoom - 1) * 350;
      const maxPanY = (zoom - 1) * 250;
      const newX = Math.max(-maxPanX, Math.min(maxPanX, panInitialOffsetRef.current.x + dx));
      const newY = Math.max(-maxPanY, Math.min(maxPanY, panInitialOffsetRef.current.y + dy));
      setPanOffset({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (zoom > 1 && isPanning) {
      setIsPanning(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (zoom > 1) {
      resetZoom();
    } else {
      setZoom(2);
    }
  };

  // Mobile Touch Gestures: Pinch to Zoom, Pan, Swipe left/right
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
      touchMidpointStartRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      panInitialOffsetRef.current = { ...panOffset };
      hasMovedPanRef.current = true;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      panStartRef.current = { x: t.clientX, y: t.clientY };
      touchStartPosRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
      panInitialOffsetRef.current = { ...panOffset };
      hasMovedPanRef.current = false;
      if (zoom > 1) {
        setIsPanning(true);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current > 0) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const scale = currentDist / touchStartDistRef.current;
      const nextZoom = Math.max(1, Math.min(4, Math.round(touchStartZoomRef.current * scale * 100) / 100));
      setZoom(nextZoom);

      if (nextZoom === 1) {
        setPanOffset({ x: 0, y: 0 });
      } else {
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const dx = midX - touchMidpointStartRef.current.x;
        const dy = midY - touchMidpointStartRef.current.y;
        const maxPanX = (nextZoom - 1) * 350;
        const maxPanY = (nextZoom - 1) * 250;
        const newX = Math.max(-maxPanX, Math.min(maxPanX, panInitialOffsetRef.current.x + dx));
        const newY = Math.max(-maxPanY, Math.min(maxPanY, panInitialOffsetRef.current.y + dy));
        setPanOffset({ x: newX, y: newY });
      }
      hasMovedPanRef.current = true;
    } else if (e.touches.length === 1 && zoom > 1 && isPanning) {
      const t = e.touches[0];
      const dx = t.clientX - panStartRef.current.x;
      const dy = t.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasMovedPanRef.current = true;
      }
      const maxPanX = (zoom - 1) * 350;
      const maxPanY = (zoom - 1) * 250;
      const newX = Math.max(-maxPanX, Math.min(maxPanX, panInitialOffsetRef.current.x + dx));
      const newY = Math.max(-maxPanY, Math.min(maxPanY, panInitialOffsetRef.current.y + dy));
      setPanOffset({ x: newX, y: newY });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (e.touches.length === 0) {
      touchStartDistRef.current = 0;
      const now = Date.now();
      const tStart = touchStartPosRef.current;
      const swipeDuration = now - tStart.time;

      // Double tap check for quick 2x zoom toggle on mobile
      if (!hasMovedPanRef.current && now - lastTapTimeRef.current < 300) {
        if (zoom > 1) {
          resetZoom();
        } else {
          setZoom(2);
        }
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;

        // Swipe left/right detection when not zoomed
        if (zoom === 1 && swipeDuration < 400 && e.changedTouches.length === 1) {
          const tEnd = e.changedTouches[0];
          const swipeDx = tEnd.clientX - tStart.x;
          const swipeDy = tEnd.clientY - tStart.y;
          if (Math.abs(swipeDx) > 50 && Math.abs(swipeDy) < 60) {
            if (swipeDx < 0 && hasNextEvent && onNextEvent) {
              onNextEvent();
            } else if (swipeDx > 0 && hasPrevEvent && onPrevEvent) {
              onPrevEvent();
            }
          }
        }
      }
    }
  };

  if (!segment || !camera) return null;

  const imageUrl = api.getPictureUrl(camera.id, segment.datadir, segment.file, segment.videoStart, segment.videoEnd);
  const eventInfo = getEventTypeInfo(segment.record_type);
  const downloadFilename = `hikvision_snapshot_${camera.name.replace(/\s+/g, '_')}_${segment.start.replace(/[: ]/g, '_')}.jpg`;

  return (
    <div 
      ref={containerRef}
      className={`glass-panel border border-amber-500/30 bg-slate-950 overflow-hidden shadow-2xl flex flex-col select-none transition-all duration-200 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-0' : 'rounded-2xl'
      }`}
    >
      {/* 1. TOP HEADER (Above the photo) */}
      <div className="px-3 sm:px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/20 shrink-0" />
          <span className="font-semibold text-xs sm:text-sm text-white drop-shadow truncate">
            {camera.name}
          </span>
          <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 flex items-center gap-1">
            <CameraIcon className="w-3 h-3" />
            <span>SNAPSHOT</span>
          </span>
          {eventInfo && (
            <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded border shrink-0 ${eventInfo.badgeClass}`}>
              {eventInfo.label}
            </span>
          )}
          <span className="text-[10px] sm:text-xs text-amber-300 font-mono bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60 hidden sm:inline-block shrink-0">
            {segment.start}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Bookmark button */}
          {onOpenSaveBookmark && (
            <button
              onClick={onOpenSaveBookmark}
              title={isBookmarked ? 'Bookmarked (Click to edit notes)' : 'Bookmark Snapshot (B)'}
              className={`p-1.5 rounded-lg border transition-colors ${
                isBookmarked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80'
              }`}
            >
              {isBookmarked ? (
                <BookmarkCheck className="w-3.5 h-3.5 text-amber-400 fill-current" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Zoom controls */}
          <div className="hidden md:flex items-center bg-slate-950 border border-slate-700/80 rounded-lg p-0.5 text-xs text-slate-300">
            <button
              onClick={() => changeZoom(-0.5)}
              className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-slate-300 w-11 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => changeZoom(0.5)}
              className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetZoom}
              className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors border-l border-slate-800 ml-0.5 text-slate-400"
              title="Reset zoom (0 / Z)"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Download Snapshot */}
          <a
            href={imageUrl}
            download={downloadFilename}
            title="Download Full JPEG Snapshot"
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </a>

          {/* Fullscreen Toggle */}
          <button
            onClick={handleFullscreenToggle}
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close Photo View */}
          <button
            onClick={onClose}
            title="Close Snapshot (Esc)"
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/40 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. MIDDLE PHOTO VIEWPORT */}
      <div
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        className={`relative w-full bg-black flex items-center justify-center overflow-hidden select-none touch-none ${
          zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        } ${
          isFullscreen ? 'flex-1 min-h-0' : 'aspect-video max-h-[55vh] sm:max-h-[65vh]'
        }`}
      >
        {/* Floating Zoom Indicator Badge when zoomed */}
        {zoom > 1 && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/95 border border-slate-700/90 text-xs text-white shadow-xl backdrop-blur-md pointer-events-auto"
          >
            <span className="font-bold text-amber-400 font-mono">{zoom.toFixed(1)}x</span>
            <span className="text-slate-400 text-[10px] hidden sm:inline">• Drag to Pan</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetZoom();
              }}
              className="ml-1 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 hover:text-white px-2 py-0.5 rounded text-slate-200 transition-colors cursor-pointer active:scale-95 shadow-sm"
              title="Reset Zoom to 1.0x (Z / 0)"
            >
              Reset
            </button>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm z-20 pointer-events-none">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs text-slate-300 font-medium">Loading snapshot...</p>
          </div>
        )}

        {hasError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 text-center">
            <CameraIcon className="w-10 h-10 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">Failed to load picture snapshot</p>
            <p className="text-xs text-slate-500 font-mono">Offset: {segment.videoStart}..{segment.videoEnd}</p>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={`${camera.name} snapshot at ${segment.start}`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isPanning ? 'none' : 'transform 0.12s ease-out',
            }}
            className="max-h-full max-w-full object-contain pointer-events-none rounded shadow-2xl"
          />
        )}

        {/* Previous / Next Floating Buttons on Hover/Tap */}
        {hasPrevEvent && onPrevEvent && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrevEvent();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-xl transition-all hover:scale-110 active:scale-95 z-20"
            title="Previous Snapshot (Left Arrow)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {hasNextEvent && onNextEvent && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNextEvent();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-xl transition-all hover:scale-110 active:scale-95 z-20"
            title="Next Snapshot (Right Arrow)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 3. BOTTOM CONTROL BAR */}
      <div className="px-3 sm:px-4 py-2.5 bg-slate-900/90 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap shrink-0 text-xs text-slate-400">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={onPrevEvent}
            disabled={!hasPrevEvent}
            title="Previous Snapshot ([ / Left Arrow)"
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 disabled:opacity-30 border border-slate-800 transition-colors flex items-center gap-1 text-xs"
          >
            <SkipBack className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <button
            onClick={onNextEvent}
            disabled={!hasNextEvent}
            title="Next Snapshot (] / Right Arrow)"
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 disabled:opacity-30 border border-slate-800 transition-colors flex items-center gap-1 text-xs"
          >
            <span className="hidden sm:inline">Next</span>
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono text-slate-300 ml-1">
            {segment.start}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="hidden md:inline font-mono">
            datadir{segment.datadir}/hiv{String(segment.file).padStart(5, '0')}.pic ({((segment.videoEnd - segment.videoStart) / 1024).toFixed(1)} KB)
          </span>
          <span className="hidden lg:inline text-slate-500">
            Swipe or use arrow keys to browse
          </span>
        </div>
      </div>
    </div>
  );
};
