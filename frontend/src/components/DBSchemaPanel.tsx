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
import { useTheme, type Theme } from '../context/ThemeContext';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

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
  selectedDb: string | null;
  onSelectDb: (db: string) => void;
}

export default function DBSchemaPanel({ onSelectTable, selectedDb, onSelectDb }: Props) {
  const { theme: t } = useTheme();
  const s = makeStyles(t);

  const [databases, setDatabases] = useState<string[]>([]);
  const [dbMenuOpen, setDbMenuOpen] = useState(false);
  const [dbMenuPos, setDbMenuPos] = useState({ top: 0, left: 0 });
  const dbBtnRef = useRef<View>(null);

  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch(`${BASE_URL}/query/databases`)
      .then((r) => r.json())
      .then((list: string[]) => setDatabases(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSchema(null);
    const url = selectedDb
      ? `${BASE_URL}/query/schema?db_name=${encodeURIComponent(selectedDb)}`
      : `${BASE_URL}/query/schema`;
    fetch(url)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail ?? `Error ${r.status}`);
        return data as SchemaResponse;
      })
      .then((d) => {
        const safe = { ...d, tables: d.tables ?? [] };
        setSchema(safe);
        if (safe.tables.length > 0) setExpanded({ [safe.tables[0].name]: true });
        else setExpanded({});
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
    <View style={s.panel}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.pgLogo}>
            <Text style={s.pgLogoText}>DB</Text>
          </View>
          <View ref={dbBtnRef}>
            <TouchableOpacity style={s.dbBtn} onPress={openDbMenu} activeOpacity={0.7}>
              <Text style={s.dbBtnText} numberOfLines={1}>
                {schema?.database ?? selectedDb ?? '…'}
              </Text>
              <View style={s.dbBtnChevron} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => setRefreshKey((k) => k + 1)} style={s.refreshBtn}>
          <Text style={s.refreshIcon}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── DB dropdown modal ── */}
      <Modal transparent visible={dbMenuOpen} animationType="none" onRequestClose={() => setDbMenuOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setDbMenuOpen(false)}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[s.dbMenu, { top: dbMenuPos.top, left: dbMenuPos.left }]}>
              <Text style={s.dbMenuTitle}>SWITCH DATABASE</Text>
              {databases.map((db) => {
                const active = db === (schema?.database ?? selectedDb);
                return (
                  <TouchableOpacity
                    key={db}
                    style={[s.dbMenuItem, active && s.dbMenuItemActive]}
                    onPress={() => {
                      setDbMenuOpen(false);
                      if (!active) { onSelectDb(db); setSchema(null); setExpanded({}); }
                    }}
                  >
                    {active && <Text style={s.dbMenuCheck}>✓</Text>}
                    <Text style={[s.dbMenuText, active && s.dbMenuTextActive]}>{db}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Stats bar ── */}
      {schema && (
        <View style={s.statsBar}>
          <StatPill label="Tables" value={String(schema.tables?.length ?? 0)} s={s} />
          <StatPill label="Rows" value={(schema.tables ?? []).reduce((a, tbl) => a + (tbl.row_count ?? 0), 0).toLocaleString()} s={s} />
          <StatPill label="Cols" value={String((schema.tables ?? []).reduce((a, tbl) => a + (tbl.columns?.length ?? 0), 0))} s={s} />
        </View>
      )}

      <View style={s.divider} />

      {/* ── Body ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={t.accent} />
          <Text style={s.loadingText}>Loading schema…</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setRefreshKey((k) => k + 1)} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : schema?.tables?.length === 0 ? (
        <View style={s.center}>
          <Text style={s.loadingText}>No tables found in this database.</Text>
        </View>
      ) : (
        <ScrollView style={s.tableList} showsVerticalScrollIndicator={false}>
          {(schema?.tables ?? []).map((table) => (
            <TableRow
              key={table.name}
              table={table}
              s={s}
              t={t}
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

function StatPill({ label, value, s }: { label: string; value: string; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.statPill}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function TableRow({
  table, s, t, open, onToggle, onSelect,
}: {
  table: TableInfo;
  s: ReturnType<typeof makeStyles>;
  t: Theme;
  open: boolean;
  onToggle: () => void;
  onSelect?: (name: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const dotsRef = useRef<View>(null);

  const openMenu = () => {
    dotsRef.current?.measureInWindow((x, y, w, h) => {
      setMenuPos({
        top: y + h + 4,
        right: Platform.OS === 'web' ? window.innerWidth - x - w : 16,
      });
    });
    setMenuOpen(true);
  };

  return (
    <View style={[s.tableBlock, { borderLeftColor: t.accent }]}>
      <TouchableOpacity style={s.tableHeader} onPress={onToggle} activeOpacity={0.75}>
        <View style={s.tableNameWrap}>
          <View style={[s.tableNamePill, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={[s.tableName, { color: t.accent }]} numberOfLines={1}>{table.name}</Text>
          </View>
          <Text style={s.tableCount}>{table.row_count.toLocaleString()} rows</Text>
        </View>
        {onSelect && (
          <View ref={dotsRef}>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); openMenu(); }}
              style={s.dotsBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[s.dotsBtnText, { color: t.accent }]}>⋮</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {/* Dots context menu */}
      <Modal transparent visible={menuOpen} animationType="none" onRequestClose={() => setMenuOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[s.dotsMenu, { top: menuPos.top, right: menuPos.right }, { backgroundColor: t.surface, borderColor: t.border }]}>
              <TouchableOpacity
                style={s.dotsMenuItem}
                onPress={() => { setMenuOpen(false); onSelect!(table.name); }}
              >
                <Text style={[s.dotsMenuIcon, { color: t.accent }]}>▶</Text>
                <Text style={[s.dotsMenuText, { color: t.text }]}>Select this table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {open && (
        <View style={s.colList}>
          {table.columns.map((col) => (
            <View key={col.name} style={s.colRow}>
              <View style={s.colNameRow}>
                {col.is_primary_key && <Text style={s.badge_pk}>PK</Text>}
                {col.is_foreign_key && <Text style={s.badge_fk}>FK</Text>}
                <Text style={s.colName} numberOfLines={1}>{col.name}</Text>
              </View>
              <View style={s.colMeta}>
                <Text style={s.colType} numberOfLines={1}>{col.type}</Text>
                {col.nullable && <Text style={s.colNull}>null</Text>}
                {col.foreign_table && (
                  <Text style={s.colRef} numberOfLines={1}>→ {col.foreign_table}</Text>
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

function makeStyles(t: Theme) {
  const MONO = Platform.OS === 'web' ? 'monospace' : 'Courier';
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.surface, overflow: 'hidden' },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10,
      backgroundColor: t.dark ? '#1a1f2e' : '#faf5ff',
      borderBottomWidth: 1, borderBottomColor: t.dark ? t.border : '#ede9fe',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    pgLogo: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#336791', alignItems: 'center', justifyContent: 'center' },
    pgLogoText: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },

    dbBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.accentBg, borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 4, maxWidth: 150,
    },
    dbBtnText: { fontSize: 12, fontWeight: '700', color: t.text, flexShrink: 1 },
    dbBtnChevron: {
      width: 0, height: 0,
      borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
      borderLeftColor: 'transparent', borderRightColor: 'transparent',
      borderTopColor: t.accent, marginTop: 2,
    },
    refreshBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
    refreshIcon: { fontSize: 15, color: t.accent, fontWeight: '700' },

    dbMenu: {
      position: 'absolute', backgroundColor: t.surface,
      borderRadius: 12, borderWidth: 1, borderColor: t.border,
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 }, elevation: 10, minWidth: 200, paddingVertical: 6, zIndex: 999,
    },
    dbMenuTitle: { fontSize: 9, fontWeight: '800', color: t.textMuted, letterSpacing: 1.2, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8 },
    dbMenuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
    dbMenuItemActive: { backgroundColor: t.accentBg },
    dbMenuCheck: { fontSize: 12, color: t.accent, fontWeight: '800', width: 14 },
    dbMenuText: { fontSize: 13, color: t.text },
    dbMenuTextActive: { color: t.accent, fontWeight: '700' },

    statsBar: {
      flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6,
      backgroundColor: t.dark ? '#1a1f2e' : '#faf5ff',
    },
    statPill: { flex: 1, alignItems: 'center', backgroundColor: t.accentBg, borderRadius: 8, paddingVertical: 5 },
    statValue: { fontSize: 13, fontWeight: '800', color: t.accent },
    statLabel: { fontSize: 9, color: t.accent, fontWeight: '600', marginTop: 1, opacity: 0.7 },

    divider: { height: 1, backgroundColor: t.border },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
    loadingText: { fontSize: 13, color: t.textMuted, marginTop: 8 },
    errorText: { fontSize: 13, color: '#ef4444', textAlign: 'center' },
    retryBtn: { backgroundColor: t.accentBg, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
    retryText: { color: t.accent, fontWeight: '700', fontSize: 13 },

    tableList: { flex: 1 },
    tableBlock: { borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: t.border, marginBottom: 1 },
    tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, gap: 6 },
    tableNameWrap: { flex: 1, gap: 2 },
    tableNamePill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
    tableName: { fontSize: 12, fontWeight: '800' },
    tableCount: { fontSize: 10, color: t.textMuted, marginLeft: 1 },
    dotsBtn: { paddingHorizontal: 6, paddingVertical: 2 },
    dotsBtnText: { fontSize: 18, fontWeight: '900', letterSpacing: 0 },
    dotsMenu: {
      position: 'absolute', borderRadius: 10, borderWidth: 1,
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 }, elevation: 10,
      minWidth: 170, paddingVertical: 4, zIndex: 999,
    },
    dotsMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
    dotsMenuIcon: { fontSize: 10, fontWeight: '800' },
    dotsMenuText: { fontSize: 13, fontWeight: '600' },

    colList: { paddingLeft: 22, paddingRight: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: t.border },
    colRow: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: t.dark ? '#1e293b' : '#f8fafc', gap: 2 },
    colNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    colMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 2, flexWrap: 'wrap' },
    colName: { fontSize: 12, color: t.text, fontWeight: '600', flexShrink: 1 },
    colType: { fontSize: 10, color: t.textMuted, fontFamily: MONO, flexShrink: 1 },
    colNull: { fontSize: 9, color: '#d97706', fontWeight: '700', backgroundColor: '#fef3c7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
    colRef: { fontSize: 10, color: t.accent },

    badge_pk: { fontSize: 9, fontWeight: '800', color: '#fff', backgroundColor: '#4f46e5', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
    badge_fk: { fontSize: 9, fontWeight: '800', color: '#fff', backgroundColor: '#0ea5e9', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  });
}
