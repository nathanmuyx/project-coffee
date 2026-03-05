export const colors = {
  // Core
  background: '#FAFAFA',
  card: '#FFFFFF',
  cardHover: '#F9FAFB',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Text
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Brand — subtle indigo accent
  primary: '#4F46E5',
  primaryLight: '#EEF2FF',
  primaryDark: '#3730A3',

  // Semantic
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  info: '#2563EB',
  infoLight: '#EFF6FF',

  // Category accents
  drink: '#6366F1',
  food: '#F59E0B',
  combo: '#8B5CF6',

  // Queue colors
  queue1: '#6366F1',
  queue2: '#EC4899',
  queue3: '#14B8A6',
  queue4: '#F97316',
  queue5: '#8B5CF6',

  // Sync status
  synced: '#059669',
  pending: '#D97706',
  offline: '#9CA3AF',
} as const;

export const queueColors = [
  colors.queue1,
  colors.queue2,
  colors.queue3,
  colors.queue4,
  colors.queue5,
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

export const categoryConfig = {
  drink: { label: 'Drinks', color: colors.drink, icon: 'D' },
  food: { label: 'Food', color: colors.food, icon: 'F' },
  combo: { label: 'Combos', color: colors.combo, icon: 'C' },
} as const;

export type Category = keyof typeof categoryConfig;

export const ingredientCategoryConfig = {
  beans: { label: 'Beans', color: '#92400E' },
  milk: { label: 'Milk & Dairy', color: '#2563EB' },
  syrup: { label: 'Syrups & Sauces', color: '#D97706' },
  sweetener: { label: 'Sweeteners', color: '#DB2777' },
  powder: { label: 'Powders & Tea', color: '#7C3AED' },
  other: { label: 'Other', color: '#6B7280' },
} as const;

export const INGREDIENT_CATEGORIES = [
  'beans', 'milk', 'syrup', 'sweetener', 'powder', 'other',
] as const;

export const GROUP_COLOR_OPTIONS = [
  '#92400E', '#2563EB', '#D97706', '#DB2777', '#7C3AED',
  '#F59E0B', '#14B8A6', '#EC4899', '#9CA3AF', '#6366F1',
  '#059669', '#DC2626', '#0891B2', '#4338CA',
] as const;

export const inventoryCategoryConfig: Record<string, { label: string; color: string }> = {
  beans:       { label: 'Beans',      color: '#92400E' },
  milk:        { label: 'Milk & Dairy', color: '#2563EB' },
  syrup:       { label: 'Syrups',     color: '#D97706' },
  sweetener:   { label: 'Sweeteners', color: '#DB2777' },
  powder:      { label: 'Powders',    color: '#7C3AED' },
  ingredients: { label: 'Ingredients', color: '#6366F1' },
  packaging:   { label: 'Packaging',  color: '#F59E0B' },
  equipment:   { label: 'Equipment',  color: '#14B8A6' },
  supplies:    { label: 'Supplies',   color: '#EC4899' },
  other:       { label: 'Other',      color: '#9CA3AF' },
};
