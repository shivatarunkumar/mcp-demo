import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RootStackParamList } from '../../App';
import { useAuth } from '../context/AuthContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Landing'>;
};

const { width } = Dimensions.get('window');
const CARD_WIDTH = Platform.OS === 'web' ? 320 : width * 0.82;

export default function LandingScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.badge}>Powered by AI</Text>
        <Text style={styles.title}>What would you{'\n'}like to do?</Text>
        <Text style={styles.subtitle}>
          Choose an experience below to get started.
        </Text>
      </View>

      {/* Cards */}
      <View style={styles.cards}>
        <OptionCard
          emoji="🗄️"
          title="Query Your Database"
          description="Query your retail database in plain English and explore your data instantly."
          accent="#6366f1"
          onPress={() => navigation.navigate('TalkToData')}
        />
        <OptionCard
          emoji="🤖"
          title="Chat with LLM"
          description="Have a free-form conversation with the AI assistant about anything."
          accent="#0ea5e9"
          onPress={() => navigation.navigate('Chat')}
        />
        {user?.role === 'admin' && (
          <OptionCard
            emoji="🛡️"
            title="Admin Panel"
            description="Review and approve pending user registrations."
            accent="#f59e0b"
            onPress={() => navigation.navigate('Admin')}
          />
        )}
      </View>

      <Text style={styles.footer}>mcp-demo · retail intelligence</Text>
    </View>
  );
}

function OptionCard({
  emoji,
  title,
  description,
  accent,
  onPress,
}: {
  emoji: string;
  title: string;
  description: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, { width: CARD_WIDTH, borderTopColor: accent }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <Text style={[styles.cardTitle, { color: accent }]}>{title}</Text>
      <Text style={styles.cardDesc}>{description}</Text>
      <View style={[styles.arrowBtn, { backgroundColor: accent }]}>
        <Text style={styles.arrowText}>Get started →</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 40,
  },

  topBar: {
    position: 'absolute' as const,
    top: 16,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userEmail: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  logoutBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },

  hero: { alignItems: 'center', gap: 10 },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#6366f1',
    textTransform: 'uppercase',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },

  cards: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 16,
    alignItems: 'center',
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderTopWidth: 4,
    padding: 24,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardEmoji: { fontSize: 36 },
  cardTitle: { fontSize: 20, fontWeight: '800' },
  cardDesc: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  arrowBtn: {
    marginTop: 6,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  arrowText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  footer: { fontSize: 12, color: '#cbd5e1' },
});
