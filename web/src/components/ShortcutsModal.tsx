import React from 'react';
import { X, Keyboard, Play, Film, MousePointer, ZoomIn } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto select-none">
      <div className="relative w-full max-w-xl glass-panel bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Keyboard Shortcuts & Controls</h2>
              <p className="text-xs text-slate-400">Quick reference for video playback & timeline navigation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs sm:text-sm">
          {/* Section: Video Playback */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" />
              Playback & Stepping
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Play / Pause</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">Space</kbd>
                  <span className="text-slate-500 text-xs">or</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">K</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Step -1 / +1 Frame</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[11px] font-mono text-amber-300 shadow-sm">,</kbd>
                  <span className="text-slate-500 text-xs">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[11px] font-mono text-amber-300 shadow-sm">.</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Seek &plusmn; 5 seconds</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">&larr;</kbd>
                  <span className="text-slate-500 text-xs">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">&rarr;</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Seek &plusmn; 10 seconds</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">J</kbd>
                  <span className="text-slate-500 text-xs">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">L</kbd>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Event & View Navigation */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5" />
              Navigation & View
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Prev / Next Recording</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">[</kbd>
                  <span className="text-slate-500 text-xs">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">]</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Toggle Fullscreen</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">F</kbd>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Mute / Unmute Audio</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">M</kbd>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Shortcuts Help</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">?</kbd>
              </div>
            </div>
          </div>

          {/* Section: Digital Zoom & Bookmarks */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <ZoomIn className="w-3.5 h-3.5" />
              Zoom, Pan & Bookmarks
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Cycle Zoom (1x &rarr; 2x &rarr; 3x)</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">Z</kbd>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Zoom In / Out</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">+</kbd>
                  <span className="text-slate-500 text-xs">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-sm">-</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Pan Zoomed Viewport</span>
                <span className="text-[11px] text-slate-400 font-mono">Click &amp; Drag Video</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-slate-300">Bookmark Current Clip</span>
                <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[11px] font-mono text-amber-300 shadow-sm">B</kbd>
              </div>
            </div>
          </div>

          {/* Section: Timeline Mouse Gestures */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <MousePointer className="w-3.5 h-3.5" />
              Timeline Gestures
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <div className="font-medium text-slate-200 text-xs">Mouse Drag &amp; Pan</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Click and drag anywhere on the timeline to pan smoothly.</p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <div className="font-medium text-slate-200 text-xs">Scroll Wheel Zoom</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Scroll up/down over the timeline or video to zoom in/out.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-md"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
