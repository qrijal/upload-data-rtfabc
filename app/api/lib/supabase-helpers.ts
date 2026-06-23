// app/api/lib/supabase-helpers.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ==================== PARSING & CLEANING ====================

export const parseExcelDate = (excelSerial: any): string => {
  if (!excelSerial) return new Date().toISOString().split('T')[0];
  if (isNaN(Number(excelSerial))) {
    const d = new Date(excelSerial);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : excelSerial;
  }
  const dateOffset = Number(excelSerial) - 25569;
  return new Date(dateOffset * 86400 * 1000).toISOString().split('T')[0];
};

export const cleanIndonesianNumber = (val: any): number => {
  if (val === null || val === undefined) return 0.0;
  if (typeof val === 'number') return val;
  let valStr = String(val).trim();
  if (!valStr) return 0.0;
  if (valStr.includes(',')) {
    valStr = valStr.replace(/\./g, '').replace(',', '.');
  }
  const num = parseFloat(valStr);
  return isNaN(num) ? 0.0 : num;
};

// ==================== AGREGASI (FLEKSIBEL) ====================

export const aggregateData = (
  arr: any[],
  pivotCols: string[],
  includeDetails = false,
  qtyField = 'qty',
  priceField = 'price'
) => {
  const groups: Record<string, { row: any; qty: number; price: number }> = {};
  arr.forEach(item => {
    const groupKey = pivotCols.map(col => String(item[col] || '')).join('|');
    const qty = cleanIndonesianNumber(item[qtyField] ?? 0);
    const price = cleanIndonesianNumber(item[priceField] ?? 0);
    if (!groups[groupKey]) {
      const baseRow: any = {};
      pivotCols.forEach(col => { baseRow[col] = item[col]; });
      if (includeDetails) {
        baseRow.product_name = item.product_name || '';
        baseRow.category_name = item.category_name || '';
      }
      groups[groupKey] = { row: baseRow, qty: 0, price: 0 };
    }
    groups[groupKey].qty += qty;
    groups[groupKey].price = price; // harga diambil dari baris terakhir
  });
  return Object.values(groups).map(g => ({ ...g.row, qty: g.qty, price: g.price }));
};

// ==================== CSV & CONVERT ====================

export const convertToCsvString = (arr: any[], headers: string[]): string => {
  const csvRows = [headers.join(',')];
  for (const row of arr) {
    const values = headers.map(header => {
      const val = row[header] === undefined || row[header] === null ? '' : String(row[header]);
      return val.includes(',') || val.includes('\n') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
};

// ==================== FETCH MASTER DATA ====================

export const fetchValidSkus = async () => {
  const validSkus = new Set<string>();
  let offset = 0;
  const batchSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('dim_product')
      .select('product_code')
      .order('product_code', { ascending: true })
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    if (batch && batch.length > 0) {
      batch.forEach(p => { if (p.product_code) validSkus.add(String(p.product_code).trim().toUpperCase()); });
      if (batch.length < batchSize) hasMore = false;
      else offset += batchSize;
    } else hasMore = false;
  }
  return validSkus;
};

export const fetchBranchMap = async () => {
  const { data, error } = await supabase.from('dim_branch').select('area_name, city_code');
  if (error) throw error;
  const map = new Map<string, string>();
  data?.forEach(b => {
    if (b.area_name) map.set(String(b.area_name).trim().toUpperCase(), String(b.city_code).trim());
  });
  return map;
};

export const fetchBranchCodeMap = async () => {
  const { data, error } = await supabase
    .from('dim_branch')
    .select('branch_name, branch_code');
  if (error) throw error;
  const map = new Map<string, string>();
  data?.forEach(row => {
    if (row.branch_name) {
      map.set(String(row.branch_name).trim().toUpperCase(), String(row.branch_code).trim());
    }
  });
  return map;
};
export const makeKeyProduct = (areaCode: string, productCode: string) =>
  `${areaCode.substring(0, 3)}-${productCode}`;

// ==================== LOGGING ====================

export const logUpload = async (
  module: string,
  fileName: string,
  rowsCount: number,
  status: string,
  errorNote?: string
) => {
  await supabase.from('upload_logs').insert({
    module,
    file_name: fileName || 'unknown',
    rows_count: rowsCount,
    status,
    error_note: errorNote || null,
  });
};

export const fetchBranchData = async () => {
  const { data, error } = await supabase
    .from('dim_branch')
    .select('branch_name, branch_code, area_name, city_code');
  if (error) throw error;
  const areaMap = new Map<string, string>();
  const branchMap = new Map<string, string>();
  data?.forEach(row => {
    if (row.area_name) {
      areaMap.set(String(row.area_name).trim().toUpperCase(), String(row.city_code).trim());
    }
    if (row.branch_name) {
      branchMap.set(String(row.branch_name).trim().toUpperCase(), String(row.branch_code).trim());
    }
  });
  return { areaMap, branchMap };
};

export const fetchConvertMap = async () => {
  const { data, error } = await supabase
    .from('dim_product')
    .select('product_code, qty_convert');
  if (error) throw error;
  const map = new Map<string, number>();
  data?.forEach(row => {
    if (row.product_code) {
      map.set(String(row.product_code).trim().toUpperCase(), row.qty_convert || 1);
    }
  });
  return map;
};