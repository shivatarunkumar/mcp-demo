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

export type Row = Record<string, unknown>;

interface Props {
  columns: string[];
  rows: Row[];
}

type SortDir = 'asc' | 'desc' | null;

const DEFAULT_COL_WIDTH = 150;
const MIN_COL_WIDTH = 60;

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

// ── Column menu (3-dot popup) ──────────────────────────────────────────────────

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
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<View>(null);
  const isSorted = sortCol === col;
  const hasFilter = filterValue.trim().length > 0;

  const openMenu = () => {
    btnRef.current?.measureInWindow((x, y, _w, h) => {
      setPos({ top: y + h + 2, left: x });
    });
    setOpen(true);
  };

  const close = () => setOpen(false);

  return (
    <View ref={btnRef}>
      <TouchableOpacity onPress={openMenu} style={styles.dotBtn}>
        <Text style={[styles.dotText, (isSorted || hasFilter) && styles.dotTextActive]}>⋮</Text>
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="none" onRequestClose={close}>
        <TouchableWithoutFeedback onPress={close}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[styles.menu, { top: pos.top, left: pos.left }]}>
              <Text style={styles.menuTitle}>{col}</Text>

              {/* Sort options */}
              <Text style={styles.menuSection}>SORT</Text>
              <MenuItem
                label="↑  Ascending"
                active={isSorted && sortDir === 'asc'}
                onPress={() => { close(); onSort('asc'); }}
              />
              <MenuItem
                label="↓  Descending"
                active={isSorted && sortDir === 'desc'}
                onPress={() => { close(); onSort('desc'); }}
              />
              {isSorted && (
                <MenuItem
                  label="✕  Clear sort"
                  onPress={() => { close(); onSort(null); }}
                />
              )}

              <View style={styles.menuDivider} />

              {/* Filter */}
              <Text style={styles.menuSection}>FILTER</Text>
              <View style={styles.menuFilterRow}>
                <TextInput
                  style={styles.menuFilterInput}
                  value={filterValue}
                  onChangeText={onFilter}
                  placeholder="Filter value…"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                {hasFilter && (
                  <TouchableOpacity onPress={() => { onClearFilter(); }} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>✕</Text>
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

function MenuItem({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.menuItem, active && styles.menuItemActive]} onPress={onPress}>
      <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DataTable({ columns, rows }: Props) {
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
      const lower = val.toLowerCase();
      data = data.filter((r) => String(r[col] ?? '').toLowerCase().includes(lower));
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
      <View style={styles.statsRow}>
        <Text style={styles.stats}>
          {processed.length} / {rows.length} row{rows.length !== 1 ? 's' : ''}
          {hasFilters ? `  · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active` : ''}
        </Text>
        {hasFilters && (
          <TouchableOpacity onPress={() => setFilters({})}>
            <Text style={styles.clearAllText}>✕ Clear all filters</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header row */}
          <View style={styles.headerRow}>
            {columns.map((col) => {
              const w = widths[col] ?? DEFAULT_COL_WIDTH;
              const isSorted = sortCol === col;
              const hasFilter = !!(filters[col]?.trim());

              return (
                <View key={col} style={[styles.headerCell, { width: w }]}>
                  {/* Sort label — click to toggle sort */}
                  <TouchableOpacity
                    style={styles.headerLabel}
                    onPress={() => {
                      if (!isSorted) handleSort(col, 'asc');
                      else if (sortDir === 'asc') handleSort(col, 'desc');
                      else handleSort(col, null);
                    }}
                  >
                    <Text style={styles.headerText} numberOfLines={1}>
                      {col}
                      {isSorted && (
                        <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</Text>
                      )}
                    </Text>
                    {hasFilter && <View style={styles.filterDot} />}
                  </TouchableOpacity>

                  {/* 3-dot menu */}
                  <ColMenu
                    col={col}
                    sortCol={sortCol}
                    sortDir={sortDir}
                    filterValue={filters[col] ?? ''}
                    onSort={(dir) => handleSort(col, dir)}
                    onFilter={(val) => setFilter(col, val)}
                    onClearFilter={() => clearFilter(col)}
                  />

                  {/* Resize grip */}
                  {Platform.OS === 'web' && (
                    <View
                      // @ts-ignore
                      onMouseDown={(e: any) => { e.preventDefault(); startResize(col, e.clientX, w); }}
                      style={styles.resizeHandle}
                    />
                  )}
                </View>
              );
            })}
          </View>

          {/* Data rows */}
          {processed.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No rows match the current filters.</Text>
            </View>
          ) : (
            processed.map((row, i) => (
              <View key={i} style={[styles.dataRow, i % 2 === 1 && styles.dataRowAlt]}>
                {columns.map((col) => {
                  const w = widths[col] ?? DEFAULT_COL_WIDTH;
                  return (
                    <Text key={col} style={[styles.cell, { width: w }]} numberOfLines={1}>
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

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  stats: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  clearAllText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },

  // Header
  headerRow: { flexDirection: 'row', backgroundColor: '#ede9fe' },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#ddd6fe',
    borderBottomWidth: 2,
    borderBottomColor: '#c4b5fd',
  },
  headerLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9 },
  headerText: { fontSize: 13, fontWeight: '700', color: '#4f46e5', flex: 1 },
  sortArrow: { fontSize: 12, color: '#6366f1' },
  filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6366f1', marginLeft: 4 },

  // 3-dot button
  dotBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  dotText: { fontSize: 16, color: '#94a3b8', lineHeight: 16 },
  dotTextActive: { color: '#6366f1' },

  // Resize grip
  resizeHandle: {
    width: 5,
    alignSelf: 'stretch',
    cursor: 'col-resize' as any,
    borderRightWidth: 2,
    borderRightColor: '#c4b5fd',
  },

  // Column menu
  menu: {
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
    minWidth: 220,
    paddingBottom: 10,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  menuSection: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  menuDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 6 },
  menuItem: { paddingHorizontal: 14, paddingVertical: 9 },
  menuItemActive: { backgroundColor: '#ede9fe' },
  menuItemText: { fontSize: 13, color: '#475569' },
  menuItemTextActive: { color: '#6366f1', fontWeight: '700' },

  // Filter inside menu
  menuFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 4,
    gap: 6,
  },
  menuFilterInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#1e293b',
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: { fontSize: 11, color: '#ef4444', fontWeight: '700' },

  // Data rows
  dataRow: { flexDirection: 'row' },
  dataRowAlt: { backgroundColor: '#fafafa' },
  cell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1e293b',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  emptyRow: { padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#94a3b8' },
});
