// app/api/download-products/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Workbook from "exceljs"; // Import exceljs

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const maxDuration = 300;

export async function GET() {
  try {
    console.log("[Download Products]: Memulai penarikan ALL data untuk format Excel...");

    let allData: any[] = [];
    let from = 0;
    let to = 999;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("dim_product")
        .select("*")
        .range(from, to);

      if (error) throw new Error(error.message);

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
          to += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    if (allData.length === 0) {
      return NextResponse.json({ success: false, message: "Tabel dim_product kosong" }, { status: 404 });
    }

    // --- PROSES PEMBUATAN FILE EXCEL (.XLSX) ---

    // 1. Inisialisasi Workbook dan Worksheet
    const workbook = new Workbook.Workbook();
    const worksheet = workbook.addWorksheet("Products");

    // 2. Ambil key dari objek data sebagai Header kolom Excel
    const headers = Object.keys(allData[0]);

    // Format kolom untuk ExcelJS (menentukan nama header dan key datanya)
    worksheet.columns = headers.map(header => ({
      header: header,
      key: header,
    }));

    // 3. Masukkan data baris demi baris (ExcelJS otomatis menangani format tipe data)
    for (const row of allData) {
      const formattedRow: any = {};
      for (const header of headers) {
        const val = row[header];

        if (typeof val === "string") {
          // PERBAIKAN: Menghapus garis miring pemisah yang salah
          formattedRow[header] = val.replace(/\r\n/g, '\n');
        } else {
          formattedRow[header] = val !== null && val !== undefined ? val : "";
        }
      }
      worksheet.addRow(formattedRow);
    }

    // Optional: Membuat header menjadi BOLD agar terlihat rapi
    worksheet.getRow(1).font = { bold: true };

    // 4. Generate buffer Excel ke dalam memori
    const buffer = await workbook.xlsx.writeBuffer();

    // 5. Mengembalikan response dengan Content-Type khusus Excel (.xlsx)
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=dim_product_ALL_${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });

  } catch (error: any) {
    console.error("[Download Products] Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}