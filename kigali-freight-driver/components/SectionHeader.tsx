import { Platform, StyleSheet, Text, View } from 'react-native';
import { theme } from '../lib/theme';

export function SectionHeader({ title, subtitle, eyebrow = 'Manifest' }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.tagWrap}>
        <View style={styles.tagDot} />
        <Text style={styles.tag}>{eyebrow}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  tagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  tagDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: theme.colors.primary },
  tag: { color: theme.colors.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.4, fontFamily: mono },
  title: { color: theme.colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.2 },
  subtitle: { color: theme.colors.muted, fontSize: 13, marginTop: 5, lineHeight: 18 },
});
