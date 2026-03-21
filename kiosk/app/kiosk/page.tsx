"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { MenuItem, CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { buildDisplayMenu } from "@/lib/menu-config";
import { MenuGrid } from "@/components/menu-grid";
import { getKioskChannel } from "@/lib/kiosk-channel";
import { Money, DeviceMobile, Trash, Minus, Plus } from "@phosphor-icons/react";

type FlowState =
  | "browsing"
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
  const totalCost = cart.reduce((s, i) => s + i.menuItem.cost * i.quantity, 0);

  const itemImageMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const drink of displayMenu) {
      for (const v of drink.variants) {
        map.set(v.menuItem.id, drink.image);
      }
    }
    return map;
  }, [displayMenu]);
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  const submitOrder = async (method: PaymentMethod, chip: number): Promise<string | null> => {
    setSubmitting(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          total,
          total_cost: totalCost,
          status: "pending",
          chip_number: chip,
          payment_method: method,
        })
        .select("id")
        .single();

      if (orderError || !order) throw orderError;

      const orderItems = cart.map((c) => ({
        order_id: order.id,
        menu_item_id: c.menuItem.id,
        item_name: c.menuItem.name,
        item_price: c.menuItem.price,
        item_cost: c.menuItem.cost,
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
    setFlowState("browsing");
  };

  const handlePay = async (method: PaymentMethod) => {
    setPaymentMethod(method);
    const num = await assignNextNumber();
    const orderId = await submitOrder(method, num);
    if (orderId) {
      setPendingOrderId(orderId);
      setFlowState(method === "gcash" ? "gcash_qr" : "waiting_cash");
    }
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

  // Browsing (default) — menu + cart panel with payment buttons
  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-white">
      <div className="px-6 pt-6 pb-2 shrink-0">
        <h1 className="text-4xl font-extrabold text-black tracking-tight">TAP TO ORDER</h1>
      </div>
      <div className="flex-1 min-h-0">
        <MenuGrid
          drinks={displayMenu}
          cart={cart}
          onAddItem={addItem}
        />
      </div>

      {/* Cart panel — appears when items are in cart */}
      {cart.length > 0 && (
        <div className="shrink-0 border-t-2 border-gray-100 bg-gray-50 px-5 pt-4 pb-5">
          {/* Cart items */}
          <div className="space-y-2 mb-4">
            {cart.map((c) => (
              <div key={c.menuItem.id} className="flex items-center gap-3 bg-white rounded-2xl p-3 border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={itemImageMap.get(c.menuItem.id) ?? ""}
                  alt={c.menuItem.name}
                  className="w-16 h-16 rounded-xl object-cover shrink-0 bg-gray-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xl text-black leading-tight truncate">{c.menuItem.name}</div>
                  <div className="text-lg text-gray-500 font-semibold">{formatCurrency(c.menuItem.price * c.quantity)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => updateQuantity(c.menuItem.id, -1)}
                    className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors active:scale-95"
                  >
                    <Minus size={22} weight="bold" />
                  </button>
                  <span className="w-10 text-center text-2xl font-extrabold text-black">{c.quantity}</span>
                  <button
                    onClick={() => updateQuantity(c.menuItem.id, 1)}
                    className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors active:scale-95"
                  >
                    <Plus size={22} weight="bold" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Payment row */}
          <div className="flex items-stretch gap-3">
            <button
              onClick={clearCart}
              className="w-16 rounded-2xl bg-gray-200 hover:bg-gray-300 text-gray-500 flex items-center justify-center transition-colors active:scale-95"
            >
              <Trash size={26} weight="bold" />
            </button>
            <button
              onClick={() => handlePay("cash")}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-4 py-7 rounded-2xl bg-black hover:bg-gray-800 text-white font-bold text-4xl transition-colors active:scale-[0.97] disabled:opacity-50"
            >
              <Money size={44} weight="bold" />
              <span>Cash</span>
              <span className="opacity-60 ml-1">{formatCurrency(total)}</span>
            </button>
            <button
              onClick={() => handlePay("gcash")}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-4 py-7 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-4xl transition-colors active:scale-[0.97] disabled:opacity-50"
            >
              <DeviceMobile size={44} weight="bold" />
              <span>GCash</span>
              <span className="opacity-60 ml-1">{formatCurrency(total)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
