import React, { useState, useEffect } from 'react';
import type { Camera, SystemStatus } from '../types';
import { api } from '../api';
import { 
  X, 
  Camera as CameraIcon, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  HardDrive, 
  Lock, 
  Activity, 
  Eye, 
  EyeOff,
  FolderSearch,
  Server,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: Camera[];
  onCamerasUpdated: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  cameras,
  onCamerasUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'cameras' | 'system' | 'security'>('cameras');
  const [editingCamera, setEditingCamera] = useState<Partial<Camera> | null>(null);
  const [cameraPassword, setCameraPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [pathDiscovery, setPathDiscovery] = useState<{ valid?: boolean; message?: string; dirs?: any[] } | null>(null);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);

  // System status state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>('');
  const [cacheMessage, setCacheMessage] = useState<string>('');

  // Password change state
  const [currentPass, setCurrentPass] = useState<string>('');
  const [newPass, setNewPass] = useState<string>('');
  const [confirmPass, setConfirmPass] = useState<string>('');
  const [passMessage, setPassMessage] = useState<{ success?: boolean; text?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSystemStatus();
    }
  }, [isOpen]);

  const loadSystemStatus = async () => {
    try {
      const res = await api.getSystemStatus();
      setSystemStatus(res.status);
      setIsScanning(res.is_scanning);
    } catch (err) {
      console.error('Failed to load system status', err);
    }
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCamera || !editingCamera.name) return;

    try {
      const payload = {
        ...editingCamera,
        password: cameraPassword || undefined,
      };

      if (editingCamera.id) {
        await api.updateCamera(editingCamera.id, payload);
      } else {
        await api.createCamera(payload);
      }

      setEditingCamera(null);
      setCameraPassword('');
      setTestResult(null);
      setPathDiscovery(null);
      onCamerasUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to save camera');
    }
  };

  const handleDeleteCamera = async (id: number) => {
    if (!confirm('Are you sure you want to delete this camera configuration?')) return;
    try {
      await api.deleteCamera(id);
      onCamerasUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete camera');
    }
  };

  const handleToggleEnabled = async (cam: Camera) => {
    try {
      await api.updateCamera(cam.id, {
        name: cam.name,
        ip: cam.ip,
        path: cam.path,
        username: cam.username,
        is_isapi: cam.is_isapi,
        sort_order: cam.sort_order,
        enabled: !cam.enabled,
      });
      onCamerasUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to update camera status');
    }
  };

  const handleMoveCamera = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cameras.length) return;

    const newCameras = [...cameras];
    const [moved] = newCameras.splice(index, 1);
    newCameras.splice(targetIndex, 0, moved);

    const orderedIds = newCameras.map((c) => c.id);
    try {
      await api.reorderCameras(orderedIds);
      onCamerasUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to reorder cameras');
    }
  };

  const handleTestConnection = async () => {
    if (!editingCamera?.ip) {
      alert('Please enter a camera IP address first');
      return
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection({
        ip: editingCamera.ip,
        username: editingCamera.username || 'admin',
        password: cameraPassword,
        is_isapi: !!editingCamera.is_isapi,
        camera_id: editingCamera.id,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDiscoverPath = async () => {
    if (!editingCamera?.path) {
      alert('Please enter a storage path first');
      return;
    }
    setIsDiscovering(true);
    setPathDiscovery(null);
    try {
      const res = await api.discoverPath(editingCamera.path);
      setPathDiscovery(res);
    } catch (err: any) {
      setPathDiscovery({ valid: false, message: err.message || 'Path error' });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleTriggerRescan = async () => {
    try {
      const res = await api.triggerRescan();
      setScanMessage(res.message);
      setIsScanning(true);
      setTimeout(loadSystemStatus, 3000);
    } catch (err: any) {
      setScanMessage('Failed: ' + err.message);
    }
  };

  const handleClearCache = async () => {
    try {
      const res = await api.clearCache();
      setCacheMessage(res.message);
      loadSystemStatus();
    } catch (err: any) {
      setCacheMessage('Failed: ' + err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) {
      setPassMessage({ success: false, text: 'New passwords do not match' });
      return;
    }
    try {
      await api.changePassword({ current_password: currentPass, new_password: newPass });
      setPassMessage({ success: true, text: 'Password successfully changed' });
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err: any) {
      setPassMessage({ success: false, text: err.message || 'Failed to update password' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl glass-panel bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <CameraIcon className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-base sm:text-lg text-white">Hub Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 px-4 sm:px-6">
          <button
            onClick={() => { setActiveTab('cameras'); setEditingCamera(null); }}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'cameras'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CameraIcon className="w-4 h-4" />
            Cameras ({cameras.length})
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'system'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            Storage & System
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            Security & Auth
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: CAMERAS */}
          {activeTab === 'cameras' && (
            <div>
              {editingCamera ? (
                /* Edit / Add Camera Form */
                <form onSubmit={handleSaveCamera} className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">
                      {editingCamera.id ? 'Edit Camera' : 'Add New Camera'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingCamera(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Back to list
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Camera Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={editingCamera.name || ''}
                        onChange={(e) => setEditingCamera({ ...editingCamera, name: e.target.value })}
                        placeholder="e.g. Front Entrance"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Camera IP Address *
                      </label>
                      <input
                        type="text"
                        required
                        value={editingCamera.ip || ''}
                        onChange={(e) => setEditingCamera({ ...editingCamera, ip: e.target.value })}
                        placeholder="e.g. 192.168.1.160"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Recording Storage Path (NFS/NAS/SD or info.bin) *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={editingCamera.path || ''}
                        onChange={(e) => setEditingCamera({ ...editingCamera, path: e.target.value })}
                        placeholder="e.g. /mnt/hikvision/spicam1/info.bin"
                        className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleDiscoverPath}
                        disabled={isDiscovering}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <FolderSearch className="w-3.5 h-3.5" />
                        {isDiscovering ? 'Checking...' : 'Check Path'}
                      </button>
                    </div>
                    {pathDiscovery && (
                      <div className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-1.5 ${
                        pathDiscovery.valid ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                      }`}>
                        {pathDiscovery.valid ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        <span>{pathDiscovery.message}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Camera Username
                      </label>
                      <input
                        type="text"
                        value={editingCamera.username || ''}
                        onChange={(e) => setEditingCamera({ ...editingCamera, username: e.target.value })}
                        placeholder="admin"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Camera Password {editingCamera.id ? '(Leave blank to keep unchanged)' : '*'}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={cameraPassword}
                          onChange={(e) => setCameraPassword(e.target.value)}
                          placeholder={editingCamera.id ? '••••••••' : 'Enter camera password'}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-3 pr-9 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={editingCamera.enabled !== false}
                        onChange={(e) => setEditingCamera({ ...editingCamera, enabled: e.target.checked })}
                        className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <span>Enabled</span>
                    </label>
                  </div>

                  {/* Test Connection Button & Result */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <Activity className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-blue-400' : ''}`} />
                      {isTesting ? 'Testing Camera...' : 'Test Live Connection'}
                    </button>

                    {testResult && (
                      <div className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-1.5 ${
                        testResult.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                      }`}>
                        {testResult.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{testResult.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingCamera(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-medium shadow-md shadow-blue-600/20 transition-all"
                    >
                      Save Camera
                    </button>
                  </div>
                </form>
              ) : (
                /* Camera List */
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-400">
                      Manage connected Hikvision/HiLook cameras and their local storage folders.
                    </p>
                    <button
                      onClick={() => {
                        setEditingCamera({
                          name: '',
                          path: '',
                          ip: '',
                          username: 'admin',
                          enabled: true,
                          sort_order: cameras.length,
                        });
                        setCameraPassword('');
                        setTestResult(null);
                        setPathDiscovery(null);
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Camera
                    </button>
                  </div>

                  {cameras.length === 0 ? (
                    <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
                      <CameraIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No cameras added yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cameras.map((c, index) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Reorder Arrows */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveCamera(index, 'up')}
                                title="Move Up"
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === cameras.length - 1}
                                onClick={() => handleMoveCamera(index, 'down')}
                                title="Move Down"
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-white truncate">{c.name}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                                <span>{c.ip}</span>
                                <span>&bull;</span>
                                <span className="truncate max-w-[160px] sm:max-w-xs">{c.path}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleEnabled(c)}
                              title={c.enabled ? "Disable Camera" : "Enable Camera"}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                c.enabled ? 'bg-emerald-600' : 'bg-slate-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  c.enabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <button
                              onClick={() => {
                                setEditingCamera(c);
                                setCameraPassword('');
                                setTestResult(null);
                                setPathDiscovery(null);
                              }}
                              title="Edit Camera"
                              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCamera(c.id)}
                              title="Delete Camera"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SYSTEM & STORAGE */}
          {activeTab === 'system' && (
            <div className="space-y-4">
              {systemStatus && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 block">Version</span>
                    <span className="text-base font-bold text-white">v{systemStatus.version}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 block">Indexed Events</span>
                    <span className="text-base font-bold text-blue-400">{systemStatus.event_count.toLocaleString()}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 block">Video Cache</span>
                    <span className="text-base font-bold text-amber-400">{systemStatus.cache_size_mb} MB</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 block">FFmpeg Engine</span>
                    <span className="text-xs font-semibold text-emerald-400 truncate block">
                      {systemStatus.has_ffmpeg ? 'Ready' : 'Missing'}
                    </span>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                  Storage Crawler & Indexing
                </h4>
                <p className="text-xs text-slate-400">
                  Crawl all configured camera storage directories to index new motion and recording events into the SQLite database.
                </p>
                <button
                  onClick={handleTriggerRescan}
                  disabled={isScanning}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Scan in Progress...' : 'Rescan Storage Now'}
                </button>
                {scanMessage && (
                  <p className="text-xs text-blue-400 mt-1 font-mono">{scanMessage}</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  Transcoded Video Cache
                </h4>
                <p className="text-xs text-slate-400">
                  Temporary transcoded and remuxed MP4 clips generated during playback can be cleared to free up disk space.
                </p>
                <button
                  onClick={handleClearCache}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Clear Video Cache
                </button>
                {cacheMessage && (
                  <p className="text-xs text-emerald-400 mt-1 font-mono">{cacheMessage}</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & AUTH */}
          {activeTab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <h4 className="text-sm font-semibold text-white">Change Admin Password</h4>
              <p className="text-xs text-slate-400">
                Update your administrator credentials for logging into the web interface.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {passMessage && (
                <div className={`p-2 rounded-lg text-xs flex items-center gap-1.5 ${
                  passMessage.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                }`}>
                  {passMessage.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{passMessage.text}</span>
                </div>
              )}

              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-medium shadow-md transition-all"
              >
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
