import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { PencilSimple, Trash, Plus, X, Flask, CaretDown, CaretUp, Minus, ArrowsLeftRight, DotsSixVertical } from 'phosphor-react-native';
import { supabase } from '../lib/supabase';
import { setCachedMenu } from '../lib/storage';
import { StockAdjustmentModal } from '../lib/components/StockAdjustmentModal';
import type { Ingredient, IngredientCategory, InventoryGroup, MenuItem, MenuItemIngredient, RecipeEntry, StockLog, StockLogType } from '../lib/types';
import {
  borderRadius,
  categoryConfig,
  colors,
  fontSize,
  fontWeight,
  GROUP_COLOR_OPTIONS,
  inventoryCategoryConfig,
  spacing,
  type Category,
} from '../constants/theme';

type MenuFormData = {
  name: string;
  category: Category;
  price: string;
  is_available: boolean;
  recipe: RecipeEntry[];
};

type IngredientFormData = {
  name: string;
  unit: 'ml' | 'g' | 'pcs';
  category: IngredientCategory;
  group_id: string | null;
  current_stock: string;
  cost_per_unit: string;
  low_stock_threshold: string;
};

const EMPTY_MENU_FORM: MenuFormData = {
  name: '',
  category: 'drink',
  price: '',
  is_available: true,
  recipe: [],
};

const EMPTY_INGREDIENT_FORM: IngredientFormData = {
  name: '',
  unit: 'pcs',
  category: 'other',
  group_id: null,
  current_stock: '',
  cost_per_unit: '',
  low_stock_threshold: '',
};

/** Auto-guess coffee-niche category from ingredient name */
export function guessIngredientCategory(name: string): IngredientCategory {
  const n = name.toLowerCase();
  if (/bean|coffee bean|roast|arabica|robusta|espresso/.test(n)) return 'beans';
  if (/milk|cream|dairy|creamer|oat\s?milk|soy\s?milk|almond\s?milk|condensed/.test(n)) return 'milk';
  if (/syrup|sauce|caramel|hazelnut|vanilla\s+syrup|chocolate\s+(sauce|syrup)/.test(n)) return 'syrup';
  if (/sugar|sweetener|honey|stevia|muscovado|brown\s+sugar/.test(n)) return 'sweetener';
  if (/powder|matcha|cocoa|cacao|tea|chai/.test(n)) return 'powder';
  return 'other';
}

export default function MenuScreen() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [inventoryGroups, setInventoryGroups] = useState<InventoryGroup[]>([]);
  const [activeTab, setActiveTab] = useState<'items' | 'ingredients'>('items');
  const [refreshing, setRefreshing] = useState(false);

  // Menu form
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [menuForm, setMenuForm] = useState<MenuFormData>(EMPTY_MENU_FORM);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [savingMenu, setSavingMenu] = useState(false);

  // Ingredient form
  const [showIngredientForm, setShowIngredientForm] = useState(false);
  const [ingredientForm, setIngredientForm] = useState<IngredientFormData>(EMPTY_INGREDIENT_FORM);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [savingIngredient, setSavingIngredient] = useState(false);

  const [dbError, setDbError] = useState<string | null>(null);

  // Recipe data keyed by menu_item_id
  const [recipeMap, setRecipeMap] = useState<Record<string, MenuItemIngredient[]>>({});

  // Ingredient picker for recipe
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);

  // Inventory tracking: purchased from purchases table, served from orders × recipes, adjusted from stock_logs
  const [totalPurchased, setTotalPurchased] = useState<Record<string, number>>({});
  const [totalServed, setTotalServed] = useState<Record<string, number>>({});
  const [totalAdjusted, setTotalAdjusted] = useState<Record<string, number>>({});

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'menu' | 'ingredient'; item: MenuItem | Ingredient } | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

  // Group CRUD
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupForm, setGroupForm] = useState<{ name: string; color: string }>({ name: '', color: '#6B7280' });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);

  // Per-item inventory accordion
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [stockLogsMap, setStockLogsMap] = useState<Record<string, { logs: StockLog[]; total: number; loading: boolean }>>({});

  // Stock adjustment modal
  const [adjustingItem, setAdjustingItem] = useState<Ingredient | null>(null);

  // Move-to-group modal
  const [movingItem, setMovingItem] = useState<Ingredient | null>(null);

  const fetchAll = useCallback(async () => {
    setStockLogsMap({}); // clear log cache so expanded items re-fetch
    const [menuRes, ingredientRes, recipeRes, purchasesRes, orderItemsRes, groupsRes, adjustLogsRes] = await Promise.all([
      supabase.from('menu_items').select('*').order('sort_order'),
      supabase.from('ingredients').select('*').order('sort_order').order('name'),
      supabase.from('menu_item_ingredients').select('*, ingredient:ingredients(*)'),
      supabase.from('purchases').select('item_name, quantity, content_quantity').eq('category', 'ingredients'),
      supabase.from('order_items').select('menu_item_id, quantity'),
      supabase.from('inventory_groups').select('*').order('sort_order'),
      supabase.from('stock_logs').select('ingredient_id, quantity').in('type', ['spoiled', 'calibration', 'tasting', 'adjustment']),
    ]);

    const errors: string[] = [];
    if (menuRes.error) errors.push(`menu_items: [${menuRes.error.code}] ${menuRes.error.message}`);
    if (ingredientRes.error) errors.push(`ingredients: [${ingredientRes.error.code}] ${ingredientRes.error.message}`);
    if (recipeRes.error) errors.push(`recipes: [${recipeRes.error.code}] ${recipeRes.error.message}`);

    if (errors.length > 0) {
      setDbError(errors.join('\n'));
    } else {
      setDbError(null);
    }

    if (menuRes.data) {
      setMenuItems(menuRes.data);
      await setCachedMenu(menuRes.data.filter((i) => i.is_available));
    }
    if (ingredientRes.data) setIngredients(ingredientRes.data);
    if (groupsRes.data) setInventoryGroups(groupsRes.data);
    if (recipeRes.data) {
      const map: Record<string, MenuItemIngredient[]> = {};
      for (const row of recipeRes.data) {
        if (!map[row.menu_item_id]) map[row.menu_item_id] = [];
        map[row.menu_item_id].push(row);
      }
      setRecipeMap(map);

      // Compute total served per ingredient from orders × recipes
      if (orderItemsRes.data) {
        const recipesByMenu: Record<string, { ingredient_id: string; quantity: number }[]> = {};
        for (const r of recipeRes.data) {
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
    }

    // Compute total purchased per ingredient from purchases table
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

    // Compute total adjustments per ingredient from stock_logs (spoiled/calibration/tasting/adjustment)
    // These quantities are already negative in the DB
    if (adjustLogsRes.data) {
      const adjusted: Record<string, number> = {};
      for (const log of adjustLogsRes.data) {
        adjusted[log.ingredient_id] = (adjusted[log.ingredient_id] || 0) + log.quantity;
      }
      setTotalAdjusted(adjusted);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }

  // ─── Menu Item CRUD ───

  function openMenuForm(item?: MenuItem) {
    if (item) {
      setEditingItemId(item.id);
      const existingRecipe = recipeMap[item.id] || [];
      setMenuForm({
        name: item.name,
        category: item.category,
        price: item.price.toString(),
        is_available: item.is_available,
        recipe: existingRecipe.map((r) => ({
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredient?.name ?? 'Unknown',
          unit: r.ingredient?.unit ?? 'pcs',
          quantity: r.quantity.toString(),
          cost_per_unit: r.ingredient?.cost_per_unit ?? 0,
        })),
      });
    } else {
      setEditingItemId(null);
      setMenuForm(EMPTY_MENU_FORM);
    }
    setShowMenuForm(true);
  }

  const recipeCost = useMemo(() => {
    return menuForm.recipe.reduce((sum, r) => {
      const qty = parseFloat(r.quantity) || 0;
      return sum + qty * r.cost_per_unit;
    }, 0);
  }, [menuForm.recipe]);

  async function saveMenuItem() {
    if (!menuForm.name.trim() || !menuForm.price) {
      Alert.alert('Missing fields', 'Name and price are required.');
      return;
    }

    setSavingMenu(true);

    const base = {
      name: menuForm.name.trim(),
      category: menuForm.category,
      price: parseFloat(menuForm.price),
      cost: recipeCost,
      cost_is_manual: false,
      is_available: menuForm.is_available,
    };

    try {
      let itemId = editingItemId;

      if (editingItemId) {
        const { error } = await supabase
          .from('menu_items')
          .update(base)
          .eq('id', editingItemId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('menu_items')
          .insert({ ...base, sort_order: menuItems.length + 1 })
          .select('id')
          .single();
        if (error) throw error;
        itemId = data.id;
      }

      // Save recipe: delete old rows, insert new
      if (itemId) {
        await supabase.from('menu_item_ingredients').delete().eq('menu_item_id', itemId);
        if (menuForm.recipe.length > 0) {
          const rows = menuForm.recipe
            .filter((r) => parseFloat(r.quantity) > 0)
            .map((r) => ({
              menu_item_id: itemId,
              ingredient_id: r.ingredient_id,
              quantity: parseFloat(r.quantity),
            }));
          if (rows.length > 0) {
            const { error } = await supabase.from('menu_item_ingredients').insert(rows);
            if (error) throw error;
          }
        }
      }

      setShowMenuForm(false);
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save. Check connection.');
    } finally {
      setSavingMenu(false);
    }
  }

  async function toggleAvailability(item: MenuItem) {
    await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id);
    fetchAll();
  }

  function deleteMenuItem(item: MenuItem) {
    setDeleteTarget({ type: 'menu', item });
  }

  // ─── Ingredient CRUD ───

  function openIngredientForm(item?: Ingredient, presetGroupId?: string | null) {
    if (item) {
      setEditingIngredientId(item.id);
      setIngredientForm({
        name: item.name,
        unit: item.unit,
        category: item.category as IngredientCategory,
        group_id: item.group_id,
        current_stock: item.current_stock.toString(),
        cost_per_unit: item.cost_per_unit.toString(),
        low_stock_threshold: item.low_stock_threshold.toString(),
      });
    } else {
      setEditingIngredientId(null);
      setIngredientForm({
        ...EMPTY_INGREDIENT_FORM,
        group_id: presetGroupId ?? null,
        category: presetGroupId ? categoryFromGroup(presetGroupId) : 'other',
      });
    }
    setShowIngredientForm(true);
  }

  async function saveIngredient() {
    if (!ingredientForm.name.trim()) {
      Alert.alert('Missing fields', 'Name is required.');
      return;
    }

    setSavingIngredient(true);
    const payload = {
      name: ingredientForm.name.trim(),
      unit: ingredientForm.unit,
      category: ingredientForm.category,
      group_id: ingredientForm.group_id,
      current_stock: parseFloat(ingredientForm.current_stock) || 0,
      cost_per_unit: parseFloat(ingredientForm.cost_per_unit) || 0,
      low_stock_threshold: parseFloat(ingredientForm.low_stock_threshold) || 0,
    };

    try {
      if (editingIngredientId) {
        const { error } = await supabase.from('ingredients').update(payload).eq('id', editingIngredientId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ingredients').insert(payload);
        if (error) throw error;
      }
      setShowIngredientForm(false);
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save. Check connection.');
    } finally {
      setSavingIngredient(false);
    }
  }

  function deleteIngredient(item: Ingredient) {
    setDeleteTarget({ type: 'ingredient', item });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingItem(true);
    const table = deleteTarget.type === 'menu' ? 'menu_items' : 'ingredients';
    await supabase.from(table).delete().eq('id', deleteTarget.item.id);
    setDeleteTarget(null);
    setDeletingItem(false);
    fetchAll();
  }

  // ─── Move ingredient to group ───

  async function moveToGroup(ingredient: Ingredient, groupId: string | null) {
    const cat = groupId ? categoryFromGroup(groupId) : ingredient.category;
    await supabase.from('ingredients').update({
      group_id: groupId,
      category: cat,
    }).eq('id', ingredient.id);
    setMovingItem(null);
    fetchAll();
  }

  // ─── Drag reorder persistence ───

  async function onReorderGroups(reordered: InventoryGroup[]) {
    setInventoryGroups(reordered);
    const updates = reordered.map((g, i) => ({ id: g.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from('inventory_groups').update({ sort_order: u.sort_order }).eq('id', u.id);
    }
  }

  async function onReorderIngredients(groupId: string | null, reordered: Ingredient[]) {
    // Update local state immediately
    setIngredients((prev) => {
      const otherItems = prev.filter((i) => (i.group_id ?? '__ungrouped__') !== (groupId ?? '__ungrouped__'));
      return [...otherItems, ...reordered];
    });
    const updates = reordered.map((ing, i) => ({ id: ing.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from('ingredients').update({ sort_order: u.sort_order }).eq('id', u.id);
    }
  }

  // ─── Inventory accordion helpers ───

  async function fetchStockLogs(ingredientId: string, offset = 0, limit = 5) {
    setStockLogsMap((prev) => ({
      ...prev,
      [ingredientId]: {
        logs: prev[ingredientId]?.logs ?? [],
        total: prev[ingredientId]?.total ?? 0,
        loading: true,
      },
    }));

    const { data, count } = await supabase
      .from('stock_logs')
      .select('*', { count: 'exact' })
      .eq('ingredient_id', ingredientId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (data) {
      setStockLogsMap((prev) => ({
        ...prev,
        [ingredientId]: {
          logs: offset === 0 ? data : [...(prev[ingredientId]?.logs ?? []), ...data],
          total: count ?? data.length,
          loading: false,
        },
      }));
    }
  }

  function toggleItem(ingredientId: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedItemId === ingredientId) {
      setExpandedItemId(null);
    } else {
      setExpandedItemId(ingredientId);
      if (!stockLogsMap[ingredientId]?.logs.length) {
        fetchStockLogs(ingredientId);
      }
    }
  }

  // ─── Group CRUD ───

  function toggleGroup(groupId: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGroupId((prev) => (prev === groupId ? null : groupId));
  }

  function openGroupForm(group?: InventoryGroup) {
    if (group) {
      setEditingGroupId(group.id);
      setGroupForm({ name: group.name, color: group.color });
    } else {
      setEditingGroupId(null);
      setGroupForm({ name: '', color: '#6B7280' });
    }
    setShowGroupForm(true);
  }

  async function saveGroup() {
    if (!groupForm.name.trim()) {
      Alert.alert('Missing fields', 'Name is required.');
      return;
    }
    setSavingGroup(true);
    try {
      if (editingGroupId) {
        const { error } = await supabase.from('inventory_groups').update({
          name: groupForm.name.trim(),
          color: groupForm.color,
        }).eq('id', editingGroupId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('inventory_groups').insert({
          name: groupForm.name.trim(),
          color: groupForm.color,
          sort_order: inventoryGroups.length,
        });
        if (error) throw error;
      }
      setShowGroupForm(false);
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save group.');
    } finally {
      setSavingGroup(false);
    }
  }

  function deleteGroup(group: InventoryGroup) {
    Alert.alert(
      'Delete Group',
      `Delete "${group.name}"? Ingredients in this group will become ungrouped.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('inventory_groups').delete().eq('id', group.id);
            fetchAll();
          },
        },
      ],
    );
  }

  /** Map group_id → legacy category string for backward compat */
  function categoryFromGroup(groupId: string): IngredientCategory {
    const g = inventoryGroups.find((g) => g.id === groupId);
    if (!g) return 'other';
    const map: Record<string, IngredientCategory> = {
      'Beans': 'beans', 'Milk & Dairy': 'milk', 'Syrups': 'syrup',
      'Sweeteners': 'sweetener', 'Powders': 'powder', 'Packaging': 'packaging',
      'Equipment': 'equipment', 'Supplies': 'supplies', 'Other': 'other',
    };
    return map[g.name] ?? 'other';
  }

  const ingredientsByGroup = useMemo(() => {
    const map: Record<string, Ingredient[]> = {};
    for (const ing of ingredients) {
      const key = ing.group_id ?? '__ungrouped__';
      if (!map[key]) map[key] = [];
      map[key].push(ing);
    }
    return map;
  }, [ingredients]);

  /** Build a readable summary for a group's items */
  function computeGroupSummary(items: Ingredient[]) {
    let lowCount = 0, emptyCount = 0;
    const previews: string[] = [];
    // Track worst progress for the group bar
    let worstProgress = 1;
    let worstItem: { name: string; remaining: number; total: number; unit: string } | null = null;
    for (const ing of items) {
      const purchased = totalPurchased[ing.name] || 0;
      const served = totalServed[ing.id] || 0;
      const total = purchased || (ing.current_stock + served);
      const remaining = Math.max(total - served + (totalAdjusted[ing.id] || 0), 0);
      const progress = total > 0 ? Math.min(remaining / total, 1) : 1;
      const empty = remaining <= 0;
      const low = !empty && ing.low_stock_threshold > 0 && remaining <= ing.low_stock_threshold;
      if (empty) emptyCount++;
      else if (low) lowCount++;
      const stock = empty ? 'Empty' : `${remaining.toLocaleString()} ${ing.unit}`;
      previews.push(`${ing.name} · ${stock}`);
      if (progress < worstProgress) {
        worstProgress = progress;
        worstItem = { name: ing.name, remaining, total, unit: ing.unit };
      }
    }
    const barColor = emptyCount > 0
      ? colors.danger
      : lowCount > 0
        ? colors.warning
        : colors.success;
    // Contextual label for the bar
    let barLabel = '';
    if (items.length === 1) {
      const ing = items[0];
      const purchased = totalPurchased[ing.name] || 0;
      const served = totalServed[ing.id] || 0;
      const total = purchased || (ing.current_stock + served);
      const remaining = Math.max(total - served + (totalAdjusted[ing.id] || 0), 0);
      barLabel = remaining <= 0 ? 'Empty' : `${remaining.toLocaleString()} ${ing.unit} left`;
    } else if (items.length > 1) {
      if (emptyCount > 0 || lowCount > 0) {
        const parts: string[] = [];
        if (emptyCount > 0) parts.push(`${emptyCount} empty`);
        if (lowCount > 0) parts.push(`${lowCount} low`);
        barLabel = parts.join(', ');
      } else {
        barLabel = 'All stocked';
      }
    }
    return { lowCount, emptyCount, previews, worstProgress, barColor, barLabel };
  }

  // Recipe helpers — all items available (ingredients, packaging, supplies, etc.)
  const availableIngredients = useMemo(() => {
    const usedIds = new Set(menuForm.recipe.map((r) => r.ingredient_id));
    return ingredients.filter((i) => !usedIds.has(i.id));
  }, [ingredients, menuForm.recipe]);

  function addRecipeIngredient(ing: Ingredient) {
    setMenuForm((prev) => ({
      ...prev,
      recipe: [
        ...prev.recipe,
        {
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          unit: ing.unit,
          quantity: '',
          cost_per_unit: ing.cost_per_unit,
        },
      ],
    }));
    setShowIngredientPicker(false);
  }

  function updateRecipeQty(ingredientId: string, qty: string) {
    setMenuForm((prev) => ({
      ...prev,
      recipe: prev.recipe.map((r) =>
        r.ingredient_id === ingredientId ? { ...r, quantity: qty } : r
      ),
    }));
  }

  function removeRecipeIngredient(ingredientId: string) {
    setMenuForm((prev) => ({
      ...prev,
      recipe: prev.recipe.filter((r) => r.ingredient_id !== ingredientId),
    }));
  }

  const categories: Category[] = ['drink', 'food', 'combo'];
  const units: Array<'ml' | 'g' | 'pcs'> = ['ml', 'g', 'pcs'];

  function getLogColor(type: StockLogType): string {
    switch (type) {
      case 'purchase': return colors.success;
      case 'sale': return colors.primary;
      case 'spoiled': return colors.danger;
      case 'calibration': return colors.warning;
      case 'tasting': return colors.info;
      case 'adjustment': return colors.textMuted;
      default: return colors.textMuted;
    }
  }

  function getLogLabel(type: StockLogType): string {
    switch (type) {
      case 'purchase': return 'Purchase';
      case 'sale': return 'Sale';
      case 'spoiled': return 'Spoiled';
      case 'calibration': return 'Calibration';
      case 'tasting': return 'Tasting';
      case 'adjustment': return 'Adjustment';
      default: return type;
    }
  }

  return (
    <View style={styles.container}>
      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setActiveTab('items')}
          style={[styles.tab, activeTab === 'items' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'items' && styles.tabTextActive]}>
            Menu Items
          </Text>
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{menuItems.length}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('ingredients')}
          style={[styles.tab, activeTab === 'ingredients' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'ingredients' && styles.tabTextActive]}>
            Inventory
          </Text>
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{ingredients.length}</Text>
          </View>
        </Pressable>
      </View>

      {/* DB error banner */}
      {dbError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerTitle}>Supabase Error</Text>
          <Text style={styles.errorBannerText} selectable>{dbError}</Text>
        </View>
      )}

      {activeTab === 'items' ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
            {/* Add item button */}
            <Pressable onPress={() => openMenuForm()} style={styles.addBtn}>
              <Plus size={16} color={colors.textSecondary} weight="bold" />
              <Text style={styles.addBtnText}>Add Menu Item</Text>
            </Pressable>

            {/* Menu items list */}
            {menuItems.map((item) => {
              const cat = categoryConfig[item.category];
              return (
                <View key={item.id} style={[styles.itemCard, !item.is_available && styles.itemDisabled]}>
                  <View style={styles.itemMain}>
                    <View style={styles.itemTop}>
                      <View style={[styles.catTag, { backgroundColor: cat.color + '14' }]}>
                        <Text style={[styles.catTagText, { color: cat.color }]}>
                          {cat.label}
                        </Text>
                      </View>
                      {(recipeMap[item.id]?.length ?? 0) > 0 && (
                        <View style={styles.recipeBadge}>
                          <Flask size={10} color={colors.primary} weight="fill" />
                          <Text style={styles.recipeBadgeText}>Recipe</Text>
                        </View>
                      )}
                      {!item.is_available && (
                        <View style={styles.unavailableBadge}>
                          <Text style={styles.unavailableBadgeText}>Hidden</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <View style={styles.itemPricing}>
                      <Text style={styles.itemPrice}>₱{item.price}</Text>
                      <Text style={styles.itemCost}>Cost: ₱{item.cost}</Text>
                      <Text style={styles.itemMargin}>
                        Margin: {Math.round(((item.price - item.cost) / item.price) * 100)}%
                      </Text>
                    </View>
                  </View>
                  <View style={styles.itemActions}>
                    <Switch
                      value={item.is_available}
                      onValueChange={() => toggleAvailability(item)}
                      trackColor={{ false: colors.border, true: colors.success + '40' }}
                      thumbColor={item.is_available ? colors.success : colors.textMuted}
                    />
                    <Pressable onPress={() => openMenuForm(item)} style={styles.editBtn}>
                      <PencilSimple size={16} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => deleteMenuItem(item)} style={styles.deleteBtn}>
                      <Trash size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {menuItems.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>No menu items</Text>
                <Text style={styles.emptySub}>Add your first item to get started</Text>
              </View>
            )}
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      ) : (
        <DraggableFlatList
          data={inventoryGroups}
          keyExtractor={(item) => item.id}
          onDragEnd={({ data }) => onReorderGroups(data)}
          containerStyle={{ flex: 1 }}
          contentContainerStyle={styles.content}
          activationDistance={10}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.groupActionRow}>
              <Pressable onPress={() => openIngredientForm()} style={[styles.addBtn, { flex: 1, marginBottom: 0 }]}>
                <Plus size={16} color={colors.textSecondary} weight="bold" />
                <Text style={styles.addBtnText}>Add Item</Text>
              </Pressable>
              <Pressable onPress={() => openGroupForm()} style={[styles.addBtn, { flex: 1, marginBottom: 0 }]}>
                <Plus size={16} color={colors.textSecondary} weight="bold" />
                <Text style={styles.addBtnText}>Add Group</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: group, drag, isActive }: RenderItemParams<InventoryGroup>) => {
            const groupItems = ingredientsByGroup[group.id] ?? [];
            const isGroupExpanded = expandedGroupId === group.id;
            const summary = computeGroupSummary(groupItems);

            return (
              <ScaleDecorator>
                <View style={[styles.groupItem, isActive && { elevation: 8, shadowOpacity: 0.15 }]}>
                  {/* Group header */}
                  <Pressable onPress={() => toggleGroup(group.id)} style={styles.groupHeader}>
                    <Pressable onLongPress={drag} delayLongPress={200} hitSlop={8}>
                      <DotsSixVertical size={16} color={colors.textMuted} weight="bold" />
                    </Pressable>
                    <View style={[styles.groupColorBar, { backgroundColor: group.color }]} />
                    <View style={styles.groupHeaderText}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      <Text style={styles.groupPreview} numberOfLines={1}>
                        {groupItems.length === 0
                          ? 'No items'
                          : groupItems.length === 1
                            ? summary.previews[0]
                            : groupItems.map((i) => i.name).join(', ')
                        }
                      </Text>
                    </View>
                    {groupItems.length > 0 && (
                      <View style={styles.groupBarSection}>
                        <View style={styles.groupBarTrack}>
                          <View style={[styles.groupBarFill, {
                            width: `${Math.max(summary.worstProgress * 100, summary.worstProgress > 0 ? 3 : 0)}%`,
                            backgroundColor: summary.barColor,
                          }]} />
                        </View>
                        <Text style={[styles.groupBarLabel, { color: summary.barColor }]}>
                          {summary.barLabel}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); openGroupForm(group); }}
                      style={styles.groupEditBtn}
                      hitSlop={8}
                    >
                      <PencilSimple size={14} color={colors.textMuted} />
                    </Pressable>
                    {isGroupExpanded
                      ? <CaretUp size={16} color={colors.textMuted} />
                      : <CaretDown size={16} color={colors.textMuted} />
                    }
                  </Pressable>

                  {/* Group body: nested ingredients */}
                  {isGroupExpanded && (
                    <View style={styles.groupBody}>
                      {groupItems.map((ing) => {
                        const isExpanded = expandedItemId === ing.id;
                        const purchased = totalPurchased[ing.name] || 0;
                        const served = totalServed[ing.id] || 0;
                        const total = purchased || (ing.current_stock + served);
                        const remaining = Math.max(total - served + (totalAdjusted[ing.id] || 0), 0);
                        const progress = total > 0 ? Math.min(remaining / total, 1) : 1;
                        const isEmpty = remaining <= 0;
                        const isLow = !isEmpty && ing.low_stock_threshold > 0 && remaining <= ing.low_stock_threshold;
                        const barColor = isEmpty
                          ? colors.danger
                          : isLow || progress <= 0.15
                            ? colors.warning
                            : colors.success;
                        const statusLabel = isEmpty ? ' \u00b7 Empty' : isLow ? ' \u00b7 Low' : '';
                        const entry = stockLogsMap[ing.id];

                        return (
                          <View key={ing.id} style={styles.invItem}>
                            <Pressable onPress={() => toggleItem(ing.id)} style={styles.invHeader}>
                              <View style={[styles.invDot, { backgroundColor: group.color }]} />
                              <View style={styles.invHeaderText}>
                                <Text style={styles.invName} numberOfLines={1}>{ing.name}</Text>
                                <Text style={styles.invSub}>
                                  {remaining.toLocaleString()} {ing.unit}{statusLabel}
                                </Text>
                              </View>
                              <View style={styles.invMiniBarTrack}>
                                <View style={[styles.invMiniBarFill, {
                                  width: `${Math.max(progress * 100, isEmpty ? 0 : 3)}%`,
                                  backgroundColor: barColor,
                                }]} />
                              </View>
                              {isExpanded
                                ? <CaretUp size={16} color={colors.textMuted} />
                                : <CaretDown size={16} color={colors.textMuted} />
                              }
                            </Pressable>

                            {isExpanded && (
                              <View style={styles.invBody}>
                                <View style={styles.invActions}>
                                  <Pressable onPress={() => setMovingItem(ing)} style={styles.invActionBtn}>
                                    <ArrowsLeftRight size={14} color={colors.primary} weight="bold" />
                                    <Text style={[styles.invActionText, { color: colors.primary }]}>Move</Text>
                                  </Pressable>
                                  <Pressable onPress={() => setAdjustingItem(ing)} style={styles.invActionBtn}>
                                    <Minus size={14} color={colors.warning} weight="bold" />
                                    <Text style={styles.invActionText}>Adjust</Text>
                                  </Pressable>
                                  <Pressable onPress={() => openIngredientForm(ing)} style={styles.invActionBtn}>
                                    <PencilSimple size={14} color={colors.textSecondary} />
                                    <Text style={styles.invActionText}>Edit</Text>
                                  </Pressable>
                                  <Pressable onPress={() => deleteIngredient(ing)} style={styles.invActionBtnDanger}>
                                    <Trash size={14} color={colors.danger} />
                                    <Text style={[styles.invActionText, { color: colors.danger }]}>Delete</Text>
                                  </Pressable>
                                </View>

                                <Text style={styles.invHistoryTitle}>Stock History</Text>

                                {entry?.loading && !entry.logs.length && (
                                  <Text style={styles.invLogEmpty}>Loading history...</Text>
                                )}
                                {entry && !entry.loading && entry.logs.length === 0 && (
                                  <Text style={styles.invLogEmpty}>No stock history yet</Text>
                                )}
                                {entry?.logs.map((log) => (
                                  <View key={log.id} style={styles.invLogRow}>
                                    <View style={[styles.invLogIcon, { backgroundColor: getLogColor(log.type) + '18' }]}>
                                      <Text style={[styles.invLogIconText, { color: getLogColor(log.type) }]}>
                                        {log.quantity > 0 ? '+' : '\u2212'}
                                      </Text>
                                    </View>
                                    <View style={styles.invLogContent}>
                                      <Text style={styles.invLogType}>
                                        {getLogLabel(log.type)}
                                        <Text style={[styles.invLogQty, { color: log.quantity > 0 ? colors.success : colors.textSecondary }]}>
                                          {' '}{log.quantity > 0 ? '+' : ''}{log.quantity.toLocaleString()} {ing.unit}
                                        </Text>
                                      </Text>
                                      {log.notes ? <Text style={styles.invLogNotes} numberOfLines={1}>{log.notes}</Text> : null}
                                    </View>
                                    <Text style={styles.invLogTime}>
                                      {dayjs(log.created_at).format('MMM D')}
                                    </Text>
                                  </View>
                                ))}

                                {entry && entry.total > entry.logs.length && (
                                  <Pressable
                                    onPress={() => fetchStockLogs(ing.id, entry.logs.length, 20)}
                                    style={styles.invViewAllBtn}
                                  >
                                    <Text style={styles.invViewAllText}>
                                      View All ({entry.total - entry.logs.length} more)
                                    </Text>
                                  </Pressable>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                      <Pressable
                        onPress={() => openIngredientForm(undefined, group.id)}
                        style={styles.groupAddBtn}
                      >
                        <Plus size={14} color={colors.textMuted} weight="bold" />
                        <Text style={styles.groupAddBtnText}>Add to {group.name}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </ScaleDecorator>
            );
          }}
          ListFooterComponent={
            <>
            {/* Ungrouped items — always visible */}
            {(() => {
              const ungroupedItems = ingredientsByGroup['__ungrouped__'] ?? [];
              const ungroupedSummary = computeGroupSummary(ungroupedItems);
              return (
              <View style={styles.groupItem}>
                <Pressable onPress={() => toggleGroup('__ungrouped__')} style={styles.groupHeader}>
                  <View style={[styles.groupColorBar, { backgroundColor: colors.textMuted }]} />
                  <View style={styles.groupHeaderText}>
                    <Text style={styles.groupName}>Ungrouped</Text>
                    <Text style={styles.groupPreview} numberOfLines={1}>
                      {ungroupedItems.length === 0
                        ? 'No items'
                        : ungroupedItems.length === 1
                          ? ungroupedSummary.previews[0]
                          : ungroupedItems.map((i) => i.name).join(', ')
                      }
                    </Text>
                  </View>
                  {ungroupedItems.length > 0 && (
                    <View style={styles.groupBarSection}>
                      <View style={styles.groupBarTrack}>
                        <View style={[styles.groupBarFill, {
                          width: `${Math.max(ungroupedSummary.worstProgress * 100, ungroupedSummary.worstProgress > 0 ? 3 : 0)}%`,
                          backgroundColor: ungroupedSummary.barColor,
                        }]} />
                      </View>
                      <Text style={[styles.groupBarLabel, { color: ungroupedSummary.barColor }]}>
                        {ungroupedSummary.barLabel}
                      </Text>
                    </View>
                  )}
                  {expandedGroupId === '__ungrouped__'
                    ? <CaretUp size={16} color={colors.textMuted} />
                    : <CaretDown size={16} color={colors.textMuted} />
                  }
                </Pressable>

                {expandedGroupId === '__ungrouped__' && (
                  <View style={styles.groupBody}>
                    {ungroupedItems.map((ing) => {
                      const isExpanded = expandedItemId === ing.id;
                      const catConfig = inventoryCategoryConfig[ing.category] ?? inventoryCategoryConfig.other;
                      const purchased = totalPurchased[ing.name] || 0;
                      const served = totalServed[ing.id] || 0;
                      const total = purchased || (ing.current_stock + served);
                      const remaining = Math.max(total - served + (totalAdjusted[ing.id] || 0), 0);
                      const progress = total > 0 ? Math.min(remaining / total, 1) : 1;
                      const isEmpty = remaining <= 0;
                      const isLow = !isEmpty && ing.low_stock_threshold > 0 && remaining <= ing.low_stock_threshold;
                      const barColor = isEmpty
                        ? colors.danger
                        : isLow || progress <= 0.15
                          ? colors.warning
                          : colors.success;
                      const statusLabel = isEmpty ? ' \u00b7 Empty' : isLow ? ' \u00b7 Low' : '';
                      const entry = stockLogsMap[ing.id];

                      return (
                        <View key={ing.id} style={styles.invItem}>
                          <Pressable onPress={() => toggleItem(ing.id)} style={styles.invHeader}>
                            <View style={[styles.invDot, { backgroundColor: catConfig.color }]} />
                            <View style={styles.invHeaderText}>
                              <Text style={styles.invName} numberOfLines={1}>{ing.name}</Text>
                              <Text style={styles.invSub}>
                                {remaining.toLocaleString()} {ing.unit}{statusLabel}
                              </Text>
                            </View>
                            <View style={styles.invMiniBarTrack}>
                              <View style={[styles.invMiniBarFill, {
                                width: `${Math.max(progress * 100, isEmpty ? 0 : 3)}%`,
                                backgroundColor: barColor,
                              }]} />
                            </View>
                            {isExpanded
                              ? <CaretUp size={16} color={colors.textMuted} />
                              : <CaretDown size={16} color={colors.textMuted} />
                            }
                          </Pressable>

                          {isExpanded && (
                            <View style={styles.invBody}>
                              <View style={styles.invActions}>
                                <Pressable onPress={() => setAdjustingItem(ing)} style={styles.invActionBtn}>
                                  <Minus size={14} color={colors.warning} weight="bold" />
                                  <Text style={styles.invActionText}>Adjust</Text>
                                </Pressable>
                                <Pressable onPress={() => openIngredientForm(ing)} style={styles.invActionBtn}>
                                  <PencilSimple size={14} color={colors.textSecondary} />
                                  <Text style={styles.invActionText}>Edit</Text>
                                </Pressable>
                                <Pressable onPress={() => deleteIngredient(ing)} style={styles.invActionBtnDanger}>
                                  <Trash size={14} color={colors.danger} />
                                  <Text style={[styles.invActionText, { color: colors.danger }]}>Delete</Text>
                                </Pressable>
                              </View>

                              <Text style={styles.invHistoryTitle}>Stock History</Text>

                              {entry?.loading && !entry.logs.length && (
                                <Text style={styles.invLogEmpty}>Loading history...</Text>
                              )}
                              {entry && !entry.loading && entry.logs.length === 0 && (
                                <Text style={styles.invLogEmpty}>No stock history yet</Text>
                              )}
                              {entry?.logs.map((log) => (
                                <View key={log.id} style={styles.invLogRow}>
                                  <View style={[styles.invLogIcon, { backgroundColor: getLogColor(log.type) + '18' }]}>
                                    <Text style={[styles.invLogIconText, { color: getLogColor(log.type) }]}>
                                      {log.quantity > 0 ? '+' : '\u2212'}
                                    </Text>
                                  </View>
                                  <View style={styles.invLogContent}>
                                    <Text style={styles.invLogType}>
                                      {getLogLabel(log.type)}
                                      <Text style={[styles.invLogQty, { color: log.quantity > 0 ? colors.success : colors.textSecondary }]}>
                                        {' '}{log.quantity > 0 ? '+' : ''}{log.quantity.toLocaleString()} {ing.unit}
                                      </Text>
                                    </Text>
                                    {log.notes ? <Text style={styles.invLogNotes} numberOfLines={1}>{log.notes}</Text> : null}
                                  </View>
                                  <Text style={styles.invLogTime}>
                                    {dayjs(log.created_at).format('MMM D')}
                                  </Text>
                                </View>
                              ))}

                              {entry && entry.total > entry.logs.length && (
                                <Pressable
                                  onPress={() => fetchStockLogs(ing.id, entry.logs.length, 20)}
                                  style={styles.invViewAllBtn}
                                >
                                  <Text style={styles.invViewAllText}>
                                    View All ({entry.total - entry.logs.length} more)
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                    <View style={styles.groupAddRow}>
                      <Pressable
                        onPress={() => openIngredientForm()}
                        style={styles.groupAddBtn}
                      >
                        <Plus size={14} color={colors.textMuted} weight="bold" />
                        <Text style={styles.groupAddBtnText}>Add Item</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => openGroupForm()}
                        style={styles.groupAddBtn}
                      >
                        <Plus size={14} color={colors.textMuted} weight="bold" />
                        <Text style={styles.groupAddBtnText}>Add Group</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
              );
            })()}

            {ingredients.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>No inventory items</Text>
                <Text style={styles.emptySub}>Add purchases in Costing to see them here</Text>
              </View>
            )}
            <View style={{ height: spacing.xxl }} />
            </>
          }
        />
      )}

      {/* ─── Menu Item Modal ─── */}
      <Modal visible={showMenuForm} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingItemId ? 'Edit Item' : 'New Menu Item'}
              </Text>

              <Text style={styles.fieldLabel}>Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={menuForm.name}
                onChangeText={(t) => setMenuForm({ ...menuForm, name: t })}
                placeholder="e.g. Iced Americano"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.segmentRow}>
                {categories.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setMenuForm({ ...menuForm, category: cat })}
                    style={[
                      styles.segment,
                      menuForm.category === cat && styles.segmentActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        menuForm.category === cat && styles.segmentTextActive,
                      ]}
                    >
                      {categoryConfig[cat].label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* ─── Recipe Section ─── */}
              <Text style={styles.recipeSectionTitle}>Recipe & Materials</Text>
              <Text style={styles.recipeSectionHint}>
                Add ingredients, cups, lids, etc. to calculate cost
              </Text>

              {menuForm.recipe.map((entry) => {
                const lineCost = (parseFloat(entry.quantity) || 0) * entry.cost_per_unit;
                return (
                  <View key={entry.ingredient_id} style={styles.recipeRow}>
                    <View style={styles.recipeInfo}>
                      <Text style={styles.recipeIngName}>{entry.ingredient_name}</Text>
                      <View style={styles.recipeQtyRow}>
                        <TextInput
                          style={styles.recipeQtyInput}
                          value={entry.quantity}
                          onChangeText={(t) => updateRecipeQty(entry.ingredient_id, t)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                        />
                        <Text style={styles.recipeUnit}>{entry.unit}</Text>
                        <Text style={styles.recipeLineCost}>
                          = ₱{lineCost.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => removeRecipeIngredient(entry.ingredient_id)}
                      style={styles.recipeRemoveBtn}
                      hitSlop={8}
                    >
                      <X size={14} color={colors.danger} />
                    </Pressable>
                  </View>
                );
              })}

              {availableIngredients.length > 0 && (
                <Pressable
                  onPress={() => setShowIngredientPicker(true)}
                  style={styles.addRecipeBtn}
                >
                  <Plus size={14} color={colors.primary} weight="bold" />
                  <Text style={styles.addRecipeBtnText}>Add Item</Text>
                </Pressable>
              )}

              {menuForm.recipe.length > 0 && (
                <View style={styles.recipeTotalRow}>
                  <Text style={styles.recipeTotalLabel}>Recipe Cost</Text>
                  <Text style={styles.recipeTotalValue}>₱{recipeCost.toFixed(2)}</Text>
                </View>
              )}

              {/* ─── Price ─── */}
              <Text style={styles.fieldLabel}>Price (₱) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={menuForm.price}
                onChangeText={(t) => setMenuForm({ ...menuForm, price: t })}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />

              {/* ─── Profit Preview ─── */}
              {menuForm.price && recipeCost > 0 && (
                <View style={styles.marginPreview}>
                  <Text style={styles.marginPreviewText}>
                    Cost: ₱{recipeCost.toFixed(2)} · Profit: ₱{(parseFloat(menuForm.price) - recipeCost).toFixed(0)} · Margin: {Math.round(((parseFloat(menuForm.price) - recipeCost) / parseFloat(menuForm.price)) * 100)}%
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowMenuForm(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveMenuItem}
                disabled={savingMenu}
                style={[styles.modalSaveBtn, savingMenu && { opacity: 0.5 }]}
              >
                <Text style={styles.modalSaveText}>
                  {savingMenu ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Item Picker Modal ─── */}
      <Modal visible={showIngredientPicker} transparent animationType="fade">
        <Pressable style={styles.dialogOverlay} onPress={() => setShowIngredientPicker(false)}>
          <Pressable style={styles.dialogCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Select Item</Text>
            <ScrollView style={styles.pickerList}>
              {inventoryGroups.map((group) => {
                const items = availableIngredients.filter((i) => i.group_id === group.id);
                if (items.length === 0) return null;
                return (
                  <View key={group.id}>
                    <Text style={styles.pickerSectionTitle}>{group.name}</Text>
                    {items.map((ing) => (
                      <Pressable
                        key={ing.id}
                        onPress={() => addRecipeIngredient(ing)}
                        style={styles.pickerItem}
                      >
                        <Text style={styles.pickerItemName}>{ing.name}</Text>
                        <Text style={styles.pickerItemDetail}>
                          ₱{ing.cost_per_unit}/{ing.unit}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                );
              })}
              {(() => {
                const ungrouped = availableIngredients.filter((i) => !i.group_id);
                if (ungrouped.length === 0) return null;
                return (
                  <View>
                    <Text style={styles.pickerSectionTitle}>Ungrouped</Text>
                    {ungrouped.map((ing) => (
                      <Pressable
                        key={ing.id}
                        onPress={() => addRecipeIngredient(ing)}
                        style={styles.pickerItem}
                      >
                        <Text style={styles.pickerItemName}>{ing.name}</Text>
                        <Text style={styles.pickerItemDetail}>
                          ₱{ing.cost_per_unit}/{ing.unit}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                );
              })()}
              {availableIngredients.length === 0 && (
                <Text style={styles.pickerEmpty}>No items available. Add purchases in Costing first.</Text>
              )}
            </ScrollView>
            <View style={styles.dialogFooter}>
              <Pressable
                onPress={() => setShowIngredientPicker(false)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Delete Confirmation Modal ─── */}
      <Modal visible={deleteTarget !== null} transparent animationType="fade">
        <Pressable style={styles.dialogOverlay} onPress={() => setDeleteTarget(null)}>
          <Pressable style={styles.dialogCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Are you sure?</Text>
              <Text style={styles.dialogDescription}>
                This will permanently delete "{deleteTarget?.item.name}". This action cannot be undone.
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
                disabled={deletingItem}
                style={[styles.dialogDestructiveBtn, deletingItem && { opacity: 0.5 }]}
              >
                <Text style={styles.dialogDestructiveText}>
                  {deletingItem ? 'Deleting...' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Ingredient Modal ─── */}
      <Modal visible={showIngredientForm} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingIngredientId ? 'Edit Ingredient' : 'New Ingredient'}
            </Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={ingredientForm.name}
              onChangeText={(t) => setIngredientForm({ ...ingredientForm, name: t })}
              placeholder="e.g. Coffee Beans"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Unit</Text>
            <View style={styles.segmentRow}>
              {units.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setIngredientForm({ ...ingredientForm, unit: u })}
                  style={[
                    styles.segment,
                    ingredientForm.unit === u && styles.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      ingredientForm.unit === u && styles.segmentTextActive,
                    ]}
                  >
                    {u}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Group</Text>
            <View style={styles.catPickerRow}>
              {inventoryGroups.map((group) => {
                const active = ingredientForm.group_id === group.id;
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => setIngredientForm({ ...ingredientForm, group_id: group.id, category: categoryFromGroup(group.id) })}
                    style={[
                      styles.catPill,
                      active && { backgroundColor: group.color, borderColor: group.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catPillText,
                        active && { color: colors.textInverse, fontWeight: fontWeight.semibold },
                      ]}
                    >
                      {group.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Current Stock</Text>
                <TextInput
                  style={styles.input}
                  value={ingredientForm.current_stock}
                  onChangeText={(t) => setIngredientForm({ ...ingredientForm, current_stock: t })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Cost per Unit (₱)</Text>
                <TextInput
                  style={styles.input}
                  value={ingredientForm.cost_per_unit}
                  onChangeText={(t) => setIngredientForm({ ...ingredientForm, cost_per_unit: t })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Low Stock Threshold</Text>
            <TextInput
              style={styles.input}
              value={ingredientForm.low_stock_threshold}
              onChangeText={(t) => setIngredientForm({ ...ingredientForm, low_stock_threshold: t })}
              keyboardType="numeric"
              placeholder="Alert when stock falls below this"
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowIngredientForm(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveIngredient}
                disabled={savingIngredient}
                style={[styles.modalSaveBtn, savingIngredient && { opacity: 0.5 }]}
              >
                <Text style={styles.modalSaveText}>
                  {savingIngredient ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Group Form Modal ─── */}
      <Modal visible={showGroupForm} transparent animationType="fade">
        <Pressable style={styles.dialogOverlay} onPress={() => setShowGroupForm(false)}>
          <Pressable style={styles.dialogCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>
              {editingGroupId ? 'Edit Group' : 'New Group'}
            </Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={groupForm.name}
              onChangeText={(t) => setGroupForm({ ...groupForm, name: t })}
              placeholder="e.g. Beans"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Color</Text>
            <View style={styles.colorPickerRow}>
              {GROUP_COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setGroupForm({ ...groupForm, color: c })}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    groupForm.color === c && styles.colorSwatchActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.dialogFooter}>
              {editingGroupId && (
                <Pressable
                  onPress={() => {
                    const g = inventoryGroups.find((g) => g.id === editingGroupId);
                    if (g) { setShowGroupForm(false); deleteGroup(g); }
                  }}
                  style={styles.dialogDestructiveBtn}
                >
                  <Text style={styles.dialogDestructiveText}>Delete</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setShowGroupForm(false)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveGroup}
                disabled={savingGroup}
                style={[styles.modalSaveBtn, savingGroup && { opacity: 0.5 }]}
              >
                <Text style={styles.modalSaveText}>
                  {savingGroup ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Move to Group Modal ─── */}
      <Modal visible={movingItem !== null} transparent animationType="fade">
        <Pressable style={styles.dialogOverlay} onPress={() => setMovingItem(null)}>
          <Pressable style={styles.dialogCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Move "{movingItem?.name}"</Text>
            <Text style={styles.moveSubtitle}>Select a group</Text>
            <ScrollView style={styles.moveList}>
              {inventoryGroups.map((group) => {
                const isCurrent = movingItem?.group_id === group.id;
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => !isCurrent && movingItem && moveToGroup(movingItem, group.id)}
                    style={[styles.moveRow, isCurrent && styles.moveRowCurrent]}
                  >
                    <View style={[styles.moveDot, { backgroundColor: group.color }]} />
                    <Text style={[styles.moveRowText, isCurrent && styles.moveRowTextCurrent]}>
                      {group.name}
                    </Text>
                    {isCurrent && (
                      <Text style={styles.moveCurrentLabel}>Current</Text>
                    )}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => movingItem && moveToGroup(movingItem, null)}
                style={[styles.moveRow, !movingItem?.group_id && styles.moveRowCurrent]}
              >
                <View style={[styles.moveDot, { backgroundColor: colors.textMuted }]} />
                <Text style={[styles.moveRowText, !movingItem?.group_id && styles.moveRowTextCurrent]}>
                  Ungrouped
                </Text>
                {!movingItem?.group_id && (
                  <Text style={styles.moveCurrentLabel}>Current</Text>
                )}
              </Pressable>
            </ScrollView>
            <View style={styles.dialogFooter}>
              <Pressable onPress={() => setMovingItem(null)} style={styles.dialogCancelBtn}>
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Stock Adjustment Modal ─── */}
      <StockAdjustmentModal
        visible={adjustingItem !== null}
        ingredient={adjustingItem}
        remainingStock={adjustingItem ? (() => {
          const purchased = totalPurchased[adjustingItem.name] || 0;
          const served = totalServed[adjustingItem.id] || 0;
          const total = purchased || (adjustingItem.current_stock + served);
          return Math.max(total - served + (totalAdjusted[adjustingItem.id] || 0), 0);
        })() : undefined}
        onClose={() => setAdjustingItem(null)}
        onSaved={fetchAll}
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
  // ─── Error banner ───
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: '#DC2626',
    marginBottom: spacing.xs,
  },
  errorBannerText: {
    fontSize: fontSize.sm,
    color: '#DC2626',
    lineHeight: 18,
  },
  // ─── Tabs ───
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.textPrimary,
  },
  tabText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  tabBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  tabBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
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
  // ─── Item cards ───
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemDisabled: {
    opacity: 0.5,
  },
  itemMain: {
    flex: 1,
  },
  itemTop: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  catTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  catTagText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  unavailableBadge: {
    backgroundColor: colors.borderLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  unavailableBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  itemName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  itemPricing: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  itemPrice: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemCost: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  itemMargin: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: fontWeight.medium,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.dangerLight,
  },
  // ─── Group accordion ───
  groupActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  groupItem: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  groupColorBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  groupHeaderText: {
    flex: 1,
  },
  groupName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  groupPreview: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  groupBarSection: {
    alignItems: 'flex-end',
    gap: 3,
    minWidth: 72,
  },
  groupBarTrack: {
    width: 60,
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  groupBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  groupBarLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  groupEditBtn: {
    padding: spacing.sm,
  },
  groupBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  groupEmptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  groupAddRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  groupAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
  },
  groupAddBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  colorPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
  },
  colorSwatchActive: {
    borderWidth: 3,
    borderColor: colors.textPrimary,
  },
  // ─── Inventory accordion ───
  invItem: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  invHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  invDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  invHeaderText: {
    flex: 1,
  },
  invName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  invSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  invMiniBarTrack: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: spacing.sm,
  },
  invMiniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  invBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  invActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  invActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  invActionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.dangerLight,
  },
  invActionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  invHistoryTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  invLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  invLogIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invLogIconText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  invLogContent: {
    flex: 1,
  },
  invLogType: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  invLogQty: {
    fontWeight: fontWeight.semibold,
  },
  invLogNotes: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  invLogTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  invLogEmpty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  invViewAllBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  invViewAllText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  // ─── Empty state ───
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
  // ─── Recipe badge ───
  recipeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  recipeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  // ─── Modal ───
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
    marginBottom: spacing.xl,
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
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  segmentText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
  },
  catPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  catPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catPillText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  fieldHalf: {
    flex: 1,
  },
  marginPreview: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  marginPreviewText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.success,
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
  // ─── Required asterisk ───
  required: {
    color: colors.danger,
    fontWeight: fontWeight.bold,
  },
  // ─── Disabled input ───
  inputDisabled: {
    backgroundColor: colors.borderLight,
    color: colors.textMuted,
  },
  // ─── Recipe section ───
  recipeSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  recipeSectionHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeIngName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  recipeQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recipeQtyInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    width: 70,
    textAlign: 'center',
  },
  recipeUnit: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  recipeLineCost: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: fontWeight.semibold,
  },
  recipeRemoveBtn: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  addRecipeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  addRecipeBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  recipeTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  recipeTotalLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
  },
  recipeTotalValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  // ─── Cost toggle ───
  costToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  costToggleLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  // ─── Ingredient picker ───
  pickerList: {
    maxHeight: 250,
    marginBottom: spacing.lg,
  },
  pickerSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  pickerItemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  pickerItemDetail: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  pickerEmpty: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
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
  // ─── Move to group modal ───
  moveSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  moveList: {
    maxHeight: 300,
    marginBottom: spacing.lg,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  moveRowCurrent: {
    backgroundColor: colors.primaryLight,
  },
  moveDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  moveRowText: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  moveRowTextCurrent: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  moveCurrentLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
});
