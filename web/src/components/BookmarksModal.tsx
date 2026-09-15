import React, { useState } from 'react';
import type { Bookmark } from '../types';
import { api } from '../api';
import { 
  X, 
  Bookmark as BookmarkIcon, 
  Play, 
  Trash2, 
  Edit3, 
  Check, 
  Camera as CameraIcon, 
  Clock, 
  Calendar
} from 'lucide-react';

interface BookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  onBookmarksUpdated: () => void;
  onPlayBookmark: (bookmark: Bookmark) => void;
}

export const BookmarksModal: React.FC<BookmarksModalProps> = ({
  isOpen,
  onClose,
  bookmarks,
  onBookmarksUpdated,
  onPlayBookmark,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleStartEdit = (bm: Bookmark) => {
    setEditingId(bm.id);
    setEditTitle(bm.title);
    setEditNotes(bm.notes);
  };

  const handleSaveEdit = async (id: number) => {
    setIsSubmitting(true);
    try {
      await api.updateBookmark(id, { title: editTitle, notes: editNotes });
      setEditingId(null);
      onBookmarksUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to update bookmark');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this bookmark?')) return;
    try {
      await api.deleteBookmark(id);
      if (editingId === id) {
        setEditingId(null);
      }
      onBookmarksUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete bookmark');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto select-none">
      <div className="relative w-full max-w-2xl glass-panel bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookmarkIcon className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Saved Recording Bookmarks</h2>
              <p className="text-xs text-slate-400">{bookmarks.length} bookmarked video clips for quick access</p>
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
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          {bookmarks.length === 0 ? (
            <div className="py-12 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 space-y-2">
              <BookmarkIcon className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-medium text-slate-300">No saved bookmarks yet</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                While watching any recording in Playback mode, click the Bookmark icon or press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">B</kbd> to save it here.
              </p>
            </div>
          ) : (
            bookmarks.map((bm) => {
              const isEditing = editingId === bm.id;

              return (
                <div
                  key={bm.id}
                  className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Bookmark title"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                          />
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Add notes or descriptions..."
                            rows={2}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                          />
                        </div>
                      ) : (
                        <div>
                          <h3 className="font-semibold text-sm text-white truncate flex items-center gap-1.5">
                            <BookmarkIcon className="w-3.5 h-3.5 text-amber-400 fill-current shrink-0" />
                            <span>{bm.title}</span>
                          </h3>
                          {bm.notes && (
                            <p className="text-xs text-slate-300 mt-1 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                              {bm.notes}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Meta info tags */}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                          <CameraIcon className="w-3 h-3 text-blue-400" />
                          {bm.camera_name}
                        </span>
                        <span className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                          <Calendar className="w-3 h-3 text-sky-400" />
                          {bm.start_time.split(' ')[0]}
                        </span>
                        <span className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                          <Clock className="w-3 h-3 text-amber-400" />
                          {bm.start_time.split(' ')[1]} &rarr; {bm.end_time.split(' ')[1]}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(bm.id)}
                            disabled={isSubmitting}
                            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                            title="Save changes"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(bm.id)}
                            className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-600 border border-rose-800/80 text-rose-300 hover:text-white transition-colors cursor-pointer"
                            title="Remove / Delete this bookmark"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              onPlayBookmark(bm);
                              onClose();
                            }}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all"
                            title="Play this recording"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Play</span>
                          </button>
                          <button
                            onClick={() => handleStartEdit(bm)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Edit Title & Notes"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(bm.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition-colors"
                            title="Remove Bookmark"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
