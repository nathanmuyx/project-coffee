import { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';
import {
  Trash,
  Plus,
  Minus,
  CaretDown,
  CaretUp,
} from 'phosphor-react-native';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/format';
import { CalendarPicker } from '../lib/components/CalendarPicker';
import type { DailySummary, Ingredient, ItemPopularity, MenuItem, Order } from '../lib/types';
import {
  borderRadius,
  colors,
  fontSize,
  fontWeight,
  spacing,
} from '../constants/theme';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Stats data
  const [allDays, setAllDays] = useState<DailySummary[]>([]);
  const [bestSellers, setBestSellers] = useState<ItemPopularity[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [totalPurchased, setTotalPurchased] = useState<Record<string, number>>({});
  const [totalServed, setTotalServed] = useState<Record<string, number>>({});

  // Add order form
  const [showAddForm, setShowAddForm] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orderDate, setOrderDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [orderCustomer, setOrderCustomer] = useState('');
  const [orderCart, setOrderCart] = useState<Record<string, number>>({});
  const [showCalendar, setShowCalendar] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const fetchOrders = useCallback(async () => {
    const [ordersRes, menuRes, allDaysRes, popularityRes, stockRes, purchasesRes, recipesRes, orderItemsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('menu_items').select('*').eq('is_available', true).order('sort_order'),
      supabase
        .from('daily_summary')
        .select('*')
        .order('sale_date', { ascending: false })
        .limit(30),
      supabase.from('item_popularity').select('*').limit(5),
      supabase.from('ingredients').select('*'),
      supabase.from('purchases').select('item_name, quantity, content_quantity').eq('category', 'ingredients'),
      supabase.from('menu_item_ingredients').select('menu_item_id, ingredient_id, quantity'),
      supabase.from('order_items').select('menu_item_id, quantity'),
    ]);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (menuRes.data) setMenuItems(menuRes.data);
    if (allDaysRes.data) setAllDays(allDaysRes.data);
    if (popularityRes.data) setBestSellers(popularityRes.data);
    if (stockRes.data) {
      // Sort: empty first, then low, then by name
      const sorted = [...stockRes.data].sort((a: Ingredient, b: Ingredient) => {
        const aStatus = a.current_stock <= 0 ? 0 : a.current_stock <= a.low_stock_threshold ? 1 : 2;
        const bStatus = b.current_stock <= 0 ? 0 : b.current_stock <= b.low_stock_threshold ? 1 : 2;
        if (aStatus !== bStatus) return aStatus - bStatus;
        return a.name.localeCompare(b.name);
      });
      setAllIngredients(sorted);
    }
    if (purchasesRes.data) {
      const purchased: Record<string, number> = {};
      for (const p of purchasesRes.data) {
        const amount = p.content_quantity
          ? p.quantity * p.content_quantity
          : p.quantity;
        purchased[p.item_name] = (purchased[p.item_name] || 0) + amount;
      }
      setTotalPurchased(purchased);
    }
    // Compute served per ingredient from orders × recipes
    if (recipesRes.data && orderItemsRes.data) {
      const recipesByMenu: Record<string, { ingredient_id: string; quantity: number }[]> = {};
      for (const r of recipesRes.data) {
        if (!recipesByMenu[r.menu_item_id]) recipesByMenu[r.menu_item_id] = [];
        recipesByMenu[r.menu_item_id].push({ ingredient_id: r.ingredient_id, quantity: r.quantity });
      }
      const served: Record<string, number> = {};
      for (const item of orderItemsRes.data) {
        const itemRecipes = recipesByMenu[item.menu_item_id];
        if (!itemRecipes) continue;
        for (const r of itemRecipes) {
          served[r.ingredient_id] = (served[r.ingredient_id] || 0) + item.quantity * r.quantity;
        }
      }
      setTotalServed(served);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }

  async function cancelOrder(orderId: string) {
    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);
    fetchOrders();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('orders').delete().eq('id', deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    fetchOrders();
  }

  // Add order helpers
  function openAddForm() {
    setOrderDate(dayjs().format('YYYY-MM-DD'));
    setOrderCustomer('');
    setOrderCart({});
    setShowCalendar(false);
    setShowAddForm(true);
  }

  function setCartQty(itemId: string, delta: number) {
    setOrderCart((prev) => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  }

  const cartItems = menuItems.filter((m) => (orderCart[m.id] || 0) > 0);
  const cartTotal = cartItems.reduce(
    (s, m) => s + m.price * (orderCart[m.id] || 0),
    0
  );
  const cartCost = cartItems.reduce(
    (s, m) => s + m.cost * (orderCart[m.id] || 0),
    0
  );

  async function saveOrder() {
    if (cartItems.length === 0) return;
    setSavingOrder(true);

    try {
      // Use noon on selected date so timezone won't shift the day
      const createdAt = dayjs(orderDate).hour(12).minute(0).second(0).toISOString();

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          total: cartTotal,
          total_cost: cartCost,
          status: 'completed',
          notes: orderCustomer.trim() || null,
          created_at: createdAt,
        })
        .select('id, order_number')
        .single();

      if (orderError || !order) throw orderError;

      const items = cartItems.map((m) => ({
        order_id: order.id,
        menu_item_id: m.id,
        item_name: m.name,
        item_price: m.price,
        item_cost: m.cost,
        quantity: orderCart[m.id],
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(items);
      if (itemsError) throw itemsError;

      setShowAddForm(false);
      fetchOrders();
    } catch {
      // silently fail — could add toast later
    } finally {
      setSavingOrder(false);
    }
  }

  // Overall stats
  const today = dayjs().format('YYYY-MM-DD');
  const completedOrders = orders.filter((o) => o.status === 'completed');
  const totalRevenue = completedOrders.reduce((s, o) => s + o.total, 0);
  const totalProfit = completedOrders.reduce(
    (s, o) => s + (o.total - o.total_cost),
    0
  );
  const totalCups = completedOrders.reduce(
    (s, o) => s + (o.order_items?.reduce((a, i) => a + i.quantity, 0) ?? 0),
    0
  );

  // Group orders by date
  const grouped: { date: string; label: string; orders: Order[] }[] = [];
  const dateMap = new Map<string, Order[]>();
  for (const order of orders) {
    const d = dayjs(order.created_at).format('YYYY-MM-DD');
    if (!dateMap.has(d)) dateMap.set(d, []);
    dateMap.get(d)!.push(order);
  }
  for (const [date, dateOrders] of dateMap) {
    const d = dayjs(date);
    const isToday = date === today;
    const isYesterday = date === dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const label = isToday
      ? 'Today'
      : isYesterday
        ? 'Yesterday'
        : d.format('ddd, MMM D');
    grouped.push({ date, label, orders: dateOrders });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Overall stats bar */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{completedOrders.length}</Text>
            <Text style={styles.statLabel}>Total Orders</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalCups}</Text>
            <Text style={styles.statLabel}>Cups Sold</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatCurrency(totalRevenue)}</Text>
            <Text style={styles.statLabel}>Revenue</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {formatCurrency(totalProfit)}
            </Text>
            <Text style={styles.statLabel}>Profit</Text>
          </View>
        </View>

        {/* Best Sellers */}
        {bestSellers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Best Sellers</Text>
            <View style={styles.listCard}>
              {bestSellers.map((item, idx) => (
                <View
                  key={item.item_name}
                  style={[
                    styles.listRow,
                    idx < bestSellers.length - 1 && styles.listRowBorder,
                  ]}
                >
                  <View style={styles.rankCircle}>
                    <Text style={styles.rankText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.listName}>{item.item_name}</Text>
                  <View style={styles.listStats}>
                    <Text style={styles.listSold}>{item.total_sold} sold</Text>
                    <Text style={styles.listRevenue}>
                      {formatCurrency(item.total_revenue)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Add Order button */}
        <Pressable onPress={openAddForm} style={styles.addBtn}>
          <Plus size={16} color={colors.textSecondary} weight="bold" />
          <Text style={styles.addBtnText}>Add Past Order</Text>
        </Pressable>

        {/* Order list grouped by date */}
        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySub}>
              Orders will appear here after checkout
            </Text>
          </View>
        ) : (
          grouped.map((group) => (
            <View key={group.date}>
              <Text style={styles.sectionTitle}>{group.label}</Text>
              {group.orders.map((order) => {
                const isCancelled = order.status === 'cancelled';
                const isExpanded = expandedId === order.id;
                const profit = order.total - order.total_cost;

                return (
                  <Pressable
                    key={order.id}
                    onPress={() =>
                      setExpandedId(isExpanded ? null : order.id)
                    }
                    style={[
                      styles.orderCard,
                      isCancelled && styles.orderCancelled,
                    ]}
                  >
                    <View style={styles.orderHeader}>
                      <View style={styles.orderHeaderLeft}>
                        <View style={styles.orderTopRow}>
                          <Text
                            style={[
                              styles.orderNumber,
                              isCancelled && styles.textCancelled,
                            ]}
                          >
                            #{order.order_number}
                          </Text>
                          {order.notes && (
                            <Text style={styles.orderCustomer}>
                              {order.notes}
                            </Text>
                          )}
                          {isCancelled && (
                            <View style={styles.cancelledBadge}>
                              <Text style={styles.cancelledBadgeText}>
                                CANCELLED
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.orderTime}>
                          {dayjs(order.created_at).format('h:mm A')}
                        </Text>
                      </View>
                      <View style={styles.orderTotals}>
                        <Text
                          style={[
                            styles.orderTotal,
                            isCancelled && styles.textStrikethrough,
                          ]}
                        >
                          {formatCurrency(order.total)}
                        </Text>
                        {!isCancelled && (
                          <Text style={styles.orderProfit}>
                            +{formatCurrency(profit)}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Always show items */}
                    <View style={styles.orderItemsList}>
                      {order.order_items?.map((item) => (
                        <View key={item.id} style={styles.orderItem}>
                          <Text style={styles.orderItemQty}>
                            {item.quantity}×
                          </Text>
                          <Text style={styles.orderItemName}>
                            {item.item_name}
                          </Text>
                          <Text style={styles.orderItemPrice}>
                            {formatCurrency(item.item_price * item.quantity)}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {isExpanded && (
                      <View style={styles.orderActions}>
                        <View style={styles.orderActionRow}>
                          {!isCancelled && (
                            <Pressable
                              onPress={() => cancelOrder(order.id)}
                              style={styles.cancelBtn}
                            >
                              <Text style={styles.cancelBtnText}>
                                Cancel Order
                              </Text>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() => setDeleteTarget(order)}
                            style={styles.deleteBtn}
                          >
                            <Trash size={16} color={colors.danger} />
                            <Text style={styles.deleteBtnText}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}

        {/* Day History — transaction-style */}
        {allDays.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Pop-Up History</Text>
            <View style={styles.listCard}>
              {allDays.map((day, idx) => {
                const cups = day.total_orders; // total orders as proxy
                const avgOrder = day.total_orders > 0
                  ? Math.round(day.total_revenue / day.total_orders)
                  : 0;
                return (
                  <View
                    key={day.sale_date}
                    style={[
                      styles.historyRow,
                      idx < allDays.length - 1 && styles.listRowBorder,
                    ]}
                  >
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyDate}>
                        {dayjs(day.sale_date).format('ddd, MMM D')}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {day.total_orders} order{day.total_orders !== 1 ? 's' : ''} · avg {formatCurrency(avgOrder)} · {Math.round(day.margin_percent)}% margin
                      </Text>
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={styles.historyRevenue}>
                        {formatCurrency(day.total_revenue)}
                      </Text>
                      <Text style={styles.historyProfit}>
                        +{formatCurrency(day.gross_profit)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Inventory */}
        {allIngredients.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Inventory</Text>
            <View style={styles.listCard}>
              {allIngredients.map((ing, idx) => {
                const purchased = totalPurchased[ing.name] || 0;
                const served = totalServed[ing.id] || 0;
                // Compute remaining from purchased - served (don't trust current_stock which drifted)
                const total = purchased || (ing.current_stock + served);
                const remaining = Math.max(total - served, 0);
                const progress = total > 0 ? Math.min(remaining / total, 1) : 1;
                const isEmpty = remaining <= 0;
                const isLow = !isEmpty && ing.low_stock_threshold > 0 && remaining <= ing.low_stock_threshold;
                const barColor = isEmpty
                  ? colors.danger
                  : isLow
                    ? colors.warning
                    : progress <= 0.15
                      ? colors.warning
                      : colors.success;
                const statusLabel = isEmpty
                  ? 'Empty'
                  : isLow || progress <= 0.15
                    ? 'Low'
                    : 'In Stock';
                const statusColor = isEmpty
                  ? colors.danger
                  : isLow || progress <= 0.15
                    ? colors.warning
                    : colors.textMuted;

                return (
                  <View
                    key={ing.id}
                    style={[
                      styles.invRow,
                      idx < allIngredients.length - 1 && styles.listRowBorder,
                    ]}
                  >
                    {/* Left progress bar — vertical, fills from bottom */}
                    <View style={styles.invBarTrack}>
                      <View style={{ flex: Math.max(1 - progress - (total > 0 ? served / total : 0), 0) }} />
                      {served > 0 && total > 0 && (
                        <View
                          style={{
                            flex: Math.min(served / total, 1 - progress),
                            width: '100%',
                            backgroundColor: colors.textMuted,
                            opacity: 0.25,
                          }}
                        />
                      )}
                      <View
                        style={[
                          styles.invBarFill,
                          {
                            flex: Math.max(progress, 0.05),
                            backgroundColor: barColor,
                          },
                        ]}
                      />
                    </View>

                    {/* Content */}
                    <View style={styles.invContent}>
                      <View style={styles.invTop}>
                        <Text style={styles.invName}>{ing.name}</Text>
                        <View style={[styles.invBadge, { backgroundColor: barColor + '18' }]}>
                          <Text style={[styles.invBadgeText, { color: statusColor }]}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.invBottom}>
                        <Text style={[styles.invStock, isEmpty && { color: colors.danger }]}>
                          {remaining.toLocaleString()} {ing.unit}{total > remaining ? ` of ${total.toLocaleString()}` : ''}
                        </Text>
                        {served > 0 && (
                          <Text style={styles.invMeta}>
                            {served.toLocaleString()} {ing.unit} served
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* ─── Add Order Modal ─── */}
      <Modal visible={showAddForm} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Add Past Order</Text>

              {/* Date picker */}
              <Text style={styles.fieldLabel}>Date</Text>
              <Pressable
                onPress={() => setShowCalendar(!showCalendar)}
                style={styles.dateBtn}
              >
                <Text style={styles.dateBtnText}>
                  {dayjs(orderDate).format('ddd, MMM D, YYYY')}
                </Text>
                {showCalendar ? (
                  <CaretUp size={14} color={colors.textMuted} />
                ) : (
                  <CaretDown size={14} color={colors.textMuted} />
                )}
              </Pressable>
              {showCalendar && (
                <CalendarPicker
                  selected={orderDate}
                  onSelect={(d) => {
                    setOrderDate(d);
                    setShowCalendar(false);
                  }}
                />
              )}

              {/* Customer */}
              <Text style={styles.fieldLabel}>Customer (optional)</Text>
              <TextInput
                style={styles.input}
                value={orderCustomer}
                onChangeText={setOrderCustomer}
                placeholder="e.g. Customer 1"
                placeholderTextColor={colors.textMuted}
              />

              {/* Menu items */}
              <Text style={styles.fieldLabel}>Items</Text>
              {menuItems.map((item) => {
                const qty = orderCart[item.id] || 0;
                return (
                  <View key={item.id} style={styles.menuRow}>
                    <View style={styles.menuRowInfo}>
                      <Text style={styles.menuRowName}>{item.name}</Text>
                      <Text style={styles.menuRowPrice}>₱{item.price}</Text>
                    </View>
                    <View style={styles.menuRowQty}>
                      {qty > 0 && (
                        <Pressable
                          onPress={() => setCartQty(item.id, -1)}
                          style={styles.qtyBtn}
                        >
                          <Minus size={14} color={colors.textSecondary} weight="bold" />
                        </Pressable>
                      )}
                      {qty > 0 && (
                        <Text style={styles.qtyText}>{qty}</Text>
                      )}
                      <Pressable
                        onPress={() => setCartQty(item.id, 1)}
                        style={[styles.qtyBtn, qty === 0 && styles.qtyBtnAdd]}
                      >
                        <Plus size={14} color={qty === 0 ? colors.primary : colors.textSecondary} weight="bold" />
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              {cartTotal > 0 && (
                <View style={styles.cartSummary}>
                  <Text style={styles.cartSummaryLabel}>
                    {cartItems.reduce((s, m) => s + (orderCart[m.id] || 0), 0)} item{cartItems.length !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.cartSummaryTotal}>
                    {formatCurrency(cartTotal)}
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowAddForm(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveOrder}
                disabled={savingOrder || cartItems.length === 0}
                style={[
                  styles.modalSaveBtn,
                  (savingOrder || cartItems.length === 0) && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.modalSaveText}>
                  {savingOrder ? 'Saving...' : 'Save Order'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Delete Confirmation Modal ─── */}
      <Modal visible={deleteTarget !== null} transparent animationType="fade">
        <Pressable
          style={styles.dialogOverlay}
          onPress={() => setDeleteTarget(null)}
        >
          <Pressable
            style={styles.dialogCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Delete order?</Text>
              <Text style={styles.dialogDescription}>
                This will permanently delete order #{deleteTarget?.order_number}{' '}
                ({formatCurrency(deleteTarget?.total ?? 0)}). Stats and dashboard
                will be updated. This cannot be undone.
              </Text>
            </View>
            <View style={styles.dialogFooter}>
              <Pressable
                onPress={() => setDeleteTarget(null)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                disabled={deleting}
                style={[
                  styles.dialogDestructiveBtn,
                  deleting && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.dialogDestructiveText}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  // ─── Add button ───
  addBtn: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  addBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  // ─── Stats ───
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  // ─── Section ───
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  // ─── Empty ───
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  emptySub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  // ─── Orders ───
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderCancelled: {
    opacity: 0.5,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderHeaderLeft: {
    flex: 1,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  orderNumber: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  orderCustomer: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  textCancelled: {
    color: colors.textMuted,
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  cancelledBadge: {
    backgroundColor: colors.dangerLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  cancelledBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
  orderTime: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  orderTotals: {
    alignItems: 'flex-end',
  },
  orderTotal: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  orderProfit: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
  },
  orderItemsList: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  orderActions: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  orderItemQty: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    width: 32,
  },
  orderItemName: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  orderItemPrice: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  orderActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    backgroundColor: colors.dangerLight,
  },
  deleteBtnText: {
    color: colors.danger,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  // ─── Add Order Modal ───
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  dateBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dateBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuRowInfo: {
    flex: 1,
  },
  menuRowName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  menuRowPrice: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  menuRowQty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  qtyBtnAdd: {
    borderColor: colors.primary + '40',
    backgroundColor: colors.primaryLight,
  },
  qtyText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: 'center',
  },
  cartSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  cartSummaryLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.primary,
  },
  cartSummaryTotal: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  modalCancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  modalSaveBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.textPrimary,
  },
  modalSaveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textInverse,
  },
  // ─── Alert Dialog (shadcn-style) ───
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialogCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
  },
  dialogHeader: {
    marginBottom: spacing.xl,
  },
  dialogTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  dialogDescription: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    lineHeight: 20,
  },
  dialogFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  dialogCancelBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dialogCancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  dialogDestructiveBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.danger,
  },
  dialogDestructiveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textInverse,
  },
  // ─── Stats sections ───
  listCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  listRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rankText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  listName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  listStats: {
    alignItems: 'flex-end',
  },
  listSold: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  listRevenue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  historyLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  historyDate: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  historyMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  historyRevenue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  historyProfit: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.success,
    marginTop: 2,
  },
  // ─── Inventory ───
  invRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 60,
  },
  invBarTrack: {
    width: 5,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: spacing.sm,
    marginLeft: spacing.md,
    flexDirection: 'column',
  },
  invBarFill: {
    width: '100%',
    borderRadius: 3,
  },
  invContent: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  invTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  invBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  invBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  invBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  invStock: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  invMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
