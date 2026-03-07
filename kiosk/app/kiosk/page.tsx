"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { MenuItem, CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { buildDisplayMenu } from "@/lib/menu-config";
import { MenuGrid } from "@/components/menu-grid";
import { getKioskChannel } from "@/lib/kiosk-channel";

type FlowState =
  | "browsing"
  | "reviewing"
  | "payment"
  | "waiting_cash"
  | "gcash_qr"
  | "success";

type PaymentMethod = "cash" | "gcash";

const MAX_BLOCK = 20;

export default function KioskPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const displayMenu = useMemo(() => buildDisplayMenu(menuItems), [menuItems]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [flowState, setFlowState] = useState<FlowState>("browsing");
  const [chipNumber, setChipNumber] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [gcashOverride, setGcashOverride] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase
      .from("menu_items")
      .select("*")
      .eq("is_available", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setMenuItems(data);
      });
  }, []);

  // Fetch next block number (last used today % 20 + 1)
  const assignNextNumber = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("chip_number")
      .gte("created_at", today.toISOString())
      .not("chip_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.chip_number ?? 0;
    const next = (last % MAX_BLOCK) + 1;
    setChipNumber(next);
    return next;
  }, []);

  // Preload and cache GCash QR image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setQrLoaded(true);
    img.src = "/gcash-qr.png";
  }, []);

  // Listen for GCash display override from /orders
  useEffect(() => {
    const channel = getKioskChannel();
    channel
      .on("broadcast", { event: "display" }, ({ payload }) => {
        if (payload.mode === "gcash_qr") setGcashOverride(true);
        if (payload.mode === "normal") setGcashOverride(false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Auto-reset from success after 3s
  useEffect(() => {
    if (flowState === "success") {
      const timer = setTimeout(() => {
        setCart([]);
        setChipNumber(0);
        setPaymentMethod("cash");
        setPendingOrderId(null);
        setFlowState("browsing");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [flowState]);

  // Poll for order acceptance (cash & gcash)
  useEffect(() => {
    if ((flowState === "waiting_cash" || flowState === "gcash_qr") && pendingOrderId) {
      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from("orders")
          .select("status")
          .eq("id", pendingOrderId)
          .single();
        if (data && data.status !== "pending") {
          if (data.status === "cancelled") {
            setCart([]);
            setChipNumber(0);
            setPaymentMethod("cash");
            setPendingOrderId(null);
            setFlowState("browsing");
          } else {
            setFlowState("success");
          }
        }
      }, 2500);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [flowState, pendingOrderId]);

  const addItem = useCallback((item: MenuItem, qty: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItem.id === item.id ? { ...c, quantity: c.quantity + qty } : c
        );
      }
      return [...prev, { menuItem: item, quantity: qty }];
    });
  }, []);

  const updateQuantity = useCallback((menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.menuItem.id === menuItemId
            ? { ...c, quantity: c.quantity + delta }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const total = cart.reduce((s, i) => s + i.menuItem.price * i.quantity, 0);
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  const itemImageMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const drink of displayMenu) {
      for (const v of drink.variants) {
        map.set(v.menuItem.id, drink.image);
      }
    }
    return map;
  }, [displayMenu]);

  const submitOrder = async (method?: PaymentMethod): Promise<string | null> => {
    const pm = method ?? paymentMethod;
    setSubmitting(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          total,
          total_cost: 0,
          status: "pending",
          chip_number: chipNumber,
          payment_method: pm,
        })
        .select("id")
        .single();

      if (orderError || !order) throw orderError;

      const orderItems = cart.map((c) => ({
        order_id: order.id,
        menu_item_id: c.menuItem.id,
        item_name: c.menuItem.name,
        item_price: c.menuItem.price,
        item_cost: 0,
        quantity: c.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return order.id;
    } catch (err) {
      console.error("Order submission failed:", err);
      alert("Failed to place order. Please try again.");
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const cancelPendingOrder = async () => {
    if (pendingOrderId) {
      await supabase.from("order_items").delete().eq("order_id", pendingOrderId);
      await supabase.from("orders").delete().eq("id", pendingOrderId);
      setPendingOrderId(null);
    }
    setFlowState("payment");
  };

  const goToPayment = async () => {
    await assignNextNumber();
    setFlowState("payment");
  };

  // GCash QR override from /orders
  if (gcashOverride) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh overflow-hidden bg-white p-8">
        <h2 className="text-3xl font-bold text-black mb-2">Scan to pay with GCash</h2>
        <div className="mb-6 flex-1 max-h-[70vh] flex items-center justify-center">
          {!qrLoaded && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-gray-400 text-sm">Loading QR...</span>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gcash-qr.png"
            alt="GCash QR Code"
            className={`h-full object-contain rounded-2xl ${qrLoaded ? "" : "hidden"}`}
            onLoad={() => setQrLoaded(true)}
          />
        </div>
      </div>
    );
  }

  // Success screen
  if (flowState === "success") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh overflow-hidden bg-white p-8">
        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-14 h-14 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-4xl font-extrabold text-black mb-2">Order Placed!</h1>
        <p className="text-xl text-gray-400 mb-2">Your block number</p>
        <div className="w-40 h-40 rounded-3xl bg-black flex items-center justify-center mb-4">
          <span className="text-8xl font-extrabold text-white">{chipNumber}</span>
        </div>
        <p className="text-lg text-gray-500 mb-4">Return this block to claim your order.</p>
        <div className="text-4xl font-extrabold text-black mb-4">{formatCurrency(total)}</div>
        <div className={`inline-flex items-center px-4 py-1.5 rounded-full text-base font-bold mb-6 ${
          paymentMethod === "gcash" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
        }`}>
          {paymentMethod === "gcash" ? "GCash" : "Cash"}
        </div>
        <div className="w-full max-w-sm space-y-1">
          {cart.map((c) => (
            <div key={c.menuItem.id} className="flex justify-between text-lg text-gray-700">
              <span>{c.quantity}x {c.menuItem.name}</span>
              <span className="font-semibold">{formatCurrency(c.menuItem.price * c.quantity)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Waiting for cash payment acceptance
  if (flowState === "waiting_cash") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh overflow-hidden bg-white p-8">
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6 animate-pulse">
          <svg className="w-10 h-10 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-black mb-2">Waiting for payment confirmation...</h2>
        <p className="text-xl text-gray-500 mb-6">Please pay at the counter</p>
        <div className="w-32 h-32 rounded-3xl bg-black flex items-center justify-center mb-4">
          <span className="text-7xl font-extrabold text-white">{chipNumber}</span>
        </div>
        <div className="text-4xl font-extrabold text-black mb-8">{formatCurrency(total)}</div>
        <button
          onClick={cancelPendingOrder}
          className="px-8 py-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-black font-bold text-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // GCash QR screen (also serves as waiting screen — polls for confirmation)
  if (flowState === "gcash_qr") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh overflow-hidden bg-white p-8">
        <h2 className="text-3xl font-bold text-black mb-2">Scan to pay with GCash</h2>
        <div className="text-4xl font-extrabold text-black mb-6">{formatCurrency(total)}</div>

        <div className="mb-6 flex-1 max-h-[60vh] flex items-center justify-center">
          {!qrLoaded && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-gray-400 text-sm">Loading QR...</span>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gcash-qr.png"
            alt="GCash QR Code"
            className={`h-full object-contain rounded-2xl ${qrLoaded ? "" : "hidden"}`}
            onLoad={() => setQrLoaded(true)}
          />
        </div>

        <p className="text-lg text-gray-400 animate-pulse">Waiting for confirmation...</p>
      </div>
    );
  }

  // Payment method selection
  if (flowState === "payment") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh overflow-hidden bg-white p-8">
        <button
          onClick={() => setFlowState("reviewing")}
          className="self-start mb-6 text-gray-400 hover:text-black transition-colors flex items-center gap-2 text-lg"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="text-6xl font-extrabold text-black mb-4">{formatCurrency(total)}</div>

        <h2 className="text-2xl font-bold text-gray-500 mb-8">How would you like to pay?</h2>

        <div className="flex gap-4 w-full max-w-md">
          <button
            onClick={async () => {
              setPaymentMethod("cash");
              const orderId = await submitOrder("cash");
              if (orderId) {
                setPendingOrderId(orderId);
                setFlowState("waiting_cash");
              }
            }}
            disabled={submitting}
            className="flex-1 flex flex-col items-center gap-4 p-8 rounded-2xl bg-white border-2 border-gray-200 hover:border-black transition-all active:scale-95 disabled:opacity-50"
          >
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-black">Cash</span>
            <span className="text-base text-gray-500">Pay at the counter</span>
          </button>

          <button
            onClick={async () => {
              setPaymentMethod("gcash");
              const orderId = await submitOrder("gcash");
              if (orderId) {
                setPendingOrderId(orderId);
                setFlowState("gcash_qr");
              }
            }}
            disabled={submitting}
            className="flex-1 flex flex-col items-center gap-4 p-8 rounded-2xl bg-white border-2 border-gray-200 hover:border-black transition-all active:scale-95 disabled:opacity-50"
          >
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-black">GCash</span>
            <span className="text-base text-gray-500">Scan QR to pay</span>
          </button>
        </div>
      </div>
    );
  }

  // Reviewing cart
  if (flowState === "reviewing") {
    return (
      <div className="flex flex-col h-dvh overflow-hidden bg-white p-6">
        <h2 className="text-3xl font-bold text-black mb-4 shrink-0">Review Your Order</h2>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {cart.map((item) => (
            <div
              key={item.menuItem.id}
              className="flex items-center gap-4 bg-gray-50 rounded-2xl p-4 border border-gray-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={itemImageMap.get(item.menuItem.id) ?? ""}
                alt={item.menuItem.name}
                className="w-24 h-24 rounded-xl object-cover shrink-0 bg-gray-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-xl text-black leading-tight">{item.menuItem.name}</div>
                <div className="text-2xl font-extrabold text-black mt-1">
                  {formatCurrency(item.menuItem.price * item.quantity)}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => updateQuantity(item.menuItem.id, -1)}
                  className="w-14 h-14 rounded-xl bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-3xl font-bold text-black active:scale-95 transition-transform"
                >
                  -
                </button>
                <span className="w-8 text-center text-2xl font-extrabold text-black">
                  {item.quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.menuItem.id, 1)}
                  className="w-14 h-14 rounded-xl bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-3xl font-bold text-black active:scale-95 transition-transform"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-gray-200 pt-5 mt-4">
          <div className="flex justify-between items-end mb-5">
            <div>
              <span className="text-sm text-gray-400 uppercase tracking-wide">Total</span>
              <div className="text-lg text-gray-500">
                {totalItems} item{totalItems !== 1 ? "s" : ""}
              </div>
            </div>
            <span className="text-5xl font-extrabold text-black">{formatCurrency(total)}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setFlowState("browsing")}
              className="flex-1 py-6 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-2xl transition-colors"
            >
              Order More
            </button>
            <button
              onClick={goToPayment}
              disabled={cart.length === 0}
              className="flex-[2] py-6 rounded-2xl bg-black hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-3xl transition-colors"
            >
              Checkout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Browsing (default)
  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-white">
      <div className="p-4 pb-0">
        <p className="text-gray-500 text-lg">Tap items to add to your order</p>
      </div>
      <div className="flex-1 min-h-0">
        <MenuGrid
          drinks={displayMenu}
          cart={cart}
          onAddItem={addItem}
        />
      </div>
      <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-5 flex items-center justify-between">
        <div>
          <span className="text-2xl text-gray-500">
            {totalItems > 0 ? `${totalItems} item${totalItems !== 1 ? "s" : ""}` : "No items"}
          </span>
          <span className="text-4xl font-extrabold text-black ml-4">
            {formatCurrency(total)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="px-6 py-5 rounded-2xl text-gray-400 hover:text-red-500 font-bold text-2xl transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setFlowState("reviewing")}
            disabled={cart.length === 0}
            className="px-12 py-5 rounded-2xl bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 text-white font-bold text-3xl transition-colors active:scale-[0.98]"
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
