import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

const TABLE_COLOR = { bg: '#ede9fe', border: '#6366f1', text: '#4f46e5' };

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  foreign_table: string | null;
}

interface TableInfo {
  name: string;
  row_count: number;
  columns: ColumnInfo[];
}

interface SchemaResponse {
  database: string;
  tables: TableInfo[];
}

interface Props {
  onSelectTable?: (tableName: string) => void;
}

export default function DBSchemaPanel({ onSelectTable }: Props) {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [dbMenuOpen, setDbMenuOpen] = useState(false);
  const [dbMenuPos, setDbMenuPos] = useState({ top: 0, left: 0 });
  const dbBtnRef = useRef<View>(null);

  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch available databases once
  useEffect(() => {
    fetch(`${BASE_URL}/query/databases`)
      .then((r) => r.json())
      .then((list: string[]) => {
        setDatabases(list);
      })
      .catch(() => {});
  }, []);

  // Fetch schema whenever selectedDb or refreshKey changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = selectedDb
      ? `${BASE_URL}/query/schema?db_name=${encodeURIComponent(selectedDb)}`
      : `${BASE_URL}/query/schema`;
    fetch(url)
      .then((r) => r.json())
      .then((d: SchemaResponse) => {
        setSchema(d);
        if (d.tables?.length > 0) {
          setExpanded({ [d.tables[0].name]: true });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDb, refreshKey]);

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));

  const openDbMenu = () => {
    dbBtnRef.current?.measureInWindow((x, y, _w, h) => {
      setDbMenuPos({ top: y + h + 4, left: x });
    });
    setDbMenuOpen(true);
  };

  return (
    <View style={styles.panel}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.pgLogo}>
            <Text style={styles.pgLogoText}>DB</Text>
          </View>
          <View ref={dbBtnRef}>
            <TouchableOpacity style={styles.dbBtn} onPress={openDbMenu} activeOpacity={0.7}>
              <Text style={styles.dbBtnText} numberOfLines={1}>
                {schema?.database ?? selectedDb ?? '…'}
              </Text>
              <View style={styles.dbBtnChevron} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setRefreshKey((k) => k + 1)}
          style={styles.refreshBtn}
        >
          <Text style={styles.refreshIcon}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── DB dropdown modal ── */}
      <Modal
        transparent
        visible={dbMenuOpen}
        animationType="none"
        onRequestClose={() => setDbMenuOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDbMenuOpen(false)}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[styles.dbMenu, { top: dbMenuPos.top, left: dbMenuPos.left }]}>
              <Text style={styles.dbMenuTitle}>SWITCH DATABASE</Text>
              {databases.map((db) => {
                const active = db === (schema?.database ?? selectedDb);
                return (
                  <TouchableOpacity
                    key={db}
                    style={[styles.dbMenuItem, active && styles.dbMenuItemActive]}
                    onPress={() => {
                      setDbMenuOpen(false);
                      if (!active) {
                        setSelectedDb(db);
                        setSchema(null);
                        setExpanded({});
                      }
                    }}
                  >
                    {active && <Text style={styles.dbMenuCheck}>✓</Text>}
                    <Text style={[styles.dbMenuText, active && styles.dbMenuTextActive]}>{db}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Stats bar ── */}
      {schema && (
        <View style={styles.statsBar}>
          <StatPill label="Tables" value={String(schema.tables.length)} />
          <StatPill
            label="Rows"
            value={schema.tables.reduce((s, t) => s + t.row_count, 0).toLocaleString()}
          />
          <StatPill
            label="Cols"
            value={String(schema.tables.reduce((s, t) => s + t.columns.length, 0))}
          />
        </View>
      )}

      <View style={styles.divider} />

      {/* ── Body ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6366f1" />
          <Text style={styles.loadingText}>Loading schema…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => setRefreshKey((k) => k + 1)}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.tableList} showsVerticalScrollIndicator={false}>
          {schema!.tables.map((table) => (
            <TableRow
              key={table.name}
              table={table}
              color={TABLE_COLOR}
              open={!!expanded[table.name]}
              onToggle={() => toggle(table.name)}
              onSelect={onSelectTable}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type TableColor = { bg: string; border: string; text: string };

function TableRow({
  table,
  color,
  open,
  onToggle,
  onSelect,
}: {
  table: TableInfo;
  color: TableColor;
  open: boolean;
  onToggle: () => void;
  onSelect?: (name: string) => void;
}) {
  return (
    <View style={[styles.tableBlock, { borderLeftColor: color.border }]}>
      {/* Table header row */}
      <TouchableOpacity style={styles.tableHeader} onPress={onToggle} activeOpacity={0.75}>
        <View style={styles.tableNameWrap}>
          <View style={[styles.tableNamePill, { backgroundColor: color.bg, borderColor: color.border }]}>
            <Text style={[styles.tableName, { color: color.text }]} numberOfLines={1}>
              {table.name}
            </Text>
          </View>
          <Text style={styles.tableCount}>{table.row_count.toLocaleString()} rows</Text>
        </View>
        {onSelect && (
          <TouchableOpacity
            onPress={() => onSelect(table.name)}
            style={[styles.queryBtn, { backgroundColor: color.bg, borderColor: color.border }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.queryBtnText, { color: color.text }]}>Query</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Columns */}
      {open && (
        <View style={styles.colList}>
          {table.columns.map((col) => (
            <View key={col.name} style={styles.colRow}>
              <View style={styles.colNameRow}>
                {col.is_primary_key && <Text style={styles.badge_pk}>PK</Text>}
                {col.is_foreign_key && <Text style={styles.badge_fk}>FK</Text>}
                <Text style={styles.colName} numberOfLines={1}>{col.name}</Text>
              </View>
              <View style={styles.colMeta}>
                <Text style={styles.colType} numberOfLines={1}>{col.type}</Text>
                {col.nullable && <Text style={styles.colNull}>null</Text>}
                {col.foreign_table && (
                  <Text style={styles.colRef} numberOfLines={1}>
                    → {col.foreign_table}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#faf5ff',
    borderBottomWidth: 1,
    borderBottomColor: '#ede9fe',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  pgLogo: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#336791',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgLogoText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  headerLabel: { fontSize: 9, fontWeight: '800', color: '#6366f1', letterSpacing: 1.2, marginBottom: 3 },

  // DB switcher button
  dbBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ede9fe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 150,
  },
  dbBtnText: { fontSize: 12, fontWeight: '700', color: '#1e293b', flexShrink: 1 },
  dbBtnChevron: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#6366f1',
    marginTop: 2,
  },

  refreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  refreshIcon: { fontSize: 15, color: '#6366f1', fontWeight: '700' },

  // DB dropdown menu
  dbMenu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    minWidth: 200,
    paddingVertical: 6,
    zIndex: 999,
  },
  dbMenuTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.2,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
  },
  dbMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  dbMenuItemActive: { backgroundColor: '#f5f3ff' },
  dbMenuCheck: { fontSize: 12, color: '#6366f1', fontWeight: '800', width: 14 },
  dbMenuText: { fontSize: 13, color: '#334155' },
  dbMenuTextActive: { color: '#6366f1', fontWeight: '700' },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: '#faf5ff',
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#ede9fe',
    borderRadius: 8,
    paddingVertical: 5,
  },
  statValue: { fontSize: 13, fontWeight: '800', color: '#4f46e5' },
  statLabel: { fontSize: 9, color: '#7c3aed', fontWeight: '600', marginTop: 1 },

  divider: { height: 1, backgroundColor: '#e2e8f0' },

  // Loading / error
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  loadingText: { fontSize: 13, color: '#94a3b8', marginTop: 8 },
  errorText: { fontSize: 13, color: '#ef4444', textAlign: 'center' },
  retryBtn: { backgroundColor: '#ede9fe', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: '#6366f1', fontWeight: '700', fontSize: 13 },

  // Table list
  tableList: { flex: 1 },
  tableBlock: {
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 1,
  },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  chevron: { fontSize: 13, width: 13 },
  tableNameWrap: { flex: 1, gap: 2 },
  tableNamePill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tableName: { fontSize: 12, fontWeight: '800' },
  tableCount: { fontSize: 10, color: '#94a3b8', marginLeft: 1 },
  queryBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  queryBtnText: { fontSize: 10, fontWeight: '800' },

  // Column rows
  colList: {
    paddingLeft: 22,
    paddingRight: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  colRow: {
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    gap: 2,
  },
  colNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  colMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 2, flexWrap: 'wrap' },
  colName: { fontSize: 12, color: '#1e293b', fontWeight: '600', flexShrink: 1 },
  colType: { fontSize: 10, color: '#94a3b8', fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier', flexShrink: 1 },
  colNull: {
    fontSize: 9,
    color: '#d97706',
    fontWeight: '700',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  colRef: { fontSize: 10 },

  badge_pk: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#4f46e5',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badge_fk: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
});
