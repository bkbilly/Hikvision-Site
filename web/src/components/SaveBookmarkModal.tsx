import React, { useState, useEffect } from 'react';
import type { Bookmark as BookmarkType, Camera, RecordingSegment } from '../types';
import { api } from '../api';
import { X, Bookmark, Check, Trash2 } from 'lucide-react';

interface SaveBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  camera: Camera;
  segment: RecordingSegment;
  existingBookmark?: BookmarkType | null;
  onSaved: () => void;
}

export const SaveBookmarkModal: React.FC<SaveBookmarkModalProps> = ({
  isOpen,
  onClose,
  camera,
  segment,
  existingBookmark,
  onSaved,
}) => {
  const defaultTitle = `${camera.name} - ${segment.start}`;
  const [title, setTitle] = useState<string>(defaultTitle);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (existingBookmark) {
        setTitle(existingBookmark.title || defaultTitle);
        setNotes(existingBookmark.notes || '');
      } else {
        setTitle(`${camera.name} - ${segment.start}`);
        setNotes('');
      }
      setIsSaving(false);
    }
  }, [isOpen, camera.name, segment.start, existingBookmark]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (existingBookmark) {
        await api.updateBookmark(existingBookmark.id, {
          title: title.trim() || defaultTitle,
          notes: notes.trim(),
        });
      } else {
        await api.createBookmark({
          camera_id: camera.id,
          camera_name: camera.name,
          title: title.trim() || defaultTitle,
          notes: notes.trim(),
          start_time: segment.start,
          end_time: segment.end,
          datadir: segment.datadir,
          file: segment.file,
          videoStart: segment.videoStart,
          videoEnd: segment.videoEnd,
          record_type: segment.record_type,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to save bookmark');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingBookmark) return;
    if (!confirm('Are you sure you want to remove this bookmark?')) return;
    setIsSaving(true);
    try {
      await api.deleteBookmark(existingBookmark.id);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to delete bookmark');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto select-none">
      <div className="relative w-full max-w-md glass-panel bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-400 fill-current" />
            <h3 className="font-bold text-sm text-white">
              {existingBookmark ? 'Edit Bookmark' : 'Bookmark Recording'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Bookmark Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Package Delivered"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add key observations, license plates, or context..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 font-mono space-y-0.5">
            <div><strong>Camera:</strong> {camera.name}</div>
            <div><strong>Time:</strong> {segment.start} &rarr; {segment.end.split(' ')[1]}</div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
            {existingBookmark ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSaving}
                className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-600 border border-rose-800/80 text-rose-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : existingBookmark ? 'Update Bookmark' : 'Save Bookmark'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
