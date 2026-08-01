import { useEffect, useState } from 'react';
import { Modal, TouchableOpacity, View, Image, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

// In-app viewer for delivery/document photos — every "view photo" action
// in the app opens this instead of Linking.openURL, which would hand off
// to the OS browser and take the driver out of the app entirely.
export function ImageViewerModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);

  // Reset the spinner each time a new image is opened — otherwise the
  // second photo viewed in a session would just reuse whatever loading
  // state the first one left behind.
  useEffect(() => {
    if (url) setLoading(true);
  }, [url]);

  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color={theme.colors.paper} />
        </TouchableOpacity>
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: width * 0.92, height: height * 0.75 }}
            resizeMode="contain"
            onLoadEnd={() => setLoading(false)}
          />
        ) : null}
        {loading ? <ActivityIndicator style={StyleSheet.absoluteFillObject} color={theme.colors.primary} pointerEvents="none" /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,15,12,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,239,228,0.12)',
  },
});
