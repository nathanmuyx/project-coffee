import { useCallback, useEffect, useState } from 'react';
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
  CaretDown,
  CaretUp,
  Check,
  X,
  Info,
  Plus,
  PencilSimple,
  Trash,
} from 'phosphor-react-native';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/format';
import { CalendarPicker } from '../lib/components/CalendarPicker';
import { StockAdjustmentModal } from '../lib/components/StockAdjustmentModal';
import { guessIngredientCategory } from './menu';
import type { Ingredient, Purchase, PurchaseCategory } from '../lib/types';
import {
  borderRadius,
  colors,
  fontSize,
  fontWeight,
  shadow,
  spacing,
} from '../constants/theme';

// ─── Constants ───

const PURCHASE_CATEGORIES: { key: PurchaseCategory; label: string }[] = [
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'packaging', label: 'Packaging' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'other', label: 'Other' },
];

const categoryColors: Record<PurchaseCategory, string> = {
  ingredients: '#6366F1',
  packaging: '#F59E0B',
  equipment: '#14B8A6',
  supplies: '#EC4899',
  other: '#9CA3AF',
};

type CostMode = 'itemized' | 'fixed';

type FormData = {
  item_name: string;
  category: PurchaseCategory;
  cost_mode: CostMode;
  quantity: string;
  unit: string;
  unit_cost: string;
  content_quantity: string;
  content_unit: 'ml' | 'g' | 'pcs';
  supplier: string;
  notes: string;
  purchased_at: string;
};

const EMPTY_FORM: FormData = {
  item_name: '',
  category: 'ingredients',
  cost_mode: 'itemized',
  quantity: '1',
  unit: 'pcs',
  unit_cost: '',
  content_quantity: '',
  content_unit: 'ml',
  supplier: '',
  notes: '',
  purchased_at: dayjs().format('YYYY-MM-DD'),
};

const CONTENT_UNITS: Array<'ml' | 'g' | 'pcs'> = ['ml', 'g', 'pcs'];

// ─── Toast Component ───

function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: 'success' | 'error' | 'info';
  onDismiss: () => void;
}) {
  const bg = {
    success: colors.successLight,
    error: colors.dangerLight,
    info: colors.primaryLight,
  }[type];
  const fg = {
    success: colors.success,
    error: colors.danger,
    info: colors.primary,
  }[type];
  const IconComponent = { success: Check, error: X, info: Info }[type];

  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <Pressable onPress={onDismiss} style={[toastStyles.container, { backgroundColor: bg }]}>
      <IconComponent size={18} color={fg} weight="bold" />
      <Text style={[toastStyles.text, { color: fg }]}>{message}</Text>
    </Pressable>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    zIndex: 999,
    gap: spacing.sm,
  },
  text: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
});

// ─── Main Screen ───

export default function CostingScreen() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState<PurchaseCategory | 'all'>('all');
  const [showCalendar, setShowCalendar] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [deletingPurchase, setDeletingPurchase] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Inventory
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [adjustingItem, setAdjustingItem] = useState<Ingredient | null>(null);
  // Cash on hand & Money on keep
  const [cashOnHand, setCashOnHand] = useState(0);
  const [moneyOnKeep, setMoneyOnKeep] = useState(0);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showKeepModal, setShowKeepModal] = useState(false);
  const [cashManual, setCashManual] = useState('');
  const [keepManual, setKeepManual] = useState('');

  type DenomCounts = Record<number, number>;
  const emptyDenoms = (): DenomCounts => ({ 1: 0, 5: 0, 10: 0, 20: 0, 50: 0, 100: 0, 200: 0, 500: 0, 1000: 0 });
  const [cashDenoms, setCashDenoms] = useState<DenomCounts>(emptyDenoms());
  const [keepDenoms, setKeepDenoms] = useState<DenomCounts>(emptyDenoms());

  const denomTotal = (d: DenomCounts) => Object.entries(d).reduce((sum, [k, v]) => sum + Number(k) * v, 0);
  const cashTotal = denomTotal(cashDenoms) + (parseFloat(cashManual) || 0);
  const keepTotal = denomTotal(keepDenoms) + (parseFloat(keepManual) || 0);

  function showToast(message: string, type: 'success' | 'error' | 'info') {
    setToast({ message, type });
  }

  const fetchPurchases = useCallback(async () => {
    const { data, error, status } = await supabase
      .from('purchases')
      .select('*')
      .order('purchased_at', { ascending: false });

    if (error) {
      console.error('[Costing] fetch error:', JSON.stringify(error));
      setDbError(`[${error.code}] ${error.message} (hint: ${error.hint || 'none'}) (status: ${status})`);
      return;
    }

    setDbError(null);
    if (data) setPurchases(data);
  }, []);

  const fetchIngredients = useCallback(async () => {
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .order('name');
    if (data) setIngredients(data);
  }, []);

  const fetchCashOnHand = useCallback(async () => {
    const { data } = await supabase
      .from('cash_on_hand')
      .select('amount, money_on_keep')
      .limit(1)
      .single();
    if (data) {
      setCashOnHand(Number(data.amount));
      setMoneyOnKeep(Number(data.money_on_keep) || 0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPurchases();
      fetchIngredients();
      fetchCashOnHand();
    }, [fetchPurchases, fetchIngredients, fetchCashOnHand])
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchPurchases(), fetchIngredients(), fetchCashOnHand()]);
    setRefreshing(false);
  }

  function openAdjust(item: Ingredient) {
    setAdjustingItem(item);
  }

  // ─── Cash on Hand ───

  const DENOMINATIONS = [1, 5, 10, 20, 50, 100, 200, 500, 1000];

  function openCashModal() {
    setCashDenoms(emptyDenoms());
    setCashManual('');
    setShowCashModal(true);
  }

  async function saveCashOnHand() {
    await supabase
      .from('cash_on_hand')
      .update({ amount: cashTotal, updated_at: new Date().toISOString() })
      .not('id', 'is', null);
    setCashOnHand(cashTotal);
    setShowCashModal(false);
  }

  function openKeepModal() {
    setKeepDenoms(emptyDenoms());
    setKeepManual('');
    setShowKeepModal(true);
  }

  async function saveMoneyOnKeep() {
    await supabase
      .from('cash_on_hand')
      .update({ money_on_keep: keepTotal, updated_at: new Date().toISOString() })
      .not('id', 'is', null);
    setMoneyOnKeep(keepTotal);
    setShowKeepModal(false);
  }

  function updateDenom(setter: React.Dispatch<React.SetStateAction<DenomCounts>>, denom: number, text: string) {
    const val = parseInt(text) || 0;
    setter((prev) => ({ ...prev, [denom]: Math.max(0, val) }));
  }

  // ─── Form ───

  function openForm(purchase?: Purchase) {
    if (purchase) {
      setEditingId(purchase.id);
      const isFixed = purchase.quantity === 1 && purchase.unit === '—';
      setForm({
        item_name: purchase.item_name,
        category: purchase.category,
        cost_mode: isFixed ? 'fixed' : 'itemized',
        quantity: purchase.quantity.toString(),
        unit: purchase.unit,
        unit_cost: purchase.unit_cost.toString(),
        content_quantity: purchase.content_quantity?.toString() ?? '',
        content_unit: (purchase.content_unit as 'ml' | 'g' | 'pcs') ?? 'ml',
        supplier: purchase.supplier ?? '',
        notes: purchase.notes ?? '',
        purchased_at: dayjs(purchase.purchased_at).format('YYYY-MM-DD'),
      });
    } else {
      setEditingId(null);
      setForm({ ...EMPTY_FORM, purchased_at: dayjs().format('YYYY-MM-DD') });
    }
    setShowCalendar(false);
    setShowForm(true);
  }

  async function savePurchase() {
    if (!form.item_name.trim() || !form.unit_cost) {
      showToast('Item name and unit cost are required.', 'error');
      return;
    }

    setSaving(true);
    const isFixed = form.cost_mode === 'fixed';
    const qty = isFixed ? 1 : (parseFloat(form.quantity) || 1);
    const unitCost = parseFloat(form.unit_cost) || 0;
    const contentQty = parseFloat(form.content_quantity) || null;

    const payload = {
      item_name: form.item_name.trim(),
      category: form.category,
      quantity: qty,
      unit: isFixed ? '—' : (form.unit.trim() || 'pcs'),
      unit_cost: unitCost,
      total_cost: qty * unitCost,
      content_quantity: form.category === 'ingredients' ? contentQty : null,
      content_unit: form.category === 'ingredients' && contentQty ? form.content_unit : null,
      supplier: form.supplier.trim() || null,
      notes: form.notes.trim() || null,
      purchased_at: form.purchased_at,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from('purchases')
          .update(payload)
          .eq('id', editingId)
          .select();
        if (error) throw error;
        showToast('Purchase updated', 'success');
      } else {
        const { error } = await supabase
          .from('purchases')
          .insert(payload)
          .select();
        if (error) throw error;
        showToast('Purchase added', 'success');
      }

      // Auto-sync all purchases into ingredients table for recipe use
      {
        const name = payload.item_name;
        // If content specified (e.g., 1000ml), use that for stock/cost
        // Otherwise fall back to purchase qty/unit_cost
        const hasContent = contentQty && contentQty > 0;
        const totalContent = hasContent ? contentQty * qty : qty;
        const ingUnit = hasContent ? form.content_unit : payload.unit;
        const costPerUnit = hasContent
          ? payload.total_cost / (contentQty * qty)
          : payload.unit_cost;

        const ingCategory = payload.category === 'ingredients'
          ? guessIngredientCategory(name)
          : payload.category;

        // Resolve group_id from inventory_groups
        const categoryToGroupName: Record<string, string> = {
          beans: 'Beans', milk: 'Milk & Dairy', syrup: 'Syrups',
          sweetener: 'Sweeteners', powder: 'Powders', packaging: 'Packaging',
          equipment: 'Equipment', supplies: 'Supplies', other: 'Other',
          ingredients: 'Other',
        };
        const groupName = categoryToGroupName[ingCategory] ?? 'Other';
        const { data: groupRow } = await supabase
          .from('inventory_groups')
          .select('id')
          .eq('name', groupName)
          .limit(1)
          .single();
        const groupId = groupRow?.id ?? null;

        const { data: existing } = await supabase
          .from('ingredients')
          .select('id, current_stock, category, group_id')
          .ilike('name', name)
          .limit(1)
          .single();

        if (existing) {
          const updates: Record<string, unknown> = {
            cost_per_unit: costPerUnit,
            unit: ingUnit,
            // Only set category if still legacy 'ingredients', don't overwrite user edits
            ...(existing.category === 'ingredients' ? { category: ingCategory } : {}),
            // Only set group_id if ingredient doesn't have one yet
            ...(!existing.group_id && groupId ? { group_id: groupId } : {}),
          };
          if (!editingId) {
            updates.current_stock = existing.current_stock + totalContent;
            // Log the stock addition
            await supabase.from('stock_logs').insert({
              ingredient_id: existing.id,
              type: 'purchase',
              quantity: totalContent,
              notes: `Purchased ${payload.item_name}`,
            });
          }
          await supabase.from('ingredients').update(updates).eq('id', existing.id);
        } else {
          const { data: newIng } = await supabase.from('ingredients').insert({
            name,
            unit: ingUnit,
            category: ingCategory,
            group_id: groupId,
            current_stock: totalContent,
            cost_per_unit: costPerUnit,
            low_stock_threshold: 0,
          }).select('id').single();
          // Log the initial stock
          if (newIng) {
            await supabase.from('stock_logs').insert({
              ingredient_id: newIng.id,
              type: 'purchase',
              quantity: totalContent,
              notes: `Initial purchase of ${name}`,
            });
          }
        }
      }

      setShowForm(false);
      setSaving(false);
      await Promise.all([fetchPurchases(), fetchIngredients()]);
    } catch (err: any) {
      setSaving(false);
      const msg = err?.message ?? 'Unknown error';
      const code = err?.code ?? '';
      showToast(`Save failed${code ? ` [${code}]` : ''}: ${msg}`, 'error');
    }
  }

  function handleDelete(p: Purchase) {
    setDeletingPurchase(p);
  }

  async function confirmDelete() {
    if (!deletingPurchase) return;
    setDeleting(true);
    const { error } = await supabase.from('purchases').delete().eq('id', deletingPurchase.id);
    if (error) {
      showToast(`Delete failed: ${error.message}`, 'error');
    } else {
      showToast('Purchase deleted', 'success');
    }
    setDeletingPurchase(null);
    setDeleting(false);
    fetchPurchases();
  }

  // ─── Computed ───

  const filtered =
    filterCat === 'all'
      ? purchases
      : purchases.filter((p) => p.category === filterCat);

  const totalSpent = purchases.reduce((s, p) => s + p.total_cost, 0);

  const thisMonth = purchases
    .filter((p) => dayjs(p.purchased_at).isSame(dayjs(), 'month'))
    .reduce((s, p) => s + p.total_cost, 0);

  const byCategory = PURCHASE_CATEGORIES.map((cat) => {
    const catTotal = purchases
      .filter((p) => p.category === cat.key)
      .reduce((s, p) => s + p.total_cost, 0);
    return { ...cat, total: catTotal };
  }).filter((c) => c.total > 0);

  const formQty = form.cost_mode === 'fixed' ? 1 : (parseFloat(form.quantity) || 0);
  const formUnitCost = parseFloat(form.unit_cost) || 0;
  const formTotal = formQty * formUnitCost;

  return (
    <View style={styles.container}>
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* DB error banner */}
        {dbError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerTitle}>Supabase Error</Text>
            <Text style={styles.errorBannerText} selectable>{dbError}</Text>
          </View>
        )}

        {/* Money KPI row */}
        <View style={styles.kpiRow}>
          <Pressable onPress={openCashModal} style={[styles.kpiCard, styles.kpiCardCash]}>
            <View style={styles.kpiHeader}>
              <Text style={[styles.kpiLabel, styles.kpiLabelCash]}>Cash on Hand</Text>
              <PencilSimple size={14} color={colors.success} />
            </View>
            <Text style={[styles.kpiValue, styles.kpiValueCash]}>{formatCurrency(cashOnHand)}</Text>
            <Text style={[styles.kpiHint, styles.kpiHintCash]}>Change for customers</Text>
          </Pressable>
          <Pressable onPress={openKeepModal} style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>Money on Keep</Text>
              <PencilSimple size={14} color={colors.primary} />
            </View>
            <Text style={styles.kpiValue}>{formatCurrency(moneyOnKeep)}</Text>
            <Text style={styles.kpiHint}>Hidden savings</Text>
          </Pressable>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, styles.summaryCardDark]}>
            <Text style={styles.summaryLabelDark}>Total Spent</Text>
            <Text style={styles.summaryValueDark}>
              {formatCurrency(totalSpent)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>This Month</Text>
            <Text style={styles.summaryValue}>{formatCurrency(thisMonth)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Purchases</Text>
            <Text style={styles.summaryValue}>{purchases.length}</Text>
          </View>
        </View>

        {/* Breakdown by category */}
        {byCategory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>By Category</Text>
            <View style={styles.breakdownCard}>
              {byCategory.map((cat, idx) => {
                const pct =
                  totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
                return (
                  <View
                    key={cat.key}
                    style={[
                      styles.breakdownRow,
                      idx < byCategory.length - 1 && styles.breakdownRowBorder,
                    ]}
                  >
                    <View style={styles.breakdownLeft}>
                      <View
                        style={[
                          styles.catDot,
                          { backgroundColor: categoryColors[cat.key] },
                        ]}
                      />
                      <Text style={styles.breakdownName}>{cat.label}</Text>
                    </View>
                    <View style={styles.breakdownRight}>
                      <Text style={styles.breakdownPct}>
                        {Math.round(pct)}%
                      </Text>
                      <Text style={styles.breakdownTotal}>
                        {formatCurrency(cat.total)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={styles.barContainer}>
                {byCategory.map((cat) => {
                  const pct =
                    totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
                  return (
                    <View
                      key={cat.key}
                      style={[
                        styles.barSegment,
                        {
                          width: `${Math.max(pct, 2)}%`,
                          backgroundColor: categoryColors[cat.key],
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* Add button */}
        <View style={styles.addRow}>
          <Text style={styles.sectionTitle}>Purchases</Text>
          <Pressable onPress={() => openForm()} style={styles.addBtn}>
            <Plus size={14} color={colors.textInverse} weight="bold" />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          <Pressable
            onPress={() => setFilterCat('all')}
            style={[
              styles.filterPill,
              filterCat === 'all' && styles.filterPillActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filterCat === 'all' && styles.filterTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          {PURCHASE_CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              onPress={() => setFilterCat(cat.key)}
              style={[
                styles.filterPill,
                filterCat === cat.key && {
                  backgroundColor: categoryColors[cat.key] + '14',
                  borderColor: categoryColors[cat.key],
                },
              ]}
            >
              <View style={[styles.filterDot, { backgroundColor: categoryColors[cat.key] }]} />
              <Text
                style={[
                  styles.filterText,
                  filterCat === cat.key && {
                    color: categoryColors[cat.key],
                    fontWeight: fontWeight.semibold,
                  },
                ]}
              >
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Purchase list */}
        {filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No purchases yet</Text>
            <Text style={styles.emptySub}>
              Track what you buy to understand your costs
            </Text>
          </View>
        ) : (
          filtered.map((p) => (
            <View key={p.id} style={styles.purchaseCard}>
              {/* Left: icon circle */}
              <View
                style={[
                  styles.purchaseIcon,
                  { backgroundColor: categoryColors[p.category] + '14' },
                ]}
              >
                <Text style={[styles.purchaseIconText, { color: categoryColors[p.category] }]}>
                  {p.item_name.charAt(0).toUpperCase()}
                </Text>
              </View>

              {/* Center: info */}
              <View style={styles.purchaseInfo}>
                <Text style={styles.purchaseName} numberOfLines={1}>{p.item_name}</Text>
                <Text style={styles.purchaseDetail} numberOfLines={1}>
                  {p.unit === '—'
                    ? 'Fixed cost'
                    : `${p.quantity} ${p.unit} × ${formatCurrency(p.unit_cost)}`}
                  {p.supplier ? `  ·  ${p.supplier}` : ''}
                </Text>
                <View style={styles.purchaseTagRow}>
                  {filterCat === 'all' && (
                    <View
                      style={[
                        styles.purchaseCatTag,
                        { backgroundColor: categoryColors[p.category] + '14' },
                      ]}
                    >
                      <Text style={[styles.purchaseCatText, { color: categoryColors[p.category] }]}>
                        {PURCHASE_CATEGORIES.find((c) => c.key === p.category)?.label}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.purchaseDate}>{dayjs(p.purchased_at).format('MMM D')}</Text>
                </View>
              </View>

              {/* Right: price + actions */}
              <View style={styles.purchaseRight}>
                <Text style={styles.purchaseTotal}>{formatCurrency(p.total_cost)}</Text>
                <View style={styles.purchaseActions}>
                  <Pressable onPress={() => openForm(p)} hitSlop={8} style={styles.actionBtn}>
                    <PencilSimple size={14} color={colors.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(p)} hitSlop={8} style={styles.actionBtnDel}>
                    <Trash size={14} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* ─── Purchase Form Modal ─── */}
      <Modal visible={showForm} transparent animationType="fade">
        <View style={styles.modalBg}>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Purchase' : 'New Purchase'}
              </Text>

              <Text style={styles.fieldLabel}>Item Name</Text>
              <TextInput
                style={styles.input}
                value={form.item_name}
                onChangeText={(t) => setForm({ ...form, item_name: t })}
                placeholder="e.g. Coffee Beans 1kg"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.catGrid}>
                {PURCHASE_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.key}
                    onPress={() => setForm({ ...form, category: cat.key })}
                    style={[
                      styles.catOption,
                      form.category === cat.key && {
                        backgroundColor: categoryColors[cat.key] + '14',
                        borderColor: categoryColors[cat.key],
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.catOptionDot,
                        { backgroundColor: categoryColors[cat.key] },
                      ]}
                    />
                    <Text
                      style={[
                        styles.catOptionText,
                        form.category === cat.key && {
                          color: categoryColors[cat.key],
                          fontWeight: fontWeight.semibold,
                        },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Pricing mode */}
              <View style={styles.costModeRow}>
                <Pressable
                  onPress={() => setForm({ ...form, cost_mode: 'itemized' })}
                  style={[
                    styles.costModeBtn,
                    form.cost_mode === 'itemized' && styles.costModeBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.costModeBtnText,
                      form.cost_mode === 'itemized' && styles.costModeBtnTextActive,
                    ]}
                  >
                    Itemized
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setForm({ ...form, cost_mode: 'fixed' })}
                  style={[
                    styles.costModeBtn,
                    form.cost_mode === 'fixed' && styles.costModeBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.costModeBtnText,
                      form.cost_mode === 'fixed' && styles.costModeBtnTextActive,
                    ]}
                  >
                    Fixed cost
                  </Text>
                </Pressable>
              </View>

              {form.cost_mode === 'itemized' ? (
                <>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldThird}>
                      <Text style={styles.fieldLabel}>Qty</Text>
                      <TextInput
                        style={styles.input}
                        value={form.quantity}
                        onChangeText={(t) => setForm({ ...form, quantity: t })}
                        keyboardType="numeric"
                        placeholder="1"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={styles.fieldThird}>
                      <Text style={styles.fieldLabel}>Unit</Text>
                      <TextInput
                        style={styles.input}
                        value={form.unit}
                        onChangeText={(t) => setForm({ ...form, unit: t })}
                        placeholder="pcs"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={styles.fieldThird}>
                      <Text style={styles.fieldLabel}>Unit Cost (₱)</Text>
                      <TextInput
                        style={styles.input}
                        value={form.unit_cost}
                        onChangeText={(t) => setForm({ ...form, unit_cost: t })}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  </View>

                  {formTotal > 0 && (
                    <View style={styles.totalPreview}>
                      <Text style={styles.totalPreviewLabel}>Total</Text>
                      <Text style={styles.totalPreviewValue}>
                        {formatCurrency(formTotal)}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>Total (₱)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.unit_cost}
                    onChangeText={(t) => setForm({ ...form, unit_cost: t })}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                  />
                </>
              )}

              {/* Content fields — only for ingredients in itemized mode */}
              {form.category === 'ingredients' && form.cost_mode === 'itemized' && (
                <View style={styles.contentSection}>
                  <Text style={styles.contentTitle}>Contains</Text>
                  <Text style={styles.contentHint}>
                    Total content per unit (e.g., 1 bottle = 1000ml)
                  </Text>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.fieldLabel}>Amount</Text>
                      <TextInput
                        style={styles.input}
                        value={form.content_quantity}
                        onChangeText={(t) => setForm({ ...form, content_quantity: t })}
                        keyboardType="numeric"
                        placeholder="e.g. 1000"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.fieldLabel}>Unit</Text>
                      <View style={styles.segmentRow}>
                        {CONTENT_UNITS.map((u) => (
                          <Pressable
                            key={u}
                            onPress={() => setForm({ ...form, content_unit: u })}
                            style={[
                              styles.segmentSm,
                              form.content_unit === u && styles.segmentSmActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.segmentSmText,
                                form.content_unit === u && styles.segmentSmTextActive,
                              ]}
                            >
                              {u}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                  {form.content_quantity && parseFloat(form.content_quantity) > 0 && formTotal > 0 && (
                    <View style={styles.costPerUnitPreview}>
                      <Text style={styles.costPerUnitText}>
                        = ₱{(formTotal / ((parseFloat(form.content_quantity) || 1) * (parseFloat(form.quantity) || 1))).toFixed(2)}/{form.content_unit}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Date picker */}
              <Text style={styles.fieldLabel}>Date</Text>
              <Pressable
                onPress={() => setShowCalendar(!showCalendar)}
                style={styles.dateBtn}
              >
                <Text style={styles.dateBtnText}>
                  {dayjs(form.purchased_at).format('ddd, MMM D, YYYY')}
                </Text>
                {showCalendar ? (
                  <CaretUp size={14} color={colors.textMuted} />
                ) : (
                  <CaretDown size={14} color={colors.textMuted} />
                )}
              </Pressable>
              {showCalendar && (
                <View style={styles.calendarWrap}>
                  <CalendarPicker
                    selected={form.purchased_at}
                    onSelect={(date) => {
                      setForm({ ...form, purchased_at: date });
                      setShowCalendar(false);
                    }}
                  />
                </View>
              )}

              <Text style={styles.fieldLabel}>Supplier (optional)</Text>
              <TextInput
                style={styles.input}
                value={form.supplier}
                onChangeText={(t) => setForm({ ...form, supplier: t })}
                placeholder="e.g. Lazada, local market"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={form.notes}
                onChangeText={(t) => setForm({ ...form, notes: t })}
                placeholder="Any notes about this purchase"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
              />

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setShowForm(false)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={savePurchase}
                  disabled={saving}
                  style={[styles.modalSaveBtn, saving && { opacity: 0.5 }]}
                >
                  <Text style={styles.modalSaveText}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Delete Confirmation Modal ─── */}
      <Modal visible={deletingPurchase !== null} transparent animationType="fade">
        <Pressable style={styles.dialogOverlay} onPress={() => setDeletingPurchase(null)}>
          <Pressable style={styles.dialogCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Are you sure?</Text>
              <Text style={styles.dialogDescription}>
                This will permanently delete "{deletingPurchase?.item_name}". This action cannot be undone.
              </Text>
            </View>
            {deletingPurchase && (
              <View style={styles.dialogDetail}>
                <Text style={styles.dialogDetailText}>
                  {deletingPurchase.quantity} {deletingPurchase.unit} — {formatCurrency(deletingPurchase.total_cost)}
                </Text>
              </View>
            )}
            <View style={styles.dialogFooter}>
              <Pressable
                onPress={() => setDeletingPurchase(null)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                disabled={deleting}
                style={[styles.dialogDestructiveBtn, deleting && { opacity: 0.5 }]}
              >
                <Text style={styles.dialogDestructiveText}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Cash on Hand Modal ─── */}
      <Modal visible={showCashModal} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.denomDialogCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.dialogTitle}>Cash on Hand</Text>
              <View style={styles.cashDisplayRow}>
                <Text style={styles.cashDisplayLabel}>Total</Text>
                <Text style={styles.cashDisplayValue}>{formatCurrency(cashTotal)}</Text>
              </View>
              <Text style={styles.fieldLabel}>Quick amount (₱)</Text>
              <TextInput
                style={styles.input}
                value={cashManual}
                onChangeText={setCashManual}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
              />
              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>By denomination</Text>
              <View style={styles.denomGrid}>
                {[...DENOMINATIONS].reverse().map((d) => (
                  <View key={d} style={styles.denomItem}>
                    <Text style={styles.denomItemLabel}>₱{d >= 1000 ? `${d / 1000}k` : d}</Text>
                    <View style={styles.denomInputRow}>
                      <Pressable
                        onPress={() => setCashDenoms((prev) => ({ ...prev, [d]: Math.max(0, prev[d] - 1) }))}
                        style={styles.denomStepBtn}
                      >
                        <Text style={styles.denomStepText}>−</Text>
                      </Pressable>
                      <TextInput
                        style={styles.denomInput}
                        value={cashDenoms[d] ? cashDenoms[d].toString() : ''}
                        onChangeText={(t) => updateDenom(setCashDenoms, d, t)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        selectTextOnFocus
                      />
                      <Pressable
                        onPress={() => setCashDenoms((prev) => ({ ...prev, [d]: prev[d] + 1 }))}
                        style={styles.denomStepBtn}
                      >
                        <Text style={styles.denomStepText}>+</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.denomSubtotal}>{formatCurrency(d * cashDenoms[d])}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                onPress={() => { setCashDenoms(emptyDenoms()); setCashManual(''); }}
                style={styles.cashResetBtn}
              >
                <Text style={styles.cashResetText}>Reset all</Text>
              </Pressable>
              <View style={styles.dialogFooter}>
                <Pressable onPress={() => setShowCashModal(false)} style={styles.dialogCancelBtn}>
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveCashOnHand} style={styles.modalSaveBtn}>
                  <Text style={styles.modalSaveText}>Save</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Money on Keep Modal ─── */}
      <Modal visible={showKeepModal} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.denomDialogCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.dialogTitle}>Money on Keep</Text>
              <View style={styles.keepDisplayRow}>
                <Text style={styles.keepDisplayLabel}>Total</Text>
                <Text style={styles.keepDisplayValue}>{formatCurrency(keepTotal)}</Text>
              </View>
              <Text style={styles.fieldLabel}>Quick amount (₱)</Text>
              <TextInput
                style={styles.input}
                value={keepManual}
                onChangeText={setKeepManual}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
              />
              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>By denomination</Text>
              <View style={styles.denomGrid}>
                {[...DENOMINATIONS].reverse().map((d) => (
                  <View key={d} style={styles.denomItem}>
                    <Text style={[styles.denomItemLabel, { color: colors.primary }]}>₱{d >= 1000 ? `${d / 1000}k` : d}</Text>
                    <View style={styles.denomInputRow}>
                      <Pressable
                        onPress={() => setKeepDenoms((prev) => ({ ...prev, [d]: Math.max(0, prev[d] - 1) }))}
                        style={styles.denomStepBtn}
                      >
                        <Text style={styles.denomStepText}>−</Text>
                      </Pressable>
                      <TextInput
                        style={styles.denomInput}
                        value={keepDenoms[d] ? keepDenoms[d].toString() : ''}
                        onChangeText={(t) => updateDenom(setKeepDenoms, d, t)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        selectTextOnFocus
                      />
                      <Pressable
                        onPress={() => setKeepDenoms((prev) => ({ ...prev, [d]: prev[d] + 1 }))}
                        style={styles.denomStepBtn}
                      >
                        <Text style={styles.denomStepText}>+</Text>
                      </Pressable>
                    </View>
                    <Text style={[styles.denomSubtotal, { color: colors.primary }]}>{formatCurrency(d * keepDenoms[d])}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                onPress={() => { setKeepDenoms(emptyDenoms()); setKeepManual(''); }}
                style={styles.cashResetBtn}
              >
                <Text style={styles.cashResetText}>Reset all</Text>
              </Pressable>
              <View style={styles.dialogFooter}>
                <Pressable onPress={() => setShowKeepModal(false)} style={styles.dialogCancelBtn}>
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveMoneyOnKeep} style={styles.modalSaveBtn}>
                  <Text style={styles.modalSaveText}>Save</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Stock Adjustment Modal ─── */}
      <StockAdjustmentModal
        visible={adjustingItem !== null}
        ingredient={adjustingItem}
        onClose={() => setAdjustingItem(null)}
        onSaved={fetchIngredients}
      />
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
  // ─── Banners ───
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.danger + '30',
  },
  errorBannerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.danger,
    marginBottom: spacing.xs,
  },
  errorBannerText: {
    fontSize: fontSize.sm,
    color: colors.danger,
    lineHeight: 18,
  },
  // ─── KPI Row ───
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  kpiCardCash: {
    backgroundColor: colors.successLight,
    borderColor: colors.success + '30',
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  kpiLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
  },
  kpiLabelCash: {
    color: colors.success,
  },
  kpiValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  kpiValueCash: {
    color: colors.success,
  },
  kpiHint: {
    fontSize: fontSize.xs,
    color: colors.primary + '90',
    marginTop: 2,
  },
  kpiHintCash: {
    color: colors.success + '90',
  },
  cashDisplayRow: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cashDisplayLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.success,
    marginBottom: spacing.xs,
  },
  cashDisplayValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.success,
  },
  denomGrid: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  denomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  denomItemLabel: {
    width: 44,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.success,
  },
  denomInputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  denomStepBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denomStepText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  denomInput: {
    flex: 1,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
  },
  denomSubtotal: {
    width: 70,
    textAlign: 'right',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.success,
  },
  cashResetBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  cashResetText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  keepDisplayRow: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  keepDisplayLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  keepDisplayValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  // ─── Summary ───
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryCardDark: {
    backgroundColor: colors.textPrimary,
    borderWidth: 0,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  summaryLabelDark: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  summaryValueDark: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textInverse,
  },
  // ─── Breakdown ───
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  breakdownCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  breakdownRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  breakdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  breakdownPct: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    width: 36,
    textAlign: 'right',
  },
  breakdownTotal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 70,
    textAlign: 'right',
  },
  barContainer: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: spacing.md,
    gap: 2,
  },
  barSegment: {
    height: '100%',
    borderRadius: 3,
  },
  // ─── Add ───
  addRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  // ─── Filters ───
  filterScroll: {
    marginBottom: spacing.lg,
  },
  filterRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
  },
  filterPillActive: {
    backgroundColor: colors.textPrimary,
    ...shadow.sm,
  },
  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  filterText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  filterTextActive: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
  },
  // ─── Purchase cards ───
  purchaseCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: spacing.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.md,
  },
  purchaseIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchaseIconText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  purchaseInfo: {
    flex: 1,
    gap: 2,
  },
  purchaseName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  purchaseDetail: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.normal,
  },
  purchaseTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  purchaseCatTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  purchaseCatText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
  },
  purchaseDate: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  purchaseRight: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  purchaseTotal: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  purchaseActions: {
    flexDirection: 'row',
    gap: 2,
  },
  actionBtn: {
    padding: 6,
    borderRadius: borderRadius.full,
  },
  actionBtnDel: {
    padding: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.dangerLight,
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
    textAlign: 'center',
  },
  // ─── Adjust modal ───
  // ─── Modal ───
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
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
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  catOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catOptionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldThird: {
    flex: 1,
  },
  fieldHalf: {
    flex: 1,
  },
  // ─── Content section (ingredients) ───
  contentSection: {
    marginTop: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  contentTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  contentHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segmentSm: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  segmentSmActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  segmentSmText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  segmentSmTextActive: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
  },
  costPerUnitPreview: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  costPerUnitText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.success,
  },
  totalPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  totalPreviewLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  totalPreviewValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  // ─── Cost mode toggle ───
  costModeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  costModeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  costModeBtnActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  costModeBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  costModeBtnTextActive: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
  },
  // ─── Date picker ───
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
  calendarWrap: {
    marginTop: spacing.sm,
  },
  // ─── Actions ───
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
  denomDialogCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
  },
  dialogHeader: {
    marginBottom: spacing.lg,
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
  dialogDetail: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  dialogDetailText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
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
});
