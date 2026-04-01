import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
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
import { useTheme, type Theme } from '../context/ThemeContext';

export type Row = Record<string, unknown>;

interface Props {
  columns: string[];
  rows: Row[];
}

type SortDir = 'asc' | 'desc' | null;

const DEFAULT_COL_WIDTH = 150;
const MIN_COL_WIDTH = 60;

// ── Filter matching ────────────────────────────────────────────────────────────
// Supports: >=100  >100  <=50  <50  =100  !=foo  plain text (contains)

function matchesFilter(cellValue: unknown, expr: string): boolean {
  const cell = cellValue == null ? '' : String(cellValue);
  const ops = [['>=', (a: number, b: number) => a >= b], ['<=', (a: number, b: number) => a <= b],
               ['!=', null], ['>', (a: number, b: number) => a > b], ['<', (a: number, b: number) => a < b],
               ['=', (a: number, b: number) => a === b]] as const;

  for (const [op, fn] of ops) {
    if (!expr.startsWith(op)) continue;
    const rhs = expr.slice(op.length).trim();
    if (op === '!=') return !cell.toLowerCase().includes(rhs.toLowerCase());
    const num = Number(rhs);
    if (!isNaN(num) && rhs !== '') return fn!(Number(cell), num);
    // fallback string compare
    if (op === '=') return cell.toLowerCase() === rhs.toLowerCase();
  }
  // plain contains
  return cell.toLowerCase().includes(expr.toLowerCase());
}

// ── Column resizing ────────────────────────────────────────────────────────────

function useColWidths(columns: string[]) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c, DEFAULT_COL_WIDTH]))
  );

  const prevCols = useRef(columns);
  if (prevCols.current !== columns) {
    prevCols.current = columns;
    setWidths(Object.fromEntries(columns.map((c) => [c, DEFAULT_COL_WIDTH])));
  }

  const startResize = useCallback((col: string, startX: number, currentW: number) => {
    if (Platform.OS !== 'web') return;
    const onMouseMove = (e: MouseEvent) => {
      const next = Math.max(MIN_COL_WIDTH, currentW + e.clientX - startX);
      setWidths((prev) => ({ ...prev, [col]: next }));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  return { widths, startResize };
}

// ── Column menu ────────────────────────────────────────────────────────────────

interface ColMenuProps {
  col: string;
  sortCol: string | null;
  sortDir: SortDir;
  filterValue: string;
  onSort: (dir: 'asc' | 'desc' | null) => void;
  onFilter: (val: string) => void;
  onClearFilter: () => void;
}

function ColMenu({ col, sortCol, sortDir, filterValue, onSort, onFilter, onClearFilter }: ColMenuProps) {
  const { theme: t } = useTheme();
  const s = makeStyles(t);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<View>(null);
  const isSorted = sortCol === col;
  const hasFilter = filterValue.trim().length > 0;

  const openMenu = () => {
    btnRef.current?.measureInWindow((x, y, _w, h) => setPos({ top: y + h + 2, left: x }));
    setOpen(true);
  };
  const close = () => setOpen(false);

  return (
    <View ref={btnRef}>
      <TouchableOpacity onPress={openMenu} style={s.dotBtn}>
        <Text style={[s.dotText, (isSorted || hasFilter) && s.dotTextActive]}>⋮</Text>
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="none" onRequestClose={close}>
        <TouchableWithoutFeedback onPress={close}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[s.menu, { top: pos.top, left: pos.left }]}>
              <Text style={s.menuTitle}>{col}</Text>

              <Text style={s.menuSection}>SORT</Text>
              <MenuItem label="↑  Ascending"  active={isSorted && sortDir === 'asc'}  onPress={() => { close(); onSort('asc'); }}  s={s} />
              <MenuItem label="↓  Descending" active={isSorted && sortDir === 'desc'} onPress={() => { close(); onSort('desc'); }} s={s} />
              {isSorted && <MenuItem label="✕  Clear sort" onPress={() => { close(); onSort(null); }} s={s} />}

              <View style={s.menuDivider} />

              <Text style={s.menuSection}>FILTER</Text>
              <View style={s.menuFilterRow}>
                <TextInput
                  style={s.menuFilterInput}
                  value={filterValue}
                  onChangeText={onFilter}
                  placeholder="text, >=100, <50, !=x"
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                {hasFilter && (
                  <TouchableOpacity onPress={onClearFilter} style={s.clearBtn}>
                    <Text style={s.clearBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function MenuItem({ label, active, onPress, s }: { label: string; active?: boolean; onPress: () => void; s: ReturnType<typeof makeStyles> }) {
  return (
    <TouchableOpacity style={[s.menuItem, active && s.menuItemActive]} onPress={onPress}>
      <Text style={[s.menuItemText, active && s.menuItemTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DataTable({ columns, rows }: Props) {
  const { theme: t } = useTheme();
  const s = makeStyles(t);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { widths, startResize } = useColWidths(columns);

  const handleSort = (col: string, dir: 'asc' | 'desc' | null) => {
    if (dir === null) { setSortCol(null); setSortDir(null); }
    else { setSortCol(col); setSortDir(dir); }
  };

  const setFilter = (col: string, val: string) =>
    setFilters((prev) => ({ ...prev, [col]: val }));

  const clearFilter = (col: string) =>
    setFilters((prev) => { const n = { ...prev }; delete n[col]; return n; });

  const processed = useMemo(() => {
    let data = [...rows];
    Object.entries(filters).forEach(([col, val]) => {
      if (!val.trim()) return;
      data = data.filter((r) => matchesFilter(r[col], val.trim()));
    });
    if (sortCol && sortDir) {
      data.sort((a, b) => {
        const av = String(a[sortCol] ?? '');
        const bv = String(b[sortCol] ?? '');
        const num = !isNaN(Number(av)) && !isNaN(Number(bv));
        const cmp = num ? Number(av) - Number(bv) : av.localeCompare(bv);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return data;
  }, [rows, filters, sortCol, sortDir]);

  const hasFilters = Object.values(filters).some((v) => v.trim());
  const activeFilterCount = Object.values(filters).filter((v) => v.trim()).length;

  return (
    <View>
      {/* Stats bar */}
      <View style={s.statsRow}>
        <Text style={s.stats}>
          {processed.length} / {rows.length} row{rows.length !== 1 ? 's' : ''}
          {hasFilters ? `  · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active` : ''}
        </Text>
        {hasFilters && (
          <TouchableOpacity onPress={() => setFilters({})}>
            <Text style={s.clearAllText}>✕ Clear all filters</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header row */}
          <View style={s.headerRow}>
            {columns.map((col) => {
              const w = widths[col] ?? DEFAULT_COL_WIDTH;
              const isSorted = sortCol === col;
              const hasFilter = !!(filters[col]?.trim());
              return (
                <View key={col} style={[s.headerCell, { width: w }]}>
                  <TouchableOpacity
                    style={s.headerLabel}
                    onPress={() => {
                      if (!isSorted) handleSort(col, 'asc');
                      else if (sortDir === 'asc') handleSort(col, 'desc');
                      else handleSort(col, null);
                    }}
                  >
                    <Text style={s.headerText} numberOfLines={1}>
                      {col}
                      {isSorted && <Text style={s.sortArrow}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</Text>}
                    </Text>
                    {hasFilter && <View style={s.filterDot} />}
                  </TouchableOpacity>

                  <ColMenu
                    col={col}
                    sortCol={sortCol}
                    sortDir={sortDir}
                    filterValue={filters[col] ?? ''}
                    onSort={(dir) => handleSort(col, dir)}
                    onFilter={(val) => setFilter(col, val)}
                    onClearFilter={() => clearFilter(col)}
                  />

                  {Platform.OS === 'web' && (
                    <View
                      // @ts-ignore
                      onMouseDown={(e: any) => { e.preventDefault(); startResize(col, e.clientX, w); }}
                      style={s.resizeHandle}
                    />
                  )}
                </View>
              );
            })}
          </View>

          {/* Data rows */}
          {processed.length === 0 ? (
            <View style={s.emptyRow}>
              <Text style={s.emptyText}>No rows match the current filters.</Text>
            </View>
          ) : (
            processed.map((row, i) => (
              <View
                key={i}
                style={[s.dataRow, { backgroundColor: i % 2 === 1 ? t.dark ? '#162032' : '#f8fafc' : t.surface }]}
              >
                {columns.map((col) => {
                  const w = widths[col] ?? DEFAULT_COL_WIDTH;
                  return (
                    <Text key={col} style={[s.cell, { width: w }]} numberOfLines={1}>
                      {row[col] == null ? '—' : String(row[col])}
                    </Text>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function makeStyles(t: Theme) {
  return StyleSheet.create({
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    stats: { fontSize: 12, color: t.textSub, fontWeight: '600' },
    clearAllText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },

    headerRow: { flexDirection: 'row', backgroundColor: t.accentBg },
    headerCell: {
      flexDirection: 'row', alignItems: 'center',
      borderRightWidth: 1, borderRightColor: t.dark ? t.accentBorder : '#ddd6fe',
      borderBottomWidth: 2, borderBottomColor: t.dark ? t.accent : '#c4b5fd',
    },
    headerLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9 },
    headerText: { fontSize: 13, fontWeight: '700', color: t.accent, flex: 1 },
    sortArrow: { fontSize: 12, color: t.accent },
    filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent, marginLeft: 4 },

    dotBtn: { paddingHorizontal: 6, paddingVertical: 8 },
    dotText: { fontSize: 16, color: t.textMuted, lineHeight: 16 },
    dotTextActive: { color: t.accent },

    resizeHandle: {
      width: 5, alignSelf: 'stretch',
      cursor: 'col-resize' as any,
      borderRightWidth: 2, borderRightColor: t.dark ? t.accent : '#c4b5fd',
    },

    menu: {
      position: 'absolute', backgroundColor: t.surface,
      borderRadius: 12, borderWidth: 1, borderColor: t.border,
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 }, elevation: 10, minWidth: 220, paddingBottom: 10,
    },
    menuTitle: { fontSize: 13, fontWeight: '800', color: t.text, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
    menuSection: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 1, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
    menuDivider: { height: 1, backgroundColor: t.border, marginVertical: 6 },
    menuItem: { paddingHorizontal: 14, paddingVertical: 9 },
    menuItemActive: { backgroundColor: t.accentBg },
    menuItemText: { fontSize: 13, color: t.textSub },
    menuItemTextActive: { color: t.accent, fontWeight: '700' },

    menuFilterRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 4, gap: 6 },
    menuFilterInput: {
      flex: 1, backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: t.text,
    },
    clearBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
    clearBtnText: { fontSize: 11, color: '#ef4444', fontWeight: '700' },

    dataRow: { flexDirection: 'row' },
    cell: {
      paddingHorizontal: 10, paddingVertical: 8,
      fontSize: 13, color: t.text,
      borderRightWidth: 1, borderRightColor: t.border,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    emptyRow: { padding: 20, alignItems: 'center' },
    emptyText: { fontSize: 13, color: t.textMuted },
  });
}
