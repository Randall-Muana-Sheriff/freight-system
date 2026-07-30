import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { token, isReady } = useAuth();

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07111f' }}>
        <ActivityIndicator color="#4FD1C5" />
      </View>
    );
  }

  return <Redirect href={token ? '/(app)' : '/(auth)/login'} />;
}
