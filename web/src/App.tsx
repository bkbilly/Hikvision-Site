import { useState, useEffect, useCallback } from 'react';
import type { Bookmark, Camera, RecordingSegment } from './types';
import { api, getAuthToken, clearAuthToken } from './api';
import { parseSegmentTime } from './utils/date';
import { Navbar } from './components/Navbar';
import { LiveGrid } from './components/LiveGrid';
import { VideoPlayer } from './components/VideoPlayer';
import { Timeline } from './components/Timeline';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { BookmarksModal } from './components/BookmarksModal';
import { SaveBookmarkModal } from './components/SaveBookmarkModal';
import { LoginModal } from './components/LoginModal';
import { PhotoViewer } from './components/PhotoViewer';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getAuthToken());
  const [username, setUsername] = useState<string>('admin');
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'playback'>('live');
  const [events, setEvents] = useState<RecordingSegment[]>([]);
  const [activeSegment, setActiveSegment] = useState<RecordingSegment | null>(null);
  const [mediaType, setMediaType] = useState<'video' | 'picture'>('video');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState<boolean>(false);
  const [isSaveBookmarkOpen, setIsSaveBookmarkOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);

  // Selected date (for 24h day-level event caching & mini-map overview)
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // Main timeline zoomed-in viewport window (default: 3 hours)
  const [timeWindow, setTimeWindow] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 2 * 3600 * 1000);
    const end = new Date(now.getTime() + 1 * 3600 * 1000);
    return { start, end };
  });

  // Verify auth session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const me = await api.getMe();
        setIsAuthenticated(true);
        setUsername(me.username);
      } catch {
        setIsAuthenticated(false);
      }
    };
    if (getAuthToken()) {
      checkAuth();
    }
  }, []);

  // Handle unauthorized event dispatched by API client
  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const [hasInitializedCamera, setHasInitializedCamera] = useState<boolean>(false);

  // Load cameras
  const loadCameras = useCallback(async () => {
    try {
      const data = await api.getCameras();
      setCameras(data);
      const enabled = data.filter((c) => c.enabled !== false);
      setSelectedCamera((prev) => {
        if (!hasInitializedCamera) {
          setHasInitializedCamera(true);
          return enabled.length > 0 ? enabled[0] : null;
        }
        if (prev && !enabled.some((c) => c.id === prev.id)) {
          return enabled.length > 0 ? enabled[0] : null;
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load cameras', err);
    }
  }, [hasInitializedCamera]);

  useEffect(() => {
    if (isAuthenticated) {
      loadCameras();
    }
  }, [isAuthenticated, loadCameras]);

  // Load events with 3-day buffer (yesterday, today, tomorrow) centered on date
  const loadEventsForDate = useCallback(async (date: Date) => {
    if (!isAuthenticated) return;
    const enabled = cameras.filter((c) => c.enabled !== false);
    if (enabled.length === 0) {
      setEvents([]);
      return;
    }
    setIsLoadingEvents(true);
    try {
      const cameraIDs = selectedCamera && enabled.some((c) => c.id === selectedCamera.id)
        ? [selectedCamera.id]
        : enabled.map((c) => c.id);

      const dayStartMs = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).getTime();
      const bufferStartMs = dayStartMs - 24 * 3600 * 1000;
      const bufferEndMs = dayStartMs + 48 * 3600 * 1000 - 1;

      const startUnix = Math.floor(bufferStartMs / 1000);
      const endUnix = Math.ceil(bufferEndMs / 1000);

      const data = await api.getEvents({
        cameras: cameraIDs,
        start: startUnix,
        end: endUnix,
        type: mediaType,
      });

      setEvents(data || []);
    } catch (err) {
      console.error('Failed to load events', err);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [isAuthenticated, cameras, selectedCamera, mediaType]);

  useEffect(() => {
    if (activeTab === 'playback') {
      loadEventsForDate(selectedDate);
    }
  }, [activeTab, selectedDate, selectedCamera, mediaType, loadEventsForDate]);

  // Automatically track date as timeline is panned left or right
  const handleChangeTimeWindow = useCallback((start: Date, end: Date) => {
    setTimeWindow({ start, end });

    // Calculate center of visible timeline window
    const centerMs = (start.getTime() + end.getTime()) / 2;
    const centerDate = new Date(centerMs);
    const newYear = centerDate.getFullYear();
    const newMonth = centerDate.getMonth();
    const newDay = centerDate.getDate();

    setSelectedDate((prev) => {
      if (
        prev.getFullYear() !== newYear ||
        prev.getMonth() !== newMonth ||
        prev.getDate() !== newDay
      ) {
        return new Date(newYear, newMonth, newDay);
      }
      return prev;
    });
  }, []);

  // Handle explicit date change from Date Picker
  const handleSelectDate = (newDate: Date) => {
    setSelectedDate(newDate);
    const start = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate(), 8, 0, 0);
    const end = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate(), 14, 0, 0);
    setTimeWindow({ start, end });
  };

  // Quick navigation between events (Next / Previous)
  const currentEventIndex = events.findIndex((e) =>
    activeSegment &&
    e.camera_id === activeSegment.camera_id &&
    e.datadir === activeSegment.datadir &&
    e.file === activeSegment.file &&
    e.videoStart === activeSegment.videoStart
  );

  const handleNextEvent = () => {
    if (currentEventIndex >= 0 && currentEventIndex < events.length - 1) {
      const nextSeg = events[currentEventIndex + 1];
      setActiveSegment(nextSeg);
      const cam = cameras.find((c) => c.id === nextSeg.camera_id);
      if (cam) setSelectedCamera(cam);

      // Center timeline window on the next event
      const segTime = parseSegmentTime(nextSeg.start).getTime();
      const currentDuration = timeWindow.end.getTime() - timeWindow.start.getTime();
      setTimeWindow({
        start: new Date(segTime - currentDuration / 2),
        end: new Date(segTime + currentDuration / 2),
      });
    }
  };

  const handlePrevEvent = () => {
    if (currentEventIndex > 0) {
      const prevSeg = events[currentEventIndex - 1];
      setActiveSegment(prevSeg);
      const cam = cameras.find((c) => c.id === prevSeg.camera_id);
      if (cam) setSelectedCamera(cam);

      // Center timeline window on previous event
      const segTime = parseSegmentTime(prevSeg.start).getTime();
      const currentDuration = timeWindow.end.getTime() - timeWindow.start.getTime();
      setTimeWindow({
        start: new Date(segTime - currentDuration / 2),
        end: new Date(segTime + currentDuration / 2),
      });
    }
  };

  // Load saved bookmarks
  const loadBookmarks = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await api.getBookmarks();
      setBookmarks(data || []);
    } catch (err) {
      console.error('Failed to load bookmarks', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadBookmarks();
    }
  }, [isAuthenticated, loadBookmarks]);

  const handlePlayBookmark = (bm: Bookmark) => {
    setActiveTab('playback');
    const cam = cameras.find((c) => c.id === bm.camera_id) || null;
    if (cam) setSelectedCamera(cam);

    const segTime = parseSegmentTime(bm.start_time).getTime();
    const dateObj = new Date(segTime);
    setSelectedDate(dateObj);

    const currentDuration = timeWindow.end.getTime() - timeWindow.start.getTime();
    setTimeWindow({
      start: new Date(segTime - currentDuration / 2),
      end: new Date(segTime + currentDuration / 2),
    });

    setActiveSegment({
      id: 0,
      camera_id: bm.camera_id,
      start: bm.start_time,
      end: bm.end_time,
      group: 0,
      datadir: bm.datadir,
      file: bm.file,
      videoStart: bm.videoStart,
      videoEnd: bm.videoEnd,
      record_type: bm.record_type,
    });
  };

  const handleSelectCameraForPlayback = (camera: Camera) => {
    setSelectedCamera(camera);
    setActiveTab('playback');
  };

  const handleSelectSegment = (seg: RecordingSegment) => {
    setActiveSegment(seg);
    const cam = cameras.find((c) => c.id === seg.camera_id);
    if (cam) setSelectedCamera(cam);
  };

  const handleRescan = async () => {
    setIsScanning(true);
    try {
      await api.triggerRescan();
      setTimeout(() => {
        setIsScanning(false);
        loadEventsForDate(selectedDate);
      }, 3000);
    } catch (err) {
      console.error(err);
      setIsScanning(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    clearAuthToken();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <LoginModal
        onLoginSuccess={(user) => {
          setIsAuthenticated(true);
          setUsername(user);
        }}
      />
    );
  }

  const enabledCameras = cameras.filter((c) => c.enabled !== false);

  const isCurrentSegmentBookmarked = Boolean(
    activeSegment &&
    bookmarks.some(
      (b) =>
        b.camera_id === activeSegment.camera_id &&
        b.datadir === activeSegment.datadir &&
        b.file === activeSegment.file &&
        b.videoStart === activeSegment.videoStart
    )
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        cameras={enabledCameras}
        selectedCamera={selectedCamera}
        onSelectCamera={(cam) => {
          setSelectedCamera(cam);
          setActiveSegment(null);
        }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBookmarks={() => setIsBookmarksOpen(true)}
        bookmarksCount={bookmarks.length}
        onLogout={handleLogout}
        onRescan={handleRescan}
        isScanning={isScanning}
        username={username}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-4">
        {activeTab === 'live' ? (
          <LiveGrid
            cameras={enabledCameras}
            onSelectCameraForPlayback={handleSelectCameraForPlayback}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        ) : (
          <div className="space-y-4">
            {activeSegment && activeSegment.media_type === 'picture' ? (
              <PhotoViewer
                camera={selectedCamera || cameras.find((c) => c.id === activeSegment.camera_id) || null}
                segment={activeSegment}
                onClose={() => setActiveSegment(null)}
                onNextEvent={handleNextEvent}
                onPrevEvent={handlePrevEvent}
                hasNextEvent={currentEventIndex >= 0 && currentEventIndex < events.length - 1}
                hasPrevEvent={currentEventIndex > 0}
                onOpenShortcuts={() => setIsShortcutsOpen(true)}
                onOpenSaveBookmark={() => setIsSaveBookmarkOpen(true)}
                isBookmarked={isCurrentSegmentBookmarked}
              />
            ) : (
              <VideoPlayer
                selectedCamera={selectedCamera}
                activeSegment={activeSegment}
                onNextEvent={handleNextEvent}
                onPrevEvent={handlePrevEvent}
                hasNextEvent={currentEventIndex >= 0 && currentEventIndex < events.length - 1}
                hasPrevEvent={currentEventIndex > 0}
                onOpenShortcuts={() => setIsShortcutsOpen(true)}
                onOpenSaveBookmark={() => setIsSaveBookmarkOpen(true)}
                isBookmarked={isCurrentSegmentBookmarked}
              />
            )}

            <Timeline
              cameras={enabledCameras}
              selectedCamera={selectedCamera}
              events={events}
              activeSegment={activeSegment}
              onSelectSegment={handleSelectSegment}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              startTime={timeWindow.start}
              endTime={timeWindow.end}
              onChangeTimeWindow={handleChangeTimeWindow}
              isLoading={isLoadingEvents}
              mediaType={mediaType}
              onChangeMediaType={(type) => {
                setMediaType(type);
                setActiveSegment(null);
              }}
            />
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        cameras={cameras}
        onCamerasUpdated={() => {
          loadCameras();
          loadEventsForDate(selectedDate);
        }}
      />

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <BookmarksModal
        isOpen={isBookmarksOpen}
        onClose={() => setIsBookmarksOpen(false)}
        bookmarks={bookmarks}
        onBookmarksUpdated={loadBookmarks}
        onPlayBookmark={handlePlayBookmark}
      />

      {selectedCamera && activeSegment && (
        <SaveBookmarkModal
          isOpen={isSaveBookmarkOpen}
          onClose={() => setIsSaveBookmarkOpen(false)}
          camera={selectedCamera}
          segment={activeSegment}
          existingBookmark={bookmarks.find(
            (b) =>
              b.camera_id === activeSegment.camera_id &&
              b.datadir === activeSegment.datadir &&
              b.file === activeSegment.file &&
              b.videoStart === activeSegment.videoStart
          )}
          onSaved={loadBookmarks}
        />
      )}
    </div>
  );
}

export default App;
