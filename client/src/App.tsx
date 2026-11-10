import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { SandboxBanner } from './components/layout/SandboxBanner';

import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { TransactionDetailsPage } from './pages/TransactionDetailsPage';
import { LedgerPage } from './pages/LedgerPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { WebhooksPage } from './pages/WebhooksPage';
import { LoginPage } from './pages/LoginPage';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      <SandboxBanner />
      <Navbar />
      <main className="flex-1">
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
      </main>
      <Footer />
    </div>
  );
};
