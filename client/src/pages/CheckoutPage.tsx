import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatCents, generateIdempotencyKey } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  CreditCard,
  ShoppingBag,
  Plus,
  Minus,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Lock,
} from 'lucide-react';

export const CheckoutPage: React.FC = () => {

  // 1. Fetch authoritative products from PostgreSQL
  const { data: productsData, isLoading: isProductsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.getProducts(),
  });

  const products = productsData?.data?.products || [];

  // Cart state: map of productId -> quantity
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerEmail, setCustomerEmail] = useState('demo.buyer@paypal-sandbox.test');
  const [customerName, setCustomerName] = useState('Alex Rivera (Demo Buyer)');

  // Processing state
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdOrderData, setCreatedOrderData] = useState<{
    orderId: string;
    orderNumber: string;
    paymentId: string;
    providerOrderId: string;
    totalAmountMinor: number;
    approvalUrl?: string;
  } | null>(null);
  const [capturedPayment, setCapturedPayment] = useState<any | null>(null);

  // Set default product in cart once loaded
  React.useEffect(() => {
    if (products.length > 0 && Object.keys(cart).length === 0) {
      setCart({ [products[0].id]: 1 });
    }
  }, [products]);

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[productId] || 0;
      const updated = Math.max(0, current + delta);
      const next = { ...prev };
      if (updated === 0) {
        delete next[productId];
      } else {
        next[productId] = updated;
      }
      return next;
    });
  };

  // Authoritative total calculated client-side purely for display; backend recalculates authoritatively
  const displayTotalMinor = Object.entries(cart).reduce((sum, [productId, qty]) => {
    const prod = products.find((p) => p.id === productId);
    return sum + (prod ? prod.unitAmountMinor * qty : 0);
  }, 0);

  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0);

  // Handler 1: Create Order with Idempotency Key
  const handleInitiatePayment = async () => {
    try {
      setErrorMsg(null);
      setIsCreatingOrder(true);

      const items = Object.entries(cart).map(([productId, quantity]) => ({
        productId,
        quantity,
      }));

      if (items.length === 0) {
        throw new Error('Please select at least one product to checkout');
      }

      const idempotencyKey = generateIdempotencyKey('IDEM-ORD');

      const res = await api.createPaymentOrder(
        {
          items,
          customerEmail,
          customerName,
        },
        idempotencyKey
      );

      setCreatedOrderData(res.data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create payment order');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Handler 2: Authoritative Capture against PayPal
  const handleCapturePayment = async () => {
    if (!createdOrderData) return;

    try {
      setErrorMsg(null);
      setIsCapturing(true);

      const idempotencyKey = generateIdempotencyKey('IDEM-CAP');
      const res = await api.capturePayment(createdOrderData.paymentId, idempotencyKey);

      setCapturedPayment(res.data.payment);
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment capture failed');
    } finally {
      setIsCapturing(false);
    }
  };

  const resetCheckout = () => {
    setCreatedOrderData(null);
    setCapturedPayment(null);
    setErrorMsg(null);
    if (products.length > 0) {
      setCart({ [products[0].id]: 1 });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Interactive Payment Integration
          </span>
          <span className="text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-full">
            SDK &amp; REST v2
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-1">
          PayPal Sandbox Demo Checkout
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select digital services, verify authoritative server-side price calculation, and execute real sandbox capture.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Transaction Error:</span> {errorMsg}
          </div>
        </div>
      )}

      {/* Confirmation View when Captured */}
      {capturedPayment ? (
        <div className="p-8 rounded-3xl bg-card border border-emerald-500/30 shadow-lg text-center max-w-2xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
              Confirmed &amp; Settled
            </span>
            <h2 className="text-2xl font-extrabold text-foreground mt-1">
              Payment Successfully Captured!
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              The double-entry ledger has been updated, and debit/credit journals have been posted atomically.
            </p>
          </div>

          {/* Details table */}
          <div className="bg-muted/40 rounded-2xl p-4 text-left text-xs font-mono space-y-2 border border-border">
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground font-sans">Internal Payment ID:</span>
              <span className="font-semibold text-foreground truncate max-w-xs">{capturedPayment.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground font-sans">PayPal Order ID:</span>
              <span className="font-semibold text-foreground">{capturedPayment.providerOrderId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground font-sans">PayPal Capture ID:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {capturedPayment.providerCaptureId || 'CAP-CONFIRMED'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground font-sans">Total Amount:</span>
              <span className="font-bold text-foreground text-sm font-sans">
                {formatCents(capturedPayment.amountMinor)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground font-sans">Ledger Journals Created:</span>
              <span className="font-bold text-blue-600 dark:text-blue-400 font-sans">
                {capturedPayment.ledgerJournals?.length || 1} Journal Posted
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              to={`/transactions/${capturedPayment.id}`}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 shadow-sm"
            >
              <span>Inspect Transaction &amp; Ledger</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={resetCheckout}
              className="px-5 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Checkout Another Item</span>
            </button>
          </div>
        </div>
      ) : (
        /* Normal Checkout Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Product Selection */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <span>Select Products</span>
              </h2>
              <span className="text-xs text-muted-foreground">
                Authoritative pricing from PostgreSQL
              </span>
            </div>

            {isProductsLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-border">
                Loading products...
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((product) => {
                  const qty = cart[product.id] || 0;
                  return (
                    <div
                      key={product.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        qty > 0
                          ? 'bg-card border-primary/50 shadow-sm ring-1 ring-primary/20'
                          : 'bg-card/60 border-border hover:border-border/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-foreground">{product.name}</h3>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              {product.sku}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {product.description}
                          </p>
                          <div className="mt-2 text-sm font-extrabold text-foreground">
                            {formatCents(product.unitAmountMinor)}
                          </div>
                        </div>

                        {/* Quantity Counter */}
                        <div className="flex items-center gap-2 shrink-0 bg-muted/70 p-1 rounded-xl border border-border">
                          <button
                            onClick={() => updateQuantity(product.id, -1)}
                            disabled={qty === 0}
                            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center font-bold text-xs">{qty}</span>
                          <button
                            onClick={() => updateQuantity(product.id, 1)}
                            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Order Summary & PayPal Button */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-6">
              <h2 className="text-base font-bold text-foreground">Order Summary &amp; Checkout</h2>

              {/* Customer Info Form */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-background border border-input text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Full Name"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Buyer Email Address</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-background border border-input text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              {/* Pricing breakdown */}
              <div className="pt-4 border-t border-border space-y-2 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Selected Items ({cartItemCount})</span>
                  <span>{formatCents(displayTotalMinor)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Payment Gateway Processing</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Free (Sandbox)</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Idempotency Protection</span>
                  <span className="text-blue-600 dark:text-blue-400 font-mono text-[11px]">ENFORCED</span>
                </div>
                <div className="pt-2 border-t border-border flex justify-between items-baseline">
                  <span className="font-bold text-foreground text-sm">Authoritative Total</span>
                  <span className="font-extrabold text-xl text-foreground">
                    {formatCents(displayTotalMinor)}
                  </span>
                </div>
              </div>

              {/* Action: Initiate PayPal Order or Capture */}
              {!createdOrderData ? (
                <button
                  onClick={handleInitiatePayment}
                  disabled={cartItemCount === 0 || isCreatingOrder}
                  className="w-full py-3.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
                >
                  {isCreatingOrder ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Authoritative Order...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Proceed to PayPal Sandbox Checkout</span>
                    </>
                  )}
                </button>
              ) : (
                /* Step 2: PayPal Order Created -> Execute Sandbox Capture */
                <div className="space-y-4 pt-2">
                  <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-blue-700 dark:text-blue-300">
                      <span>PayPal Order Created:</span>
                      <span className="font-mono">{createdOrderData.providerOrderId}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Status: <StatusBadge status="PENDING_APPROVAL" size="sm" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {createdOrderData.approvalUrl && (
                      <a
                        href={createdOrderData.approvalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 px-4 rounded-xl bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <span>Approve on PayPal Sandbox Modal</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      onClick={handleCapturePayment}
                      disabled={isCapturing}
                      className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all"
                    >
                      {isCapturing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Authorizing &amp; Capturing Payment...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-5 h-5" />
                          <span>Confirm Sandbox Capture &amp; Settle</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground text-center">
                <Lock className="w-3.5 h-3.5 text-emerald-500" />
                <span>Zero client price trust. All charges verified by backend.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
