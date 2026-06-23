// app/api/upload-sj/route.ts
import { NextResponse } from 'next/server';
import {
  supabase,
  parseExcelDate,
  cleanIndonesianNumber,
  aggregateData,
  convertToCsvString,
  fetchValidSkus,
  fetchBranchData,
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
    const { areaMap, branchMap } = await fetchBranchData();

    // ============================================================
    // 1. Mapping data mentah (sesuai Python)
    // ============================================================
    const mappedData = rawPayload.map((row: any) => {
      // Area lookup
      const areaNameClean = String(row.area_name || '').trim().toUpperCase();
      const rawCityCode = areaMap.get(areaNameClean) || "UNKNOWN";
      const areaCode = `${namaCompany}-${rawCityCode}`;

      // Branch lookup
      const branchNameClean = String(row.branch_name || '').trim().toUpperCase();
      const branchCode = branchMap.get(branchNameClean) || "UNKNOWN";

      // Clean fields
      const productCodeClean = String(row.product_code || '').trim();
      const noSqClean = String(row.no_sq || '').trim();
      const noSoClean = String(row.no_so || '').trim();
      const noSjClean = String(row.no_sj || '').trim();

      // Composite keys (sesuai Python)
      const keySq = `${noSqClean}-${productCodeClean}`;
      const keySo = `${noSoClean}-${noSqClean}-${productCodeClean}`;
      const keySj = `${noSjClean}-${noSoClean}-${keySq}-${branchCode}`;
      const keyProduct = makeKeyProduct(areaCode, productCodeClean);

      return {
        // Kolom dari payload
        date_sj: parseExcelDate(row.date_sj),
        date_sq: parseExcelDate(row.date_sq),
        date_so: parseExcelDate(row.date_so),
        no_sj: noSjClean,
        no_sq: noSqClean,
        no_so: noSoClean,
        product_code: productCodeClean,
        status_sj: String(row.status_sj || 'Terproses').trim(),
        area_name: areaNameClean,
        branch_name: branchNameClean,
        area_code: areaCode,
        branch_code: branchCode,
        key_sj: keySj,
        key_so: keySo,
        key_sq: keySq,
        key_product: keyProduct,
        qty_sj: cleanIndonesianNumber(row.qty_sj), // untuk agregasi
        price: 0, // dummy, tidak digunakan
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
        'key_sj', 'key_so', 'key_sq', 'key_product', 'branch_code',
        'date_sj', 'no_sj', 'date_sq', 'no_sq', 'no_so', 'status_sj', 'product_code'
      ];
      const aggregatedInvalid = aggregateData(invalidRows, pivotColsInvalid, true, 'qty_sj', 'price');
      const csvData = aggregatedInvalid.map(item => ({ ...item, qty_sj: item.qty }));
      skuErrorCsv = convertToCsvString(csvData, [...pivotColsInvalid, 'qty_sj']);
    }

    if (validRows.length === 0) {
      return NextResponse.json({
        success: false,
        allFailed: true,
        message: 'Seluruh SKU SJ tidak terdaftar di Master Product!',
        skuErrorCsv
      });
    }

    // ============================================================
    // 3. Agregasi data valid (group by pivotCols)
    // ============================================================
    const pivotColsUtama = [
      'key_sj', 'key_so', 'key_sq', 'key_product', 'branch_code',
      'date_sj', 'no_sj', 'date_sq', 'no_sq', 'no_so', 'status_sj', 'product_code'
    ];
    const aggregatedValid = aggregateData(validRows, pivotColsUtama, false, 'qty_sj', 'price');
    const finalPayload = aggregatedValid.map(item => {
      const { qty, price, ...rest } = item;
      return { ...rest, qty_sj: qty };
    });

    // ============================================================
    // 4. Hapus data lama berdasarkan no_sj (batch 1000)
    // ============================================================
    const uniqueNoSj = [...new Set(finalPayload.map(r => r.no_sj).filter(Boolean))];
    if (uniqueNoSj.length > 0) {
      for (let i = 0; i < uniqueNoSj.length; i += 1000) {
        const batch = uniqueNoSj.slice(i, i + 1000);
        await supabase.from('monitoring_sj').delete().in('no_sj', batch);
      }
    }

    // ============================================================
    // 5. Insert data baru ke monitoring_sj
    // ============================================================
    const { data: insertedData, error: insertErr } = await supabase
      .from('monitoring_sj')
      .insert(finalPayload)
      .select('key_sj');
    if (insertErr) throw insertErr;

    // ============================================================
    // 6. Catat log aktivitas
    // ============================================================
    await logUpload(
      'SJ',
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
    console.error('❌ [Upload SJ Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}