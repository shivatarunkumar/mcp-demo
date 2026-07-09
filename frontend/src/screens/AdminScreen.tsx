import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { approveUser, getPendingUsers, rejectUser } from '../services/api';

interface PendingUser {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export default function AdminScreen() {
  const { token } = useAuth();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getPendingUsers(token);
      setUsers(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    fetchPending().finally(() => setLoading(false));
  }, [fetchPending]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPending();
    setRefreshing(false);
  };

  const handleApprove = async (userId: string) => {
    if (!token) return;
    setActionLoading(userId + '-approve');
    try {
      await approveUser(token, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    if (!token) return;
    setActionLoading(userId + '-reject');
    try {
      await rejectUser(token, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Pending Registrations</Text>
        <Text style={styles.subtitle}>
          Review and approve or reject user registration requests.
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#6366f1" size="large" style={{ marginTop: 40 }} />
      ) : users.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptyText}>No pending registrations at the moment.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {users.map((user) => (
            <View key={user.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.email[0].toUpperCase()}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.email}>{user.email}</Text>
                  <Text style={styles.date}>
                    Registered {new Date(user.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>Pending</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => handleApprove(user.id)}
                  disabled={actionLoading !== null}
                  activeOpacity={0.85}
                >
                  {actionLoading === user.id + '-approve' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.approveBtnText}>Approve</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => handleReject(user.id)}
                  disabled={actionLoading !== null}
                  activeOpacity={0.85}
                >
                  {actionLoading === user.id + '-reject' ? (
                    <ActivityIndicator color="#ef4444" size="small" />
                  ) : (
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f1f5f9' },
  container: { padding: 24, gap: 20, paddingBottom: 48 },

  header: { gap: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', lineHeight: 20 },

  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: { color: '#ef4444', fontSize: 13 },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyIcon: { fontSize: 48, color: '#22c55e' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  emptyText: { fontSize: 14, color: '#64748b' },

  list: { gap: 12 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#6366f1' },
  info: { flex: 1, gap: 2 },
  email: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  date: { fontSize: 12, color: '#94a3b8' },

  statusBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '700', color: '#d97706' },

  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  approveBtn: { backgroundColor: '#6366f1' },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rejectBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  rejectBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
});
