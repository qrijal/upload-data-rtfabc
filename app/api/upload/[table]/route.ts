import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TABLE_MAP = {
  sj: { table: 'monitoring_sj', conflict: 'key_sj' },
  sq: { table: 'monitoring_sq', conflict: 'key' },
  so: { table: 'monitoring_so', conflict: 'key_so' },
} as const;

export async function POST(
  req: Request, 
  { params }: { params: Promise<{ table: string }> } // ✅ params adalah Promise
) {
  try {
    const { table } = await params; // ✅ Unwrap params dulu!
    const key = table.toLowerCase() as keyof typeof TABLE_MAP;
    
    const config = TABLE_MAP[key];
    if (!config) {
      return NextResponse.json({ success: false, error: 'Tabel tidak valid' }, { status: 400 });
    }

    const { payload } = await req.json();
    if (!payload?.length) {
      return NextResponse.json({ success: false, error: 'Data kosong' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(config.table)
      .upsert(payload, { onConflict: config.conflict, ignoreDuplicates: false })
      .select();

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      count: data?.length ?? payload.length, 
      message: 'Upsert berhasil' 
    });
  } catch (err: any) {
    console.error('[Upsert Error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}