// app/api/upload-sq/route.ts
import { NextResponse } from 'next/server';
import {
  supabase,
  parseExcelDate,
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

    // Mapping SQ (sudah pakai qty_sq dan price)
    const mappedData = rawPayload.map((row: any) => {
      const branchNameClean = String(row.branch_name || '').trim().toUpperCase();
      const rawCityCode = branchMap.get(branchNameClean) || "UNKNOWN";
      const areaCode = `${namaCompany}-${rawCityCode}`;
      const productCodeClean = String(row.product_code || '').trim();
      const noSqClean = String(row.no_sq || '').trim();

      return {
        ...row,
        date_sq: parseExcelDate(row.date_sq),
        no_sq: noSqClean,
        product_code: productCodeClean,
        customer_name: String(row.customer_name || '').trim(),
        status_sq: String(row.status_sq || 'Terproses').trim(),
        branch_name: branchNameClean,
        area_code: areaCode,
        key: `${noSqClean}-${productCodeClean}`,
        key_product: makeKeyProduct(areaCode, productCodeClean),
        qty_sq: row.qty_sq, // untuk aggregateData kita pakai qtyField='qty_sq'
        price: row.price,   // priceField='price'
        created_at: new Date().toISOString()
      };
    });

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
        'key', 'key_product', 'area_code', 'date_sq', 'no_sq',
        'customer_name', 'product_code', 'product_name', 'category_name', 'status_sq'
      ];
      const aggregatedInvalid = aggregateData(invalidRows, pivotColsInvalid, true, 'qty_sq', 'price');
      // mapping kembali qty->qty_sq untuk CSV
      const csvData = aggregatedInvalid.map(item => ({ ...item, qty_sq: item.qty }));
      skuErrorCsv = convertToCsvString(csvData, [...pivotColsInvalid, 'qty_sq', 'price']);
    }

    if (validRows.length === 0) {
      return NextResponse.json({
        success: false,
        allFailed: true,
        message: 'Seluruh SKU tidak terdaftar di Master Product!',
        skuErrorCsv
      });
    }

    const pivotColsUtama = [
      'key', 'key_product', 'area_code', 'date_sq', 'no_sq',
      'customer_name', 'product_code', 'status_sq'
    ];
    const aggregatedValid = aggregateData(validRows, pivotColsUtama, false, 'qty_sq', 'price');
    const finalPayload = aggregatedValid.map(item => {
      const { qty, price, ...rest } = item;
      return { ...rest, qty_sq: qty, price };
    });

    const uniqueNoSq = [...new Set(finalPayload.map(r => r.no_sq).filter(Boolean))];
    if (uniqueNoSq.length > 0) {
      for (let i = 0; i < uniqueNoSq.length; i += 1000) {
        const batch = uniqueNoSq.slice(i, i + 1000);
        await supabase.from('monitoring_sq').delete().in('no_sq', batch);
      }
    }

    const { data: insertedData, error: insertErr } = await supabase
      .from('monitoring_sq')
      .insert(finalPayload)
      .select('key');
    if (insertErr) throw insertErr;

    await logUpload(
      'SQ',
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
    console.error('❌ [Upload SQ Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}