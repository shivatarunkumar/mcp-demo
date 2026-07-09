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
import { getAccessCatalog, getMyAccessRequests, submitAccessRequest } from '../services/api';

interface TableStatus {
  id: string;
  table_name: string;
  description: string | null;
  grant_status: 'none' | 'pending' | 'granted';
}

interface DatabaseCatalog {
  id: string;
  name: string;
  description: string | null;
  grant_status: 'none' | 'pending' | 'granted';
  tables: TableStatus[];
}

interface MyRequest {
  id: string;
  scope_type: string;
  status: string;
  database_id: string | null;
  table_id: string | null;
  database_name: string | null;
  table_name: string | null;
  justification: string | null;
  duration_hours: number | null;
  expires_at: string | null;
  created_at: string;
}

function fmtExpiry(expires_at: string | null): string {
  if (!expires_at) return 'No expiry';
  const diff = new Date(expires_at).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `Expires in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `Expires in ${h}h ${m}m`;
  return `Expires in ${m}m`;
}

function fmtDuration(hours: number | null): string {
  if (hours === null) return 'Max';
  if (hours < 24) return `${hours}h`;
  return `${hours / 24}d`;
}

const STATUS_COLOR: Record<string, string> = {
  granted: '#16a34a',
  pending: '#d97706',
  none: '#94a3b8',
  approved: '#16a34a',
  rejected: '#ef4444',
  expired: '#94a3b8',
};

const STATUS_BG: Record<string, string> = {
  granted: '#dcfce7',
  pending: '#fef3c7',
  none: '#f1f5f9',
  approved: '#dcfce7',
  rejected: '#fef2f2',
  expired: '#f1f5f9',
};

// tableId → { dbId, label }
type SelectedTable = { dbId: string; label: string };

const DURATION_OPTIONS: { label: string; value: number | null }[] = [
  { label: '2 hrs', value: 2 },
  { label: '4 hrs', value: 4 },
  { label: '8 hrs', value: 8 },
  { label: '1 day', value: 24 },
  { label: 'Max', value: null },
];

export default function AccessScreen() {
  const { token } = useAuth();
  const [catalog, setCatalog] = useState<DatabaseCatalog[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedDb, setExpandedDb] = useState<string | null>(null);

  // Multi-table selection
  const [selected, setSelected] = useState<Record<string, SelectedTable>>({});

  // Extend modal
  const [extendTarget, setExtendTarget] = useState<MyRequest | null>(null);
  const [extendDuration, setExtendDuration] = useState<number | null>(null);
  const [extendSubmitting, setExtendSubmitting] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const selectedCount = Object.keys(selected).length;

  // Request modal state
  const [modalVisible, setModalVisible] = useState(false);
  // For DB-level single requests
  const [dbModalTarget, setDbModalTarget] = useState<{ dbId: string; label: string } | null>(null);
  const [justification, setJustification] = useState('');
  const [durationHours, setDurationHours] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [cat, reqs] = await Promise.all([
        getAccessCatalog(token),
        getMyAccessRequests(token),
      ]);
      setCatalog(cat);
      setMyRequests(reqs);
    } catch {}
  }, [token]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const toggleTable = (tableId: string, dbId: string, label: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[tableId]) delete next[tableId];
      else next[tableId] = { dbId, label };
      return next;
    });
  };

  const openTableModal = () => {
    setDbModalTarget(null);
    setJustification('');
    setDurationHours(null);
    setSubmitError(null);
    setModalVisible(true);
  };

  const openDbModal = (dbId: string, label: string) => {
    setDbModalTarget({ dbId, label });
    setJustification('');
    setDurationHours(null);
    setSubmitError(null);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (dbModalTarget) {
        // Single database request
        await submitAccessRequest(token, {
          scope_type: 'database',
          database_id: dbModalTarget.dbId,
          justification: justification.trim() || undefined,
          duration_hours: durationHours ?? undefined,
        });
      } else {
        // Multi-table requests in parallel
        await Promise.all(
          Object.entries(selected).map(([tableId]) =>
            submitAccessRequest(token, {
              scope_type: 'table',
              table_id: tableId,
              justification: justification.trim() || undefined,
              duration_hours: durationHours ?? undefined,
            })
          )
        );
        setSelected({});
      }
      setModalVisible(false);
      await fetchData();
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtend = async () => {
    if (!token || !extendTarget) return;
    setExtendSubmitting(true);
    setExtendError(null);
    try {
      await submitAccessRequest(token, {
        scope_type: extendTarget.scope_type as 'database' | 'table',
        database_id: extendTarget.database_id ?? undefined,
        table_id: extendTarget.table_id ?? undefined,
        justification: `Extension request`,
        duration_hours: extendDuration ?? undefined,
      });
      setExtendTarget(null);
      await fetchData();
    } catch (e: any) {
      setExtendError(e.message);
    } finally {
      setExtendSubmitting(false);
    }
  };

  const renderStatusBadge = (status: string) => (
    <View style={[styles.badge, { backgroundColor: STATUS_BG[status] ?? '#f1f5f9' }]}>
      <Text style={[styles.badgeText, { color: STATUS_COLOR[status] ?? '#64748b' }]}>
        {status === 'none' ? 'No access' : status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );

  const renderDbRequestButton = (status: string, dbId: string, label: string) => {
    if (status === 'granted') return null;
    if (status === 'pending') return <View style={styles.pendingBtn}><Text style={styles.pendingBtnText}>Pending</Text></View>;
    return (
      <TouchableOpacity style={styles.requestBtn} onPress={() => openDbModal(dbId, label)} activeOpacity={0.8}>
        <Text style={styles.requestBtnText}>Request access</Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, selectedCount > 0 && { paddingBottom: 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Data Access</Text>
          <Text style={styles.subtitle}>Request access to databases or specific tables. An admin will review your request.</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#6366f1" size="small" />
            <Text style={styles.loadingText}>Loading catalog…</Text>
          </View>
        ) : (
          <>
            {/* Catalog */}
            <Text style={styles.sectionLabel}>AVAILABLE DATABASES</Text>
            <View style={styles.table}>
              {catalog.map((db, idx) => (
                <View key={db.id}>
                  {/* Database row */}
                  <View style={[styles.dbRow, idx > 0 && styles.rowBorder]}>
                    <View style={styles.dbIcon}>
                      <Text style={styles.dbIconText}>DB</Text>
                    </View>
                    <View style={styles.dbInfo}>
                      <Text style={styles.dbName}>{db.name}</Text>
                      {db.description && <Text style={styles.dbDesc} numberOfLines={1}>{db.description}</Text>}
                    </View>
                    <View style={styles.dbActions}>
                      {renderStatusBadge(db.grant_status)}
                      {renderDbRequestButton(db.grant_status, db.id, db.name)}
                      <TouchableOpacity
                        style={styles.expandBtn}
                        onPress={() => setExpandedDb(expandedDb === db.id ? null : db.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.expandBtnText}>{expandedDb === db.id ? '▲ Tables' : '▼ Tables'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Tables (expandable) */}
                  {expandedDb === db.id && (
                    <View style={styles.tablesList}>
                      {db.tables.map((tbl) => {
                        const isChecked = !!selected[tbl.id];
                        const canSelect = tbl.grant_status === 'none';
                        return (
                          <TouchableOpacity
                            key={tbl.id}
                            style={[styles.tableRow, isChecked && styles.tableRowSelected]}
                            onPress={() => canSelect && toggleTable(tbl.id, db.id, `${db.name}.${tbl.table_name}`)}
                            activeOpacity={canSelect ? 0.7 : 1}
                          >
                            {/* Checkbox */}
                            <View style={[styles.checkbox, isChecked && styles.checkboxChecked, !canSelect && styles.checkboxDisabled]}>
                              {isChecked && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                            <View style={styles.tableIcon}>
                              <Text style={styles.tableIconText}>T</Text>
                            </View>
                            <View style={styles.tableInfo}>
                              <Text style={styles.tableName}>{tbl.table_name}</Text>
                              {tbl.description && <Text style={styles.tableDesc}>{tbl.description}</Text>}
                            </View>
                            <View style={styles.tableActions}>
                              {tbl.grant_status !== 'none'
                                ? renderStatusBadge(tbl.grant_status)
                                : null}
                              {tbl.grant_status === 'pending' && (
                                <View style={styles.pendingBtn}><Text style={styles.pendingBtnText}>Pending</Text></View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* My Requests */}
            {myRequests.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 8 }]}>MY REQUESTS</Text>
                <View style={styles.myReqList}>
                  {myRequests.map((req) => {
                    const target = req.scope_type === 'database'
                      ? req.database_name
                      : `${req.database_name}.${req.table_name}`;
                    const isExpired = req.expires_at && new Date(req.expires_at).getTime() < Date.now();
                    const canExtend = req.status === 'approved';
                    return (
                      <View key={req.id} style={[styles.myReqCard, isExpired && styles.myReqCardExpired]}>
                        {/* Top row: target + status badge */}
                        <View style={styles.myReqTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.myReqTarget} numberOfLines={1}>{target}</Text>
                            <Text style={styles.myReqMeta}>
                              {req.scope_type === 'database' ? 'Database access' : 'Table access'} · {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                          </View>
                          {renderStatusBadge(isExpired ? 'expired' : req.status)}
                        </View>

                        {/* Divider */}
                        <View style={styles.myReqDivider} />

                        {/* Bottom row: chips left, button right */}
                        <View style={styles.myReqBottomRow}>
                          <View style={styles.myReqInfoRow}>
                            {req.duration_hours !== undefined && (
                              <View style={styles.myReqChip}>
                                <Text style={styles.myReqChipLabel}>DURATION</Text>
                                <Text style={styles.myReqChipValue}>{fmtDuration(req.duration_hours)}</Text>
                              </View>
                            )}
                            {req.status === 'approved' && (
                              <View style={[styles.myReqChip, isExpired ? styles.myReqChipExpired : styles.myReqChipExpiry]}>
                                <Text style={[styles.myReqChipLabel, isExpired && { color: '#ef4444' }]}>
                                  {isExpired ? 'EXPIRED' : 'EXPIRES'}
                                </Text>
                                <Text style={[styles.myReqChipValue, isExpired && { color: '#ef4444' }]}>
                                  {fmtExpiry(req.expires_at)}
                                </Text>
                              </View>
                            )}
                          </View>
                          {canExtend && (
                            <TouchableOpacity
                              style={[styles.extendBtn, isExpired && styles.extendBtnExpired]}
                              onPress={() => { setExtendTarget(req); setExtendDuration(null); setExtendError(null); }}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.extendBtnText, isExpired && styles.extendBtnTextExpired]}>
                                {isExpired ? 'Re-request access' : 'Extend access'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Sticky selection bar */}
      {selectedCount > 0 && (
        <View style={styles.selectionBar}>
          <View style={styles.selectionCount}>
            <Text style={styles.selectionCountText}>{selectedCount}</Text>
          </View>
          <Text style={styles.selectionLabel}>
            {selectedCount === 1 ? 'table selected' : 'tables selected'}
          </Text>
          <TouchableOpacity style={styles.selectionClear} onPress={() => setSelected({})} activeOpacity={0.7}>
            <Text style={styles.selectionClearText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionRequestBtn} onPress={openTableModal} activeOpacity={0.85}>
            <Text style={styles.selectionRequestText}>Request access →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Extend Modal */}
      <Modal visible={extendTarget !== null} transparent animationType="fade" onRequestClose={() => setExtendTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Extend / Re-request Access</Text>
            <Text style={styles.modalSubtitle}>
              {extendTarget?.scope_type === 'database' ? 'Database' : 'Table'}:{' '}
              <Text style={{ fontWeight: '700', color: '#0f172a' }}>
                {extendTarget?.scope_type === 'database'
                  ? extendTarget?.database_name
                  : `${extendTarget?.database_name}.${extendTarget?.table_name}`}
              </Text>
            </Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>New access duration <Text style={{ color: '#ef4444' }}>*</Text></Text>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.durationBtn, extendDuration === opt.value && styles.durationBtnActive]}
                    onPress={() => setExtendDuration(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.durationBtnText, extendDuration === opt.value && styles.durationBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {extendError && (
              <View style={styles.modalError}>
                <Text style={styles.modalErrorText}>{extendError}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setExtendTarget(null)} activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, (extendSubmitting || extendDuration === undefined) && styles.modalSubmitDisabled]}
                onPress={handleExtend}
                disabled={extendSubmitting}
                activeOpacity={0.85}
              >
                {extendSubmitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSubmitText}>Submit request</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Request Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request Access</Text>
            {dbModalTarget ? (
              <Text style={styles.modalSubtitle}>
                Database: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{dbModalTarget.label}</Text>
              </Text>
            ) : (
              <View style={styles.modalTableList}>
                {Object.entries(selected).map(([id, t]) => (
                  <View key={id} style={styles.modalTableChip}>
                    <Text style={styles.modalTableChipText}>{t.label}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Access duration <Text style={{ color: '#ef4444' }}>*</Text></Text>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.durationBtn, durationHours === opt.value && styles.durationBtnActive]}
                    onPress={() => setDurationHours(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.durationBtnText, durationHours === opt.value && styles.durationBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Justification (optional)</Text>
              <TextInput
                style={styles.modalInput}
                value={justification}
                onChangeText={setJustification}
                placeholder="Why do you need access to this data?"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                autoCapitalize="sentences"
              />
            </View>

            {submitError && (
              <View style={styles.modalError}>
                <Text style={styles.modalErrorText}>{submitError}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, submitting && styles.modalSubmitDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSubmitText}>Submit request</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 28, gap: 16, paddingBottom: 48, maxWidth: 860, alignSelf: 'center', width: '100%' },

  header: { gap: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#64748b', lineHeight: 18 },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: '#94a3b8',
    letterSpacing: 1, textTransform: 'uppercase',
  },

  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 32, justifyContent: 'center' },
  loadingText: { fontSize: 13, color: '#94a3b8' },

  table: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },

  dbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dbIcon: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center',
  },
  dbIconText: { fontSize: 10, fontWeight: '800', color: '#6366f1' },
  dbInfo: { flex: 1 },
  dbName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  dbDesc: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  dbActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  tablesList: { backgroundColor: '#fafafa', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingLeft: 60,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  tableIcon: {
    width: 26, height: 26, borderRadius: 6,
    backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center',
  },
  tableIconText: { fontSize: 9, fontWeight: '800', color: '#0284c7' },
  tableInfo: { flex: 1 },
  tableName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  tableDesc: { fontSize: 11, color: '#94a3b8' },
  tableActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Checkbox
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
    borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  checkboxChecked: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  checkboxDisabled: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  checkmark: { fontSize: 11, color: '#fff', fontWeight: '800', lineHeight: 14 },
  tableRowSelected: { backgroundColor: '#f5f3ff' },

  // Sticky selection bar
  selectionBar: {
    position: 'absolute' as const,
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  selectionCount: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center',
  },
  selectionCountText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  selectionLabel: { flex: 1, color: '#94a3b8', fontSize: 13 },
  selectionClear: { paddingHorizontal: 10, paddingVertical: 6 },
  selectionClearText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  selectionRequestBtn: {
    backgroundColor: '#6366f1', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  selectionRequestText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Modal table chips
  modalTableList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modalTableChip: {
    backgroundColor: '#f1f5f9', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  modalTableChipText: { fontSize: 12, fontWeight: '600', color: '#334155' },

  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  requestBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  requestBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  pendingBtn: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pendingBtnText: { color: '#d97706', fontWeight: '700', fontSize: 11 },

  expandBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  expandBtnText: { color: '#64748b', fontWeight: '600', fontSize: 11 },

  // My Requests cards
  myReqList: { gap: 12 },
  myReqCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  myReqCardExpired: { opacity: 0.65 },
  myReqTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  myReqTarget: { fontSize: 15, fontWeight: '700', color: '#0f172a', letterSpacing: -0.2 },
  myReqMeta: { fontSize: 12, color: '#94a3b8', marginTop: 3 },
  myReqDivider: { height: 1, backgroundColor: '#f1f5f9' },
  myReqInfoRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  myReqBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myReqChip: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
  },
  myReqChipExpiry: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  myReqChipExpired: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  myReqChipLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  myReqChipValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  extendBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  extendBtnExpired: {
    backgroundColor: '#f1f5f9',
  },
  extendBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  extendBtnTextExpired: { color: '#475569' },

  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  reqInfo: { flex: 1 },
  reqTarget: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  reqMeta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  reqJustification: { fontSize: 11, color: '#64748b', marginTop: 3, fontStyle: 'italic' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    gap: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { fontSize: 13, color: '#64748b', marginTop: -8 },
  modalField: { gap: 6 },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#374151', letterSpacing: 0.5 },
  modalInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc',
    minHeight: 80, textAlignVertical: 'top',
  },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationBtn: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#f8fafc',
  },
  durationBtnActive: { borderColor: '#6366f1', backgroundColor: '#ede9fe' },
  durationBtnText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  durationBtnTextActive: { color: '#6366f1' },

  modalError: {
    backgroundColor: '#fef2f2', borderRadius: 8,
    padding: 10, borderLeftWidth: 3, borderLeftColor: '#ef4444',
  },
  modalErrorText: { color: '#ef4444', fontSize: 12 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#f1f5f9',
  },
  modalCancelText: { color: '#64748b', fontWeight: '700', fontSize: 14 },
  modalSubmitBtn: {
    flex: 2, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#6366f1',
  },
  modalSubmitDisabled: { backgroundColor: '#a5b4fc' },
  modalSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
