import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
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
  mediaType: 'video' | 'picture';
  onChangeMediaType: (type: 'video' | 'picture') => void;
}

interface ParsedSegment {
  segment: RecordingSegment;
  startMs: number;
  endMs: number;
  isPhoto: boolean;
  camId: number;
  recordType: number;
}

interface VisualCluster {
  key: string;
  leftPct: number;
  widthPct: number;
  isPhoto: boolean;
  recordType: number;
  primarySegment: RecordingSegment;
  segments: RecordingSegment[];
  count: number;
  isActive: boolean;
  timeRangeLabel: string;
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
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const isPointerDownRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const hasDraggedRef = useRef<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartWindowRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  // Mobile Touch gesture refs
  const touchStartDistRef = useRef<number>(0);
  const touchStartWindowRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const touchCenterRatioRef = useRef<number>(0.5);

  const isMinimapDraggingRef = useRef<boolean>(false);

  // Calendar Heatmap state
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => new Date(selectedDate));
  const [recordingDatesMap, setRecordingDatesMap] = useState<Record<string, number>>({});

  // Memoize parsed timestamps to prevent reparsing strings during high-frequency drag/zoom renders
  const parsedSegments: ParsedSegment[] = useMemo(() => {
    return (events || []).map((seg) => {
      const startMs = parseSegmentTime(seg.start).getTime();
      const endMs = parseSegmentTime(seg.end).getTime();
      return {
        segment: seg,
        startMs,
        endMs: Math.max(startMs + 1000, endMs),
        isPhoto: seg.media_type === 'picture',
        camId: seg.camera_id,
        recordType: seg.record_type,
      };
    });
  }, [events]);

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
  const zoom = useCallback((factor: number, focalPointRatio: number = 0.5) => {
    const focalTime = startMs + durationMs * focalPointRatio;
    const newDuration = durationMs * factor;
    const minDuration = 30 * 1000; // 30 seconds
    const maxDuration = 48 * 3600 * 1000; // 48 hours
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, newDuration));
    const newStart = new Date(focalTime - clampedDuration * focalPointRatio);
    const newEnd = new Date(focalTime + clampedDuration * (1 - focalPointRatio));
    onChangeTimeWindow(newStart, newEnd);
  }, [startMs, durationMs, onChangeTimeWindow]);

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

  // Attach non-passive wheel event listener to prevent vertical page scrolling while zooming timeline
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = container.getBoundingClientRect();
      const focalRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (e.deltaY < 0) {
        zoom(0.75, focalRatio);
      } else {
        zoom(1.33, focalRatio);
      }
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelNative);
    };
  }, [zoom]);

  // Pointer drag panning (Mouse / Desktop)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return; // Handled by touch events
    if (e.button !== 0) return;
    isPointerDownRef.current = true;
    isDraggingRef.current = false;
    hasDraggedRef.current = false;
    dragStartXRef.current = e.clientX;
    dragStartWindowRef.current = { start: startMs, end: endMs };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (!isPointerDownRef.current || !containerRef.current) return;
    const deltaX = e.clientX - dragStartXRef.current;

    // Movement threshold (4px) to distinguish click from panning
    if (!isDraggingRef.current && Math.abs(deltaX) > 4) {
      isDraggingRef.current = true;
      hasDraggedRef.current = true;
      setIsDragging(true);
      try {
        containerRef.current.setPointerCapture(e.pointerId);
      } catch {}
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
    if (e.pointerType === 'touch') return;
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
      try {
        containerRef.current.releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (hasDraggedRef.current) {
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 100);
    }
  };

  // Mobile Touch Gestures: 1-finger horizontal pan, 2-finger pinch zoom
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      touchStartWindowRef.current = { start: startMs, end: endMs };
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2;
        touchCenterRatioRef.current = Math.max(0, Math.min(1, (midX - rect.left) / rect.width));
      }
      hasDraggedRef.current = true;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      isPointerDownRef.current = true;
      isDraggingRef.current = false;
      hasDraggedRef.current = false;
      dragStartXRef.current = t.clientX;
      dragStartWindowRef.current = { start: startMs, end: endMs };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current > 0) {
      // Pinch to zoom on mobile
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (currentDist > 10) {
        const scale = touchStartDistRef.current / currentDist;
        const initialDuration = touchStartWindowRef.current.end - touchStartWindowRef.current.start;
        const newDuration = Math.max(30000, Math.min(48 * 3600 * 1000, initialDuration * scale));
        const focalTime = touchStartWindowRef.current.start + initialDuration * touchCenterRatioRef.current;
        const newStart = new Date(focalTime - newDuration * touchCenterRatioRef.current);
        const newEnd = new Date(focalTime + newDuration * (1 - touchCenterRatioRef.current));
        onChangeTimeWindow(newStart, newEnd);
        hasDraggedRef.current = true;
      }
    } else if (e.touches.length === 1 && isPointerDownRef.current && containerRef.current) {
      // 1-finger horizontal pan on mobile
      const t = e.touches[0];
      const deltaX = t.clientX - dragStartXRef.current;
      if (!isDraggingRef.current && Math.abs(deltaX) > 4) {
        isDraggingRef.current = true;
        hasDraggedRef.current = true;
        setIsDragging(true);
      }
      if (isDraggingRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const deltaMs = -(deltaX / rect.width) * (dragStartWindowRef.current.end - dragStartWindowRef.current.start);
        onChangeTimeWindow(
          new Date(dragStartWindowRef.current.start + deltaMs),
          new Date(dragStartWindowRef.current.end + deltaMs)
        );
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      touchStartDistRef.current = 0;
      isPointerDownRef.current = false;
      isDraggingRef.current = false;
      setIsDragging(false);
      if (hasDraggedRef.current) {
        setTimeout(() => {
          hasDraggedRef.current = false;
        }, 120);
      }
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
    if (!minimapRef.current || (e.pointerType !== 'touch' && e.button !== 0)) return;
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

  // High-performance Canvas rendering for 24h Minimap (0 DOM elements created!)
  useEffect(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    for (const seg of parsedSegments) {
      if (seg.endMs >= dayStart && seg.startMs <= dayEnd) {
        const left = Math.max(0, ((seg.startMs - dayStart) / dayDurationMs) * rect.width);
        const right = Math.min(rect.width, ((seg.endMs - dayStart) / dayDurationMs) * rect.width);
        const width = Math.max(1.5, right - left);

        if (seg.isPhoto) {
          ctx.fillStyle = '#f59e0b'; // amber-500
        } else if (seg.recordType === 0) {
          ctx.fillStyle = '#34d399'; // emerald-400 (continuous)
        } else if (seg.recordType === 2) {
          ctx.fillStyle = '#f43f5e'; // rose-500 (alarm)
        } else {
          ctx.fillStyle = '#38bdf8'; // sky-400 (motion)
        }

        ctx.fillRect(left, 3, width, rect.height - 6);
      }
    }
  }, [parsedSegments, dayStart, dayEnd, dayDurationMs]);

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

  // Mini-map Viewport brush bounds
  const brushLeftPct = Math.max(0, Math.min(100, ((startMs - dayStart) / dayDurationMs) * 100));
  const brushRightPct = Math.max(0, Math.min(100, ((endMs - dayStart) / dayDurationMs) * 100));
  const brushWidthPct = Math.max(1, brushRightPct - brushLeftPct);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const now = new Date();
  const todayFormatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const formattedDateValue = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;

  // Smart Visual Clustering: shows individual distinct events when zoomed in, groups sub-pixel items when zoomed out
  const getCameraClusters = useCallback((cameraId: number): VisualCluster[] => {
    const camSegments = parsedSegments.filter((seg) => seg.camId === cameraId);
    if (camSegments.length === 0) return [];

    // Filter to visible window + 5% buffer
    const buffer = durationMs * 0.05;
    const viewStart = startMs - buffer;
    const viewEnd = endMs + buffer;

    const visible = camSegments.filter((seg) => seg.endMs >= viewStart && seg.startMs <= viewEnd);
    if (visible.length === 0) return [];

    // When zoomed in (<= 45 minutes) or when visible items are under 350,
    // show EVERY single event individually as a distinct marker!
    const shouldCluster = visible.length > 300 && durationMs > 45 * 60 * 1000;

    if (!shouldCluster) {
      return visible.map((seg) => {
        const leftPct = ((seg.startMs - startMs) / durationMs) * 100;
        const widthPct = seg.isPhoto
          ? 0.2
          : Math.max(0.25, ((seg.endMs - seg.startMs) / durationMs) * 100);

        const isActive = Boolean(
          activeSegment &&
          activeSegment.camera_id === seg.segment.camera_id &&
          activeSegment.datadir === seg.segment.datadir &&
          activeSegment.file === seg.segment.file &&
          activeSegment.videoStart === seg.segment.videoStart
        );

        return {
          key: `${cameraId}-${seg.segment.datadir}-${seg.segment.file}-${seg.segment.videoStart}`,
          leftPct,
          widthPct,
          isPhoto: seg.isPhoto,
          recordType: seg.recordType,
          primarySegment: seg.segment,
          segments: [seg.segment],
          count: 1,
          isActive,
          timeRangeLabel: seg.segment.start,
        };
      });
    }

    // When zoomed out with hundreds of events, cluster sub-pixel overlapping items
    const clusters: VisualCluster[] = [];
    let currentCluster: {
      leftPct: number;
      rightPct: number;
      isPhoto: boolean;
      recordType: number;
      segments: RecordingSegment[];
      isActive: boolean;
    } | null = null;

    // Sub-pixel threshold before merging: 0.15% (only ~1.5px on a 1000px screen)
    const minDistancePct = 0.15;

    for (const seg of visible) {
      const leftPct = ((seg.startMs - startMs) / durationMs) * 100;
      const actualWidthPct = seg.isPhoto
        ? 0.15
        : Math.max(0.2, ((seg.endMs - seg.startMs) / durationMs) * 100);
      const rightPct = leftPct + actualWidthPct;

      const isCurrentActive = Boolean(
        activeSegment &&
        activeSegment.camera_id === seg.segment.camera_id &&
        activeSegment.datadir === seg.segment.datadir &&
        activeSegment.file === seg.segment.file &&
        activeSegment.videoStart === seg.segment.videoStart
      );

      if (!currentCluster) {
        currentCluster = {
          leftPct,
          rightPct,
          isPhoto: seg.isPhoto,
          recordType: seg.recordType,
          segments: [seg.segment],
          isActive: isCurrentActive,
        };
      } else {
        const canMerge = currentCluster.isPhoto === seg.isPhoto &&
                         (leftPct - currentCluster.rightPct) <= minDistancePct;

        if (canMerge) {
          currentCluster.rightPct = Math.max(currentCluster.rightPct, rightPct);
          currentCluster.segments.push(seg.segment);
          if (isCurrentActive) {
            currentCluster.isActive = true;
          }
        } else {
          const count = currentCluster.segments.length;
          const firstSeg = currentCluster.segments[0];
          const lastSeg = currentCluster.segments[count - 1];
          clusters.push({
            key: `${cameraId}-${firstSeg.datadir}-${firstSeg.file}-${firstSeg.videoStart}-${count}`,
            leftPct: currentCluster.leftPct,
            widthPct: Math.max(0.25, currentCluster.rightPct - currentCluster.leftPct),
            isPhoto: currentCluster.isPhoto,
            recordType: currentCluster.recordType,
            primarySegment: firstSeg,
            segments: currentCluster.segments,
            count,
            isActive: currentCluster.isActive,
            timeRangeLabel: count > 1 ? `${firstSeg.start} → ${lastSeg.end.split(' ')[1] || lastSeg.end}` : firstSeg.start,
          });

          currentCluster = {
            leftPct,
            rightPct,
            isPhoto: seg.isPhoto,
            recordType: seg.recordType,
            segments: [seg.segment],
            isActive: isCurrentActive,
          };
        }
      }
    }

    if (currentCluster) {
      const count = currentCluster.segments.length;
      const firstSeg = currentCluster.segments[0];
      const lastSeg = currentCluster.segments[count - 1];
      clusters.push({
        key: `${cameraId}-${firstSeg.datadir}-${firstSeg.file}-${firstSeg.videoStart}-${count}`,
        leftPct: currentCluster.leftPct,
        widthPct: Math.max(0.25, currentCluster.rightPct - currentCluster.leftPct),
        isPhoto: currentCluster.isPhoto,
        recordType: currentCluster.recordType,
        primarySegment: firstSeg,
        segments: currentCluster.segments,
        count,
        isActive: currentCluster.isActive,
        timeRangeLabel: count > 1 ? `${firstSeg.start} → ${lastSeg.end.split(' ')[1] || lastSeg.end}` : firstSeg.start,
      });
    }

    return clusters;
  }, [parsedSegments, startMs, endMs, durationMs, activeSegment]);

  // Generate calendar days for month view
  const calendarDays = (() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({ date: d, dateStr, isCurrentMonth: false });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({ date: d, dateStr, isCurrentMonth: true });
    }

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
        {/* Left: Date Picker, Quick Range Presets, and Media Type Toggle */}
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
                {/* Header: Month / Year */}
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

          {/* Media Type Filter: Videos (Default) vs Photos */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs font-medium">
            <button
              onClick={() => onChangeMediaType('video')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                mediaType === 'video'
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>🎬</span>
              <span>Videos</span>
            </button>
            <button
              onClick={() => onChangeMediaType('picture')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                mediaType === 'picture'
                  ? 'bg-amber-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>📷</span>
              <span>Photos</span>
            </button>
          </div>
        </div>

        {/* Center: Current View Window (24h format) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>{format24hTime(startTime)}</span>
            <span className="text-slate-500">&rarr;</span>
            <span>{format24hTime(endTime)}</span>
          </div>

          <div className="hidden lg:flex items-center gap-2.5 text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-800">
            {mediaType === 'picture' ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-amber-300">Snapshot Pictures</span>
              </div>
            ) : (
              <>
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
              </>
            )}
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

      {/* OVERALL TIMELINE / MINI-MAP (24h Overview - Canvas Accelerated) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-medium">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-sky-400" />
            24h Overview ({selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })})
          </span>
          <span className="text-slate-500 font-mono text-[10px]">
            {parsedSegments.length} Total {mediaType === 'picture' ? 'Photos' : 'Recordings'} Today
          </span>
        </div>

        {/* 24-Hour Minimap Bar with Canvas and Viewport Brush */}
        <div
          ref={minimapRef}
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
          onPointerUp={handleMinimapPointerUp}
          className="relative h-7 w-full bg-slate-950/90 rounded-xl border border-slate-800 cursor-pointer overflow-hidden select-none"
          style={{ touchAction: 'none' }}
        >
          {/* Canvas renders all 50k events in <1ms */}
          <canvas
            ref={minimapCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none rounded-xl"
          />

          {/* Draggable Viewport Brush Indicator */}
          <div
            className="absolute top-0 bottom-0 border-2 border-amber-400 bg-amber-400/20 rounded-lg pointer-events-none shadow-sm transition-all"
            style={{
              left: `${brushLeftPct}%`,
              width: `${brushWidthPct}%`,
            }}
          />

          {/* Hour tick labels across 24 hours */}
          <div className="absolute inset-0 flex justify-between px-2 items-center pointer-events-none text-[9px] font-mono text-slate-400 drop-shadow">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>
      </div>

      {/* DETAILED MAIN TIMELINE TRACK AREA (Mobile Touch & Pointer Drag enabled) */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClickCapture={handleContainerClickCapture}
        className={`relative w-full bg-slate-950/90 rounded-xl border border-slate-800 p-3 overflow-hidden select-none cursor-grab ${
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

        {/* Camera Tracks with High-Performance Cluster Decimation */}
        <div className="space-y-2 mt-2">
          {activeCameras.map((cam) => {
            const clusters = getCameraClusters(cam.id);
            const totalCamEvents = parsedSegments.filter(s => s.camId === cam.id).length;

            return (
              <div key={cam.id} className="relative h-10 rounded-xl bg-slate-900/70 border border-slate-800/70 flex items-center">
                {/* Camera Name Label */}
                <div className="absolute left-2.5 z-20 pointer-events-none flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 ring-2 ring-blue-400/20" />
                  <span className="text-xs font-semibold text-slate-200 drop-shadow">
                    {cam.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({totalCamEvents})
                  </span>
                </div>

                {/* Event Cluster Segments */}
                <div className="relative w-full h-full">
                  {clusters.map((cluster) => {
                    const isPhoto = cluster.isPhoto;
                    const typeInfo = getEventTypeInfo(cluster.recordType);

                    return (
                      <button
                        key={cluster.key}
                        onClick={(e) => {
                          if (hasDraggedRef.current) {
                            e.stopPropagation();
                            e.preventDefault();
                            return;
                          }
                          e.stopPropagation();

                          // If cluster contains multiple items, pick the one closest to click coordinate
                          if (cluster.segments.length > 1 && containerRef.current) {
                            const rect = containerRef.current.getBoundingClientRect();
                            const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            const clickTimeMs = startMs + clickRatio * durationMs;

                            let bestSeg = cluster.primarySegment;
                            let bestDiff = Infinity;
                            for (const seg of cluster.segments) {
                              const sTime = parseSegmentTime(seg.start).getTime();
                              const diff = Math.abs(sTime - clickTimeMs);
                              if (diff < bestDiff) {
                                bestDiff = diff;
                                bestSeg = seg;
                              }
                            }
                            onSelectSegment(bestSeg);
                          } else {
                            onSelectSegment(cluster.primarySegment);
                          }
                        }}
                        title={
                          cluster.count > 1
                            ? `${cluster.count} ${isPhoto ? 'Photos' : 'Recordings'} (${cluster.timeRangeLabel})`
                            : `${isPhoto ? '📷 Photo' : '🎬 Video'} - ${cam.name} (${typeInfo.label}): ${cluster.primarySegment.start}`
                        }
                        className={`absolute top-1.5 bottom-1.5 rounded-sm transition-all z-10 ${
                          isDragging ? 'pointer-events-none' : ''
                        } ${
                          cluster.isActive
                            ? isPhoto
                              ? 'bg-amber-400 ring-2 ring-white shadow-[0_0_12px_rgba(251,191,36,0.9)] z-30 scale-y-125'
                              : `${typeInfo.activeColorClass} scale-y-110 z-20`
                            : isPhoto
                            ? cluster.count > 1
                              ? 'bg-amber-500/90 border border-amber-300 ring-1 ring-amber-400/40 hover:scale-y-125 hover:bg-amber-400'
                              : 'bg-amber-400 border-x border-amber-500/50 hover:scale-y-125 hover:bg-white hover:ring-2 hover:ring-amber-400 hover:z-20'
                            : `${typeInfo.colorClass} hover:scale-y-110`
                        }`}
                        style={{
                          left: `${cluster.leftPct}%`,
                          width: `${cluster.widthPct}%`,
                          minWidth: isPhoto ? (cluster.count > 1 ? '6px' : '3px') : '4px',
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
            <span>No {mediaType === 'picture' ? 'photos' : 'recordings'} found on this date. Use the date picker above or zoom out to inspect other dates.</span>
          </div>
        )}
      </div>
    </div>
  );
};
