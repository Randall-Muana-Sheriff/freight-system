import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { theme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { fetchTodaySafetyChecklist, updateSafetyChecklistItem, type SafetyChecklistItems } from '../lib/api';

// Kept in sync by hand with SAFETY_CHECKLIST_ITEMS in
// safetyChecklistController.js — the canonical list lives in application
// code on both sides rather than the database, so there's nothing to fetch
// before rendering the item labels themselves (only their checked state
// needs a round trip).
const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'seatbelt', label: 'Seatbelt fastened' },
  { key: 'mirrorsLights', label: 'Mirrors & lights checked' },
  { key: 'tyres', label: 'Tyre condition & pressure checked' },
  { key: 'cargo', label: 'Cargo secured' },
  { key: 'fatigue', label: 'Rested and fit to drive' },
];

export function SafetyChecklistCard() {
  const { token } = useAuth();
  const [items, setItems] = useState<SafetyChecklistItems>({});
  const [loading, setLoading] = useState(true);
  // Tracks which single item is mid-request, not a screen-wide flag — so
  // tapping one row doesn't visually freeze the four rows you didn't tap.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      fetchTodaySafetyChecklist(token)
        .then((data) => {
          if (!cancelled) setItems(data.items);
        })
        .catch(() => {
          // Best-effort — an empty (all-unchecked) checklist is a safe
          // fallback if this fails, not worth a screen-level error state.
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [token])
  );

  const toggleItem = async (key: string) => {
    if (!token || pendingKey) return;
    const nextChecked = !items[key];
    setPendingKey(key);
    setItems((current) => ({ ...current, [key]: nextChecked })); // optimistic
    try {
      const data = await updateSafetyChecklistItem(token, key, nextChecked);
      setItems(data.items);
    } catch {
      setItems((current) => ({ ...current, [key]: !nextChecked })); // revert
    } finally {
      setPendingKey(null);
    }
  };

  const completedCount = CHECKLIST_ITEMS.filter((item) => items[item.key]).length;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Pre-departure checklist</Text>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Text style={styles.progress}>{completedCount} of {CHECKLIST_ITEMS.length}</Text>
        )}
      </View>
      {CHECKLIST_ITEMS.map((item) => {
        const checked = !!items[item.key];
        return (
          <TouchableOpacity
            key={item.key}
            style={styles.row}
            activeOpacity={0.7}
            disabled={loading}
            onPress={() => toggleItem(item.key)}
            // The tick is drawn as an icon, so without an explicit checkbox
            // role and state a screen reader announces only the label and
            // gives no way to tell a completed check from an outstanding one.
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled: loading }}
            accessibilityLabel={item.label}
          >
            <Ionicons
              name={checked ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={checked ? theme.colors.primary : theme.colors.muted}
            />
            <Text style={[styles.label, checked && styles.labelChecked]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 20,
    gap: 4,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  progress: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  label: { flex: 1, color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  labelChecked: { color: theme.colors.muted, textDecorationLine: 'line-through' },
});
