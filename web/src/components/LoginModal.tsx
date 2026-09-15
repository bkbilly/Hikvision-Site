import React, { useState } from 'react';
import { api, setAuthToken } from '../api';
import { ShieldCheck, Lock, User, AlertCircle, Loader2 } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (username: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login({ username, password });
      setAuthToken(res.token);
      onLoginSuccess(res.username);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm glass-panel bg-slate-900/90 rounded-2xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-1 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-wide">Hikvision Hub</h1>
          <p className="text-xs text-slate-400">Sign in to access live streams and playback</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/30 transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
