import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { SandboxBanner } from './components/layout/SandboxBanner';

// Eager-load the landing page (first paint)
import { LandingPage } from './pages/LandingPage';

// Lazy-load all other routes for code-splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then(m => ({ default: m.CheckoutPage })));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then(m => ({ default: m.TransactionsPage })));
const TransactionDetailsPage = lazy(() => import('./pages/TransactionDetailsPage').then(m => ({ default: m.TransactionDetailsPage })));
const LedgerPage = lazy(() => import('./pages/LedgerPage').then(m => ({ default: m.LedgerPage })));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage').then(m => ({ default: m.ReconciliationPage })));
const WebhooksPage = lazy(() => import('./pages/WebhooksPage').then(m => ({ default: m.WebhooksPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      <SandboxBanner />
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/transactions/:id" element={<TransactionDetailsPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/reconciliation" element={<ReconciliationPage />} />
            <Route path="/webhooks" element={<WebhooksPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<LandingPage />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
};
