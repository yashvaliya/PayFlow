import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard,
  Lock,
  Mail,
  User,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, register, quickLogin } = useAuth();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      if (isRegisterMode) {
        if (!name.trim()) throw new Error('Please enter your full name');
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (role: 'ADMIN' | 'VIEWER') => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      await quickLogin(role);
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Quick login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and title */}
        <div className="text-center">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 items-center justify-center text-white shadow-md shadow-blue-500/25 mb-4">
            <CreditCard className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            {isRegisterMode ? 'Create PayFlow Account' : 'Sign in to PayFlow'}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Access merchant dashboards, ledger journals, and settlement tools.
          </p>
        </div>

        {/* 1-Click Recruiter Demo Access */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Instant Demo Access</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('ADMIN')}
              disabled={isLoading}
              className="p-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-left transition-colors"
            >
              <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
                Demo Admin
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Full refund &amp; recon rights</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('VIEWER')}
              disabled={isLoading}
              className="p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-left transition-colors"
            >
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                Demo Viewer
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Read-only auditing view</div>
            </button>
          </div>
        </div>

        {/* Traditional Form */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            {isRegisterMode && (
              <div>
                <label className="font-semibold text-muted-foreground">Full Name</label>
                <div className="relative mt-1">
                  <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-foreground outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Sarah Chen"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="font-semibold text-muted-foreground">Email Address</label>
              <div className="relative mt-1">
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-foreground outline-none focus:ring-1 focus:ring-primary"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-muted-foreground">Password</label>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-foreground outline-none focus:ring-1 focus:ring-primary"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 mt-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{isRegisterMode ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-muted-foreground">
            {isRegisterMode ? (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegisterMode(false)}
                  className="text-primary font-semibold hover:underline"
                >
                  Sign In
                </button>
              </span>
            ) : (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegisterMode(true)}
                  className="text-primary font-semibold hover:underline"
                >
                  Create one
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
