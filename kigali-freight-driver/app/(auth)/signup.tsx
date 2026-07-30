import { useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { theme } from '../../lib/theme';
import { AuthTicket, ManifestField, StampButton } from '../../components/AuthTicket';

function newSerial() {
  const n = Math.floor(1000 + Math.random() * 8999);
  return `KGL-DRV-${n}`;
}

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [serial] = useState(newSerial);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      Alert.alert('Username too short', 'Username must be at least 3 characters.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords don’t match', 'Re-enter the same password in both fields.');
      return;
    }

    try {
      setLoading(true);
      await signUp(trimmedUsername, password);
      router.replace('/(app)');
    } catch (error) {
      Alert.alert('Registration failed', error instanceof Error ? error.message : 'Unable to create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthTicket
      kicker="New Driver Manifest"
      title="Join the Fleet"
      subtitle="Register with a username and password. You'll be dispatched as a driver account."
      manifestCode={serial}
      stamp="Driver Intake"
      footer={
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
          <Text style={{ color: theme.colors.text, fontSize: 13 }}>
            Already registered?{' '}
            <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      }
    >
      <ManifestField label="Choose a username" value={username} onChangeText={setUsername} placeholder="e.g. jean.bosco" />
      <ManifestField label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secure />
      <ManifestField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" secure />
      <StampButton label="Register driver" onPress={onSubmit} loading={loading} />
    </AuthTicket>
  );
}
