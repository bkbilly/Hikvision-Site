import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { Camera, RecordingSegment } from '../types';
import { api } from '../api';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  SkipBack, 
  SkipForward, 
  StepBack,
  StepForward,
  Maximize2, 
  Minimize2,
  Download, 
  Gauge, 
  Sliders, 
  Camera as CameraIcon, 
  Loader2, 
  Volume2, 
  VolumeX,
  Bookmark,
  BookmarkCheck,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { getEventTypeInfo } from '../utils/eventType';

import { LiveStreamView } from './LiveGrid';

interface VideoPlayerProps {
  selectedCamera: Camera | null;
  activeSegment: RecordingSegment | null;
  onNextEvent?: () => void;
  onPrevEvent?: () => void;
  hasNextEvent?: boolean;
  hasPrevEvent?: boolean;
  onOpenShortcuts?: () => void;
  onOpenSaveBookmark?: () => void;
  isBookmarked?: boolean;
}

const LivePlayerPreview: React.FC<{ camera: Camera }> = ({ camera }) => {
  return (
    <div className="w-full h-full relative flex items-center justify-center bg-slate-950">
      <LiveStreamView
        cameraId={camera.id}
        cameraName={camera.name}
        isPaused={false}
        className="w-full h-full object-contain select-none"
      />
      <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-bold text-rose-400 uppercase tracking-wider backdrop-blur-md shadow-lg pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        <span>LIVE FEED</span>
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700/80 px-4 py-2 rounded-xl backdrop-blur-md shadow-xl text-slate-200 text-xs sm:text-sm flex items-center gap-2 pointer-events-none whitespace-nowrap">
        <CameraIcon className="w-4 h-4 text-blue-400" />
        <span>Select a recording on the timeline below to watch playback</span>
      </div>
    </div>
  );
};

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  selectedCamera,
  activeSegment,
  onNextEvent,
  onPrevEvent,
  hasNextEvent,
  hasPrevEvent,
  onOpenShortcuts,
  onOpenSaveBookmark,
  isBookmarked,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [resolution, setResolution] = useState<string>('original');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Digital Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panInitialOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedPanRef = useRef<boolean>(false);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, []);

  const changeZoom = useCallback((delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.max(1, Math.min(4, Math.round((prev + delta) * 100) / 100));
      if (next === 1) {
        setPanOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const cycleZoom = useCallback(() => {
    setZoomLevel((prev) => {
      if (prev <= 1) return 2;
      if (prev <= 2) return 3;
      setPanOffset({ x: 0, y: 0 });
      return 1;
    });
  }, []);

  // Reset zoom on activeSegment change
  useEffect(() => {
    resetZoom();
  }, [activeSegment, resetZoom]);

  // Scrubbing & Timing state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedEnd, setBufferedEnd] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

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

  // Handle active clip changes
  useEffect(() => {
    if (!activeSegment || !selectedCamera) return;
    setIsLoading(true);
    setErrorMessage('');
    setCurrentTime(0);
    setDuration(0);

    const video = videoRef.current;
    if (video) {
      const url = api.getVideoUrl(
        activeSegment.camera_id,
        activeSegment.datadir,
        activeSegment.file,
        activeSegment.videoStart,
        activeSegment.videoEnd,
        resolution
      );
      video.src = url;
      video.load();
      video.playbackRate = playbackSpeed;
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [activeSegment, resolution]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekRelative = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  }, []);

  const stepFrame = useCallback((direction: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
    }
    const frameDuration = 1 / 25; // 0.04s per frame at 25fps standard
    const targetTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + direction * frameDuration));
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  }, []);

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!document.fullscreenElement) {
      if (container && container.requestFullscreen) {
        container.requestFullscreen().catch(() => {
          video?.requestFullscreen?.();
        });
      } else if (video && video.requestFullscreen) {
        video.requestFullscreen();
      }
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  // Time update and buffer progress
  const handleTimeUpdate = () => {
    if (!videoRef.current || isScrubbing) return;
    setCurrentTime(videoRef.current.currentTime);

    // Buffer tracking
    if (videoRef.current.buffered.length > 0) {
      setBufferedEnd(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      setIsLoading(false);
    }
  };

  // Scrub bar interaction
  const calculateSeekTime = (clientX: number): number => {
    if (!progressBarRef.current || duration <= 0) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pos * duration;
  };

  const handleScrubStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoRef.current || duration <= 0) return;
    setIsScrubbing(true);
    const seekTo = calculateSeekTime(e.clientX);
    setCurrentTime(seekTo);
    videoRef.current.currentTime = seekTo;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);

    if (isScrubbing && videoRef.current) {
      const seekTo = pos * duration;
      setCurrentTime(seekTo);
      videoRef.current.currentTime = seekTo;
    }
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
  };

  // Mobile touch pinch-to-zoom & touch-pan refs
  const touchStartDistRef = useRef<number>(0);
  const touchStartZoomRef = useRef<number>(1);
  const touchMidpointStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapTimeRef = useRef<number>(0);

  // Desktop Mouse pointer drag-to-pan & click-to-play
  const handleVideoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (e.button !== 0) return;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panInitialOffsetRef.current = { ...panOffset };
    hasMovedPanRef.current = false;
    if (zoomLevel > 1) {
      setIsPanning(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleVideoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedPanRef.current = true;
    }
    if (zoomLevel > 1 && isPanning) {
      const maxPanX = (zoomLevel - 1) * 260;
      const maxPanY = (zoomLevel - 1) * 180;
      const newX = Math.max(-maxPanX, Math.min(maxPanX, panInitialOffsetRef.current.x + dx / zoomLevel));
      const newY = Math.max(-maxPanY, Math.min(maxPanY, panInitialOffsetRef.current.y + dy / zoomLevel));
      setPanOffset({ x: newX, y: newY });
    }
  };

  const handleVideoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (zoomLevel > 1 && isPanning) {
      setIsPanning(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
    if (!hasMovedPanRef.current) {
      togglePlay();
    }
  };

  const handleVideoDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (zoomLevel > 1) {
      resetZoom();
    } else {
      setZoomLevel(2);
    }
  };

  // Mobile Touch Gestures: Pinch to Zoom & Touch Pan
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // Two fingers: Pinch-to-zoom
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoomLevel;
      touchMidpointStartRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      panInitialOffsetRef.current = { ...panOffset };
      hasMovedPanRef.current = true;
    } else if (e.touches.length === 1) {
      // One finger: Pan (if zoomed) or Tap (if not zoomed)
      const t = e.touches[0];
      panStartRef.current = { x: t.clientX, y: t.clientY };
      panInitialOffsetRef.current = { ...panOffset };
      hasMovedPanRef.current = false;
      if (zoomLevel > 1) {
        setIsPanning(true);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current > 0) {
      // Two fingers pinch zooming & panning
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const scale = currentDist / touchStartDistRef.current;
      const nextZoom = Math.max(1, Math.min(4, Math.round(touchStartZoomRef.current * scale * 100) / 100));
      setZoomLevel(nextZoom);

      if (nextZoom === 1) {
        setPanOffset({ x: 0, y: 0 });
      } else {
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const dx = midX - touchMidpointStartRef.current.x;
        const dy = midY - touchMidpointStartRef.current.y;
        const maxPanX = (nextZoom - 1) * 260;
        const maxPanY = (nextZoom - 1) * 180;
        const newX = Math.max(-maxPanX, Math.min(maxPanX, panInitialOffsetRef.current.x + dx / nextZoom));
        const newY = Math.max(-maxPanY, Math.min(maxPanY, panInitialOffsetRef.current.y + dy / nextZoom));
        setPanOffset({ x: newX, y: newY });
      }
      hasMovedPanRef.current = true;
    } else if (e.touches.length === 1 && zoomLevel > 1 && isPanning) {
      // One finger pan when zoomed in
      const t = e.touches[0];
      const dx = t.clientX - panStartRef.current.x;
      const dy = t.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasMovedPanRef.current = true;
      }
      const maxPanX = (zoomLevel - 1) * 260;
      const maxPanY = (zoomLevel - 1) * 180;
      const newX = Math.max(-maxPanX, Math.min(maxPanX, panInitialOffsetRef.current.x + dx / zoomLevel));
      const newY = Math.max(-maxPanY, Math.min(maxPanY, panInitialOffsetRef.current.y + dy / zoomLevel));
      setPanOffset({ x: newX, y: newY });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (e.touches.length === 0) {
      touchStartDistRef.current = 0;
      // Double tap check for quick 2x zoom toggle on mobile
      const now = Date.now();
      if (!hasMovedPanRef.current && now - lastTapTimeRef.current < 320) {
        if (zoomLevel > 1) {
          resetZoom();
        } else {
          setZoomLevel(2);
        }
        lastTapTimeRef.current = 0;
      } else if (!hasMovedPanRef.current) {
        lastTapTimeRef.current = now;
        togglePlay();
      }
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekRelative(5);
      } else if (e.code === 'KeyJ') {
        e.preventDefault();
        seekRelative(-10);
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        seekRelative(10);
      } else if (e.code === 'Comma' || e.key === '<' || e.key === ',') {
        e.preventDefault();
        stepFrame(-1);
      } else if (e.code === 'Period' || e.key === '>' || e.key === '.') {
        e.preventDefault();
        stepFrame(1);
      } else if (e.code === 'BracketLeft') {
        e.preventDefault();
        if (hasPrevEvent && onPrevEvent) onPrevEvent();
      } else if (e.code === 'BracketRight') {
        e.preventDefault();
        if (hasNextEvent && onNextEvent) onNextEvent();
      } else if (e.code === 'KeyZ') {
        e.preventDefault();
        cycleZoom();
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') {
        e.preventDefault();
        changeZoom(0.5);
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') {
        e.preventDefault();
        changeZoom(-0.5);
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        if (onOpenSaveBookmark) onOpenSaveBookmark();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        handleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        if (onOpenShortcuts) onOpenShortcuts();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekRelative, stepFrame, cycleZoom, changeZoom, onPrevEvent, onNextEvent, hasPrevEvent, hasNextEvent, onOpenShortcuts, onOpenSaveBookmark]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  const downloadUrl = activeSegment && selectedCamera
    ? api.getVideoUrl(
        activeSegment.camera_id,
        activeSegment.datadir,
        activeSegment.file,
        activeSegment.videoStart,
        activeSegment.videoEnd,
        'original'
      )
    : '';

  return (
    <div 
      ref={containerRef}
      className={`glass-panel border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl flex flex-col select-none ${
        isFullscreen ? 'w-full h-full rounded-none border-0' : 'rounded-2xl'
      }`}
    >
      {/* 1. TOP HEADER (Above the video) */}
      <div className="px-3 sm:px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-500/20 shrink-0" />
          <span className="font-semibold text-xs sm:text-sm text-white drop-shadow truncate">
            {selectedCamera ? selectedCamera.name : 'No Camera Selected'}
          </span>
          {activeSegment && (
            <>
              <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded border shrink-0 ${getEventTypeInfo(activeSegment.record_type).badgeClass}`}>
                {getEventTypeInfo(activeSegment.record_type).label}
              </span>
              <span className="text-[10px] sm:text-xs text-blue-300 font-mono bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60 hidden sm:inline-block shrink-0">
                {activeSegment.start} &rarr; {activeSegment.end.split(' ')[1]}
              </span>
            </>
          )}
        </div>

        {activeSegment && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Bookmark button */}
            {onOpenSaveBookmark && (
              <button
                onClick={onOpenSaveBookmark}
                title={isBookmarked ? 'Bookmarked (Click to edit notes)' : 'Bookmark Recording (B)'}
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

            {/* Resolution Selector */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-300">
              <Sliders className="w-3.5 h-3.5 text-slate-400 hidden sm:inline-block" />
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="original" className="bg-slate-900">Original Quality</option>
                <option value="1920x1080" className="bg-slate-900">1080p</option>
                <option value="1280x720" className="bg-slate-900">720p</option>
                <option value="640x360" className="bg-slate-900">360p</option>
              </select>
            </div>

            {/* Download Link */}
            <a
              href={downloadUrl}
              download={`hikvision_clip_${activeSegment.start.replace(/[: ]/g, '_')}.mp4`}
              title="Download MP4 Clip"
              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* 2. MIDDLE VIDEO VIEWPORT (Digital Zoom & Touch Pan Enabled) */}
      <div
        onPointerDown={handleVideoPointerDown}
        onPointerMove={handleVideoPointerMove}
        onPointerUp={handleVideoPointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleVideoDoubleClick}
        className={`relative w-full bg-black flex items-center justify-center overflow-hidden touch-none select-none ${
          zoomLevel > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'
        } ${
          isFullscreen ? 'flex-1 min-h-0' : 'aspect-video max-h-[55vh] sm:max-h-[65vh]'
        }`}
      >
        {/* Floating Zoom Indicator Badge when zoomed */}
        {zoomLevel > 1 && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/95 border border-slate-700/90 text-xs text-white shadow-xl backdrop-blur-md pointer-events-auto"
          >
            <span className="font-bold text-amber-400 font-mono">{zoomLevel.toFixed(1)}x</span>
            <span className="text-slate-400 text-[10px] hidden sm:inline">• Drag to Pan</span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                resetZoom();
              }}
              className="ml-1 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 hover:text-white px-2 py-0.5 rounded text-slate-200 transition-colors cursor-pointer active:scale-95 shadow-sm"
              title="Reset Zoom to 1.0x (Z)"
            >
              Reset
            </button>
          </div>
        )}

        {activeSegment ? (
          <video
            ref={videoRef}
            className="w-full h-full object-contain pointer-events-none"
            playsInline
            style={{
              transform: zoomLevel > 1 ? `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)` : undefined,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onLoadedData={() => setIsLoading(false)}
            onLoadedMetadata={handleLoadedMetadata}
            onDurationChange={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onError={() => {
              setIsLoading(false);
              setErrorMessage('Unable to extract or transcode video segment. Please check camera storage path.');
            }}
            onEnded={() => {
              setIsPlaying(false);
              if (onNextEvent) onNextEvent();
            }}
          />
        ) : selectedCamera ? (
          <LivePlayerPreview camera={selectedCamera} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2 p-6 text-center">
            <CameraIcon className="w-12 h-12 text-slate-700" />
            <p className="text-sm font-medium text-slate-400">Select a camera and recording event to play</p>
          </div>
        )}

        {/* Error overlay */}
        {errorMessage && activeSegment && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30 p-4">
            <div className="max-w-md p-4 rounded-xl bg-rose-950/90 border border-rose-800 text-rose-200 text-xs sm:text-sm text-center space-y-3 shadow-2xl">
              <p className="font-semibold">{errorMessage}</p>
              <button
                onClick={() => {
                  setErrorMessage('');
                  setIsLoading(true);
                  if (videoRef.current) {
                    videoRef.current.load();
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className="px-4 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading overlay spinner */}
        {isLoading && !errorMessage && activeSegment && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center pointer-events-none z-20">
            <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-blue-400 shadow-xl">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-[11px] font-medium text-slate-300">Loading Clip...</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. BOTTOM DEDICATED CONTROLS (Below the video) */}
      {activeSegment && (
        <div className="px-3 sm:px-4 py-2.5 bg-slate-900/90 border-t border-slate-800/80 space-y-2 shrink-0">
          {/* Interactive Scrub / Progress Bar */}
          <div
            ref={progressBarRef}
            onPointerDown={handleScrubStart}
            onPointerMove={handleScrubMove}
            onPointerUp={handleScrubEnd}
            onPointerLeave={() => setHoverTime(null)}
            className="relative w-full h-4 flex items-center cursor-pointer group/progress py-1 touch-none"
          >
            {/* Background Track */}
            <div className="w-full h-1.5 group-hover/progress:h-2 bg-slate-800 rounded-full overflow-hidden transition-all relative">
              {/* Buffered Progress */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-slate-700 transition-all duration-150"
                style={{ width: `${bufferedPct}%` }}
              />
              {/* Played Progress Bar */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-blue-600 via-sky-400 to-indigo-400"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Scrubber Thumb */}
            <div
              className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md border-2 border-blue-600 -translate-x-1/2 scale-100 sm:scale-0 sm:group-hover/progress:scale-100 transition-transform pointer-events-none"
              style={{ left: `${progressPct}%` }}
            />

            {/* Hover Time Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-7 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] sm:text-xs font-mono text-white -translate-x-1/2 shadow-xl pointer-events-none"
                style={{ left: `${hoverPosition}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          {/* Bottom Actions Row */}
          <div className="flex items-center justify-between gap-1 sm:gap-2 flex-wrap sm:flex-nowrap">
            {/* Left: Previous / 10s Rewind / -1 Frame / Play / +1 Frame / 10s Forward / Next & Timers */}
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <button
                onClick={onPrevEvent}
                disabled={!hasPrevEvent}
                title="Previous Recording ([)"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 disabled:opacity-30 border border-slate-800 transition-colors"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => seekRelative(-10)}
                title="Rewind 10s (J)"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => stepFrame(-1)}
                title="Step -1 Frame (, / <)"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
              >
                <StepBack className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={togglePlay}
                title={isPlaying ? 'Pause (Space / K)' : 'Play (Space / K)'}
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-transform active:scale-95"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => stepFrame(1)}
                title="Step +1 Frame (. / >)"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
              >
                <StepForward className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => seekRelative(10)}
                title="Forward 10s (L)"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              <button
                onClick={onNextEvent}
                disabled={!hasNextEvent}
                title="Next Recording (])"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 disabled:opacity-30 border border-slate-800 transition-colors"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Time display: mm:ss / mm:ss */}
              <div className="text-[11px] sm:text-xs text-slate-300 font-mono ml-1 sm:ml-2 whitespace-nowrap">
                <span>{formatTime(currentTime)}</span>
                <span className="text-slate-500 mx-1">/</span>
                <span className="text-slate-400">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right: Audio, Speed, Zoom, Shortcuts & Fullscreen */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Zoom In / Out Controls */}
              <div className="hidden sm:flex items-center gap-0.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs text-slate-300">
                <button
                  type="button"
                  onClick={() => changeZoom(-0.5)}
                  disabled={zoomLevel <= 1}
                  title="Zoom Out (-)"
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cycleZoom}
                  title="Cycle Zoom (Z)"
                  className="px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-200 hover:text-amber-400 transition-colors"
                >
                  {zoomLevel.toFixed(1)}x
                </button>
                <button
                  type="button"
                  onClick={() => changeZoom(0.5)}
                  disabled={zoomLevel >= 4}
                  title="Zoom In (+)"
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={toggleMute}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200">
                <Gauge className="w-3.5 h-3.5 text-blue-400 hidden sm:inline-block" />
                <select
                  value={playbackSpeed}
                  onChange={(e) => changeSpeed(Number(e.target.value))}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value={0.5} className="bg-slate-900">0.5x</option>
                  <option value={1} className="bg-slate-900">1x</option>
                  <option value={2} className="bg-slate-900">2x</option>
                  <option value={4} className="bg-slate-900">4x</option>
                  <option value={8} className="bg-slate-900">8x</option>
                  <option value={16} className="bg-slate-900">16x</option>
                </select>
              </div>


              <button
                onClick={handleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
