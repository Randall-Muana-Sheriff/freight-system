import { useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { theme } from '../../lib/theme';
import { AuthTicket, ManifestField, StampButton } from '../../components/AuthTicket';

function todayCode() {
  const d = new Date();
  return `KGL-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-A`;
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Missing details', 'Enter your username and password to sign in.');
      return;
    }
    try {
      setLoading(true);
      await signIn(username.trim(), password);
      router.replace('/(app)');
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthTicket
      kicker="Access Manifest"
      title="Driver Sign-In"
      subtitle="Enter your credentials to receive assignments and report trip status."
      manifestCode={todayCode()}
      stamp="Fleet Access"
      footer={
        <TouchableOpacity onPress={() => router.push('/(auth)/signup')} hitSlop={8}>
          <Text style={{ color: theme.colors.text, fontSize: 13 }}>
            New driver?{' '}
            <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Create an account</Text>
          </Text>
        </TouchableOpacity>
      }
    >
      <ManifestField label="Username" value={username} onChangeText={setUsername} placeholder="e.g. jean.bosco" />
      <ManifestField label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secure />
      <StampButton label="Sign in" onPress={onSubmit} loading={loading} />
    </AuthTicket>
  );
}
