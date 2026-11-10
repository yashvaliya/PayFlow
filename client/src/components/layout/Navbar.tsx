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
  Sun,
  Moon,
  LogOut,
  UserCheck,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, quickLogin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Transactions', path: '/transactions', icon: Receipt },
    { name: 'Checkout', path: '/checkout', icon: CreditCard },
    { name: 'Ledger', path: '/ledger', icon: BookOpenCheck },
    { name: 'Reconciliation', path: '/reconciliation', icon: Scale },
    { name: 'Webhooks', path: '/webhooks', icon: Radio },
  ];

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 font-bold tracking-tight text-foreground hover:opacity-90">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-900 shadow-sm">
                <CreditCard className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-xl text-foreground">
                PayFlow
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-0.5">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-secondary text-foreground font-semibold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Quick Demo Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setDemoMenuOpen(!demoMenuOpen)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border bg-card hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span>{user ? user.name.split(' ')[0] : 'Demo Accounts'}</span>
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
              </button>

              {demoMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-lg bg-card border border-border shadow-lg p-1.5 text-xs z-50 space-y-1"
                  onMouseLeave={() => setDemoMenuOpen(false)}
                >
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Fast Demo Sign In
                  </div>
                  <button
                    onClick={() => {
                      quickLogin('ADMIN');
                      setDemoMenuOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-md hover:bg-secondary transition-colors flex flex-col"
                  >
                    <span className="font-semibold text-foreground">Yash (Admin)</span>
                    <span className="text-[10px] text-muted-foreground">Full refund &amp; reconciliation access</span>
                  </button>
                  <button
                    onClick={() => {
                      quickLogin('VIEWER');
                      setDemoMenuOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-md hover:bg-secondary transition-colors flex flex-col"
                  >
                    <span className="font-semibold text-foreground">Alex (Auditor)</span>
                    <span className="text-[10px] text-muted-foreground">Read-only auditing &amp; charts</span>
                  </button>
                </div>
              )}
            </div>

            {/* User status or Sign In */}
            {user ? (
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-semibold">
                  {user.role}
                </span>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Sign in</span>
              </Link>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Mobile Menu Trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-md md:hidden text-muted-foreground hover:text-foreground hover:bg-secondary"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background px-4 py-3 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium ${
                  isActive ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{link.name}</span>
              </Link>
            );
          })}
          <div className="pt-2 border-t border-border flex gap-2">
            <button
              onClick={() => {
                quickLogin('ADMIN');
                setMobileMenuOpen(false);
              }}
              className="flex-1 py-1.5 text-xs text-center rounded bg-secondary text-foreground font-medium"
            >
              Admin Demo
            </button>
            <button
              onClick={() => {
                quickLogin('VIEWER');
                setMobileMenuOpen(false);
              }}
              className="flex-1 py-1.5 text-xs text-center rounded bg-secondary text-foreground font-medium"
            >
              Auditor Demo
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
