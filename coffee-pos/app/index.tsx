import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { CheckCircle, X, Plus, Minus } from 'phosphor-react-native';
import dayjs from 'dayjs';
import { supabase } from '../lib/supabase';
import { getCachedMenu, setCachedMenu } from '../lib/storage';
import { formatCurrency } from '../lib/format';
import type { CartItem, MenuItem, Order, QueueItem } from '../lib/types';
import {
  borderRadius,
  categoryConfig,
  colors,
  fontSize,
  fontWeight,
  queueColors,
  shadow,
  spacing,
  type Category,
} from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH >= 768;

// Ingredient-based color dots for POS cards
const DOT_RULES = [
  { keywords: ['iced', 'ice'], color: '#4A9EE5' },          // blue
  { keywords: ['caramel'], color: '#8B5E3C' },               // brown
  { keywords: ['condensed', 'spanish'], color: '#C4956A' },  // light brown
  { keywords: ['honey', 'citrus'], color: '#D4A537' },       // golden amber
];

let queueCounter = 1;

function createQueue(colorIndex: number): QueueItem {
  queueCounter++;
  return {
    id: `q-${Date.now()}-${Math.random()}`,
    label: `Customer ${queueCounter - 1}`,
    colorIndex,
    cart: [],
  };
}

// ─── Success Overlay ───
function SuccessOverlay({
  orderLabel,
  customerName,
  total,
  change,
  onDismiss,
}: {
  orderLabel: string;
  customerName: string;
  total: number;
  change: number;
  onDismiss: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
    const timer = setTimeout(onDismiss, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.overlayBg, { opacity: fadeAnim }]}>
      <Animated.View
        style={[styles.overlayCard, { transform: [{ scale: scaleAnim }] }]}
      >
        <View style={styles.overlayCheckCircle}>
          <CheckCircle size={32} color={colors.success} weight="fill" />
        </View>
        <Text style={styles.overlayTitle}>{orderLabel}</Text>
        <Text style={styles.overlayCustomer}>{customerName}</Text>
        <Text style={styles.overlayTotal}>{formatCurrency(total)}</Text>
        {change > 0 && (
          <Text style={styles.overlayChange}>Change: {formatCurrency(change)}</Text>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// ─── Main POS Screen ───
export default function POSScreen() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [queues, setQueues] = useState<QueueItem[]>([
    { id: 'q-initial', label: 'Customer 1', colorIndex: 0, cart: [] },
  ]);
  const [activeQueueId, setActiveQueueId] = useState('q-initial');
  const [successInfo, setSuccessInfo] = useState<{
    orderLabel: string;
    customerName: string;
    total: number;
    change: number;
  } | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [itemDots, setItemDots] = useState<Map<string, string[]>>(new Map());
  const [showPayment, setShowPayment] = useState(false);
  const [received, setReceived] = useState('');

  // Daily sales
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const navigation = useNavigation();

  const activeQueue = queues.find((q) => q.id === activeQueueId) ?? queues[0];
  const activeColor = queueColors[activeQueue.colorIndex % queueColors.length];

  // Fetch menu — cache-first, then refresh from Supabase
  const fetchMenu = useCallback(async () => {
    // Load cache first for instant render
    const cached = await getCachedMenu();
    if (cached && cached.length > 0) {
      setMenuItems(cached);
    }

    let items: MenuItem[] = cached ?? [];

    // Then try remote
    try {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_available', true)
        .order('sort_order');
      if (data && data.length > 0) {
        items = data;
        setMenuItems(data);
        await setCachedMenu(data);
      }
    } catch {
      // offline — cached data is already set
    }

    // Fetch ingredient-based dot colors
    try {
      const { data: recipes } = await supabase
        .from('menu_item_ingredients')
        .select('menu_item_id, ingredient:ingredients(name)');

      const ingredientsByItem = new Map<string, string[]>();
      if (recipes) {
        for (const r of recipes) {
          const names = ingredientsByItem.get(r.menu_item_id) ?? [];
          names.push(((r.ingredient as any)?.name ?? '').toLowerCase());
          ingredientsByItem.set(r.menu_item_id, names);
        }
      }
      // Also match on menu item name
      for (const item of items) {
        const names = ingredientsByItem.get(item.id) ?? [];
        names.push(item.name.toLowerCase());
        ingredientsByItem.set(item.id, names);
      }

      const dotMap = new Map<string, string[]>();
      for (const [itemId, names] of ingredientsByItem) {
        const dotColors: string[] = [];
        for (const rule of DOT_RULES) {
          if (names.some((n) => rule.keywords.some((kw) => n.includes(kw)))) {
            if (!dotColors.includes(rule.color)) {
              dotColors.push(rule.color);
            }
          }
        }
        if (dotColors.length > 0) {
          dotMap.set(itemId, dotColors);
        }
      }
      setItemDots(dotMap);
    } catch {
      // dots are optional
    }
  }, []);

  const fetchTodayOrders = useCallback(async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .eq('status', 'completed');
    if (data) setTodayOrders(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMenu();
      fetchTodayOrders();
    }, [fetchMenu, fetchTodayOrders])
  );

  // Daily KPIs
  const dailyRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const dailyProfit = todayOrders.reduce((s, o) => s + (o.total - o.total_cost), 0);
  const dailyCups = todayOrders.reduce(
    (s, o) => s + (o.order_items?.reduce((a, i) => a + i.quantity, 0) ?? 0),
    0
  );

  // Set header with daily stats
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.navKpi}>
          <Text style={styles.navKpiTitle}>POS</Text>
          <View style={styles.navKpiRow}>
            <Text style={styles.navKpiText}>{todayOrders.length} orders</Text>
            <Text style={styles.navKpiDot}>·</Text>
            <Text style={styles.navKpiText}>{dailyCups} cups</Text>
            <Text style={styles.navKpiDot}>·</Text>
            <Text style={styles.navKpiText}>{formatCurrency(dailyRevenue)}</Text>
            <Text style={styles.navKpiDot}>·</Text>
            <Text style={[styles.navKpiText, { color: colors.success }]}>
              +{formatCurrency(dailyProfit)}
            </Text>
          </View>
        </View>
      ),
    });
  }, [navigation, todayOrders, dailyRevenue, dailyProfit, dailyCups]);

  const filteredItems =
    filter === 'all'
      ? menuItems
      : menuItems.filter((i) => i.category === filter);

  // Cart helpers
  function updateActiveCart(newCart: CartItem[]) {
    setQueues((prev) =>
      prev.map((q) => (q.id === activeQueueId ? { ...q, cart: newCart } : q))
    );
  }

  function addToCart(item: MenuItem) {
    const cart = activeQueue.cart;
    const existing = cart.find((c) => c.menuItem.id === item.id);
    if (existing) {
      updateActiveCart(
        cart.map((c) =>
          c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      );
    } else {
      updateActiveCart([...cart, { menuItem: item, quantity: 1 }]);
    }
  }

  function setCartItemQty(itemId: string, qty: number) {
    if (qty <= 0) {
      updateActiveCart(activeQueue.cart.filter((c) => c.menuItem.id !== itemId));
    } else {
      updateActiveCart(
        activeQueue.cart.map((c) =>
          c.menuItem.id === itemId ? { ...c, quantity: qty } : c
        )
      );
    }
  }

  function clearCart() {
    updateActiveCart([]);
  }

  // Queue helpers
  function addQueue() {
    if (queues.length >= 5) return;
    const nextColorIndex =
      queues.length > 0
        ? (queues[queues.length - 1].colorIndex + 1) % queueColors.length
        : 0;
    const newQ = createQueue(nextColorIndex);
    setQueues((prev) => [...prev, newQ]);
    setActiveQueueId(newQ.id);
  }

  function removeQueue(id: string) {
    if (queues.length <= 1) return;
    setQueues((prev) => {
      const next = prev.filter((q) => q.id !== id);
      if (activeQueueId === id) {
        setActiveQueueId(next[0].id);
      }
      return next;
    });
  }

  // Checkout — direct Supabase
  async function checkout(changeAmount: number = 0) {
    if (activeQueue.cart.length === 0 || checkingOut) return;
    setCheckingOut(true);

    const total = activeQueue.cart.reduce(
      (sum, c) => sum + c.menuItem.price * c.quantity,
      0
    );
    const totalCost = activeQueue.cart.reduce(
      (sum, c) => sum + c.menuItem.cost * c.quantity,
      0
    );

    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          total,
          total_cost: totalCost,
          status: 'completed',
          notes: activeQueue.label,
        })
        .select('id, order_number')
        .single();

      if (orderError || !order) throw orderError;

      const orderItems = activeQueue.cart.map((c) => ({
        order_id: order.id,
        menu_item_id: c.menuItem.id,
        item_name: c.menuItem.name,
        item_price: c.menuItem.price,
        item_cost: c.menuItem.cost,
        quantity: c.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // ── Deduct ingredient stock based on recipes ──
      try {
        const menuItemIds = activeQueue.cart.map((c) => c.menuItem.id);
        const { data: recipes } = await supabase
          .from('menu_item_ingredients')
          .select('menu_item_id, ingredient_id, quantity')
          .in('menu_item_id', menuItemIds);

        if (recipes && recipes.length > 0) {
          // Aggregate total usage per ingredient
          const usage: Record<string, number> = {};
          for (const r of recipes) {
            const cartItem = activeQueue.cart.find((c) => c.menuItem.id === r.menu_item_id);
            if (!cartItem) continue;
            const amt = r.quantity * cartItem.quantity;
            usage[r.ingredient_id] = (usage[r.ingredient_id] || 0) + amt;
          }

          // Deduct stock and log each ingredient
          for (const [ingredientId, amount] of Object.entries(usage)) {
            const { data: ing } = await supabase
              .from('ingredients')
              .select('current_stock')
              .eq('id', ingredientId)
              .single();

            if (ing) {
              const newStock = Math.max(0, (ing.current_stock || 0) - amount);
              await supabase
                .from('ingredients')
                .update({ current_stock: newStock })
                .eq('id', ingredientId);
            }

            // Log to stock_logs (best-effort, don't break the deduction loop)
            try {
              await supabase
                .from('stock_logs')
                .insert({
                  ingredient_id: ingredientId,
                  type: 'sale',
                  quantity: -amount,
                  reference_id: order.id,
                  notes: `Order #${order.order_number}`,
                });
            } catch {}
          }
        }
      } catch (_stockErr) {
        // Stock deduction is best-effort — don't fail checkout
      }

      setSuccessInfo({
        orderLabel: `Order #${order.order_number}`,
        customerName: activeQueue.label,
        total,
        change: changeAmount,
      });

      // Refresh daily stats
      fetchTodayOrders();

      // Remove completed queue or clear cart
      if (queues.length > 1) {
        const remaining = queues.filter((q) => q.id !== activeQueueId);
        setQueues(remaining);
        setActiveQueueId(remaining[0].id);
      } else {
        clearCart();
      }
    } catch (err: any) {
      Alert.alert('Checkout Failed', err?.message ?? 'Could not save order. Check your connection.');
    } finally {
      setCheckingOut(false);
    }
  }

  // Cart totals
  const cartTotal = activeQueue.cart.reduce(
    (sum, c) => sum + c.menuItem.price * c.quantity,
    0
  );
  const cartCost = activeQueue.cart.reduce(
    (sum, c) => sum + c.menuItem.cost * c.quantity,
    0
  );
  const cartProfit = cartTotal - cartCost;
  const cartItemCount = activeQueue.cart.reduce(
    (sum, c) => sum + c.quantity,
    0
  );

  const cartQtyMap = new Map<string, number>();
  activeQueue.cart.forEach((c) => cartQtyMap.set(c.menuItem.id, c.quantity));

  const numColumns = IS_TABLET ? 3 : 2;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* LEFT — Menu */}
        <View style={styles.menuSide}>
          {/* Category filters */}
          <View style={styles.filterRow}>
            {(
              [
                { key: 'all' as const, label: 'All' },
                { key: 'drink' as const, label: 'Drinks' },
                { key: 'food' as const, label: 'Food' },
                { key: 'combo' as const, label: 'Combos' },
              ] as const
            ).map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.filterPill,
                  filter === f.key && styles.filterPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    filter === f.key && styles.filterLabelActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Menu grid */}
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            key={numColumns}
            contentContainerStyle={styles.gridContent}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => {
              const cat = categoryConfig[item.category];
              const qty = cartQtyMap.get(item.id);
              return (
                <Pressable
                  style={[
                    styles.menuCard,
                    qty != null && qty > 0 && {
                      borderColor: cat.color,
                      borderWidth: 1.5,
                    },
                  ]}
                  onPress={() => addToCart(item)}
                >
                  {qty != null && qty > 0 && (
                    <View
                      style={[styles.qtyBadge, { backgroundColor: cat.color }]}
                    >
                      <Text style={styles.qtyBadgeText}>{qty}</Text>
                    </View>
                  )}
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.categoryTag,
                        { backgroundColor: cat.color + '14' },
                      ]}
                    >
                      <Text style={[styles.categoryTagText, { color: cat.color }]}>
                        {cat.label}
                      </Text>
                    </View>
                    {itemDots.has(item.id) && (
                      <View style={styles.dotRow}>
                        {itemDots.get(item.id)!.map((dotColor) => (
                          <View
                            key={dotColor}
                            style={[styles.ingredientDot, { backgroundColor: dotColor }]}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>
                    {formatCurrency(item.price)}
                  </Text>
                  <Text style={styles.itemCost}>
                    Cost {formatCurrency(item.cost)}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>

        {/* RIGHT — Cart & Queue */}
        <View style={styles.cartSide}>
          {/* Queue tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.queueRow}
            contentContainerStyle={styles.queueRowContent}
          >
            {queues.map((q) => {
              const qColor = queueColors[q.colorIndex % queueColors.length];
              const isActive = q.id === activeQueueId;
              const qCount = q.cart.reduce((s, c) => s + c.quantity, 0);
              return (
                <Pressable
                  key={q.id}
                  onPress={() => setActiveQueueId(q.id)}
                  style={[
                    styles.queueTab,
                    isActive && {
                      backgroundColor: qColor + '10',
                      borderColor: qColor,
                    },
                  ]}
                >
                  <View
                    style={[styles.queueDot, { backgroundColor: qColor }]}
                  />
                  <Text
                    style={[
                      styles.queueLabel,
                      isActive && { color: qColor, fontWeight: fontWeight.bold },
                    ]}
                    numberOfLines={1}
                  >
                    {q.label}
                  </Text>
                  {qCount > 0 && (
                    <View style={[styles.queueCountBadge, { backgroundColor: qColor }]}>
                      <Text style={styles.queueCountText}>{qCount}</Text>
                    </View>
                  )}
                  {queues.length > 1 && (
                    <Pressable
                      onPress={() => removeQueue(q.id)}
                      hitSlop={8}
                      style={styles.queueRemove}
                    >
                      <X size={14} color={colors.textMuted} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
            {queues.length < 5 && (
              <Pressable onPress={addQueue} style={styles.queueAdd}>
                <Plus size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </ScrollView>

          {/* Active customer header */}
          <View style={styles.cartHeader}>
            <View style={styles.cartHeaderLeft}>
              <View
                style={[
                  styles.cartHeaderDot,
                  { backgroundColor: activeColor },
                ]}
              />
              <Text style={styles.cartHeaderTitle}>{activeQueue.label}</Text>
            </View>
            {activeQueue.cart.length > 0 && (
              <Pressable onPress={clearCart} style={styles.clearBtn}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            )}
          </View>

          {/* Cart items */}
          <ScrollView style={styles.cartList}>
            {activeQueue.cart.length === 0 ? (
              <View style={styles.emptyCartContainer}>
                <Text style={styles.emptyCartTitle}>No items yet</Text>
                <Text style={styles.emptyCartSub}>Tap menu items to add</Text>
              </View>
            ) : (
              activeQueue.cart.map((c) => (
                <View key={c.menuItem.id} style={styles.cartItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartItemName}>{c.menuItem.name}</Text>
                    <Text style={styles.cartItemPrice}>
                      {formatCurrency(c.menuItem.price)} each
                    </Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <Pressable
                      onPress={() =>
                        setCartItemQty(c.menuItem.id, c.quantity - 1)
                      }
                      style={styles.qtyBtn}
                    >
                      <Minus size={16} color={colors.textPrimary} weight="bold" />
                    </Pressable>
                    <Text style={styles.qtyValue}>{c.quantity}</Text>
                    <Pressable
                      onPress={() =>
                        setCartItemQty(c.menuItem.id, c.quantity + 1)
                      }
                      style={styles.qtyBtn}
                    >
                      <Plus size={16} color={colors.textPrimary} weight="bold" />
                    </Pressable>
                  </View>
                  <Text style={styles.cartLineTotal}>
                    {formatCurrency(c.menuItem.price * c.quantity)}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          {/* Cart footer */}
          <View style={styles.cartFooter}>
            <View style={styles.footerMetrics}>
              <View style={styles.footerMetric}>
                <Text style={styles.footerMetricLabel}>Items</Text>
                <Text style={styles.footerMetricValue}>{cartItemCount}</Text>
              </View>
              <View style={styles.footerMetric}>
                <Text style={styles.footerMetricLabel}>Cost</Text>
                <Text style={styles.footerMetricValue}>{formatCurrency(cartCost)}</Text>
              </View>
              <View style={styles.footerMetric}>
                <Text style={[styles.footerMetricLabel, { color: colors.success }]}>Profit</Text>
                <Text style={[styles.footerMetricValue, { color: colors.success }]}>
                  {formatCurrency(cartProfit)}
                </Text>
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
            </View>

            <Pressable
              onPress={() => setShowPayment(true)}
              disabled={activeQueue.cart.length === 0 || checkingOut}
              style={[
                styles.checkoutBtn,
                (activeQueue.cart.length === 0 || checkingOut) &&
                  styles.checkoutBtnDisabled,
              ]}
            >
              <Text style={styles.checkoutBtnText}>
                {checkingOut ? 'Processing...' : 'Checkout'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Payment Modal */}
      <Modal visible={showPayment} transparent animationType="fade">
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Payment</Text>

            <View style={styles.paymentTotalRow}>
              <Text style={styles.paymentTotalLabel}>Total Due</Text>
              <Text style={styles.paymentTotalValue}>{formatCurrency(cartTotal)}</Text>
            </View>

            <Text style={styles.paymentSectionLabel}>Amount Received</Text>
            <TextInput
              style={styles.paymentInput}
              value={received}
              onChangeText={setReceived}
              keyboardType="numeric"
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <View style={styles.quickAmounts}>
              {[
                { label: 'Exact', value: cartTotal },
                ...[50, 100, 200, 500, 1000]
                  .filter((v) => v >= cartTotal && v !== cartTotal)
                  .map((v) => ({ label: `₱${v}`, value: v })),
              ].map((btn) => (
                <Pressable
                  key={btn.label}
                  style={[
                    styles.quickAmountBtn,
                    parseFloat(received) === btn.value && styles.quickAmountBtnActive,
                  ]}
                  onPress={() => setReceived(String(btn.value))}
                >
                  <Text
                    style={[
                      styles.quickAmountText,
                      parseFloat(received) === btn.value && styles.quickAmountTextActive,
                    ]}
                  >
                    {btn.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {received && parseFloat(received) >= cartTotal && (
              <View style={styles.changeRow}>
                <Text style={styles.changeLabel}>Change</Text>
                <Text style={styles.changeValue}>
                  {formatCurrency(parseFloat(received) - cartTotal)}
                </Text>
              </View>
            )}

            <View style={styles.paymentActions}>
              <Pressable
                style={styles.paymentCancelBtn}
                onPress={() => {
                  setShowPayment(false);
                  setReceived('');
                }}
              >
                <Text style={styles.paymentCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.paymentConfirmBtn,
                  (!received || parseFloat(received) < cartTotal) &&
                    styles.paymentConfirmBtnDisabled,
                ]}
                disabled={!received || parseFloat(received) < cartTotal}
                onPress={() => {
                  const changeAmount = parseFloat(received) - cartTotal;
                  setShowPayment(false);
                  setReceived('');
                  checkout(changeAmount);
                }}
              >
                <Text style={styles.paymentConfirmText}>Confirm Payment</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {successInfo && (
        <SuccessOverlay
          orderLabel={successInfo.orderLabel}
          customerName={successInfo.customerName}
          total={successInfo.total}
          change={successInfo.change}
          onDismiss={() => setSuccessInfo(null)}
        />
      )}
    </View>
  );
}

const MENU_CARD_GAP = spacing.md;

const styles = StyleSheet.create({
  // ─── Nav KPI ───
  navKpi: {
    alignItems: 'flex-start',
  },
  navKpiTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  navKpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navKpiText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  navKpiDot: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  // ─── Menu side ───
  menuSide: {
    flex: IS_TABLET ? 0.6 : 0.55,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  filterLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  filterLabelActive: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
  },
  gridContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  gridRow: {
    gap: MENU_CARD_GAP,
    marginBottom: MENU_CARD_GAP,
  },
  menuCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  qtyBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  qtyBadgeText: {
    color: colors.textInverse,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  categoryTagText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  itemPrice: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  itemCost: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  // ─── Cart side ───
  cartSide: {
    flex: IS_TABLET ? 0.4 : 0.45,
    backgroundColor: colors.card,
  },
  queueRow: {
    maxHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  queueRowContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  queueTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  queueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  queueLabel: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  queueCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  queueCountText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  queueRemove: {
    marginLeft: 2,
  },
  queueAdd: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  cartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cartHeaderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cartHeaderTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  clearBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.dangerLight,
  },
  clearText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.danger,
  },
  cartList: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  emptyCartContainer: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
  },
  emptyCartTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  emptyCartSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  cartItemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  cartItemPrice: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: 'center',
  },
  cartLineTotal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 60,
    textAlign: 'right',
  },
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
  },
  footerMetrics: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  footerMetric: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
  },
  footerMetricLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  footerMetricValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  totalLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  checkoutBtn: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
  },
  checkoutBtnDisabled: {
    opacity: 0.3,
  },
  checkoutBtnText: {
    color: colors.textInverse,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  // ─── Overlay ───
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  overlayCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    minWidth: 280,
    ...shadow.lg,
  },
  overlayCheckCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  overlayTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  overlayCustomer: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  overlayTotal: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
    marginTop: spacing.md,
  },
  overlayChange: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.success,
    marginTop: spacing.sm,
  },
  // ─── Ingredient dots ───
  dotRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  ingredientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // ─── Payment Modal ───
  paymentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  paymentCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    width: 380,
    maxWidth: '90%' as any,
    ...shadow.lg,
  },
  paymentTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  paymentTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  paymentTotalLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  paymentTotalValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  paymentSectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  paymentInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickAmountBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  quickAmountBtnActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  quickAmountText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  quickAmountTextActive: {
    color: colors.textInverse,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  changeLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.success,
  },
  changeValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.success,
  },
  paymentActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  paymentCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentCancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  paymentConfirmBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
  },
  paymentConfirmBtnDisabled: {
    opacity: 0.3,
  },
  paymentConfirmText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
});
