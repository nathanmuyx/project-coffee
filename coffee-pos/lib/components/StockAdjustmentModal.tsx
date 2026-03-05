import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../supabase';
import type { Ingredient, StockLogType } from '../types';
import {
  borderRadius,
  colors,
  fontSize,
  fontWeight,
  spacing,
} from '../../constants/theme';

type Props = {
  visible: boolean;
  ingredient: Ingredient | null;
  remainingStock?: number;
  onClose: () => void;
  onSaved: () => void;
};

const REASON_OPTIONS: { key: StockLogType; label: string }[] = [
  { key: 'spoiled', label: 'Spoiled' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'tasting', label: 'Tasting' },
  { key: 'adjustment', label: 'Other' },
];

export function StockAdjustmentModal({ visible, ingredient, remainingStock, onClose, onSaved }: Props) {
  const [quantity, setQuantity] = useState('');
  const [type, setType] = useState<StockLogType>('spoiled');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setQuantity('');
    setType('spoiled');
    setNotes('');
    onClose();
  }

  async function save() {
    if (!ingredient || !quantity) return;
    const amount = parseFloat(quantity) || 0;
    if (amount <= 0) {
      Alert.alert('Invalid', 'Enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      await supabase.from('stock_logs').insert({
        ingredient_id: ingredient.id,
        type,
        quantity: -amount,
        notes: notes.trim() || null,
      });

      const newStock = Math.max(0, ingredient.current_stock - amount);
      await supabase
        .from('ingredients')
        .update({ current_stock: newStock })
        .eq('id', ingredient.id);

      handleClose();
      onSaved();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Adjust Stock</Text>
            <Text style={styles.description}>
              {ingredient?.name} — {(remainingStock ?? ingredient?.current_stock ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} {ingredient?.unit} remaining
            </Text>
          </View>

          <Text style={styles.label}>Reason</Text>
          <View style={styles.reasonRow}>
            {REASON_OPTIONS.map(({ key, label }) => {
              const active = type === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setType(key)}
                  style={[styles.reasonPill, active && styles.reasonPillActive]}
                >
                  <Text style={[styles.reasonText, active && styles.reasonTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Amount used ({ingredient?.unit})</Text>
            <Pressable
              onPress={() => setQuantity((remainingStock ?? ingredient?.current_stock ?? 0).toString())}
              style={styles.allBtn}
            >
              <Text style={styles.allBtnText}>
                All ({(remainingStock ?? ingredient?.current_stock ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} {ingredient?.unit})
              </Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. expired, test batch"
            placeholderTextColor={colors.textMuted}
          />

          <View style={styles.footer}>
            <Pressable onPress={handleClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            >
              <Text style={styles.saveText}>
                {saving ? 'Saving...' : 'Deduct'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    lineHeight: 20,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  allBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warning + '18',
  },
  allBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.warning,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reasonPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonPillActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  reasonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  reasonTextActive: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  cancelBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  saveBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.warning,
  },
  saveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textInverse,
  },
});
