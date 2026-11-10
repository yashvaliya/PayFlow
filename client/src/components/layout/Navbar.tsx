import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  CreditCard,
  LayoutDashboard,
  Receipt,
  BookOpenCheck,
  Scale,
  Radio,
  FileCode2,
  Sun,
  Moon,
  LogOut,
  UserCheck,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, quickLogin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Transactions', path: '/transactions', icon: Receipt },
    { name: 'Checkout', path: '/checkout', icon: CreditCard, highlight: true },
    { name: 'Ledger', path: '/ledger', icon: BookOpenCheck },
    { name: 'Reconciliation', path: '/reconciliation', icon: Scale },
    { name: 'Webhooks', path: '/webhooks', icon: Radio },
  ];

  return (
    <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight text-foreground hover:opacity-90">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-300 bg-clip-text text-transparent font-extrabold text-2xl">
                PayFlow
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                SANDBOX
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : link.highlight
                        ? 'text-primary hover:bg-primary/5 font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
              title="OpenAPI / Swagger Documentation"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Swagger Docs</span>
            </a>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User Session */}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-semibold leading-none">{user.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="dropdown relative group">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Demo Login</span>
                  </button>
                  <div className="absolute right-0 mt-2 w-56 p-2 bg-card rounded-xl border border-border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                    <div className="text-[11px] font-semibold text-muted-foreground px-2 py-1">
                      Instant Recruiter Sign-in:
                    </div>
                    <button
                      onClick={() => quickLogin('ADMIN')}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-xs font-medium flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                        <div>
                          <div className="font-semibold">Demo Admin</div>
                          <div className="text-[10px] text-muted-foreground">Full refund & recon rights</div>
                        </div>
                      </div>
                      <span className="text-[9px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded font-mono">ADMIN</span>
                    </button>
                    <button
                      onClick={() => quickLogin('VIEWER')}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-xs font-medium flex items-center justify-between mt-1"
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <div>
                          <div className="font-semibold">Demo Viewer</div>
                          <div className="text-[10px] text-muted-foreground">Read-only monitoring</div>
                        </div>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded font-mono">VIEWER</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-muted-foreground hover:bg-muted"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-border flex flex-col gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.name}</span>
                </Link>
              );
            })}
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              <FileCode2 className="w-4 h-4" />
              <span>Swagger / OpenAPI Docs</span>
            </a>
          </div>
        )}
      </div>
    </header>
  );
};
