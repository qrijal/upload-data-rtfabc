// app/api/upload-stock/route.ts
import { NextResponse } from 'next/server';
import {
  supabase,
  parseExcelDate,
  cleanIndonesianNumber,
  convertToCsvString,
  fetchValidSkus,
  fetchConvertMap,
  fetchBranchCodeMap,
  logUpload,
} from '../lib/supabase-helpers';

export async function POST(req: Request) {
  try {
    const warehouseName = req.headers.get('x-warehouse-name') || '';
    const { payload: rawPayload, fileName } = await req.json();

    if (!rawPayload?.length) {
      return NextResponse.json({ error: 'Data payload kosong.' }, { status: 400 });
    }

    const validSkus = await fetchValidSkus();
    const convertMap = await fetchConvertMap();
    const branchCodeMap = await fetchBranchCodeMap();

    // 1. Mapping data
    const mappedData = rawPayload.map((row: any) => {
      const branchNameClean = String(row.branch_name || '').trim().toUpperCase();
      const branchCode = branchCodeMap.get(branchNameClean) || "UNKNOWN";
      const productCodeClean = String(row.product_code || '').trim().toUpperCase();
      const factor = convertMap.get(productCodeClean) || 1;
      const qty = cleanIndonesianNumber(row.qty_stock);
      const convertedQty = Math.round((qty / factor) * 100) / 100;

      return {
        date_stock: parseExcelDate(row.date_stock),
        branch_code: branchCode,
        product_code: productCodeClean,
        qty_stock: convertedQty,
        key_product: `${branchCode.substring(0, 3)}-${productCodeClean}`,
        created_at: new Date().toISOString()
      };
    });

    // 2. Validasi SKU & filter qty > 0
    const validRows: any[] = [];
    const invalidRows: any[] = [];
    mappedData.forEach(row => {
      const checkSku = String(row.product_code).toUpperCase();
      if (validSkus.has(checkSku)) {
        if (row.qty_stock > 0) {
          validRows.push(row);
        } else {
          // qty <= 0 diabaikan (tidak masuk error CSV, hanya diabaikan)
        }
      } else {
        invalidRows.push(row);
      }
    });

    let skuErrorCsv: string | null = null;
    let hasSkuError = false;
    if (invalidRows.length > 0) {
      hasSkuError = true;
      const csvData = invalidRows.map(row => ({
        date_stock: row.date_stock,
        branch_code: row.branch_code,
        product_code: row.product_code,
        qty_stock: row.qty_stock,
        status: 'SKU tidak terdaftar atau qty <= 0'
      }));
      skuErrorCsv = convertToCsvString(csvData, ['date_stock', 'branch_code', 'product_code', 'qty_stock', 'status']);
    }

    if (validRows.length === 0) {
      return NextResponse.json({
        success: false,
        allFailed: true,
        message: 'Tidak ada data valid (SKU tidak terdaftar atau qty <= 0).',
        skuErrorCsv
      });
    }

    // 3. Hapus data lama berdasarkan kombinasi date_stock + branch_code
    // Ambil pasangan unik (date_stock, branch_code) dari data valid
    const uniquePairs = new Set<string>();
    validRows.forEach(row => {
      uniquePairs.add(`${row.date_stock}|${row.branch_code}`);
    });

    // Delete per kombinasi (loop) untuk menghindari error filter kompleks
    for (const pair of uniquePairs) {
      const [date, branch] = pair.split('|');
      const { error: deleteErr } = await supabase
        .from('fact_stock')
        .delete()
        .eq('date_stock', date)
        .eq('branch_code', branch);
      if (deleteErr) throw deleteErr;
    }

    // 4. Insert data baru
    const { data: insertedData, error: insertErr } = await supabase
      .from('fact_stock')
      .insert(validRows)
      .select('product_code');
    if (insertErr) throw insertErr;

    // 5. Catat log
    await logUpload(
      'STOCK',
      fileName,
      insertedData?.length || validRows.length,
      hasSkuError ? 'partial' : 'success',
      hasSkuError ? 'Beberapa SKU tidak terdaftar atau qty <= 0' : undefined
    );

    return NextResponse.json({
      success: true,
      count: insertedData?.length || validRows.length,
      hasSkuError,
      skuErrorCsv
    });

  } catch (err: any) {
    console.error('❌ [Upload Stock Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}