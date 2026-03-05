import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { CaretLeft, CaretRight } from 'phosphor-react-native';
import {
  borderRadius,
  colors,
  fontSize,
  fontWeight,
  spacing,
} from '../../constants/theme';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function CalendarPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (date: string) => void;
}) {
  const selectedDate = dayjs(selected);
  const [viewMonth, setViewMonth] = useState(selectedDate.startOf('month'));

  const daysInMonth = viewMonth.daysInMonth();
  const startDay = viewMonth.day(); // 0=Sun
  const cells: (number | null)[] = [];

  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  // Pad last week
  const lastWeek = weeks[weeks.length - 1];
  while (lastWeek.length < 7) lastWeek.push(null);

  function handleSelect(day: number) {
    const date = viewMonth.date(day).format('YYYY-MM-DD');
    onSelect(date);
  }

  const isToday = (day: number) =>
    viewMonth.date(day).isSame(dayjs(), 'day');

  const isSelected = (day: number) =>
    viewMonth.date(day).format('YYYY-MM-DD') === selected;

  return (
    <View style={calStyles.container}>
      {/* Header */}
      <View style={calStyles.header}>
        <Pressable
          onPress={() => setViewMonth(viewMonth.subtract(1, 'month'))}
          style={calStyles.navBtn}
        >
          <CaretLeft size={16} color={colors.textSecondary} weight="bold" />
        </Pressable>
        <Text style={calStyles.monthLabel}>
          {viewMonth.format('MMMM YYYY')}
        </Text>
        <Pressable
          onPress={() => setViewMonth(viewMonth.add(1, 'month'))}
          style={calStyles.navBtn}
        >
          <CaretRight size={16} color={colors.textSecondary} weight="bold" />
        </Pressable>
      </View>

      {/* Weekday labels */}
      <View style={calStyles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={calStyles.weekLabel}>
            {w}
          </Text>
        ))}
      </View>

      {/* Day grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={calStyles.weekRow}>
          {week.map((day, di) => {
            if (day === null) {
              return <View key={`e-${di}`} style={calStyles.dayCell} />;
            }
            const sel = isSelected(day);
            const today = isToday(day);
            return (
              <Pressable
                key={day}
                onPress={() => handleSelect(day)}
                style={[
                  calStyles.dayCell,
                  sel && calStyles.dayCellSelected,
                ]}
              >
                <Text
                  style={[
                    calStyles.dayText,
                    today && !sel && calStyles.dayTextToday,
                    sel && calStyles.dayTextSelected,
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const calStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  dayCellSelected: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.sm,
  },
  dayText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  dayTextToday: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  dayTextSelected: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
  },
});
