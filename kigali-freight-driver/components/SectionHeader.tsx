import { StyleSheet, Text, View } from 'react-native';
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

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  tagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  tagDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: theme.colors.primary },
  tag: { color: theme.colors.muted, ...theme.type.micro, textTransform: 'uppercase', letterSpacing: 1.4, fontFamily: theme.fonts.mono },
  title: { color: theme.colors.text, ...theme.type.title, fontFamily: theme.fonts.headingBlack, letterSpacing: -0.2 },
  subtitle: { color: theme.colors.muted, ...theme.type.bodySm, marginTop: 5, fontFamily: theme.fonts.body },
});
