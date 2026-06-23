'use client';
import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
    FaFileExcel,
    FaUpload,
    FaSpinner,
    FaCheckCircle,
    FaExclamationTriangle,
    FaSearch,
    FaTimes,
} from 'react-icons/fa';

// Helper parse date (sama dengan backend)
const parseExcelDate = (excelSerial: any): string => {
    if (!excelSerial) return '';
    if (isNaN(Number(excelSerial))) {
        const d = new Date(excelSerial);
        return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
    }
    const dateOffset = Number(excelSerial) - 25569;
    return new Date(dateOffset * 86400 * 1000).toISOString().split('T')[0];
};

type ModuleType = 'sq' | 'so' | 'sj' | 'stock';

export default function UploadModule({ type, title }: { type: ModuleType; title: string }) {
    // State umum
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [step, setStep] = useState<'idle' | 'extracting' | 'uploading' | 'done' | 'error'>('idle');
    const [status, setStatus] = useState<{ text: string; type: 'info' | 'success' | 'error' }>({
        text: `Upload file Excel ${title}`,
        type: 'info',
    });
    const [summary, setSummary] = useState<{
        fileName: string;
        totalItems: number;
        rowsInserted: number;
        dateMin: string;
        dateMax: string;
        hasSkuError?: boolean;
    } | null>(null);

    // State untuk mode update (hanya untuk SQ/SO/SJ)
    const [updateMode, setUpdateMode] = useState<'partial' | 'full'>('partial');
    const [selectedSq, setSelectedSq] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const fileRef = useRef<HTMLInputElement>(null);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const isDocumentType = ['sq', 'so', 'sj'].includes(type);

    // Handler file change
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const ext = f.name.toLowerCase().split('.').pop();
        if (!['xlsx', 'xls', 'xlsm'].includes(ext || '')) {
            setStatus({ text: '⚠️ File harus berformat Excel (.xlsx, .xls, .xlsm)', type: 'error' });
            setFile(null);
            return;
        }
        setFile(f);
        setStatus({ text: `📄 ${f.name} siap diproses`, type: 'info' });
        setSummary(null);
        setProgress(0);
        setStep('idle');
        setSelectedSq([]);
    };

    // Upload handler
    const handleUpload = () => {
        if (!file) {
            setStatus({ text: '⚠️ Pilih file Excel dulu', type: 'error' });
            return;
        }

        setLoading(true);
        setProgress(0);
        setStep('extracting');
        setStatus({ text: '📤 Membaca dan mengekstrak data dari Excel...', type: 'info' });

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                let dateStock = '';
                if (type === 'stock') {
                    const tanggalMeta = rawRows[2]?.[1] || ''; // B3
                    dateStock = parseExcelDate(tanggalMeta); // pakai helper yang sudah ada
                }
                if (!rawRows || rawRows.length < 6) {
                    throw new Error('Format tidak sesuai (kurang dari 6 baris).');
                }

                const namaGudang = rawRows[0]?.[1] || '';
                const titleFile = rawRows[1]?.[1] || '';

                // Validasi judul berdasarkan type
                let expectedTitle = '';
                if (type === 'sq') expectedTitle = 'Rincian Penawaran Penjualan';
                else if (type === 'so') expectedTitle = 'Rincian Pesanan Penjualan';
                else if (type === 'sj') expectedTitle = 'Rincian Pengiriman Pesanan';
                else if (type === 'stock') expectedTitle = 'Kuantitas Barang per Gudang';

                if (String(titleFile).trim() !== expectedTitle) {
                    throw new Error(`Berkas bukan ${expectedTitle} yang valid.`);
                }

                const dataRows = rawRows.slice(5);
                let mappedPayload: any[] = [];

                // Mapping berdasarkan type
                if (type === 'sq') {
                    mappedPayload = dataRows
                        .map((row) => ({
                            date_sq: row[3],
                            no_sq: row[1],
                            customer_name: row[5],
                            product_code: row[9],
                            status_sq: row[21],
                            qty_sq: row[13],
                            price: row[17],
                            branch_name: row[19],
                            product_name: row[11],
                            category_name: row[27],
                        }))
                        .filter((r) => r.no_sq && String(r.no_sq).trim() !== '');
                } else if (type === 'so') {
                    mappedPayload = dataRows
                        .map((row) => ({
                            date_so: row[3],
                            no_so: row[5],
                            no_sq: row[1],
                            product_code: row[7],
                            status_so: row[17],
                            qty_so: row[11],
                            area_name: row[19],
                        }))
                        .filter((r) => r.no_so && String(r.no_so).trim() !== '');
                } else if (type === 'sj') {
                    mappedPayload = dataRows
                        .map((row) => ({
                            branch_name: row[1],
                            area_name: row[21],
                            date_sj: row[3],
                            no_sj: row[5],
                            date_sq: row[35],
                            no_sq: row[37],
                            date_so: row[31],
                            no_so: row[33],
                            status_sj: row[39],
                            product_code: row[11],
                            qty_sj: row[17],
                        }))
                        .filter((r) => r.no_sj && String(r.no_sj).trim() !== '');
                } else if (type === 'stock') {
                    mappedPayload = dataRows
                        .map((row) => ({
                            date_stock: dateStock,  // satu tanggal untuk semua baris
                            branch_name: row[1],
                            product_code: row[7],
                            qty_stock: row[11],
                        }))
                        .filter((r) => r.product_code && String(r.product_code).trim() !== '');
                }

                if (mappedPayload.length === 0) {
                    throw new Error('Tidak ada data valid di file.');
                }

                setProgress(30);
                setStep('uploading');
                setStatus({ text: '⏳ Mengirim data ke server dan memproses...', type: 'info' });

                // Statistik (hanya untuk dokumen yang punya no_xxx)
                let totalUnique = 0;
                let dateField = '';
                if (type === 'sq') {
                    const uniqueSet = new Set(mappedPayload.map((r) => String(r.no_sq).trim()));
                    totalUnique = uniqueSet.size;
                    dateField = 'date_sq';
                } else if (type === 'so') {
                    const uniqueSet = new Set(mappedPayload.map((r) => String(r.no_so).trim()));
                    totalUnique = uniqueSet.size;
                    dateField = 'date_so';
                } else if (type === 'sj') {
                    const uniqueSet = new Set(mappedPayload.map((r) => String(r.no_sj).trim()));
                    totalUnique = uniqueSet.size;
                    dateField = 'date_sj';
                } else if (type === 'stock') {
                    totalUnique = mappedPayload.length; // untuk stock, total baris
                    dateField = 'date_stock';
                }

                // Range tanggal
                const dateStrings = mappedPayload
                    .map((r) => parseExcelDate(r[dateField]))
                    .filter((d) => d.length > 0);
                let dateMin = '',
                    dateMax = '';
                if (dateStrings.length > 0) {
                    const sorted = dateStrings.slice().sort();
                    dateMin = sorted[0];
                    dateMax = sorted[sorted.length - 1];
                }

                // Jika mode partial dan tipe dokumen, siapkan modal pilihan SQ
                if (updateMode === 'partial' && isDocumentType) {
                    const allSq = [...new Set(mappedPayload.map((r) => String(r[`no_${type}`] || '').trim()))];
                    setSelectedSq(allSq); // default semua terpilih
                    // Tampilkan modal
                    setStatus({
                        text: `📋 Pilih ${type.toUpperCase()} yang akan diupdate (${allSq.length} tersedia)`,
                        type: 'info',
                    });
                    // TODO: Buka modal untuk memilih SQ
                    // Untuk contoh, langsung lanjut dengan semua terpilih
                }

                // Kirim ke endpoint yang sesuai
                const endpoint = `/api/upload-${type}`;
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Warehouse-Name': namaGudang,
                    },
                    body: JSON.stringify({
                        payload: mappedPayload,
                        fileName: file.name,
                        updateMode: isDocumentType ? updateMode : undefined,
                        selectedSq: isDocumentType ? selectedSq : undefined,
                    }),
                });

                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Server gagal memproses data.');

                setProgress(80);

                // Unduh CSV jika ada error SKU
                if (json.skuErrorCsv) {
                    const blob = new Blob([json.skuErrorCsv], { type: 'text/csv;charset=utf-8-sig;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${file.name.split('.')[0]}_sku_not_available.csv`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }

                setProgress(100);
                setStep('done');
                setLoading(false);

                setSummary({
                    fileName: file.name,
                    totalItems: totalUnique,
                    rowsInserted: json.count || mappedPayload.length,
                    dateMin,
                    dateMax,
                    hasSkuError: json.hasSkuError || false,
                });

                setStatus({
                    text: `Done` +
                        (json.hasSkuError ? ' (beberapa SKU tidak terdaftar, cek file log)' : ''),
                    type: json.hasSkuError ? 'info' : 'success',
                });

                setFile(null);
                if (fileRef.current) fileRef.current.value = '';
            } catch (err: any) {
                setProgress(0);
                setStep('error');
                setLoading(false);
                setStatus({ text: `❌ Gagal: ${err.message}`, type: 'error' });
            }
        };

        reader.readAsArrayBuffer(file);
    };

    if (!isClient) return <div className="min-h-screen flex items-center justify-center">Loading Engine...</div>;

    // Render mode update hanya untuk SQ/SO/SJ
    const renderUpdateMode = () => {
        if (!isDocumentType) return null;
        return (
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Mode Update</label>
                <div className="flex gap-6">
                    <label className="inline-flex items-center">
                        <input
                            type="radio"
                            value="partial"
                            checked={updateMode === 'partial'}
                            onChange={() => setUpdateMode('partial')}
                            className="form-radio"
                        />
                        <span className="ml-2 text-sm">Partial (pilih {type.toUpperCase()} yang diupdate)</span>
                    </label>
                    <label className="inline-flex items-center">
                        <input
                            type="radio"
                            value="full"
                            checked={updateMode === 'full'}
                            onChange={() => setUpdateMode('full')}
                            className="form-radio"
                        />
                        <span className="ml-2 text-sm">Full (hapus semua {type.toUpperCase()}, ganti semua)</span>
                    </label>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <h1 className="text-xl font-bold text-gray-800 mb-1 text-center flex items-center justify-center gap-2">
                <FaFileExcel className="text-green-600" /> Upload {title}
            </h1>
            <p className="text-xs text-gray-500 text-center mb-6">
                Modul Otomatis Pembersihan & Overwrite {type.toUpperCase()}
            </p>

            {renderUpdateMode()}

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50 text-center mb-4 transition hover:border-blue-400">
                <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm"
                    onChange={handleFileChange}
                    ref={fileRef}
                    disabled={loading}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer mb-4"
                />
                <button
                    onClick={handleUpload}
                    disabled={loading || !file}
                    className="w-full px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition shadow-sm flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <FaSpinner className="animate-spin" /> Memproses...
                        </>
                    ) : (
                        <>
                            <FaUpload /> Proses Excel Langsung
                        </>
                    )}
                </button>
            </div>

            {loading && (
                <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>{step === 'extracting' ? 'Membaca Excel' : 'Upload ke Database'}</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-center">
                        {step === 'extracting' && 'Mengekstrak data dari file...'}
                        {step === 'uploading' && 'Mengirim & memproses data... (mungkin memakan waktu)'}
                    </p>
                </div>
            )}

            {status.text && (
                <div
                    className={`p-4 rounded-lg text-sm font-medium border text-center ${status.type === 'success'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : status.type === 'error'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                >
                    {status.type === 'success' && <FaCheckCircle className="inline mr-1" />}
                    {status.type === 'error' && <FaExclamationTriangle className="inline mr-1" />}
                    {status.text}
                </div>
            )}

            {summary && step === 'done' && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-[12px]">
                    <h3 className="font-semibold text-gray-700 mb-2">📊 Ringkasan Upload</h3>
                    <table className="w-full text-gray-600">
                        <tbody>
                            <tr>
                                <td className="py-1 font-medium align-top">Nama File</td>
                                <td className="py-1 pl-4 align-top">: {summary.fileName}</td>
                            </tr>
                            {isDocumentType && (
                                <tr>
                                    <td className="py-1 font-medium align-top">Jumlah {type.toUpperCase()}</td>
                                    <td className="py-1 pl-4 align-top">: {summary.totalItems}</td>
                                </tr>
                            )}
                            <tr>
                                <td className="py-1 font-medium align-top">Jumlah Baris</td>
                                <td className="py-1 pl-4 align-top">: {summary.rowsInserted}</td>
                            </tr>
                            <tr>
                                <td className="py-1 font-medium align-top">Tanggal</td>
                                <td className="py-1 pl-4 align-top">
                                    : {summary.dateMin && summary.dateMax ? `${summary.dateMin} s/d ${summary.dateMax}` : 'Tidak tersedia'}
                                </td>
                            </tr>
                            {summary.hasSkuError && (
                                <tr>
                                    <td className="py-1 font-medium align-top text-amber-600">⚠️ Catatan</td>
                                    <td className="py-1 pl-4 align-top text-amber-600">
                                        : Beberapa SKU tidak terdaftar, cek file log CSV yang diunduh.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}