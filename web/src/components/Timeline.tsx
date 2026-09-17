import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { Camera, RecordingSegment } from '../types';
import { parseSegmentTime, format24hTime } from '../utils/date';
import { getEventTypeInfo } from '../utils/eventType';
import { 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Calendar, 
  Layers, 
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { api } from '../api';

interface TimelineProps {
  cameras: Camera[];
  selectedCamera: Camera | null;
  events: RecordingSegment[];
  activeSegment: RecordingSegment | null;
  onSelectSegment: (segment: RecordingSegment) => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  startTime: Date;
  endTime: Date;
  onChangeTimeWindow: (start: Date, end: Date) => void;
  isLoading: boolean;
  mediaType: 'all' | 'video' | 'picture';
  onChangeMediaType: (type: 'all' | 'video' | 'picture') => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  cameras,
  selectedCamera,
  events,
  activeSegment,
  onSelectSegment,
  selectedDate,
  onSelectDate,
  startTime,
  endTime,
  onChangeTimeWindow,
  isLoading,
  mediaType,
  onChangeMediaType,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const isPointerDownRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const hasDraggedRef = useRef<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartWindowRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const isMinimapDraggingRef = useRef<boolean>(false);

  // Calendar Heatmap state
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => new Date(selectedDate));
  const [recordingDatesMap, setRecordingDatesMap] = useState<Record<string, number>>({});

  // Fetch recording dates summary for heatmaps
  const loadRecordingDates = useCallback(async () => {
    try {
      const cameraIDs = selectedCamera ? [selectedCamera.id] : undefined;
      const data = await api.getRecordingDates(cameraIDs, mediaType);
      const map: Record<string, number> = {};
      (data || []).forEach((item) => {
        map[item.date] = item.count;
      });
      setRecordingDatesMap(map);
    } catch (err) {
      console.error('Failed to load recording dates', err);
    }
  }, [selectedCamera, mediaType]);

  useEffect(() => {
    loadRecordingDates();
  }, [loadRecordingDates]);

  // Keep calendar view in sync when selectedDate changes if popup is closed
  useEffect(() => {
    if (!isCalendarOpen) {
      setCalendarViewDate(new Date(selectedDate));
    }
  }, [selectedDate, isCalendarOpen]);

  // Handle outside clicks to close calendar popover
  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (calendarPopoverRef.current && !calendarPopoverRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isCalendarOpen]);

  const startMs = startTime.getTime();
  const endMs = endTime.getTime();
  const durationMs = Math.max(1000, endMs - startMs);

  // Define full-day bounds for the mini-map (00:00:00 to 23:59:59.999 local day)
  const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0).getTime();
  const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999).getTime();
  const dayDurationMs = dayEnd - dayStart;

  // Zoom logic
  const zoom = useCallback((factor: number) => {
    const center = (startMs + endMs) / 2;
    const newDuration = durationMs * factor;
    const minDuration = 60 * 1000; // 1 minute
    const maxDuration = 48 * 3600 * 1000; // 48 hours
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, newDuration));
    const newStart = new Date(center - clampedDuration / 2);
    const newEnd = new Date(center + clampedDuration / 2);
    onChangeTimeWindow(newStart, newEnd);
  }, [startMs, endMs, durationMs, onChangeTimeWindow]);

  // Preset time spans
  const setPresetHours = (hours: number) => {
    const center = (startMs + endMs) / 2;
    const half = (hours * 3600 * 1000) / 2;
    onChangeTimeWindow(new Date(center - half), new Date(center + half));
  };

  const setFullDay = () => {
    onChangeTimeWindow(new Date(dayStart), new Date(dayEnd));
  };

  const shiftTime = (factor: number) => {
    const shift = durationMs * factor;
    onChangeTimeWindow(new Date(startMs + shift), new Date(endMs + shift));
  };

  // Attach non-passive wheel event listener to completely prevent page vertical scrolling while zooming timeline
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        zoom(0.75); // Zoom in
      } else {
        zoom(1.33); // Zoom out
      }
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelNative);
    };
  }, [zoom]);

  // Pointer drag panning
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isPointerDownRef.current = true;
    isDraggingRef.current = false;
    hasDraggedRef.current = false;
    dragStartXRef.current = e.clientX;
    dragStartWindowRef.current = { start: startMs, end: endMs };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || !containerRef.current) return;
    const deltaX = e.clientX - dragStartXRef.current;

    // Movement threshold (4px) to distinguish click from panning
    if (!isDraggingRef.current && Math.abs(deltaX) > 4) {
      isDraggingRef.current = true;
      hasDraggedRef.current = true;
      setIsDragging(true);
      try {
        containerRef.current.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
    }

    if (isDraggingRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const deltaMs = -(deltaX / rect.width) * (dragStartWindowRef.current.end - dragStartWindowRef.current.start);
      onChangeTimeWindow(
        new Date(dragStartWindowRef.current.start + deltaMs),
        new Date(dragStartWindowRef.current.end + deltaMs)
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
      try {
        containerRef.current.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }

    // Keep hasDraggedRef true briefly so click handlers firing right after pointerup are suppressed
    if (hasDraggedRef.current) {
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 100);
    }
  };

  const handleContainerClickCapture = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // Mini-map interaction
  const handleMinimapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!minimapRef.current || e.button !== 0) return;
    isMinimapDraggingRef.current = true;
    try {
      minimapRef.current.setPointerCapture(e.pointerId);
    } catch {}
    const rect = minimapRef.current.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetCenter = dayStart + clickRatio * dayDurationMs;
    const half = durationMs / 2;
    onChangeTimeWindow(new Date(targetCenter - half), new Date(targetCenter + half));
  };

  const handleMinimapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMinimapDraggingRef.current || !minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetCenter = dayStart + clickRatio * dayDurationMs;
    const half = durationMs / 2;
    onChangeTimeWindow(new Date(targetCenter - half), new Date(targetCenter + half));
  };

  const handleMinimapPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMinimapDraggingRef.current) return;
    isMinimapDraggingRef.current = false;
    if (minimapRef.current && minimapRef.current.hasPointerCapture(e.pointerId)) {
      try {
        minimapRef.current.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Generate dynamic time axis tick marks (in consistent 24h format)
  const generateTicks = () => {
    const ticks: { label: string; isMajor: boolean; leftPct: number }[] = [];
    const stepMs = durationMs <= 5 * 60 * 1000
      ? 30 * 1000 // 30 sec
      : durationMs <= 15 * 60 * 1000
      ? 1 * 60 * 1000 // 1 min
      : durationMs <= 60 * 60 * 1000
      ? 5 * 60 * 1000 // 5 min
      : durationMs <= 6 * 3600 * 1000
      ? 30 * 60 * 1000 // 30 min
      : durationMs <= 24 * 3600 * 1000
      ? 2 * 3600 * 1000 // 2 hours
      : 6 * 3600 * 1000; // 6 hours

    const firstTick = Math.ceil(startMs / stepMs) * stepMs;
    for (let t = firstTick; t <= endMs; t += stepMs) {
      const d = new Date(t);
      const leftPct = ((t - startMs) / durationMs) * 100;
      let label = format24hTime(d, stepMs < 60000);
      const isMidnight = d.getHours() === 0 && d.getMinutes() === 0;
      if (isMidnight || stepMs >= 12 * 3600 * 1000) {
        label = d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + label;
      }
      ticks.push({
        label,
        isMajor: isMidnight || d.getMinutes() === 0,
        leftPct,
      });
    }
    return ticks;
  };

  const ticks = generateTicks();

  // Active cameras to display
  const activeCameras = selectedCamera
    ? cameras.filter((c) => c.id === selectedCamera.id)
    : cameras;

  // Filter events belonging to selectedDate for the 24h minimap
  const dayEvents = events.filter((seg) => {
    const segStart = parseSegmentTime(seg.start).getTime();
    const segEnd = parseSegmentTime(seg.end).getTime();
    return segEnd >= dayStart && segStart <= dayEnd;
  });

  // Mini-map Viewport brush bounds
  const brushLeftPct = Math.max(0, Math.min(100, ((startMs - dayStart) / dayDurationMs) * 100));
  const brushRightPct = Math.max(0, Math.min(100, ((endMs - dayStart) / dayDurationMs) * 100));
  const brushWidthPct = Math.max(1, brushRightPct - brushLeftPct);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const now = new Date();
  const todayFormatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const formattedDateValue = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;

  // Generate calendar days for month view
  const calendarDays = (() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    // Monday is 0, Sunday is 6
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Previous month trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({ date: d, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({ date: d, dateStr, isCurrentMonth: true });
    }

    // Next month leading days
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({ date: d, dateStr, isCurrentMonth: false });
    }

    return days;
  })();

  return (
    <div className="glass-panel rounded-2xl border border-slate-800 p-3 sm:p-5 space-y-4 select-none">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Date Picker & Quick Range Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Interactive Date Calendar Picker with Recording Heatmap */}
          <div className="relative" ref={calendarPopoverRef}>
            <button
              type="button"
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500/50 rounded-xl px-3 py-1.5 text-xs text-white transition-all shadow-sm group"
              title="Select date & view recording heatmap"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-300 transition-colors shrink-0" />
              <span className="font-semibold text-slate-200">
                {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {recordingDatesMap[formattedDateValue] ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title={`${recordingDatesMap[formattedDateValue]} recordings on this day`} />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-600" />
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCalendarOpen ? 'rotate-180 text-blue-400' : ''}`} />
            </button>

            {isCalendarOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 w-72 bg-slate-950/95 backdrop-blur-md rounded-2xl border border-slate-700/90 shadow-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                {/* Header: Month / Year with prev/next and today button */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                      }}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                      title="Previous Month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-slate-100 min-w-[110px] text-center">
                      {calendarViewDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                      }}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                      title="Next Month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      setCalendarViewDate(new Date(today));
                      onSelectDate(today);
                      setIsCalendarOpen(false);
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-colors"
                  >
                    Today
                  </button>
                </div>

                {/* Days of week header */}
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
                  {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                    <div key={d} className="py-0.5">{d}</div>
                  ))}
                </div>

                {/* Calendar days grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((cell, idx) => {
                    const dateStr = cell.dateStr;
                    const count = recordingDatesMap[dateStr] || 0;
                    const hasRecordings = count > 0;
                    const isSelected = dateStr === formattedDateValue;
                    const isToday = dateStr === todayFormatted;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          onSelectDate(cell.date);
                          setIsCalendarOpen(false);
                        }}
                        className={`relative flex flex-col items-center justify-center h-8 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                            : isToday
                            ? 'border border-blue-500/50 text-blue-300 hover:bg-slate-800'
                            : cell.isCurrentMonth
                            ? 'text-slate-200 hover:bg-slate-800'
                            : 'text-slate-600 hover:bg-slate-900'
                        }`}
                        title={hasRecordings ? `${count} recordings on ${dateStr}` : `No recordings on ${dateStr}`}
                      >
                        <span>{cell.date.getDate()}</span>
                        {/* Heatmap dot indicator */}
                        {hasRecordings && (
                          <span
                            className={`absolute bottom-0.5 w-1.5 h-1.5 rounded-full ${
                              isSelected
                                ? 'bg-white'
                                : count >= 50
                                ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]'
                                : 'bg-blue-400'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Heatmap Legend */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>Has Recordings</span>
                  </div>
                  <span className="text-slate-500 font-mono">
                    {Object.keys(recordingDatesMap).length} Recorded Days
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick span buttons */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs font-medium">
            <button
              onClick={() => setPresetHours(1)}
              className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              1h
            </button>
            <button
              onClick={() => setPresetHours(3)}
              className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              3h
            </button>
            <button
              onClick={() => setPresetHours(6)}
              className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              6h
            </button>
            <button
              onClick={setFullDay}
              className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Full Day
            </button>
          </div>

          {/* Media Type Filter: All / Videos / Photos */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs font-medium">
            <button
              onClick={() => onChangeMediaType('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                mediaType === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => onChangeMediaType('video')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                mediaType === 'video'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              🎬 Videos
            </button>
            <button
              onClick={() => onChangeMediaType('picture')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                mediaType === 'picture'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              📷 Photos
            </button>
          </div>
        </div>

        {/* Center: Current View Window (24h format) & Event Type Legend */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>{format24hTime(startTime)}</span>
            <span className="text-slate-500">&rarr;</span>
            <span>{format24hTime(endTime)}</span>
          </div>

          <div className="hidden lg:flex items-center gap-2.5 text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>Motion</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Alarm</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Continuous</span>
            </div>
          </div>
        </div>

        {/* Right: Zoom & Shift Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => shiftTime(-0.35)}
            title="Pan Left (35%)"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => shiftTime(0.35)}
            title="Pan Right (35%)"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => zoom(0.6)}
            title="Zoom In"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => zoom(1.6)}
            title="Zoom Out"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* OVERALL TIMELINE / MINI-MAP (24h Overview) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-medium">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-sky-400" />
            24h Overview ({selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })})
          </span>
          <span className="text-slate-500 font-mono text-[10px]">
            {dayEvents.length} Total Recordings Today
          </span>
        </div>

        {/* 24-Hour Minimap Bar with Viewport Brush */}
        <div
          ref={minimapRef}
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
          onPointerUp={handleMinimapPointerUp}
          className="relative h-7 w-full bg-slate-950/90 rounded-xl border border-slate-800 cursor-pointer overflow-hidden"
          style={{ touchAction: 'none' }}
        >
          {/* Render all day events on mini-map */}
          {dayEvents.map((seg) => {
            const segStart = parseSegmentTime(seg.start).getTime();
            const segEnd = parseSegmentTime(seg.end).getTime();
            const leftPct = Math.max(0, ((segStart - dayStart) / dayDurationMs) * 100);
            const rightPct = Math.min(100, ((segEnd - dayStart) / dayDurationMs) * 100);
            const widthPct = Math.max(0.3, rightPct - leftPct);
            const typeInfo = getEventTypeInfo(seg.record_type);

            return (
              <div
                key={`mini-${seg.id || seg.videoStart}`}
                className={`absolute top-1 bottom-1 rounded-sm pointer-events-none ${typeInfo.minimapClass}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  minWidth: '2px',
                }}
              />
            );
          })}

          {/* Draggable Viewport Brush Indicator */}
          <div
            className="absolute top-0 bottom-0 border-2 border-amber-400 bg-amber-400/20 rounded-lg pointer-events-none shadow-sm transition-all"
            style={{
              left: `${brushLeftPct}%`,
              width: `${brushWidthPct}%`,
            }}
          />

          {/* Hour tick labels across 24 hours */}
          <div className="absolute inset-0 flex justify-between px-2 items-center pointer-events-none text-[9px] font-mono text-slate-400">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>
      </div>

      {/* DETAILED MAIN TIMELINE TRACK AREA */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleContainerClickCapture}
        className={`relative w-full bg-slate-950/90 rounded-xl border border-slate-800 p-3 overflow-hidden cursor-grab ${
          isDragging ? 'cursor-grabbing' : ''
        }`}
        style={{ touchAction: 'none' }}
      >
        {/* Loading overlay bar */}
        {isLoading && (
          <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-500 animate-pulse z-30" />
        )}

        {/* Time Scale Axis & Ticks */}
        <div className="relative h-6 w-full border-b border-slate-800 mb-2">
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute top-0 flex flex-col items-center -translate-x-1/2 pointer-events-none"
              style={{ left: `${tick.leftPct}%` }}
            >
              <div className={`w-px ${tick.isMajor ? 'bg-slate-400 h-2.5' : 'bg-slate-700 h-1.5'}`} />
              <span className="text-[10px] text-slate-400 font-mono mt-0.5 whitespace-nowrap">
                {tick.label}
              </span>
            </div>
          ))}
        </div>

        {/* Camera Tracks */}
        <div className="space-y-2 mt-2">
          {activeCameras.map((cam) => {
            const camEvents = events.filter((e) => e.camera_id === cam.id);

            return (
              <div key={cam.id} className="relative h-10 rounded-xl bg-slate-900/70 border border-slate-800/70 flex items-center">
                {/* Camera Name Label */}
                <div className="absolute left-2.5 z-20 pointer-events-none flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 ring-2 ring-blue-400/20" />
                  <span className="text-xs font-semibold text-slate-200 drop-shadow">
                    {cam.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({camEvents.length})
                  </span>
                </div>

                {/* Event Segments */}
                <div className="relative w-full h-full">
                  {camEvents.map((seg) => {
                    const segStart = parseSegmentTime(seg.start).getTime();
                    const segEnd = parseSegmentTime(seg.end).getTime();

                    const leftPct = Math.max(0, ((segStart - startMs) / durationMs) * 100);
                    const rightPct = Math.min(100, ((segEnd - startMs) / durationMs) * 100);
                    const widthPct = Math.max(0.4, rightPct - leftPct);

                    // Skip if completely outside current zoomed viewport
                    if (rightPct < 0 || leftPct > 100) return null;

                    const isActive = activeSegment?.id === seg.id || (
                      activeSegment?.camera_id === seg.camera_id &&
                      activeSegment?.datadir === seg.datadir &&
                      activeSegment?.file === seg.file &&
                      activeSegment?.videoStart === seg.videoStart
                    );

                    const isPhoto = seg.media_type === 'picture';
                    const typeInfo = getEventTypeInfo(seg.record_type);

                    return (
                      <button
                        key={`${seg.camera_id}-${seg.datadir}-${seg.file}-${seg.videoStart}-${seg.media_type || 'v'}`}
                        onClick={(e) => {
                          if (hasDraggedRef.current) {
                            e.stopPropagation();
                            e.preventDefault();
                            return;
                          }
                          e.stopPropagation();
                          onSelectSegment(seg);
                        }}
                        title={`${isPhoto ? '📷 Photo' : '🎬 Video'} - ${cam.name} (${typeInfo.label}): ${seg.start}`}
                        className={`absolute top-1.5 bottom-1.5 rounded-md transition-all z-10 ${
                          isDragging ? 'pointer-events-none' : ''
                        } ${
                          isActive
                            ? isPhoto
                              ? 'bg-amber-400 ring-2 ring-white shadow-lg z-20 scale-y-125'
                              : typeInfo.activeColorClass
                            : isPhoto
                            ? 'bg-amber-500/90 border border-amber-300 ring-1 ring-amber-400/40 hover:scale-y-125'
                            : `${typeInfo.colorClass} hover:scale-y-110`
                        }`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          minWidth: isPhoto ? '6px' : '5px',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {events.length === 0 && !isLoading && (
          <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-slate-500" />
            <span>No recordings found on this date. Use the date picker above or zoom out to inspect other dates.</span>
          </div>
        )}
      </div>
    </div>
  );
};
