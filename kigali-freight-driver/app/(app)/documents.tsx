import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { ActionSheet } from '../../components/ActionSheet';
import { ToastOverlay, type Toast } from '../../components/ToastOverlay';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { fetchMyDocuments, uploadDriverDocument, type DriverDocumentStatus, type DocumentType } from '../../lib/api';
import { useUpNavigation } from '../../lib/navigation';
import { captureException } from '../../lib/crashReporting';

const DOCUMENT_ICON: Record<DocumentType, keyof typeof Ionicons.glyphMap> = {
  national_id: 'card-outline',
  drivers_license: 'document-text-outline',
  vehicle_registration: 'car-outline',
  insurance_certificate: 'shield-checkmark-outline',
  roadworthiness_certificate: 'construct-outline',
};

const STATUS_META: Record<DriverDocumentStatus['status'], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  not_submitted: { label: 'Not submitted', color: theme.colors.muted, icon: 'cloud-upload-outline' },
  pending: { label: 'Under review', color: theme.colors.warning, icon: 'time-outline' },
  approved: { label: 'Approved', color: theme.colors.success, icon: 'checkmark-circle-outline' },
  rejected: { label: 'Rejected', color: theme.colors.danger, icon: 'close-circle-outline' },
};

export default function DocumentsScreen() {
  // Reached from Profile, and the hardware back button had the same
  // wrong answer here as on the trip screen — it just had not been hit yet.
  const goToProfile = useUpNavigation('/(app)/profile');
  const { token } = useAuth();
  const [checklist, setChecklist] = useState<DriverDocumentStatus[] | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which document type the "Add document" sheet is currently open for —
  // null means the sheet is closed. Separate from uploadingType, which only
  // turns on once a source (camera/library) has actually been picked.
  const [pickingSourceFor, setPickingSourceFor] = useState<DocumentType | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchMyDocuments(token);
      setChecklist(data.checklist);
      setVerified(data.verified);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your documents.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // useFocusEffect so returning from the upload flow (or after an admin
  // decision) always shows the latest status, not whatever was fetched on
  // first visit.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submitAsset = async (documentType: DocumentType, asset: ImagePicker.ImagePickerAsset) => {
    if (!token) return;
    setUploadingType(documentType);
    try {
      await uploadDriverDocument(token, documentType, {
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType,
      });
      await load();
    } catch (err) {
      setToast({
        icon: 'alert-circle-outline',
        message: err instanceof Error ? err.message : 'Could not upload this document. Try again.',
        tone: 'error',
      });
    } finally {
      setUploadingType(null);
    }
  };

  const onTakePhoto = async (documentType: DocumentType) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setToast({ icon: 'camera-outline', message: 'Allow camera access to take a photo of this document.', tone: 'warning' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
      if (result.canceled || !result.assets?.[0]) return;
      await submitAsset(documentType, result.assets[0]);
    } catch (err) {
      captureException(err, { screen: 'documents', action: 'onTakePhoto' });
      setToast({
        icon: 'alert-circle-outline',
        tone: 'error',
        message: 'Could not open the camera. Try again, or pick the photo from your library.',
      });
    }
  };

  const onPickFromLibrary = async (documentType: DocumentType) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setToast({ icon: 'images-outline', message: 'Allow photo library access to select a clear picture of this document.', tone: 'warning' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false });
      if (result.canceled || !result.assets?.[0]) return;
      await submitAsset(documentType, result.assets[0]);
    } catch (err) {
      captureException(err, { screen: 'documents', action: 'onPickFromLibrary' });
      setToast({
        icon: 'alert-circle-outline',
        tone: 'error',
        message: 'Could not open your photo library. Try again, or take the photo with the camera.',
      });
    }
  };

  // Most drivers won't already have a digitized photo of their ID sitting
  // in their gallery — a straight-to-library picker left "take a photo
  // right now" with no path except leaving the app to use the camera app
  // separately, then coming back to pick it. Offering both up front is the
  // actual common case, not just the convenient one to build.
  const onUpload = (documentType: DocumentType) => {
    setToast(null);
    setPickingSourceFor(documentType);
  };

  const onChooseSource = (source: 'camera' | 'library') => {
    const documentType = pickingSourceFor;
    setPickingSourceFor(null);
    if (!documentType) return;
    if (source === 'camera') {
      void onTakePhoto(documentType);
    } else {
      void onPickFromLibrary(documentType);
    }
  };

  return (
    <>
    <ScreenShell>
      <SectionHeader
        eyebrow="Compliance"
        title="Verification"
        subtitle="Submit these documents so dispatch can clear you to receive assignments."
      />

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} />
      ) : error && checklist === null ? (
        // Only replaces the whole screen with an error when nothing has
        // ever loaded successfully. If a refresh fails after a checklist
        // was already shown (e.g. connection dropped), that last-known
        // checklist stays on screen instead of vanishing behind this text.
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryRail, { backgroundColor: verified ? theme.colors.success : theme.colors.warning }]} />
            <Ionicons
              name={verified ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={verified ? theme.colors.success : theme.colors.warning}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryTitle, { color: verified ? theme.colors.success : theme.colors.warning }]}>
                {verified ? "You're verified" : 'Verification incomplete'}
              </Text>
              <Text style={styles.summaryDetail}>
                {verified
                  ? "All required documents are approved — you're clear to receive assignments."
                  : `${checklist?.filter((d) => d.status === 'approved').length ?? 0} of ${checklist?.length ?? 5} documents approved. You won't receive assignments until all are approved.`}
              </Text>
            </View>
          </View>

          <View>
            {checklist?.map((doc) => {
              const meta = STATUS_META[doc.status];
              const isUploading = uploadingType === doc.documentType;
              // Once a document is submitted, it's out of the driver's
              // hands until an admin makes a decision — no "Replace"
              // self-service re-upload while it's pending or already
              // approved. Only a rejection (an explicit admin action)
              // reopens the upload button, matching how document review
              // works on the dispatcher side.
              const canUpload = doc.status === 'not_submitted' || doc.status === 'rejected';
              return (
                <View key={doc.documentType} style={styles.docRow}>
                  <View style={styles.docIconWrap}>
                    <Ionicons name={DOCUMENT_ICON[doc.documentType]} size={19} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docLabel}>{doc.label}</Text>
                    <View style={styles.docStatusRow}>
                      <Ionicons name={meta.icon} size={12} color={meta.color} />
                      <Text style={[styles.docStatusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    {doc.status === 'rejected' && doc.rejectionReason ? (
                      <Text style={styles.rejectionText}>Reason: {doc.rejectionReason}</Text>
                    ) : null}
                  </View>
                  {canUpload ? (
                    <TouchableOpacity
                      style={styles.uploadButton}
                      activeOpacity={0.85}
                      disabled={isUploading}
                      onPress={() => onUpload(doc.documentType)}
                    >
                      {isUploading ? (
                        <ActivityIndicator color={theme.colors.primary} size="small" />
                      ) : (
                        <Text style={styles.uploadButtonText}>
                          {doc.status === 'rejected' ? 'Redo upload' : 'Upload'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      )}

      <TouchableOpacity onPress={goToProfile} style={styles.secondary} activeOpacity={0.8}>
        <Ionicons name="arrow-back-outline" color={theme.colors.primary} size={16} />
        <Text style={styles.secondaryText}>Back to profile</Text>
      </TouchableOpacity>
    </ScreenShell>

    <ActionSheet
      visible={!!pickingSourceFor}
      title="Add document"
      message="Take a new photo or choose an existing one."
      onCancel={() => setPickingSourceFor(null)}
      options={[
        { key: 'camera', label: 'Take Photo', icon: 'camera-outline', onPress: () => onChooseSource('camera') },
        { key: 'library', label: 'Choose from Library', icon: 'images-outline', onPress: () => onChooseSource('library') },
      ]}
    />

    <ToastOverlay toast={toast} onHide={() => setToast(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  errorText: { color: theme.colors.danger, ...theme.type.bodySm, marginBottom: 12, fontFamily: theme.fonts.body },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  summaryRail: { width: 3, height: 32, borderRadius: 2 },
  summaryTitle: { ...theme.type.body, fontFamily: theme.fonts.bodySemiBold },
  summaryDetail: { color: theme.colors.muted, ...theme.type.label, lineHeight: 17, marginTop: 3, fontFamily: theme.fonts.body },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  docIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: `${theme.colors.primary}1F`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docLabel: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  docStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  docStatusText: { ...theme.type.micro, fontFamily: theme.fonts.mono },
  rejectionText: { color: theme.colors.danger, ...theme.type.micro, marginTop: 3, fontFamily: theme.fonts.body },
  uploadButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 72,
    alignItems: 'center',
  },
  uploadButtonText: { color: theme.colors.primary, ...theme.type.micro, fontFamily: theme.fonts.bodySemiBold },
  secondary: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  secondaryText: { color: theme.colors.primary, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
});
