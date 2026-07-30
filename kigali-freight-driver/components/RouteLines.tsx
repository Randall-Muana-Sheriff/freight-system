import { StyleSheet, View } from 'react-native';
import { theme } from '../lib/theme';

// Faint diagonal route lines with waypoint dots — a road receding into the
// dark, standing in for the glow-orb decoration used elsewhere in
// dark-mode apps generally. Shared by every full-screen shell.
export function RouteLines() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.line, { top: '16%' }]} />
      <View style={[styles.line, { top: '58%', opacity: 0.5 }]} />
      <View style={[styles.dot, { top: '15.3%', left: '74%' }]} />
      <View style={[styles.dot, { top: '57.3%', left: '14%', opacity: 0.5 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    left: -40,
    right: -40,
    height: 1,
    backgroundColor: theme.colors.muted,
    opacity: 0.14,
    transform: [{ rotate: '-7deg' }],
  },
  dot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 99,
    backgroundColor: theme.colors.primary,
    opacity: 0.4,
  },
});
