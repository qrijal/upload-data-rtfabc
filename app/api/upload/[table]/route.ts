import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TABLES = {
  sj: { name: 'monitoring_sj', conflict: 'key_sj' },
  sq: { name: 'monitoring_sq', conflict: 'key' },
  so: { name: 'monitoring_so', conflict: 'key_so' },
  dim_product: { name: 'dim_product', conflict: 'key_product' },
  credit_limit: { name: 'credit_limit_customer', conflict: 'id_cust' }, // Penambahan Config Tabel Baru
  fact_stock: { name: 'fact_stock', dateField: 'date_stock' },
  fact_stock_aging: { name: 'fact_stock_aging', dateField: 'date_age' },
  fact_po_sales_fos_weekly: { name: 'fact_po_sales_fos_weekly', conflict: 'sales_name, week, month' },
  fact_po_sales_fos_monthly: { name: 'fact_po_sales_fos_monthly', conflict: 'sales_name, month' },
} as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const { table } = await params;
    const key = table as keyof typeof TABLES;
    const config = TABLES[key];
    
    if (!config) return NextResponse.json({ error: 'Tabel tidak valid' }, { status: 400 });

    const { payload: chunkPayload, force, isCheckOnly, isFirstChunk } = await req.json();
    if (!chunkPayload?.length) return NextResponse.json({ error: 'Data chunk kosong' }, { status: 400 });

    const now = new Date().toISOString();
    const payload = (chunkPayload as any[]).map(row => ({
      ...row,
      created_at: now
    }));

    // 📦 1. LOGIKA MONITORING SO (Murni no_sq, Saring data match, Hapus-Pasang per no_so)
    if (key === 'so') {
      const noSqInSo = [...new Set(payload.map(r => r.no_sq).filter(Boolean))]; 
      let validPayload = payload;
      let skippedNoSq: string[] = [];

      if (noSqInSo.length > 0) {
        const { data: existingSq, error: sqCheckErr } = await supabase
          .from('monitoring_sq')
          .select('no_sq')
          .in('no_sq', noSqInSo);

        if (sqCheckErr) throw sqCheckErr;

        const existingSqSet = new Set(existingSq?.map(sq => sq.no_sq));
        validPayload = payload.filter(row => existingSqSet.has(row.no_sq));
        skippedNoSq = noSqInSo.filter(noSq => !existingSqSet.has(noSq));
      }

      if (validPayload.length === 0) {
        return NextResponse.json({ success: true, count: 0, skippedSq: skippedNoSq });
      }

      const noSoInChunk = [...new Set(validPayload.map(r => r.no_so).filter(Boolean))];
      if (noSoInChunk.length > 0) {
        const { error: deleteErr } = await supabase.from('monitoring_so').delete().in('no_so', noSoInChunk);
        if (deleteErr) throw deleteErr;
      }

      const { data, error: insertErr } = await supabase.from('monitoring_so').insert(validPayload).select('key_so');
      if (insertErr) throw insertErr;

      return NextResponse.json({ success: true, count: data?.length ?? validPayload.length, skippedSq: skippedNoSq });
    }

    // 📦 2. LOGIKA MONITORING SQ (Hapus-Pasang per no_sq)
    if (key === 'sq') {
      const noSqInChunk = [...new Set(payload.map(r => r.no_sq).filter(Boolean))];
      if (noSqInChunk.length > 0) {
        const { error: deleteErr } = await supabase.from('monitoring_sq').delete().in('no_sq', noSqInChunk);
        if (deleteErr) throw deleteErr;
      }
      const { data, error: insertErr } = await supabase.from('monitoring_sq').insert(payload).select('key');
      if (insertErr) throw insertErr;
      return NextResponse.json({ success: true, count: data?.length ?? payload.length });
    }

    // 📦 3. LOGIKA MONITORING SJ (Validasi no_sq, Saring data match, Hapus-Pasang per no_sj)
    if (key === 'sj') {
      const noSqInSj = [...new Set(payload.map(r => r.no_sq).filter(Boolean))];
      let validPayload = payload;
      let skippedNoSq: string[] = [];

      if (noSqInSj.length > 0) {
        const { data: existingSq, error: sqCheckErr } = await supabase
          .from('monitoring_sq')
          .select('no_sq')
          .in('no_sq', noSqInSj);

        if (sqCheckErr) throw sqCheckErr;

        const existingSqSet = new Set(existingSq?.map(sq => sq.no_sq));
        validPayload = payload.filter(row => existingSqSet.has(row.no_sq));
        skippedNoSq = noSqInSj.filter(noSq => !existingSqSet.has(noSq));
      }

      if (validPayload.length === 0) {
        return NextResponse.json({ success: true, count: 0, skippedSq: skippedNoSq });
      }

      const noSjInChunk = [...new Set(validPayload.map(r => r.no_sj).filter(Boolean))];
      if (noSjInChunk.length > 0) {
        const { error: deleteErr } = await supabase.from('monitoring_sj').delete().in('no_sj', noSjInChunk);
        if (deleteErr) throw deleteErr;
      }

      const { data, error: insertErr } = await supabase.from('monitoring_sj').insert(validPayload).select('key_sj');
      if (insertErr) throw insertErr;

      return NextResponse.json({ success: true, count: data?.length ?? validPayload.length, skippedSq: skippedNoSq });
    }

    // 📦 4. LOGIKA VALIDASI CHECK RINGAN (Hanya Untuk Stock & Aging)
    if (isCheckOnly) {
      if (key === 'fact_stock') {
        const dates = [...new Set(payload.map(r => r.date_stock).filter(Boolean))];
        if (!dates.length) return NextResponse.json({ error: 'Tidak ada tanggal valid' }, { status: 400 });

        const { data: dbRows, error: checkErr } = await supabase.from('fact_stock').select('date_stock, branch_code').in('date_stock', dates);
        if (checkErr) throw checkErr;

        const csvPairs = new Set(payload.map(r => `${r.branch_code}|${r.date_stock}`));
        const conflicts = dbRows?.filter(row => csvPairs.has(`${row.branch_code}|${row.date_stock}`)) || [];
        const conflictDates = [...new Set(conflicts.map(r => r.date_stock))];

        if (conflictDates.length > 0) {
          return NextResponse.json({ requiresConfirmation: true, existingDates: conflictDates, message: `Data Stock sudah ada. Hapus & ganti?` }, { status: 409 });
        }
      }

      if (key === 'fact_stock_aging') {
        const dates = [...new Set(payload.map(r => r.date_age).filter(Boolean))];
        if (!dates.length) return NextResponse.json({ error: 'Tidak ada tanggal valid' }, { status: 400 });

        const { data } = await supabase.from('fact_stock_aging').select('date_age, branch_code').in('date_age', dates);
        const csvPairs = new Set(payload.map(r => `${r.branch_code}_${r.date_age}`));
        const foundMatches = data?.filter((r: any) => csvPairs.has(`${r.branch_code}_${r.date_age}`)) || [];
        const foundDates = [...new Set(foundMatches.map((r: any) => r.date_age))];
        
        if (foundDates.length > 0) {
          return NextResponse.json({ requiresConfirmation: true, existingDates: foundDates, message: `Data Stock Aging sudah ada. Hapus & ganti?` }, { status: 409 });
        }
      }
      return NextResponse.json({ success: true });
    }

    // 📦 5. EKSEKUSI DATA NYATA UNTUK TABEL BERBASIS TANGGAL
    if (key === 'fact_stock') {
      if (force && isFirstChunk) {
        const dates = [...new Set(payload.map(r => r.date_stock).filter(Boolean))];
        await supabase.from('fact_stock').delete().in('date_stock', dates);
      }
      const { data, error } = await supabase.from('fact_stock').insert(payload).select('product_code');
      if (error) throw error;
      return NextResponse.json({ success: true, count: data?.length ?? payload.length });
    }

    if (key === 'fact_stock_aging') {
      if (force && isFirstChunk) {
        const dates = [...new Set(payload.map(r => r.date_age).filter(Boolean))];
        await supabase.from('fact_stock_aging').delete().in('date_age', dates);
      }
      const { data, error } = await supabase.from('fact_stock_aging').insert(payload).select('product_code');
      if (error) throw error;
      return NextResponse.json({ success: true, count: data?.length ?? payload.length });
    }

    // 🔄 LOGIKA DEFAULT (UPSERT CHUNK: Master Product, Credit Limit Customer, Sales FOS)
    const { data, error } = await supabase.from(config.name).upsert(payload, { onConflict: config.conflict! }).select('created_at');
    if (error) throw error;
    return NextResponse.json({ success: true, count: data?.length ?? payload.length });
    
  } catch (err: any) {
    console.error('❌ [API Error Chunk]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}