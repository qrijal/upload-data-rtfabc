import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: ambil daftar produk dengan pagination & search
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const search = url.searchParams.get('search') || '';

    const offset = (page - 1) * limit;

    let query = supabase.from('dim_product').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`product_code.ilike.%${search}%,product_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('product_code', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      data,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: create atau update produk (upsert berdasarkan product_code)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    // body bisa array atau objek tunggal
    const payload = Array.isArray(body) ? body : [body];

    // Validasi minimal: product_code wajib
    for (const item of payload) {
      if (!item.product_code) {
        return NextResponse.json({ error: 'product_code wajib diisi' }, { status: 400 });
      }
    }

    // Tambahkan key_product jika belum ada
    const finalPayload = payload.map((row) => {
      if (!row.key_product && row.product_code) {
        // key_product format: KODE-PRODUK (misal ABC-BRG001) tapi kita tidak punya area_code, jadi kita buat dari product_code saja
        // Atau bisa diisi dengan product_code itu sendiri
        row.key_product = row.product_code;
      }
      return row;
    });

    const { data, error } = await supabase
      .from('dim_product')
      .upsert(finalPayload, { onConflict: 'product_code' })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}