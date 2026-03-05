import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import {
  borderRadius,
  colors,
  fontSize,
  fontWeight,
  spacing,
} from '../constants/theme';

export default function DeveloperScreen() {
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  const fetchInfo = useCallback(async () => {
    setSupabaseStatus('checking');
    try {
      const { error } = await supabase.from('menu_items').select('id').limit(1);
      setSupabaseStatus(error ? 'error' : 'connected');
    } catch {
      setSupabaseStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchInfo();
    }, [fetchInfo])
  );

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const sdkVersion = Constants.expoConfig?.sdkVersion ?? 'unknown';

  const statusColor = {
    checking: colors.textMuted,
    connected: colors.success,
    error: colors.danger,
  }[supabaseStatus];

  const statusLabel = {
    checking: 'Checking...',
    connected: 'Connected',
    error: 'Unreachable',
  }[supabaseStatus];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Tech Stack */}
      <Text style={styles.sectionTitle}>Tech Stack</Text>
      <View style={styles.card}>
        <InfoRow label="Framework" value="React Native + Expo" />
        <InfoRow label="Router" value="Expo Router (file-based)" />
        <InfoRow label="Database" value="Supabase (PostgreSQL)" />
        <InfoRow label="Language" value="TypeScript" />
        <InfoRow label="Date Library" value="dayjs" />
        <InfoRow label="App Version" value={appVersion} />
        <InfoRow label="Expo SDK" value={sdkVersion} last />
      </View>

      {/* Supabase */}
      <Text style={styles.sectionTitle}>Supabase Connection</Text>
      <View style={styles.card}>
        <View style={styles.connectionRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.connectionStatus, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
        <InfoRow label="URL" value="agdyqrwwfbamgasovaxf.supabase.co" />
        <InfoRow label="Auth" value="Anonymous key" last />
      </View>

      {/* Database Tables */}
      <Text style={styles.sectionTitle}>Database Schema</Text>
      <View style={styles.card}>
        <TableRow name="menu_items" desc="Menu catalog with price & cost" />
        <TableRow name="orders" desc="Completed/cancelled orders" />
        <TableRow name="order_items" desc="Line items per order" />
        <TableRow name="purchases" desc="Purchase / expense ledger" />
        <TableRow name="ingredients" desc="Ingredient inventory tracking" />
        <TableRow name="daily_summary" desc="Aggregated daily stats (view)" />
        <TableRow name="item_popularity" desc="Best sellers analytics (view)" last />
      </View>

      {/* Architecture */}
      <Text style={styles.sectionTitle}>Architecture</Text>
      <View style={styles.card}>
        <View style={styles.archItem}>
          <Text style={styles.archLabel}>Data Flow</Text>
          <Text style={styles.archValue}>
            Direct Supabase reads/writes for all operations
          </Text>
        </View>
        <View style={[styles.archItem, styles.archItemBorder]}>
          <Text style={styles.archLabel}>Menu Loading</Text>
          <Text style={styles.archValue}>
            Cache-first from AsyncStorage, background refresh from Supabase
          </Text>
        </View>
        <View style={[styles.archItem, styles.archItemBorder]}>
          <Text style={styles.archLabel}>State Management</Text>
          <Text style={styles.archValue}>
            Local React state (useState) — no global store
          </Text>
        </View>
      </View>

      {/* Actions */}
      <Text style={styles.sectionTitle}>Actions</Text>
      <Pressable onPress={fetchInfo} style={styles.actionBtn}>
        <Text style={styles.actionBtnText}>Refresh Connection</Text>
      </Pressable>

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
  last,
}: {
  label: string;
  value: string;
  valueColor?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function TableRow({
  name,
  desc,
  last,
}: {
  name: string;
  desc: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <View style={styles.tableNameContainer}>
        <Text style={styles.tableName}>{name}</Text>
      </View>
      <Text style={styles.tableDesc} numberOfLines={1}>
        {desc}
      </Text>
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
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  // ─── Card ───
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  infoValue: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    maxWidth: '55%',
    textAlign: 'right',
  },
  // ─── Connection ───
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectionStatus: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  // ─── Table schema ───
  tableNameContainer: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  tableName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    fontFamily: 'monospace',
  },
  tableDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  // ─── Architecture ───
  archItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  archItemBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  archLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  archValue: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  // ─── Actions ───
  actionBtn: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
});
