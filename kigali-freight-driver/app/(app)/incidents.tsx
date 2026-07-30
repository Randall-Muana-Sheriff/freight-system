import { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { InlineBanner, type BannerTone } from '../../components/InlineBanner';
import { theme } from '../../lib/theme';
import { reportIncident, isNetworkFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { enqueueOfflineAction } from '../../lib/offlineQueue';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// Pre-fills the title so a driver in a stressful moment (right after an
// accident, standing next to a flat tire) doesn't have to compose one from
// scratch — they can still edit it before sending.
const QUICK_ISSUES = ['Flat tire', 'Vehicle breakdown', 'Accident', 'Traffic delay', 'Route blocked'];

type Banner = { tone: BannerTone; icon: keyof typeof Ionicons.glyphMap; message: string };

export default function IncidentsScreen() {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const descriptionRef = useRef<TextInput>(null);

  const titleMissing = showErrors && !title.trim();
  const descriptionMissing = showErrors && !description.trim();

  const onPickQuickIssue = (issue: string) => {
    setTitle(issue);
    setBanner(null);
    descriptionRef.current?.focus();
  };

  const onSubmit = async () => {
    if (!token) return;
    if (!title.trim() || !description.trim()) {
      setShowErrors(true);
      setBanner({ tone: 'danger', icon: 'alert-circle-outline', message: 'Add a title and a few details before sending.' });
      return;
    }

    setSending(true);
    setBanner(null);
    try {
      await reportIncident(token, { title: title.trim(), description: description.trim() });
      setTitle('');
      setDescription('');
      setShowErrors(false);
      setBanner({ tone: 'success', icon: 'checkmark-circle-outline', message: 'Report sent — dispatch has been notified.' });
    } catch (error) {
      if (isNetworkFailure(error)) {
        await enqueueOfflineAction({
          type: 'incident-report',
          payload: { title: title.trim(), description: description.trim() },
          createdAt: new Date().toISOString(),
        });
        setTitle('');
        setDescription('');
        setShowErrors(false);
        setBanner({ tone: 'warning', icon: 'cloud-offline-outline', message: "Saved offline — it'll send as soon as you're back in range." });
      } else {
        setBanner({
          tone: 'danger',
          icon: 'alert-circle-outline',
          message: error instanceof Error ? error.message : 'Failed to send incident report.',
        });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <ScreenShell>
      <SectionHeader
        eyebrow="Safety"
        title="Report an issue"
        subtitle="Let dispatch know about a delay, breakdown, or anything blocking your delivery."
      />

      {banner ? (
        <InlineBanner tone={banner.tone} icon={banner.icon} message={banner.message} onDismiss={() => setBanner(null)} />
      ) : null}

      <Text style={styles.quickLabel}>Common issues</Text>
      <View style={styles.quickRow}>
        {QUICK_ISSUES.map((issue) => (
          <TouchableOpacity
            key={issue}
            style={[styles.quickChip, title === issue && styles.quickChipActive]}
            activeOpacity={0.85}
            onPress={() => onPickQuickIssue(issue)}
          >
            <Text style={[styles.quickChipText, title === issue && styles.quickChipTextActive]}>{issue}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardTopBar} />

        <Text style={styles.label}>Incident title</Text>
        <TextInput
          placeholder="e.g. Flat tire near Kimironko"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, titleMissing && styles.inputError]}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (banner?.tone === 'danger') setBanner(null);
          }}
        />
        {titleMissing ? <Text style={styles.fieldError}>Add a short title.</Text> : null}

        <Text style={styles.label}>Details</Text>
        <TextInput
          ref={descriptionRef}
          placeholder="What happened, where, and what support is needed?"
          placeholderTextColor={theme.colors.muted}
          multiline
          style={[styles.input, styles.textArea, descriptionMissing && styles.inputError]}
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            if (banner?.tone === 'danger') setBanner(null);
          }}
        />
        {descriptionMissing ? <Text style={styles.fieldError}>Add a few details.</Text> : null}

        <TouchableOpacity activeOpacity={0.9} style={styles.button} onPress={onSubmit} disabled={sending}>
          <Ionicons name="warning-outline" size={16} color={theme.colors.paper} />
          <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Send report'}</Text>
        </TouchableOpacity>
        <Text style={styles.microcopy}>Works offline — we'll send it as soon as you're back in range.</Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  quickLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: mono,
    marginBottom: 10,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  quickChipActive: { backgroundColor: 'rgba(224,162,56,0.16)', borderColor: theme.colors.warning },
  quickChipText: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  quickChipTextActive: { color: theme.colors.warning },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    padding: 18,
    gap: 12,
    overflow: 'hidden',
  },
  cardTopBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: theme.colors.warning },
  label: { color: theme.colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontFamily: mono, marginTop: 6 },
  input: {
    borderRadius: 6,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    color: theme.colors.text,
    fontSize: 14,
  },
  inputError: { borderColor: theme.colors.danger },
  fieldError: { color: theme.colors.danger, fontSize: 11, marginTop: -6 },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  button: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.warning,
    borderRadius: 6,
    paddingVertical: 14,
  },
  buttonText: { color: theme.colors.paper, fontWeight: '900', fontSize: 14 },
  microcopy: { color: theme.colors.muted, fontSize: 11, textAlign: 'center', marginTop: 2 },
});
