import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RootStackParamList } from '../../App';
import { ChatInput } from '../components/ChatInput';
import { MessageBubble } from '../components/MessageBubble';
import { TypingIndicator } from '../components/TypingIndicator';
import { useChat } from '../hooks/useChat';

export default function ChatScreen() {
  const { messages, loading, error, sendMessage, clearMessages } = useChat();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Chat'>>();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={clearMessages} style={{ marginRight: 4 }}>
          <Text style={{ color: '#6366f1', fontWeight: '600', fontSize: 14 }}>Clear</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, clearMessages]);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loading]);

  return (
    <View style={styles.outer}>
      <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState />}
        ListFooterComponent={loading ? <TypingIndicator /> : null}
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ChatInput onSend={sendMessage} disabled={loading} />
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>🤖</Text>
      <Text style={styles.emptyTitle}>LLM Assistant</Text>
      <Text style={styles.emptySub}>Ask me anything. I'm ready to help.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 760 : undefined,
    shadowColor: '#000',
    shadowOpacity: Platform.OS === 'web' ? 0.06 : 0,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  list: { paddingVertical: 12, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  emptySub: { fontSize: 15, color: '#64748b' },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: { color: '#ef4444', fontSize: 13 },
});
