'use client';
import { useState, useRef, ChangeEvent } from 'react';
import Papa from 'papaparse';

type TableKey = 'sj' | 'sq' | 'so';

const TABLE_CONFIG = {
  sj: {
    label: 'Monitoring SJ',
    endpoint: '/api/upload/sj',
    headers: 'key_sj, key_sq, date_sj, no_sj, date_sq, no_sq, date_so, no_so, status_sj, product_code, qty_sj',
    conflict: 'key_sj',
  },
  sq: {
    label: 'Monitoring SQ',
    endpoint: '/api/upload/sq',
    headers: 'key, branch_code, date_sq, no_sq, customer_name, product_code, status_sq, qty_sq, price',
    conflict: 'key',
  },
  so: {
    label: 'Monitoring SO',
    endpoint: '/api/upload/so',
    headers: 'key_so, key_sq, branch_code, no_so, no_sq, date_so, product_code, status_so, qty_so',
    conflict: 'key_so',
  },
} as const;

export default function UploadDashboard() {
  const [activeTable, setActiveTable] = useState<TableKey>('sj');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: 'info' | 'success' | 'error' }>({
    text: 'Pilih target tabel, lalu upload file CSV.',
    type: 'info',
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const config = TABLE_CONFIG[activeTable];

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setStatus({ text: '⚠️ File harus berformat .csv', type: 'error' });
      setFile(null);
      return;
    }
    setFile(f);
    setStatus({ text: `📄 File siap: ${f.name}`, type: 'info' });
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus({ text: '⚠️ Pilih file CSV terlebih dahulu', type: 'error' });
      return;
    }
    setLoading(true);
    setStatus({ text: '⏳ Membaca & mengirim data...', type: 'info' });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: async (results) => {
        const data = results.data;
        if (!data?.length) {
          setStatus({ text: '❌ CSV kosong atau tidak valid', type: 'error' });
          setLoading(false);
          return;
        }

        try {
          const res = await fetch(config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: data }),
          });
          const json = await res.json();

          if (res.ok && json.success) {
            setStatus({ text: `✅ Berhasil! ${json.count} baris di-upsert ke ${config.label}`, type: 'success' });
            setFile(null);
            if (fileRef.current) fileRef.current.value = '';
          } else {
            setStatus({ text: `❌ Gagal: ${json.error || 'Server error'}`, type: 'error' });
          }
        } catch (err: any) {
          setStatus({ text: `❌ Koneksi gagal: ${err.message}`, type: 'error' });
        } finally {
          setLoading(false);
        }
      },
      error: (err) => {
        setStatus({ text: `❌ Gagal parse CSV: ${err.message}`, type: 'error' });
        setLoading(false);
      },
    });
  };

  const reset = () => {
    setFile(null);
    setStatus({ text: 'Pilih target tabel, lalu upload file CSV.', type: 'info' });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-6 md:p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">📤 Database Upsert Dashboard</h1>
        
        {/* Tab Selector */}
        <div className="flex flex-wrap gap-3 mb-6 justify-center">
          {(Object.keys(TABLE_CONFIG) as TableKey[]).map((key) => (
            <button
              key={key}
              onClick={() => { setActiveTable(key); reset(); }}
              className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
                activeTable === key ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {TABLE_CONFIG[key].label}
            </button>
          ))}
        </div>

        {/* Upload Area */}
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50">
          <p className="text-sm text-gray-500 mb-3">
            Target: <span className="font-semibold text-blue-600">{config.label}</span> | 
            Conflict Key: <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">{config.conflict}</code>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              ref={fileRef}
              disabled={loading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <button
              onClick={handleUpload}
              disabled={loading || !file}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? '⏳ Memproses...' : '🚀 Upload'}
            </button>
          </div>
        </div>

        {/* Status Box */}
        {status.text && (
          <div className={`mt-5 p-4 rounded-lg text-sm font-medium border ${
            status.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
            status.type === 'error'   ? 'bg-red-50 text-red-700 border-red-200' :
            'bg-blue-50 text-blue-700 border-blue-200'
          }`}>
            {status.text}
          </div>
        )}

        {/* CSV Guide */}
        <details className="mt-6 bg-gray-50 border border-gray-200 rounded-lg">
          <summary className="p-4 cursor-pointer font-medium text-gray-700 select-none">📋 Panduan Header CSV</summary>
          <div className="px-4 pb-4">
            <code className="block bg-gray-900 text-gray-100 p-3 rounded-md text-xs overflow-x-auto mb-3">
              {config.headers}
            </code>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
              <li>Header harus <strong>persis</strong> (case-sensitive).</li>
              <li>Kolom <code className="bg-gray-200 px-1 rounded text-xs">{config.conflict}</code> wajib <strong>UNIQUE / PRIMARY KEY</strong> di Supabase.</li>
              <li>Baris kosong di-skip otomatis.</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  );
}