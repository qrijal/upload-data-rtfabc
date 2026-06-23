// app/api/upload-so/route.ts
import { NextResponse } from 'next/server';
import {
  supabase,
  parseExcelDate,
  cleanIndonesianNumber,
  aggregateData,
  convertToCsvString,
  fetchValidSkus,
  fetchBranchMap,
  makeKeyProduct,
  logUpload,
} from '../lib/supabase-helpers';

export async function POST(req: Request) {
  try {
    const warehouseName = req.headers.get('x-warehouse-name') || '';
    const { payload: rawPayload, fileName } = await req.json();

    if (!rawPayload?.length) {
      return NextResponse.json({ error: 'Data payload kosong.' }, { status: 400 });
    }

    const namaCompany = warehouseName.trim() === "PT. Anugrah Bangun Cahaya" ? "ABC" : "RTF";
    const validSkus = await fetchValidSkus();
    const branchMap = await fetchBranchMap();

    // ============================================================
    // 1. Mapping data mentah sesuai Python: product_code dari kolom H (index 7)
    //    area_name, no_so, no_sq, date_so, status_so, qty_so
    // ============================================================
    const mappedData = rawPayload.map((row: any) => {
      // Gunakan area_name (sesuai Python) atau fallback branch_name
      const branchNameClean = String(row.area_name || row.branch_name || '').trim().toUpperCase();
      const rawCityCode = branchMap.get(branchNameClean) || "UNKNOWN";
      const areaCode = `${namaCompany}-${rawCityCode}`;
      const productCodeClean = String(row.product_code || '').trim();
      const noSqClean = String(row.no_sq || '').trim();
      const noSoClean = String(row.no_so || '').trim();

      return {
        date_so: parseExcelDate(row.date_so),
        no_so: noSoClean,
        no_sq: noSqClean,
        product_code: productCodeClean,
        status_so: String(row.status_so || 'Terproses').trim(),
        area_name: branchNameClean,
        area_code: areaCode,
        key_sq: `${noSqClean}-${productCodeClean}`,
        key_so: `${noSoClean}-${noSqClean}-${productCodeClean}`,
        key_product: makeKeyProduct(areaCode, productCodeClean),
        qty_so: cleanIndonesianNumber(row.qty_so),
        // price tidak dipakai di SO, tapi aggregateData butuh parameter priceField,
        // kita bisa beri default 0 atau tidak digunakan karena kita akan mapping ulang.
        created_at: new Date().toISOString()
      };
    });

    // ============================================================
    // 2. Pisahkan valid vs invalid SKU
    // ============================================================
    const validRows: any[] = [];
    const invalidRows: any[] = [];
    mappedData.forEach(row => {
      const checkSku = String(row.product_code).toUpperCase();
      if (validSkus.has(checkSku)) validRows.push(row);
      else invalidRows.push(row);
    });

    let skuErrorCsv: string | null = null;
    let hasSkuError = false;

    if (invalidRows.length > 0) {
      hasSkuError = true;
      const pivotColsInvalid = [
        'key_so', 'key_sq', 'key_product', 'area_code', 'no_so',
        'no_sq', 'date_so', 'product_code', 'status_so'
      ];
      // Gunakan aggregateData dengan qtyField='qty_so', priceField='price' (dummy)
      const aggregatedInvalid = aggregateData(invalidRows, pivotColsInvalid, true, 'qty_so', 'price');
      // Mapping qty -> qty_so untuk CSV
      const csvData = aggregatedInvalid.map(item => ({ ...item, qty_so: item.qty }));
      skuErrorCsv = convertToCsvString(csvData, [...pivotColsInvalid, 'qty_so']);
    }

    if (validRows.length === 0) {
      return NextResponse.json({
        success: false,
        allFailed: true,
        message: 'Seluruh SKU SO tidak terdaftar di Master Product!',
        skuErrorCsv
      });
    }

    // ============================================================
    // 3. Agregasi data valid (group by key_so)
    // ============================================================
    const pivotColsUtama = [
      'key_so', 'key_sq', 'key_product', 'area_code', 'no_so',
      'no_sq', 'date_so', 'product_code', 'status_so'
    ];
    const aggregatedValid = aggregateData(validRows, pivotColsUtama, false, 'qty_so', 'price');
    const finalPayload = aggregatedValid.map(item => {
      const { qty, price, ...rest } = item;
      return { ...rest, qty_so: qty };
    });

    // ============================================================
    // 4. Hapus data lama berdasarkan no_so (batch 1000)
    // ============================================================
    const uniqueNoSo = [...new Set(finalPayload.map(r => r.no_so).filter(Boolean))];
    if (uniqueNoSo.length > 0) {
      for (let i = 0; i < uniqueNoSo.length; i += 1000) {
        const batch = uniqueNoSo.slice(i, i + 1000);
        await supabase.from('monitoring_so').delete().in('no_so', batch);
      }
    }

    // ============================================================
    // 5. Insert data baru
    // ============================================================
    const { data: insertedData, error: insertErr } = await supabase
      .from('monitoring_so')
      .insert(finalPayload)
      .select('key_so');
    if (insertErr) throw insertErr;

    // ============================================================
    // 6. Catat log aktivitas
    // ============================================================
    await logUpload(
      'SO',
      fileName,
      insertedData?.length || finalPayload.length,
      hasSkuError ? 'partial' : 'success',
      hasSkuError ? 'Beberapa SKU tidak terdaftar' : undefined
    );

    return NextResponse.json({
      success: true,
      count: insertedData?.length || finalPayload.length,
      hasSkuError,
      skuErrorCsv
    });

  } catch (err: any) {
    console.error('❌ [Upload SO Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}