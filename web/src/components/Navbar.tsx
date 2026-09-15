import React, { useState } from 'react';
import type { Camera } from '../types';
import { 
  Camera as CameraIcon, 
  Grid, 
  Film, 
  Settings, 
  LogOut, 
  RefreshCw, 
  Menu, 
  X, 
  ShieldCheck, 
  ChevronDown, 
  Bookmark 
} from 'lucide-react';

interface NavbarProps {
  cameras: Camera[];
  selectedCamera: Camera | null;
  onSelectCamera: (camera: Camera | null) => void;
  activeTab: 'live' | 'playback';
  onTabChange: (tab: 'live' | 'playback') => void;
  onOpenSettings: () => void;
  onOpenBookmarks?: () => void;
  bookmarksCount?: number;
  onLogout: () => void;
  onRescan: () => void;
  isScanning: boolean;
  username: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  cameras,
  selectedCamera,
  onSelectCamera,
  activeTab,
  onTabChange,
  onOpenSettings,
  onOpenBookmarks,
  bookmarksCount = 0,
  onLogout,
  onRescan,
  isScanning,
  username,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [camDropdownOpen, setCamDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 w-full glass-panel border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-4 md:px-6 h-14 flex items-center justify-between gap-2">
        {/* Left: Brand & Navigation Tabs */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="font-bold text-sm sm:text-base tracking-wide bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent hidden lg:inline-block">
              Hikvision Hub
            </span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 ml-0.5 sm:ml-2 shrink-0">
            <button
              onClick={() => onTabChange('live')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
                activeTab === 'live'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Live</span>
            </button>
            <button
              onClick={() => onTabChange('playback')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
                activeTab === 'playback'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Playback</span>
            </button>
          </div>
        </div>

        {/* Center: Camera Selector (Desktop only: md and above) */}
        {activeTab === 'playback' && (
          <div className="relative hidden md:flex items-center shrink min-w-0">
            <button
              onClick={() => setCamDropdownOpen(!camDropdownOpen)}
              className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 hover:border-blue-500/50 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm text-slate-200 transition-colors max-w-[130px] lg:max-w-[180px] xl:max-w-[220px]"
            >
              <CameraIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="font-medium truncate">
                {selectedCamera ? selectedCamera.name : 'All Cameras'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${camDropdownOpen ? 'rotate-180 text-blue-400' : ''}`} />
            </button>

            {camDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setCamDropdownOpen(false)}
                />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl py-1.5 z-50">
                  <button
                    onClick={() => {
                      onSelectCamera(null);
                      setCamDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm hover:bg-slate-800 transition-colors flex items-center gap-2 ${
                      !selectedCamera ? 'text-blue-400 font-semibold bg-blue-500/10' : 'text-slate-300'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    All Cameras
                  </button>
                  {cameras.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSelectCamera(c);
                        setCamDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm hover:bg-slate-800 transition-colors flex items-center justify-between ${
                        selectedCamera?.id === c.id ? 'text-blue-400 font-semibold bg-blue-500/10' : 'text-slate-300'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Right: Quick Actions & Profile */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Quick Rescan */}
          <button
            onClick={onRescan}
            disabled={isScanning}
            title="Scan recordings storage"
            className="p-1.5 sm:p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800/80 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {/* Bookmarks button */}
          {onOpenBookmarks && (
            <button
              onClick={onOpenBookmarks}
              title="Saved Recording Bookmarks"
              className="relative flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-lg transition-all"
            >
              <Bookmark className="w-4 h-4 text-amber-400 fill-amber-400/20 shrink-0" />
              <span className="hidden xl:inline">Bookmarks</span>
              {bookmarksCount > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full">
                  {bookmarksCount}
                </span>
              )}
            </button>
          )}

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            title="Configuration & Camera Manager"
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-all"
          >
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="hidden xl:inline">Settings</span>
          </button>

          {/* Logout (Desktop only: md and above) */}
          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-1.5 sm:p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/80 rounded-lg transition-colors hidden md:block"
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* Mobile/Tablet hamburger menu button (<md) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-white md:hidden rounded-lg hover:bg-slate-800/80 transition-colors"
            title="Open Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Drawer (<md) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950/98 backdrop-blur-lg px-4 py-4 space-y-3.5 animate-in slide-in-from-top-2 duration-150">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Select Camera
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              <button
                onClick={() => {
                  onSelectCamera(null);
                  setMobileMenuOpen(false);
                }}
                className={`px-3 py-2 text-xs rounded-lg border text-left flex items-center gap-1.5 transition-colors ${
                  !selectedCamera
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Grid className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">All Cameras</span>
              </button>
              {cameras.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelectCamera(c);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-2 text-xs rounded-lg border text-left truncate transition-colors ${
                    selectedCamera?.id === c.id
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
            {onOpenBookmarks && (
              <button
                onClick={() => {
                  onOpenBookmarks();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg bg-slate-900 border border-slate-800 text-amber-400 hover:bg-slate-800 transition-colors"
              >
                <Bookmark className="w-3.5 h-3.5 fill-current shrink-0" />
                <span className="truncate">Bookmarks ({bookmarksCount})</span>
              </button>
            )}
            <button
              onClick={() => {
                onOpenSettings();
                setMobileMenuOpen(false);
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Settings</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="truncate">Signed in as <strong className="text-slate-200">{username}</strong></span>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onLogout();
              }}
              className="flex items-center gap-1 text-red-400 hover:text-red-300 font-medium ml-2 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
