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
  const [customerEmail, setCustomerEmail] = useState('alex.rivera@example.com');
  const [customerName, setCustomerName] = useState('Alex Rivera');

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCart({ [products[0].id]: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        throw new Error('Please select at least one item');
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Checkout &amp; Settlement
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Select items to test the full payment lifecycle: order creation, PayPal capture, and double-entry ledger posting.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Error:</span> {errorMsg}
          </div>
        </div>
      )}

      {/* Confirmation View when Captured */}
      {capturedPayment ? (
        <div className="p-6 sm:p-8 rounded-xl bg-card border border-border shadow-sm text-center max-w-xl mx-auto space-y-6">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div>
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Settlement Completed
            </div>
            <h2 className="text-xl font-bold text-foreground mt-1">
              Payment Confirmed &amp; Posted
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5">
              The double-entry journal has been recorded in the ledger atomically.
            </p>
          </div>

          {/* Details table */}
          <div className="bg-secondary/40 rounded-lg p-3.5 text-left text-xs font-mono space-y-2 border border-border">
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground font-sans">Payment ID:</span>
              <span className="font-semibold text-foreground truncate max-w-[200px]">{capturedPayment.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground font-sans">PayPal Order ID:</span>
              <span className="font-semibold text-foreground">{capturedPayment.providerOrderId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground font-sans">Capture Reference:</span>
              <span className="font-semibold text-foreground">
                {capturedPayment.providerCaptureId || 'CAP-CONFIRMED'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground font-sans">Total Paid:</span>
              <span className="font-bold text-foreground font-sans">
                {formatCents(capturedPayment.amountMinor)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground font-sans">Ledger Journals:</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400 font-sans">
                {capturedPayment.ledgerJournals?.length || 1} Journal Posted
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
            <Link
              to={`/transactions/${capturedPayment.id}`}
              className="px-4 py-2 rounded-lg bg-foreground text-background font-semibold text-xs flex items-center justify-center gap-1.5 hover:opacity-90"
            >
              <span>View Transaction &amp; Ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={resetCheckout}
              className="px-4 py-2 rounded-lg border border-border bg-card hover:bg-secondary text-foreground font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Checkout Again</span>
            </button>
          </div>
        </div>
      ) : (
        /* Normal Checkout Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Product Selection */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                <span>Available Items</span>
              </h2>
              <span className="text-[11px] text-muted-foreground">
                Authoritative pricing in Postgres
              </span>
            </div>

            {isProductsLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-lg border border-border">
                Loading product catalog...
              </div>
            ) : (
              <div className="space-y-2.5">
                {products.map((product) => {
                  const qty = cart[product.id] || 0;
                  return (
                    <div
                      key={product.id}
                      className={`p-3.5 rounded-lg border transition-all ${
                        qty > 0
                          ? 'bg-card border-foreground/30 shadow-xs'
                          : 'bg-card/40 border-border hover:border-border/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-semibold text-foreground truncate">{product.name}</h3>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                              {product.sku}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                            {product.description}
                          </p>
                          <div className="mt-1.5 text-xs font-bold text-foreground">
                            {formatCents(product.unitAmountMinor)}
                          </div>
                        </div>

                        {/* Quantity Counter */}
                        <div className="flex items-center gap-1.5 shrink-0 bg-secondary/80 p-0.5 rounded-md border border-border">
                          <button
                            onClick={() => updateQuantity(product.id, -1)}
                            disabled={qty === 0}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:hover:bg-transparent"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center font-semibold text-xs">{qty}</span>
                          <button
                            onClick={() => updateQuantity(product.id, 1)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
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
            <div className="p-5 rounded-xl bg-card border border-border shadow-xs space-y-4">
              <h2 className="text-sm font-semibold text-foreground pb-2 border-b border-border">Order Summary</h2>

              {/* Customer Info Form */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 rounded-md bg-background border border-input text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Full Name"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Customer Email</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 rounded-md bg-background border border-input text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              {/* Pricing breakdown */}
              <div className="pt-3 border-t border-border space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Items ({cartItemCount})</span>
                  <span>{formatCents(displayTotalMinor)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Processing Fee</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Free (Sandbox)</span>
                </div>
                <div className="pt-2 border-t border-border flex justify-between items-baseline">
                  <span className="font-semibold text-foreground text-xs">Total Due</span>
                  <span className="font-extrabold text-base text-foreground font-mono">
                    {formatCents(displayTotalMinor)}
                  </span>
                </div>
              </div>

              {/* Action: Initiate PayPal Order or Capture */}
              {!createdOrderData ? (
                <button
                  onClick={handleInitiatePayment}
                  disabled={cartItemCount === 0 || isCreatingOrder}
                  className="w-full py-2.5 px-4 rounded-lg bg-foreground text-background font-semibold text-xs flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isCreatingOrder ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating Order...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Create PayPal Order</span>
                    </>
                  )}
                </button>
              ) : (
                /* Step 2: PayPal Order Created -> Execute Sandbox Capture */
                <div className="space-y-3 pt-1">
                  <div className="p-3 rounded-lg bg-secondary/60 border border-border text-xs space-y-1 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-sans">PayPal Order:</span>
                      <span className="font-semibold text-foreground">{createdOrderData.providerOrderId}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-sans">
                      Status: <StatusBadge status="PENDING_APPROVAL" size="sm" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {createdOrderData.approvalUrl && (
                      <a
                        href={createdOrderData.approvalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 px-3 rounded-md bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Approve on PayPal Sandbox</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    <button
                      onClick={handleCapturePayment}
                      disabled={isCapturing}
                      className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {isCapturing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Capturing &amp; Settling...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Capture Payment &amp; Post to Ledger</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground text-center pt-1">
                <Lock className="w-3 h-3 text-muted-foreground" />
                <span>Idempotency-Key header attached to all requests</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
