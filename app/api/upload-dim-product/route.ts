import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { payload, fileName } = await req.json();

    if (!payload?.length) {
      return NextResponse.json({ error: 'Data kosong' }, { status: 400 });
    }

    // Validasi: product_code wajib
    const validRows = payload.filter(row => row.product_code && row.product_code.trim() !== '');
    if (validRows.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data dengan product_code yang valid' }, { status: 400 });
    }

    // Tambahkan key_product
    const finalPayload = validRows.map((row: any) => ({
      ...row,
      key_product: row.key_product || row.product_code,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('dim_product')
      .upsert(finalPayload, { onConflict: 'product_code' })
      .select();

    if (error) throw error;

    // Catat log (opsional)
    await supabase.from('upload_logs').insert({
      module: 'MASTER_PRODUCT',
      file_name: fileName || 'upload_csv',
      rows_count: data?.length || finalPayload.length,
      status: 'success',
    });

    return NextResponse.json({
      success: true,
      count: data?.length || finalPayload.length,
    });
  } catch (err: any) {
    console.error('❌ Upload Master Product Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}