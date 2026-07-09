import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  approveUser, getPendingUsers, rejectUser,
  getAdminAccessRequests, approveAccessRequest, rejectAccessRequest,
  getAdminAccessRequestHistory, getAdminPasswordResets, resolvePasswordReset,
} from '../services/api';

interface AccessRequest {
  id: string;
  user_email: string | null;
  scope_type: string;
  database_name: string | null;
  table_name: string | null;
  justification: string | null;
  duration_hours: number | null;
  status: string;
  created_at: string;
}

function fmtDuration(hours: number | null): string {
  if (hours === null) return 'Max';
  if (hours < 24) return `${hours}h`;
  return `${hours / 24}d`;
}

interface PendingUser {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface PasswordReset {
  id: string;
  user_id: string;
  user_email: string | null;
  status: string;
  created_at: string;
}

export default function AdminScreen() {
  const { token } = useAuth();
  const [tab, setTab] = useState<'users' | 'access' | 'history' | 'resets'>('users');

  // User approvals
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Access requests
  const [accessReqs, setAccessReqs] = useState<AccessRequest[]>([]);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessActionLoading, setAccessActionLoading] = useState<string | null>(null);

  // Detail modals
  const [detailReq, setDetailReq] = useState<AccessRequest | null>(null);
  const [detailHistory, setDetailHistory] = useState<AccessRequest | null>(null);

  // History
  const [history, setHistory] = useState<AccessRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Password resets
  const [passwordResets, setPasswordResets] = useState<PasswordReset[]>([]);
  const [resetsLoading, setResetsLoading] = useState(true);
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [resetActionLoading, setResetActionLoading] = useState<string | null>(null);

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

  const fetchAccessReqs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getAdminAccessRequests(token);
      setAccessReqs(data);
    } catch {}
  }, [token]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getAdminAccessRequestHistory(token);
      setHistory(data);
    } catch {}
  }, [token]);

  const fetchPasswordResets = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getAdminPasswordResets(token);
      setPasswordResets(data);
    } catch {}
  }, [token]);

  useEffect(() => {
    setLoading(true);
    setAccessLoading(true);
    setHistoryLoading(true);
    setResetsLoading(true);
    Promise.all([fetchPending(), fetchAccessReqs(), fetchHistory(), fetchPasswordResets()]).finally(() => {
      setLoading(false);
      setAccessLoading(false);
      setHistoryLoading(false);
      setResetsLoading(false);
    });
  }, [fetchPending, fetchAccessReqs, fetchHistory, fetchPasswordResets]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPending(), fetchAccessReqs(), fetchHistory(), fetchPasswordResets()]);
    setRefreshing(false);
  };

  const handleSetPassword = async (resetId: string) => {
    if (!token) return;
    const newPass = resetPasswords[resetId]?.trim();
    if (!newPass) return;
    setResetActionLoading(resetId);
    try {
      await resolvePasswordReset(token, resetId, newPass);
      setPasswordResets((prev) => prev.filter((r) => r.id !== resetId));
      setResetPasswords((prev) => { const n = { ...prev }; delete n[resetId]; return n; });
    } catch (e: any) { setError(e.message); }
    finally { setResetActionLoading(null); }
  };

  const handleApproveAccess = async (reqId: string) => {
    if (!token) return;
    setAccessActionLoading(reqId + '-approve');
    try {
      await approveAccessRequest(token, reqId);
      setAccessReqs((prev) => prev.filter((r) => r.id !== reqId));
      fetchHistory();
    } catch (e: any) { setError(e.message); }
    finally { setAccessActionLoading(null); }
  };

  const handleRejectAccess = async (reqId: string) => {
    if (!token) return;
    setAccessActionLoading(reqId + '-reject');
    try {
      await rejectAccessRequest(token, reqId);
      setAccessReqs((prev) => prev.filter((r) => r.id !== reqId));
      fetchHistory();
    } catch (e: any) { setError(e.message); }
    finally { setAccessActionLoading(null); }
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.subtitle}>Manage users and data access</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'users' && styles.tabActive]}
          onPress={() => setTab('users')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'users' && styles.tabTextActive]}>
            User Approvals
          </Text>
          {users.length > 0 && (
            <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{users.length}</Text></View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'access' && styles.tabActive]}
          onPress={() => setTab('access')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'access' && styles.tabTextActive]}>
            Access Requests
          </Text>
          {accessReqs.length > 0 && (
            <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{accessReqs.length}</Text></View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => setTab('history')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>
            History
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'resets' && styles.tabActive]}
          onPress={() => setTab('resets')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'resets' && styles.tabTextActive]}>
            Pwd Resets
          </Text>
          {passwordResets.length > 0 && (
            <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{passwordResets.length}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── User Approvals Tab ── */}
      {tab === 'users' && (loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#6366f1" size="small" />
          <Text style={styles.loadingText}>Loading requests…</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>✓</Text>
          </View>
          <Text style={styles.emptyTitle}>Queue is empty</Text>
          <Text style={styles.emptyText}>No pending registrations right now.</Text>
        </View>
      ) : (
        <View style={styles.table}>
          {/* Table header */}
          <View style={styles.tableHead}>
            <Text style={[styles.colLabel, { flex: 1 }]}>User</Text>
            <Text style={styles.colLabel}>Requested</Text>
            <Text style={[styles.colLabel, { width: 160, textAlign: 'right' }]}>Actions</Text>
          </View>

          {users.map((user, idx) => (
            <View
              key={user.id}
              style={[styles.row, idx % 2 === 1 && styles.rowAlt]}
            >
              {/* Avatar + email */}
              <View style={[styles.rowCell, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.email[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
                  <View style={styles.statusPill}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>Pending approval</Text>
                  </View>
                </View>
              </View>

              {/* Date */}
              <View style={styles.rowCell}>
                <Text style={styles.date}>
                  {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>

              {/* Actions */}
              <View style={[styles.rowCell, { width: 160, flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }]}>
                <TouchableOpacity
                  style={[styles.btn, styles.approveBtn, actionLoading !== null && styles.btnDisabled]}
                  onPress={() => handleApprove(user.id)}
                  disabled={actionLoading !== null}
                  activeOpacity={0.8}
                >
                  {actionLoading === user.id + '-approve'
                    ? <ActivityIndicator color="#fff" size="small" style={{ width: 14, height: 14 }} />
                    : <Text style={styles.approveBtnText}>Approve</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.rejectBtn, actionLoading !== null && styles.btnDisabled]}
                  onPress={() => handleReject(user.id)}
                  disabled={actionLoading !== null}
                  activeOpacity={0.8}
                >
                  {actionLoading === user.id + '-reject'
                    ? <ActivityIndicator color="#ef4444" size="small" style={{ width: 14, height: 14 }} />
                    : <Text style={styles.rejectBtnText}>Reject</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ))}

      {/* ── Access Requests Tab ── */}
      {tab === 'access' && (accessLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#6366f1" size="small" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : accessReqs.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>✓</Text></View>
          <Text style={styles.emptyTitle}>No pending access requests</Text>
          <Text style={styles.emptyText}>All access requests have been reviewed.</Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {accessReqs.map((req) => (
            <TouchableOpacity
              key={req.id}
              style={styles.reqCard}
              onPress={() => setDetailReq(req)}
              activeOpacity={0.85}
            >
              {/* Left accent */}
              <View style={[styles.reqCardAccent, req.scope_type === 'database' ? styles.accentDb : styles.accentTable]} />

              <View style={styles.reqCardBody}>
                {/* Top row */}
                <View style={styles.reqCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqCardEmail} numberOfLines={1}>{req.user_email}</Text>
                    <Text style={styles.reqCardTarget}>
                      {req.scope_type === 'database'
                        ? `Database: ${req.database_name}`
                        : `${req.database_name}.${req.table_name}`}
                    </Text>
                  </View>
                  <View style={styles.reqCardMeta}>
                    <View style={[styles.scopeBadge, req.scope_type === 'database' ? styles.scopeDb : styles.scopeTable]}>
                      <Text style={[styles.scopeText, req.scope_type === 'database' ? styles.scopeDbText : styles.scopeTableText]}>
                        {req.scope_type}
                      </Text>
                    </View>
                    <View style={styles.durationTag}>
                      <Text style={styles.durationTagText}>{fmtDuration(req.duration_hours)}</Text>
                    </View>
                  </View>
                </View>

                {/* Justification */}
                {req.justification ? (
                  <Text style={styles.reqCardJustification} numberOfLines={1}>
                    "{req.justification}"
                  </Text>
                ) : (
                  <Text style={styles.reqCardNoJustification}>No justification provided</Text>
                )}

                {/* Bottom row */}
                <View style={styles.reqCardBottom}>
                  <Text style={styles.reqCardDate}>
                    {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.reqCardViewMore}>View details →</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* ── Detail Modal ── */}
      <Modal
        visible={detailReq !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailReq(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {detailReq && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Access Request</Text>
                  <TouchableOpacity onPress={() => setDetailReq(null)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.detailGrid}>
                  <DetailRow label="User" value={detailReq.user_email ?? '—'} />
                  <DetailRow label="Scope" value={detailReq.scope_type} />
                  <DetailRow
                    label="Target"
                    value={detailReq.scope_type === 'database'
                      ? (detailReq.database_name ?? '—')
                      : `${detailReq.database_name}.${detailReq.table_name}`}
                  />
                  <DetailRow label="Duration" value={fmtDuration(detailReq.duration_hours)} />
                  <DetailRow
                    label="Requested"
                    value={new Date(detailReq.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  />
                  <DetailRow label="Justification" value={detailReq.justification || 'None provided'} />
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalRejectBtn, accessActionLoading !== null && styles.btnDisabled]}
                    onPress={() => { handleRejectAccess(detailReq.id); setDetailReq(null); }}
                    disabled={accessActionLoading !== null}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalRejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalApproveBtn, accessActionLoading !== null && styles.btnDisabled]}
                    onPress={() => { handleApproveAccess(detailReq.id); setDetailReq(null); }}
                    disabled={accessActionLoading !== null}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalApproveText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      {/* ── History Tab ── */}
      {tab === 'history' && (historyLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#6366f1" size="small" />
          <Text style={styles.loadingText}>Loading history…</Text>
        </View>
      ) : history.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>📋</Text></View>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptyText}>Approved and rejected requests will appear here.</Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {history.map((req) => (
            <TouchableOpacity
              key={req.id}
              style={styles.reqCard}
              onPress={() => setDetailHistory(req)}
              activeOpacity={0.85}
            >
              <View style={[styles.reqCardAccent, req.status === 'approved' ? styles.accentApproved : styles.accentRejected]} />
              <View style={styles.reqCardBody}>
                <View style={styles.reqCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqCardEmail} numberOfLines={1}>{req.user_email}</Text>
                    <Text style={styles.reqCardTarget}>
                      {req.scope_type === 'database'
                        ? `Database: ${req.database_name}`
                        : `${req.database_name}.${req.table_name}`}
                    </Text>
                  </View>
                  <View style={styles.reqCardMeta}>
                    <View style={[styles.historyBadge, req.status === 'approved' ? styles.historyApproved : styles.historyRejected]}>
                      <Text style={[styles.historyBadgeText, req.status === 'approved' ? styles.historyApprovedText : styles.historyRejectedText]}>
                        {req.status === 'approved' ? 'Approved' : 'Rejected'}
                      </Text>
                    </View>
                    <View style={styles.durationTag}>
                      <Text style={styles.durationTagText}>{fmtDuration(req.duration_hours)}</Text>
                    </View>
                  </View>
                </View>
                {req.justification
                  ? <Text style={styles.reqCardJustification} numberOfLines={1}>"{req.justification}"</Text>
                  : <Text style={styles.reqCardNoJustification}>No justification provided</Text>
                }
                <View style={styles.reqCardBottom}>
                  <Text style={styles.reqCardDate}>
                    {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  <Text style={styles.reqCardViewMore}>View details →</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* ── Password Resets Tab ── */}
      {tab === 'resets' && (resetsLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#6366f1" size="small" />
          <Text style={styles.loadingText}>Loading reset requests…</Text>
        </View>
      ) : passwordResets.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>✓</Text>
          </View>
          <Text style={styles.emptyTitle}>No pending resets</Text>
          <Text style={styles.emptyText}>No password reset requests right now.</Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {passwordResets.map((reset) => (
            <View key={reset.id} style={styles.reqCard}>
              <View style={[styles.reqCardAccent, { backgroundColor: '#f59e0b' }]} />
              <View style={[styles.reqCardBody, { gap: 10 }]}>
                <View>
                  <Text style={styles.reqCardEmail}>{reset.user_email ?? reset.user_id}</Text>
                  <Text style={styles.reqCardDate}>
                    Requested {new Date(reset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.resetInput]}
                    value={resetPasswords[reset.id] ?? ''}
                    onChangeText={(v) => setResetPasswords((prev) => ({ ...prev, [reset.id]: v }))}
                    placeholder="Set temporary password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalApproveBtn, { flex: 0, paddingHorizontal: 16, paddingVertical: 10 }]}
                    onPress={() => handleSetPassword(reset.id)}
                    disabled={resetActionLoading === reset.id || !resetPasswords[reset.id]?.trim()}
                    activeOpacity={0.8}
                  >
                    {resetActionLoading === reset.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalApproveText}>Set</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}

      {/* ── History Detail Modal ── */}
      <Modal
        visible={detailHistory !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailHistory(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {detailHistory && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={styles.modalTitle}>Request Details</Text>
                    <View style={[styles.historyBadge, detailHistory.status === 'approved' ? styles.historyApproved : styles.historyRejected]}>
                      <Text style={[styles.historyBadgeText, detailHistory.status === 'approved' ? styles.historyApprovedText : styles.historyRejectedText]}>
                        {detailHistory.status === 'approved' ? 'Approved' : 'Rejected'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setDetailHistory(null)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.detailGrid}>
                  <DetailRow label="User" value={detailHistory.user_email ?? '—'} />
                  <DetailRow label="Scope" value={detailHistory.scope_type} />
                  <DetailRow
                    label="Target"
                    value={detailHistory.scope_type === 'database'
                      ? (detailHistory.database_name ?? '—')
                      : `${detailHistory.database_name}.${detailHistory.table_name}`}
                  />
                  <DetailRow label="Duration" value={fmtDuration(detailHistory.duration_hours)} />
                  <DetailRow
                    label="Requested"
                    value={new Date(detailHistory.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  />
                  <DetailRow label="Justification" value={detailHistory.justification || 'None provided'} />
                </View>

                <View style={[styles.modalActions, { justifyContent: 'flex-end' }]}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalApproveBtn, { flex: 0, paddingHorizontal: 28 }]}
                    onPress={() => setDetailHistory(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalApproveText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 28, gap: 20, paddingBottom: 48, maxWidth: 900, alignSelf: 'center', width: '100%' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: { gap: 3 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#94a3b8' },

  countBadge: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 56,
  },
  countText: { fontSize: 20, fontWeight: '800', color: '#fff', lineHeight: 24 },
  countLabel: { fontSize: 10, fontWeight: '600', color: '#c7d2fe', letterSpacing: 0.5, textTransform: 'uppercase' },

  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  errorText: { color: '#ef4444', fontSize: 12 },

  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 32, justifyContent: 'center' },
  loadingText: { fontSize: 13, color: '#94a3b8' },

  emptyBox: { alignItems: 'center', paddingVertical: 56, gap: 8 },
  emptyIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyIcon: { fontSize: 24, color: '#16a34a' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  emptyText: { fontSize: 13, color: '#94a3b8' },

  table: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  colLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowAlt: { backgroundColor: '#fafafa' },
  rowCell: { justifyContent: 'center' },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#6366f1' },

  email: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  date: { fontSize: 12, color: '#94a3b8' },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#f59e0b' },
  statusText: { fontSize: 11, color: '#f59e0b', fontWeight: '600' },

  resetInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 8, gap: 6,
  },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: '#0f172a' },
  tabBadge: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  justification: { fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 1 },

  scopeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  scopeDb: { backgroundColor: '#ede9fe' },
  scopeTable: { backgroundColor: '#e0f2fe' },
  scopeText: { fontSize: 10, fontWeight: '800' },
  scopeDbText: { color: '#6366f1' },
  scopeTableText: { color: '#0284c7' },

  // Access request cards
  cardList: { gap: 10 },
  reqCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  reqCardAccent: { width: 4 },
  accentDb: { backgroundColor: '#6366f1' },
  accentTable: { backgroundColor: '#0284c7' },
  accentApproved: { backgroundColor: '#16a34a' },
  accentRejected: { backgroundColor: '#ef4444' },
  reqCardBody: { flex: 1, padding: 14, gap: 6 },
  reqCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reqCardEmail: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  reqCardTarget: { fontSize: 12, color: '#64748b', marginTop: 1 },
  reqCardMeta: { alignItems: 'flex-end', gap: 4 },
  reqCardJustification: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  reqCardNoJustification: { fontSize: 12, color: '#cbd5e1', fontStyle: 'italic' },
  reqCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  reqCardDate: { fontSize: 11, color: '#94a3b8' },
  reqCardViewMore: { fontSize: 11, color: '#6366f1', fontWeight: '700' },
  durationTag: { backgroundColor: '#f1f5f9', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  durationTagText: { fontSize: 10, fontWeight: '700', color: '#64748b' },

  // Detail modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%',
    maxWidth: 460, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalClose: { fontSize: 16, color: '#94a3b8', fontWeight: '700', padding: 4 },
  detailGrid: { padding: 20, gap: 12 },
  detailRow: { flexDirection: 'row', gap: 12 },
  detailLabel: { width: 90, fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 1 },
  detailValue: { flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '500' },
  modalActions: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalApproveBtn: { backgroundColor: '#6366f1' },
  modalRejectBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fca5a5' },
  modalApproveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalRejectText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },

  historyBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  historyApproved: { backgroundColor: '#dcfce7' },
  historyRejected: { backgroundColor: '#fef2f2' },
  historyBadgeText: { fontSize: 10, fontWeight: '800' },
  historyApprovedText: { color: '#16a34a' },
  historyRejectedText: { color: '#ef4444' },

  btn: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  btnDisabled: { opacity: 0.5 },
  approveBtn: { backgroundColor: '#6366f1' },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  rejectBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  rejectBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 12 },
});
