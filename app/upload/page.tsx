'use client';
import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';

type TableKey =
  'sj' | 'sq' | 'so' | 'dim_product' | 'fact_stock' |
  'fact_stock_aging' | 'fact_po_sales_fos_weekly' | 'fact_po_sales_fos_monthly' | 'credit_limit';

const TABLES: Record<TableKey, { label: string; headers: string; conflict?: string; needsCheck?: boolean }> = {
  sq: { label: 'Monitoring SQ', headers: 'key, branch_code, date_sq, no_sq, customer_name, product_code, status_sq, qty_sq, price', conflict: 'key' },
  so: { label: 'Monitoring SO', headers: 'key_so, key_sq, branch_code, no_so, no_sq, date_so, product_code, status_so, qty_so', conflict: 'key_so' },
  sj: { label: 'Monitoring SJ', headers: 'key_sj, key_sq, date_sj, no_sj, date_sq, no_sq, date_so, no_so, status_sj, product_code, qty_sj', conflict: 'key_sj' },
  dim_product: { label: 'Master Product', headers: 'product_code,product_name,accessories_category,uom,brand,product_category,product_non_active,product_principle,product_for_factory,finish_good,qty_convert,uom_2,size_product,sub_category,sub_category_2,color_product,key_product', conflict: 'key_product' },
  credit_limit: { label: 'Credit Limit Customer', headers: 'id_cust, customer_name, credit_limit, credit_used, credit_available, sales_name, area_code, payment_type', conflict: 'id_cust' },
  fact_stock: { label: 'Stock', headers: 'date_stock, branch_code, product_code, qty_stock', needsCheck: true },
  fact_stock_aging: { label: 'Stock Aging', headers: 'product_code, product_age, branch_code, date_age, aging, value, qty_convert', needsCheck: true },
  fact_po_sales_fos_weekly: { label: 'Sales FOS Weekly', headers: 'sales_name, value_target_week, value_achieve_week, week, month', conflict: 'sales_name, week, month' },
  fact_po_sales_fos_monthly: { label: 'Sales FOS Monthly', headers: 'sales_name, value_target_month, value_achieve_month, month', conflict: 'sales_name, month' }
};

// 🛠️ Fungsi memotong data berdasarkan Nomor Dokumen (Maksimal 100 Dokumen unik per chunk)
const sliceIntoDocChunks = (arr: any[], docColumn: string, maxDocsPerChunk: number): any[][] => {
  const docGroups: Record<string, any[]> = {};
  arr.forEach(row => {
    const docKey = row[docColumn] || 'TANPA_DOKUMEN';
    if (!docGroups[docKey]) docGroups[docKey] = [];
    docGroups[docKey].push(row);
  });

  const chunks: any[][] = [];
  let currentChunk: any[] = [];
  let docCountInCurrentChunk = 0;

  Object.keys(docGroups).forEach(docKey => {
    currentChunk.push(...docGroups[docKey]);
    docCountInCurrentChunk++;

    if (docCountInCurrentChunk >= maxDocsPerChunk) {
      chunks.push(currentChunk);
      currentChunk = [];
      docCountInCurrentChunk = 0;
    }
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

// 🛠️ Fungsi memotong data berdasarkan jumlah baris biasa (untuk tabel Master & Fact)
const sliceIntoRowChunks = <T,>(arr: T[], chunkSize: number): T[][] => {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    res.push(arr.slice(i, i + chunkSize));
  }
  return res;
};

export default function UploadPage() {
  const [activeTable, setActiveTable] = useState<TableKey>('sj');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: 'info' | 'success' | 'error' }>({
    text: 'Pilih tabel target, lalu upload file CSV.',
    type: 'info'
  });
  const [confirmData, setConfirmData] = useState<{ show: boolean; dates: string[]; payload: any[] }>({ show: false, dates: [], payload: [] });
  const [skippedSqList, setSkippedSqList] = useState<string[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);
  const config = TABLES[activeTable];

  useEffect(() => { setIsClient(true); }, []);

  const resetAllStates = (initialMessage = 'Pilih tabel target, lalu upload CSV.') => {
    setFile(null);
    setConfirmData({ show: false, dates: [], payload: [] });
    setSkippedSqList([]);
    setStatus({ text: initialMessage, type: 'info' });
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setStatus({ text: '⚠️ File harus berformat .csv', type: 'error' });
      setFile(null);
      return;
    }
    setFile(f);
    setSkippedSqList([]);
    setStatus({ text: `📄 ${f.name} siap diupload`, type: 'info' });
  };

  const doUpload = async (data: any[], force = false) => {
    setLoading(true);
    setStatus({ text: force ? '⏳ Menghapus & mengupload data baru...' : '⏳ Memeriksa duplikasi...', type: 'info' });
    setSkippedSqList([]);

    try {
      // 📦 STEP 1: Jalankan validasi awal (hanya untuk Stock & Aging)
      if (!force && config.needsCheck && !['so', 'sq', 'sj'].includes(activeTable)) {
        const resCheck = await fetch(`/api/upload/${activeTable}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: data.slice(0, 500), force: false, isCheckOnly: true }),
        });
        const jsonCheck = await resCheck.json();

        if (resCheck.status === 409 && jsonCheck.requiresConfirmation) {
          setConfirmData({ show: true, dates: jsonCheck.existingDates, payload: data });
          setStatus({ text: jsonCheck.message, type: 'error' });
          setLoading(false);
          return;
        }
      }

      // 📦 STEP 2: Pembagian Chunk Berbasis Nomor Dokumen / Baris
      let chunks: any[][] = [];
      if (activeTable === 'so') {
        chunks = sliceIntoDocChunks(data, 'no_so', 100);
      } else if (activeTable === 'sq') {
        chunks = sliceIntoDocChunks(data, 'no_sq', 100);
      } else if (activeTable === 'sj') {
        chunks = sliceIntoDocChunks(data, 'no_sj', 100);
      } else {
        chunks = sliceIntoRowChunks(data, 1000); // Termasuk credit_limit_customer
      }

      let totalProcessed = 0;
      let isFirstChunk = true;
      let allSkippedSq: string[] = [];

      // 📦 STEP 3: Pengiriman Berkelompok (Looping)
      for (let i = 0; i < chunks.length; i++) {
        setStatus({
          text: ['so', 'sq', 'sj'].includes(activeTable)
            ? `⏳ Mengirim kelompok dokumen ${activeTable.toUpperCase()} bagian ${i + 1} dari ${chunks.length}...`
            : `⏳ Mengirim data bagian ${i + 1} dari ${chunks.length} (${totalProcessed} baris selesai)...`,
          type: 'info'
        });

        const res = await fetch(`/api/upload/${activeTable}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: chunks[i],
            force: force,
            isFirstChunk: isFirstChunk
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Server gagal memproses potongan data.');

        totalProcessed += json.count;

        if (json.skippedSq && json.skippedSq.length > 0) {
          allSkippedSq.push(...json.skippedSq);
        }

        isFirstChunk = false;
      }

      const uniqueSkipped = [...new Set(allSkippedSq)];
      setSkippedSqList(uniqueSkipped);

      // 🎉 BERHASIL TOTAL
      setStatus({
        text: `✅ File "${file?.name}" (${totalProcessed} baris) selesai diproses di ${config.label}.` +
          (uniqueSkipped.length > 0 ? ` Namun ada beberapa baris data yang dilewati.` : ''),
        type: uniqueSkipped.length > 0 ? 'info' : 'success'
      });

      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setConfirmData({ show: false, dates: [], payload: [] });

    } catch (err: any) {
      setStatus({ text: `❌ Gagal upload: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = () => {
    if (!file) { setStatus({ text: '⚠️ Pilih file CSV dulu', type: 'error' }); return; }

    setLoading(true);
    setStatus({ text: 'Membaca & menormalisasi CSV...', type: 'info' });

    Papa.parse(file, {
      header: true, skipEmptyLines: true, dynamicTyping: true,
      complete: (results) => {
        const rawData = results.data as any[];
        if (!rawData?.length) { setStatus({ text: '❌ CSV kosong', type: 'error' }); setLoading(false); return; }

        const normalizedData = rawData.map(row => {
          const newRow = { ...row };

          // Menangani jika di file CSV ditulis dengan tanda hubung 'id-cust'
          if ('id-cust' in newRow) {
            newRow.id_cust = newRow['id-cust'];
            delete newRow['id-cust'];
          }

          // 🔥 TAMBAHKAN BARIS INI untuk membuang credit_available dari data yang dikirim
          if ('credit_available' in newRow) {
            delete newRow.credit_available;
          }

          if (activeTable === 'fact_stock' && newRow.date_stock) {
            const d = new Date(newRow.date_stock);
            if (!isNaN(d.getTime())) newRow.date_stock = d.toLocaleDateString('en-CA');
          }
          if (activeTable === 'fact_stock_aging' && newRow.date_age) {
            const d = new Date(newRow.date_age);
            if (!isNaN(d.getTime())) newRow.date_age = d.toLocaleDateString('en-CA');
          }
          return newRow;
        });

        if (['so', 'sq', 'sj'].includes(activeTable)) {
          doUpload(normalizedData, true);
        } else {
          doUpload(normalizedData, false);
        }
      },
      error: (err) => { setStatus({ text: `❌ Gagal parse: ${err.message}`, type: 'error' }); setLoading(false); },
    });
  };

  if (!isClient) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4" suppressHydrationWarning>
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-6 md:p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Upload Data</h1>

        {/* Tab Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
          {(Object.keys(TABLES) as TableKey[]).map((key) => (
            <button key={key} onClick={() => { setActiveTable(key); resetAllStates(); }}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition ${activeTable === key ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {TABLES[key].label}
            </button>
          ))}
        </div>

        {/* Upload Area */}
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 mb-4">
          <p className="text-sm text-gray-500 mb-3">Target: <span className="font-semibold text-blue-600">{config.label}</span> | {['so', 'sq', 'sj'].includes(activeTable) ? 'Ganti Otomatis Data Lama Per Nomor Dokumen' : config.conflict ? `Unique/Upsert: ${config.conflict}` : 'Tanpa Unique Constraint'}</p>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <input type="file" accept=".csv" onChange={handleFileChange} ref={fileRef} disabled={loading} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
            <button onClick={handleUpload} disabled={loading || !file} className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
              {loading ? 'Memproses...' : 'Upload'}
            </button>
          </div>
        </div>

        {/* Status Box */}
        {status.text && (
          <div className={`p-4 rounded-lg text-sm font-medium border mb-4 ${status.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : status.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
            {status.text}
          </div>
        )}

        {/* List No SQ yang dilewati */}
        {skippedSqList.length > 0 && (
          <div className="p-4 rounded-lg text-sm border bg-amber-50 text-amber-900 border-amber-200 mb-4">
            <p className="font-semibold mb-2">⚠️ {skippedSqList.length} Nomor SQ berikut dilewati karena tidak terdaftar di Monitoring SQ:</p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white rounded border border-amber-100">
              {skippedSqList.map((sq) => (
                <span key={sq} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono font-medium">
                  {sq}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CSV Guide */}
        <details className="bg-gray-50 border border-gray-200 rounded-lg">
          <summary className="p-4 cursor-pointer font-medium text-gray-700 select-none">Panduan Header CSV</summary>
          <div className="px-4 pb-4">
            <code className="block bg-gray-900 text-gray-100 p-3 rounded-md text-xs overflow-x-auto mb-3">{config.headers}</code>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
              {activeTable === 'credit_limit' && <li className="text-emerald-700">💡 Data Limit Kredit akan di-update otomatis jika <code>id_cust</code> sudah terdaftar sebelumnya (Sistem Upsert).</li>}
              {['so', 'sq', 'sj'].includes(activeTable) && <li className="text-blue-700">ℹ️ Setiap nomor dokumen yang diupload akan otomatis membersihkan data item lamanya di DB sebelum item baru dimasukkan.</li>}
              <li>Header harus <strong>persis</strong> (case-sensitive). Gunakan tanda koma (<code>,</code>) sebagai pemisah kolom.</li>
            </ul>
          </div>
        </details>
      </div>

      {/* Modal Konfirmasi */}
      {confirmData.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">⚠️ Konfirmasi Replace Data</h3>
            <p className="text-sm text-gray-600 mb-4">Data untuk tanggal berikut sudah ada di database. Hapus dulu lalu upload data baru?</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {confirmData.dates.map((d) => (
                <span key={d} className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">{d}</span>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmData({ show: false, dates: [], payload: [] })} disabled={loading} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition disabled:opacity-50">Batal</button>
              <button onClick={() => doUpload(confirmData.payload, true)} disabled={loading} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition disabled:opacity-50">
                {loading ? 'Proses...' : 'Ya, Hapus & Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}