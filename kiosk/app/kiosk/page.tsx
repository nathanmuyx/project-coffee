"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { MenuItem, CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { buildDisplayMenu } from "@/lib/menu-config";
import { MenuGrid } from "@/components/menu-grid";
import { CartPanel } from "@/components/cart-panel";
import { ChipNumberInput } from "@/components/chip-number-input";

type FlowState =
  | "browsing"
  | "reviewing"
  | "payment"
  | "entering_chip"
  | "confirming"
  | "success";

type PaymentMethod = "cash" | "gcash";

export default function KioskPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const displayMenu = useMemo(() => buildDisplayMenu(menuItems), [menuItems]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [flowState, setFlowState] = useState<FlowState>("browsing");
  const [chipNumber, setChipNumber] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (flowState === "success") {
      const timer = setTimeout(() => {
        setCart([]);
        setChipNumber(0);
        setPaymentMethod("cash");
        setFlowState("browsing");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [flowState]);

  const addItem = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
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

  const submitOrder = async () => {
    setSubmitting(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          total,
          total_cost: 0,
          status: "pending",
          chip_number: chipNumber,
          payment_method: paymentMethod,
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

      setFlowState("success");
    } catch (err) {
      console.error("Order submission failed:", err);
      alert("Failed to place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Success screen
  if (flowState === "success") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white p-8">
        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
          <svg className="w-14 h-14 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-5xl font-extrabold text-black mb-2">Order Placed!</h1>
        <p className="text-2xl text-gray-500 mb-6">Your chip number is</p>
        <span className="text-8xl font-extrabold text-black mb-6">
          #{chipNumber}
        </span>
        {paymentMethod === "cash" && (
          <p className="text-xl text-gray-500">Please pay at the counter.</p>
        )}
        {paymentMethod === "gcash" && (
          <p className="text-xl text-black font-semibold">GCash payment noted.</p>
        )}
        <p className="text-gray-400 mt-4">This screen will reset shortly.</p>
      </div>
    );
  }

  // Confirming screen
  if (flowState === "confirming") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white p-8">
        <h2 className="text-3xl font-bold text-black mb-8">Confirm Your Order</h2>
        <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 w-full max-w-sm text-center">
          <div className="text-6xl font-extrabold text-black mb-4">
            #{chipNumber}
          </div>
          <div className="text-xl text-gray-500 mb-1">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </div>
          <div className="text-4xl font-extrabold text-black mb-2">{formatCurrency(total)}</div>
          <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-base font-bold mb-4 ${
            paymentMethod === "gcash"
              ? "bg-gray-100 text-black"
              : "bg-gray-100 text-black"
          }`}>
            {paymentMethod === "gcash" ? "GCash" : "Cash"}
          </div>
          {paymentMethod === "gcash" && (
            <div className="mb-4">
              <p className="text-base text-gray-500 mb-3">Scan to pay with GCash</p>
              <div className="bg-white rounded-xl p-4 inline-block border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/gcash-qr.png"
                  alt="GCash QR Code"
                  className="w-48 h-48 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.innerHTML =
                      '<div class="w-48 h-48 flex items-center justify-center text-gray-400 text-sm">QR placeholder<br/>Add gcash-qr.png to /public</div>';
                  }}
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            {cart.map((c) => (
              <div key={c.menuItem.id} className="flex justify-between text-lg text-gray-700">
                <span>{c.quantity}x {c.menuItem.name}</span>
                <span className="font-semibold">{formatCurrency(c.menuItem.price * c.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-8 w-full max-w-sm">
          <button
            onClick={() => setFlowState("entering_chip")}
            className="flex-1 py-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-black font-bold text-lg transition-colors"
          >
            Back
          </button>
          <button
            onClick={submitOrder}
            disabled={submitting}
            className="flex-1 py-4 rounded-xl bg-black hover:bg-gray-800 text-white disabled:opacity-50 font-bold text-lg transition-colors"
          >
            {submitting ? "Placing..." : "Place Order"}
          </button>
        </div>
      </div>
    );
  }

  // Chip number input
  if (flowState === "entering_chip") {
    return (
      <div className="h-screen bg-white">
        <ChipNumberInput
          onSubmit={(num) => {
            setChipNumber(num);
            setFlowState("confirming");
          }}
          onBack={() => setFlowState("payment")}
        />
      </div>
    );
  }

  // Payment method selection
  if (flowState === "payment") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white p-8">
        <button
          onClick={() => setFlowState("reviewing")}
          className="self-start mb-6 text-gray-400 hover:text-black transition-colors flex items-center gap-2 text-lg"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h2 className="text-3xl font-bold text-black mb-2">How would you like to pay?</h2>
        <p className="text-2xl text-gray-500 mb-8">{formatCurrency(total)}</p>

        <div className="flex gap-4 w-full max-w-md">
          <button
            onClick={() => {
              setPaymentMethod("cash");
              setFlowState("entering_chip");
            }}
            className="flex-1 flex flex-col items-center gap-4 p-8 rounded-2xl bg-white border-2 border-gray-200 hover:border-black transition-all active:scale-95"
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
            onClick={() => {
              setPaymentMethod("gcash");
              setFlowState("entering_chip");
            }}
            className="flex-1 flex flex-col items-center gap-4 p-8 rounded-2xl bg-white border-2 border-gray-200 hover:border-black transition-all active:scale-95"
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
      <div className="flex flex-col h-screen bg-white p-6">
        <button
          onClick={() => setFlowState("browsing")}
          className="self-start mb-4 text-gray-400 hover:text-black transition-colors flex items-center gap-2 text-lg"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Add More Items
        </button>
        <h2 className="text-3xl font-bold text-black mb-4">Review Your Order</h2>
        <div className="flex-1 overflow-y-auto space-y-3">
          {cart.map((item) => (
            <div
              key={item.menuItem.id}
              className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200"
            >
              <div>
                <div className="font-bold text-lg text-black">{item.menuItem.name}</div>
                <div className="text-base text-gray-500">
                  {formatCurrency(item.menuItem.price)} each
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateQuantity(item.menuItem.id, -1)}
                  className="w-12 h-12 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-2xl font-bold text-black"
                >
                  -
                </button>
                <span className="w-8 text-center text-xl font-bold text-black">
                  {item.quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.menuItem.id, 1)}
                  className="w-12 h-12 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-2xl font-bold text-black"
                >
                  +
                </button>
                <span className="w-24 text-right font-bold text-xl text-black">
                  {formatCurrency(item.menuItem.price * item.quantity)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-lg text-gray-500">
              {totalItems} item{totalItems !== 1 ? "s" : ""}
            </span>
            <span className="text-3xl font-extrabold text-black">{formatCurrency(total)}</span>
          </div>
          <button
            onClick={() => setFlowState("payment")}
            disabled={cart.length === 0}
            className="w-full py-4 rounded-xl bg-black hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xl transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Browsing (default)
  return (
    <div className="h-screen bg-white">
      <div className="flex flex-col h-full pr-80">
        <div className="p-4 pb-0">
          <p className="text-gray-500 text-lg">Tap items to add to your order</p>
        </div>
        <MenuGrid
          drinks={displayMenu}
          onAddItem={addItem}
        />
      </div>
      <CartPanel
        items={cart}
        onUpdateQuantity={updateQuantity}
        onContinue={() => setFlowState("reviewing")}
        onClear={clearCart}
      />
    </div>
  );
}
