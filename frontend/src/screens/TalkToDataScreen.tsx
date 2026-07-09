import React, { useCallback, useRef, useState } from 'react';
import DataTable from '../components/DataTable';
import DBSchemaPanel from '../components/DBSchemaPanel';
import { useTheme, type Theme } from '../context/ThemeContext';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

type Mode = 'sql' | 'nl';
type ExportFormat = 'csv' | 'tsv' | 'json';

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  sql?: string;
  question?: string;
  error?: string;
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function runSQLQuery(sql: string, dbName?: string | null): Promise<QueryResult> {
  const res = await fetch(`${BASE_URL}/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, ...(dbName ? { db_name: dbName } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'Query failed');
  return data;
}

async function runNLQuery(question: string, dbName?: string | null): Promise<QueryResult> {
  const res = await fetch(`${BASE_URL}/query/nl2sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ...(dbName ? { db_name: dbName } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? 'NL2SQL failed');
  return data;
}

// ── SQL formatter (no deps) ────────────────────────────────────────────────────


function formatSQL(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  const breaks = ['SELECT','FROM','WHERE','JOIN','LEFT JOIN','RIGHT JOIN','INNER JOIN',
    'GROUP BY','ORDER BY','HAVING','LIMIT','UNION','WITH'];
  breaks.forEach((kw) => {
    s = s.replace(new RegExp(`\\b${kw}\\b`, 'gi'), `\n${kw}`);
  });
  s = s.replace(/,(?!\s*\n)/g, ',\n  ');
  return s.trim();
}

// ── Export helpers (web only) ──────────────────────────────────────────────────

function exportData(
  format: ExportFormat,
  columns: string[],
  rows: Record<string, unknown>[],
) {
  if (Platform.OS !== 'web') return;
  let content = '';
  let mime = 'text/plain';
  let ext = format;

  if (format === 'json') {
    content = JSON.stringify(rows, null, 2);
    mime = 'application/json';
  } else {
    const sep = format === 'csv' ? ',' : '\t';
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return format === 'csv' ? `"${s.replace(/"/g, '""')}"` : s;
    };
    content = [
      columns.map(escape).join(sep),
      ...rows.map((r) => columns.map((c) => escape(r[c])).join(sep)),
    ].join('\n');
    mime = format === 'csv' ? 'text/csv' : 'text/tab-separated-values';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `results.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyToClipboard(text: string) {
  if (Platform.OS === 'web') {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

function copyAsTable(columns: string[], rows: Record<string, unknown>[]): string {
  const colWidths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length))
  );
  const pad = (s: string, w: number) => s.padEnd(w);
  const divider = colWidths.map((w) => '-'.repeat(w)).join('-+-');
  const header = columns.map((c, i) => pad(c, colWidths[i])).join(' | ');
  const dataRows = rows.map((r) =>
    columns.map((c, i) => pad(String(r[c] ?? ''), colWidths[i])).join(' | ')
  );
  return [header, divider, ...dataRows].join('\n');
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TalkToDataScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [mode, setMode] = useState<Mode>('sql');
  const [sql, setSql] = useState('SELECT * FROM customers LIMIT 10;');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [editableSql, setEditableSql] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(true);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setEditableSql(null);
    try {
      if (mode === 'sql') {
        const data = await runSQLQuery(sql, selectedDb);
        setResult(data);
      } else {
        const data = await runNLQuery(question, selectedDb);
        setEditableSql(data.sql ?? '');
        if (data.error) {
          setError(data.error);
        } else {
          setResult(data);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRerunEdited = async () => {
    if (!editableSql) return;
    setLoading(true);
    setError(null);
    try {
      const data = await runSQLQuery(editableSql, selectedDb);
      setResult({ ...data, sql: editableSql });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySql = (s: string) => {
    copyToClipboard(s);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSelectTable = (tableName: string) => {
    setMode('sql');
    setSql(`SELECT * FROM ${tableName} LIMIT 20;`);
    setResult(null);
    setError(null);
    setEditableSql(null);
  };

  // ── Sidebar resize / collapse ──────────────────────────────────────────────
  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX = 480;
  const SIDEBAR_DEFAULT = 260;
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarDragging = useRef(false);
  const sidebarStartX = useRef(0);
  const sidebarStartW = useRef(0);

  const onSidebarResizeStart = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    sidebarDragging.current = true;
    sidebarStartX.current = e.clientX;
    sidebarStartW.current = sidebarWidth;
    const onMouseMove = (me: MouseEvent) => {
      if (!sidebarDragging.current) return;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, sidebarStartW.current + me.clientX - sidebarStartX.current));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      sidebarDragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  return (
    <View style={s.page}>
      {/* ── Left sidebar: DB schema panel ── */}
      <View style={[s.sidebarWrapper, sidebarOpen ? { width: sidebarWidth } : { width: 0 }]}>
        {sidebarOpen && (
          <>
            <DBSchemaPanel
              onSelectTable={handleSelectTable}
              selectedDb={selectedDb}
              onSelectDb={(db) => { setSelectedDb(db); setResult(null); setError(null); setEditableSql(null); }}
            />
            {/* Drag-resize handle on right edge */}
            {Platform.OS === 'web' && (
              <View
                // @ts-ignore
                onMouseDown={onSidebarResizeStart}
                style={s.sidebarResizeHandle}
              />
            )}
            {/* Collapse button — bottom-right of sidebar */}
            <TouchableOpacity
              style={s.collapseBtn}
              onPress={() => setSidebarOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={s.collapseBtnText}>«</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Expand button — shown when sidebar is closed ── */}
      {!sidebarOpen && (
        <TouchableOpacity
          style={s.expandBtn}
          onPress={() => setSidebarOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={s.expandBtnText}>»</Text>
        </TouchableOpacity>
      )}

      {/* ── Right: main content ── */}
      <ScrollView style={s.scroll} contentContainerStyle={s.outer}>
      <View style={s.inner}>

        {/* Mode toggle */}
        <View style={s.toggleRow}>
          <ToggleBtn label="🖊️  SQL Editor"     active={mode === 'sql'} onPress={() => { setMode('sql');  setResult(null); setError(null); setEditableSql(null); }} />
          <ToggleBtn label="💬  Ask in English" active={mode === 'nl'}  onPress={() => { setMode('nl');   setResult(null); setError(null); setEditableSql(null); }} />
        </View>

        {/* Input card */}
        <View style={s.card}>
          {mode === 'sql' ? (
            <>
              <View style={s.cardHeader}>
                <Text style={s.label}>SQL QUERY</Text>
                <View style={s.headerActions}>
                  <ActionBtn label="Format" onPress={() => setSql(formatSQL(sql))} />
                  <ActionBtn label={copied ? 'Copied!' : 'Copy'} onPress={() => handleCopySql(sql)} accent={copied} />
                </View>
              </View>
              <ResizableInput
                variant="dark"
                value={sql}
                onChangeText={setSql}
                placeholder="SELECT ..."
                placeholderTextColor="#475569"
              />
              <View style={s.quickRow}>
                {QUICK_QUERIES.map((q) => (
                  <TouchableOpacity key={q.label} style={s.chip} onPress={() => setSql(q.sql)}>
                    <Text style={s.chipText}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={s.cardHeader}>
                <Text style={s.label}>ASK A QUESTION</Text>
                <TouchableOpacity
                  style={[s.sqlToggle, showSql && s.sqlToggleOn]}
                  onPress={() => setShowSql((v) => !v)}
                >
                  <View style={[s.sqlToggleThumb, showSql && s.sqlToggleThumbOn]} />
                  <Text style={[s.sqlToggleLabel, showSql && s.sqlToggleLabelOn]}>
                    {showSql ? 'SQL  on' : 'SQL  off'}
                  </Text>
                </TouchableOpacity>
              </View>
              <ResizableInput
                variant="light"
                value={question}
                onChangeText={setQuestion}
                placeholder="e.g. Show me the top 5 customers by total spend"
                placeholderTextColor="#94a3b8"
              />
              <View style={s.quickRow}>
                {NL_EXAMPLES.map((q) => (
                  <TouchableOpacity key={q} style={s.chip} onPress={() => setQuestion(q)}>
                    <Text style={s.chipText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[s.runBtn, loading && s.runBtnDisabled]}
            onPress={handleRun}
            disabled={loading || (mode === 'nl' ? !question.trim() : !sql.trim())}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.runBtnText}>{mode === 'sql' ? '▶  Run Query' : '✨  Generate & Run'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Error */}
        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity
              style={[s.retryBtn, loading && s.runBtnDisabled]}
              onPress={handleRun}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.retryBtnText}>↺  Retry</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Editable generated SQL (NL mode) — always visible when toggle is on */}
        {mode === 'nl' && showSql && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.label}>
                GENERATED SQL  <Text style={s.labelHint}>{editableSql !== null ? '(editable)' : '(run a query to generate)'}</Text>
              </Text>
              {editableSql !== null && (
                <View style={s.headerActions}>
                  <ActionBtn label="Format" onPress={() => setEditableSql(formatSQL(editableSql))} />
                  <ActionBtn label={copied ? 'Copied!' : 'Copy'} onPress={() => handleCopySql(editableSql)} accent={copied} />
                </View>
              )}
            </View>
            <ResizableInput
              variant="dark"
              value={editableSql ?? ''}
              onChangeText={setEditableSql}
            />
            {editableSql !== null && (
              <TouchableOpacity
                style={[s.runBtn, loading && s.runBtnDisabled]}
                onPress={handleRerunEdited}
                disabled={loading}
              >
                <Text style={s.runBtnText}>▶  Run Edited SQL</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Results */}
        {result && (
          <View style={s.card}>
            {/* Results header */}
            <View style={s.cardHeader}>
              <Text style={s.resultMeta}>
                {result.row_count} row{result.row_count !== 1 ? 's' : ''} returned
              </Text>
              <View style={s.headerActions}>
                <DownloadDropdown
                  onSelect={(fmt) => exportData(fmt, result.columns, result.rows)}
                />
                <CopyDropdown
                  columns={result.columns}
                  rows={result.rows}
                />
              </View>
            </View>

            <DataTable columns={result.columns} rows={result.rows} />
          </View>
        )}

      </View>
      </ScrollView>
    </View>
  );
}

// ── Small reusable pieces ──────────────────────────────────────────────────────

// ── ResizableInput ─────────────────────────────────────────────────────────────

interface ResizableInputProps {
  variant: 'dark' | 'light';
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
}

const MIN_HEIGHT = 110;
const MAX_HEIGHT = 600;

function ResizableInput({ variant, value, onChangeText, placeholder, placeholderTextColor }: ResizableInputProps) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = useCallback((e: any) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = height;

    const onMouseMove = (me: MouseEvent) => {
      if (!dragging.current) return;
      const delta = me.clientY - startY.current;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH.current + delta)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [height]);

  const inputStyle = variant === 'dark'
    ? [s.editor, { height }]
    : [s.nlInput, { height }];

  return (
    <View>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
      />
      {/* Drag handle — web only */}
      {Platform.OS === 'web' && (
        <View
          // @ts-ignore — web-only onMouseDown
          onMouseDown={onMouseDown}
          style={s.resizeHandle}
        >
          <View style={s.resizeGrip} />
        </View>
      )}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

const EXPORT_OPTIONS: { fmt: ExportFormat; label: string; desc: string }[] = [
  { fmt: 'csv',  label: 'CSV',  desc: 'Comma-separated values' },
  { fmt: 'tsv',  label: 'TSV',  desc: 'Tab-separated values' },
  { fmt: 'json', label: 'JSON', desc: 'JSON array of objects' },
];

function useDropdownPos() {
  const btnRef = useRef<View>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const measure = () =>
    btnRef.current?.measureInWindow((x, y, w, h) => {
      setPos({ top: y + h + 4, right: Platform.OS === 'web' ? window.innerWidth - x - w : 16 });
    });
  return { btnRef, pos, measure };
}

function DownloadDropdown({ onSelect }: { onSelect: (fmt: ExportFormat) => void }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [open, setOpen] = useState(false);
  const { btnRef, pos, measure } = useDropdownPos();

  return (
    <View ref={btnRef}>
      <TouchableOpacity style={s.actionBtn} onPress={() => { measure(); setOpen(true); }}>
        <Text style={s.actionBtnText}>⬇  Download ▾</Text>
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[s.dropdown, { top: pos.top, right: pos.right }]}>
              <Text style={s.dropdownTitle}>Download as</Text>
              {EXPORT_OPTIONS.map(({ fmt, label, desc }) => (
                <TouchableOpacity
                  key={fmt}
                  style={s.dropdownItem}
                  onPress={() => { setOpen(false); onSelect(fmt); }}
                >
                  <View style={s.dropdownBadge}>
                    <Text style={s.dropdownBadgeText}>{label}</Text>
                  </View>
                  <Text style={s.dropdownDesc}>{desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

type CopyOption = { key: string; label: string; desc: string; getValue: () => string };

function CopyDropdown({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { btnRef, pos, measure } = useDropdownPos();

  const COPY_OPTIONS: CopyOption[] = [
    {
      key: 'json',
      label: 'JSON',
      desc: 'Copy as JSON array',
      getValue: () => JSON.stringify(rows, null, 2),
    },
    {
      key: 'csv',
      label: 'CSV',
      desc: 'Copy as comma-separated',
      getValue: () => {
        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        return [columns.map(escape).join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))].join('\n');
      },
    },
    {
      key: 'tsv',
      label: 'TSV',
      desc: 'Copy as tab-separated',
      getValue: () =>
        [columns.join('\t'), ...rows.map((r) => columns.map((c) => String(r[c] ?? '')).join('\t'))].join('\n'),
    },
    {
      key: 'table',
      label: 'Table',
      desc: 'Copy as plain-text table',
      getValue: () => copyAsTable(columns, rows),
    },
  ];

  const handleCopy = (opt: CopyOption) => {
    setOpen(false);
    copyToClipboard(opt.getValue());
    setCopiedKey(opt.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <View ref={btnRef}>
      <TouchableOpacity
        style={[s.actionBtn, copiedKey && s.actionBtnAccent]}
        onPress={() => { measure(); setOpen(true); }}
      >
        <Text style={[s.actionBtnText, copiedKey ? s.actionBtnTextAccent : null]}>
          {copiedKey ? '✓ Copied!' : '⎘  Copy ▾'}
        </Text>
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[s.dropdown, { top: pos.top, right: pos.right }]}>
              <Text style={s.dropdownTitle}>Copy to clipboard</Text>
              {COPY_OPTIONS.map((opt) => (
                <TouchableOpacity key={opt.key} style={s.dropdownItem} onPress={() => handleCopy(opt)}>
                  <View style={s.dropdownBadge}>
                    <Text style={s.dropdownBadgeText}>{opt.label}</Text>
                  </View>
                  <Text style={s.dropdownDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function ToggleBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  return (
    <TouchableOpacity style={[s.toggleBtn, active && s.toggleBtnActive]} onPress={onPress}>
      <Text style={[s.toggleText, active && s.toggleTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActionBtn({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  return (
    <TouchableOpacity style={[s.actionBtn, accent && s.actionBtnAccent]} onPress={onPress}>
      <Text style={[s.actionBtnText, accent && s.actionBtnTextAccent]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const QUICK_QUERIES = [
  { label: 'Customers', sql: 'SELECT * FROM customers LIMIT 20;' },
  { label: 'Products',  sql: 'SELECT * FROM products LIMIT 20;' },
  { label: 'Orders',    sql: 'SELECT * FROM orders LIMIT 20;' },
  { label: 'Transactions', sql: 'SELECT * FROM transactions LIMIT 20;' },
  {
    label: 'Top customers',
    sql: `SELECT c.name, SUM(o.total) AS total_spent\nFROM customers c JOIN orders o ON o.customer_id = c.id\nGROUP BY c.id, c.name ORDER BY total_spent DESC LIMIT 10;`,
  },
];

const NL_EXAMPLES = [
  'Top 5 customers by spend',
  'Products low on stock',
  'Failed transactions this month',
  'Orders by status count',
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const CELL_WIDTH = 150;
const MONO = Platform.OS === 'web' ? 'monospace' : 'Courier';

function makeStyles(t: Theme) {
  return StyleSheet.create({
    page: { flex: 1, flexDirection: 'row', backgroundColor: t.bg },

    sidebarWrapper: {
      overflow: 'hidden',
      borderRightWidth: 1,
      borderRightColor: t.border,
      backgroundColor: t.surface,
      position: 'relative' as const,
    },
    sidebarResizeHandle: {
      position: 'absolute' as const,
      top: 0, right: 0, width: 5, bottom: 0,
      cursor: 'col-resize' as any,
      backgroundColor: 'transparent',
      zIndex: 10,
    },
    collapseBtn: {
      position: 'absolute' as const,
      bottom: 14, right: 10,
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.accentBg,
      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
      borderWidth: 1, borderColor: t.accentBorder,
      shadowColor: t.accent, shadowOpacity: 0.18, shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 }, elevation: 4, zIndex: 20,
    },
    collapseBtnText: { fontSize: 14, fontWeight: '800', color: t.accent },
    expandBtn: {
      position: 'absolute' as const,
      bottom: 14, left: 6, zIndex: 20,
      backgroundColor: t.accent,
      borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: 1, borderColor: t.accentBorder,
      shadowColor: t.accent, shadowOpacity: 0.25, shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 }, elevation: 4,
    },
    expandBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

    sidebar: { padding: 0, borderRightWidth: 0, borderRightColor: 'transparent', backgroundColor: t.surface, position: 'relative' as const },
    scroll: { flex: 1, backgroundColor: t.bg },
    outer: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 24, paddingBottom: 48 },
    inner: { width: '100%', gap: 14 },

    toggleRow: { flexDirection: 'row', backgroundColor: t.toggleBg, borderRadius: 12, padding: 4, gap: 4 },
    toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
    toggleBtnActive: { backgroundColor: t.toggleActive, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    toggleText: { fontSize: 14, fontWeight: '600', color: t.textSub },
    toggleTextActive: { color: t.accent },

    card: {
      backgroundColor: t.surface, borderRadius: 16, padding: 16, gap: 12,
      shadowColor: '#000', shadowOpacity: t.dark ? 0.3 : 0.05, shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerActions: { flexDirection: 'row', gap: 6 },

    label: { fontSize: 11, fontWeight: '800', color: t.accent, letterSpacing: 1 },
    labelHint: { fontSize: 10, fontWeight: '500', color: t.textMuted, letterSpacing: 0 },

    actionBtn: {
      borderWidth: 1, borderColor: t.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 4, backgroundColor: t.inputBg,
    },
    actionBtnAccent: { borderColor: t.accent, backgroundColor: t.accentBg },
    actionBtnText: { fontSize: 11, fontWeight: '700', color: t.textSub },
    actionBtnTextAccent: { color: t.accent },

    editor: {
      backgroundColor: t.editorBg, color: t.editorText,
      fontFamily: MONO, fontSize: 13,
      borderRadius: 10, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
      padding: 14, minHeight: MIN_HEIGHT, lineHeight: 20,
    },
    nlInput: {
      backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
      padding: 14, fontSize: 15, color: t.text, minHeight: MIN_HEIGHT, lineHeight: 22,
    },
    resizeHandle: {
      height: 10, backgroundColor: t.dark ? '#020617' : '#1e293b',
      borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
      alignItems: 'center', justifyContent: 'center', cursor: 'ns-resize' as any,
    },
    resizeGrip: { width: 32, height: 3, borderRadius: 2, backgroundColor: '#475569' },

    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: t.chipBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    chipText: { color: t.chipText, fontWeight: '600', fontSize: 12 },

    runBtn: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    runBtnDisabled: { backgroundColor: t.dark ? '#4338ca' : '#a5b4fc' },
    runBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

    errorBox: { backgroundColor: t.errorBg, borderRadius: 10, padding: 14, borderLeftWidth: 4, borderLeftColor: '#ef4444', gap: 10 },
    errorText: { color: t.errorText, fontSize: 13 },
    retryBtn: { alignSelf: 'flex-start', backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
    retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    resultMeta: { fontSize: 13, color: t.textSub, fontWeight: '600' },
    tableRow: { flexDirection: 'row' },
    tableRowAlt: { backgroundColor: t.dark ? '#0f172a' : '#f8fafc' },
    tableHeader: { backgroundColor: t.accentBg },
    cell: {
      width: CELL_WIDTH, paddingHorizontal: 10, paddingVertical: 8,
      fontSize: 13, color: t.text,
      borderRightWidth: 1, borderRightColor: t.border,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    headerCell: { fontWeight: '700', color: t.accent },

    dropdown: {
      position: 'absolute', backgroundColor: t.surface,
      borderRadius: 12, borderWidth: 1, borderColor: t.border,
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 }, elevation: 10, minWidth: 220, overflow: 'hidden',
    },
    dropdownTitle: {
      fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 1,
      paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, textTransform: 'uppercase',
    },
    dropdownItem: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 10, gap: 12,
      borderTopWidth: 1, borderTopColor: t.border,
    },
    dropdownBadge: {
      backgroundColor: t.accentBg, borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 3, minWidth: 44, alignItems: 'center',
    },
    dropdownBadgeText: { fontSize: 11, fontWeight: '800', color: t.accent },
    dropdownBadgeCopy: { backgroundColor: t.accentBg },
    dropdownBadgeTextCopy: { color: t.accent },
    dropdownDesc: { fontSize: 13, color: t.textSub },
    dropdownDivider: { height: 1, backgroundColor: t.border, marginVertical: 4 },

    sqlToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: t.border, borderRadius: 20,
      paddingHorizontal: 10, paddingVertical: 5, backgroundColor: t.bg,
    },
    sqlToggleOn: { borderColor: t.accent, backgroundColor: t.accentBg },
    sqlToggleThumb: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.textMuted },
    sqlToggleThumbOn: { backgroundColor: t.accent },
    sqlToggleLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted },
    sqlToggleLabelOn: { color: t.accent },
  });
}
