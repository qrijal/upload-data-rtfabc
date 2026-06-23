'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  FaPlus,
  FaUpload,
  FaEdit,
  FaTrash,
  FaSearch,
  FaSpinner,
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileCsv,
} from 'react-icons/fa';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Kolom yang ditampilkan di tabel
const DISPLAY_COLUMNS = [
  'product_code',
  'product_name',
  'brand',
  'product_category',
  'uom',
  'qty_convert',
  'size_product',
  'key_product',
];

const ALL_COLUMNS = [
  'product_code',
  'product_name',
  'accessories_category',
  'uom',
  'brand',
  'product_category',
  'product_non_active',
  'product_principle',
  'product_for_factory',
  'finish_good',
  'qty_convert',
  'uom_2',
  'size_product',
  'sub_category',
  'sub_category_2',
  'color_product',
  'key_product',
  'base_weight',
  'length',
  'weight',
];

export default function MasterProductPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<{ text: string; type: 'info' | 'success' | 'error' }>({
    text: '',
    type: 'info'
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const limit = 20;

  useEffect(() => {
    fetchProducts();
  }, [page, search]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('dim_product')
        .select('*', { count: 'exact' })
        .order('product_code', { ascending: true });

      if (search) {
        query = query.ilike('product_code', `%${search}%`);
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setProducts(data || []);
      setTotalPages(Math.ceil((count || 0) / limit));
    } catch (err: any) {
      setStatus({ text: '❌ Gagal memuat data: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setFormData({});
    setShowAddModal(true);
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setFormData(product);
    setShowAddModal(true);
  };

  const handleDeleteProduct = async (productCode: string) => {
    if (!confirm(`Hapus produk ${productCode}?`)) return;
    try {
      const { error } = await supabase
        .from('dim_product')
        .delete()
        .eq('product_code', productCode);
      if (error) throw error;
      setStatus({ text: `✅ Produk ${productCode} berhasil dihapus`, type: 'success' });
      fetchProducts();
    } catch (err: any) {
      setStatus({ text: '❌ Gagal hapus: ' + err.message, type: 'error' });
    }
  };

  const handleSaveProduct = async () => {
    try {
      // Validasi product_code wajib
      if (!formData.product_code?.trim()) {
        setStatus({ text: '⚠️ Product Code wajib diisi', type: 'error' });
        return;
      }

      const payload = { ...formData };
      // Hapus field yang tidak ada di tabel (misal id)
      // Pastikan key_product diisi
      if (!payload.key_product) {
        // key_product = 3 karakter pertama dari product_code + "-" + product_code
        payload.key_product = payload.product_code.substring(0, 3) + '-' + payload.product_code;
      }

      if (editingProduct) {
        const { error } = await supabase
          .from('dim_product')
          .update(payload)
          .eq('product_code', editingProduct.product_code);
        if (error) throw error;
        setStatus({ text: `✅ Produk ${payload.product_code} berhasil diupdate`, type: 'success' });
      } else {
        const { error } = await supabase
          .from('dim_product')
          .insert(payload);
        if (error) throw error;
        setStatus({ text: `✅ Produk ${payload.product_code} berhasil ditambahkan`, type: 'success' });
      }

      setShowAddModal(false);
      fetchProducts();
    } catch (err: any) {
      setStatus({ text: '❌ Gagal simpan: ' + err.message, type: 'error' });
    }
  };

  const handleUploadCSV = async () => {
    if (!uploadFile) {
      setStatus({ text: '⚠️ Pilih file CSV dulu', type: 'error' });
      return;
    }

    setUploadLoading(true);
    setStatus({ text: '⏳ Membaca dan memproses CSV...', type: 'info' });

    try {
      const text = await uploadFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      
      // Validasi header
      const missingHeaders = ALL_COLUMNS.filter(col => !headers.includes(col));
      if (missingHeaders.length > 0 && missingHeaders.some(h => h !== 'created_at')) {
        setStatus({
          text: `⚠️ Header tidak lengkap. Kolom yang hilang: ${missingHeaders.join(', ')}`,
          type: 'error'
        });
        setUploadLoading(false);
        return;
      }

      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, any> = {};
        headers.forEach((h, i) => {
          row[h] = values[i] || null;
        });
        // Generate key_product jika kosong
        if (!row.key_product && row.product_code) {
          row.key_product = row.product_code.substring(0, 3) + '-' + row.product_code;
        }
        return row;
      });

      // Filter row yang product_code kosong
      const validRows = rows.filter(r => r.product_code && r.product_code.trim());

      if (validRows.length === 0) {
        setStatus({ text: '⚠️ Tidak ada data valid (product_code kosong)', type: 'error' });
        setUploadLoading(false);
        return;
      }

      // Insert dengan upsert berdasarkan product_code
      const { data, error } = await supabase
        .from('dim_product')
        .upsert(validRows, { onConflict: 'product_code' })
        .select('product_code');

      if (error) throw error;

      setStatus({
        text: `✅ ${data?.length || validRows.length} produk berhasil diupload/update`,
        type: 'success'
      });
      setUploadFile(null);
      setShowUploadModal(false);
      fetchProducts();
    } catch (err: any) {
      setStatus({ text: '❌ Gagal upload CSV: ' + err.message, type: 'error' });
    } finally {
      setUploadLoading(false);
    }
  };

  // Render form input
  const renderFormFields = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto p-1">
      {ALL_COLUMNS.map((col) => (
        <div key={col} className="flex flex-col">
          <label className="text-xs font-medium text-gray-600 mb-1">{col}</label>
          <input
            type="text"
            value={formData[col] || ''}
            onChange={(e) => setFormData({ ...formData, [col]: e.target.value })}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder={col}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-700">Master Produk</h2>
          <div className="relative">
            <FaSearch className="absolute left-2.5 top-2.5 text-gray-400 text-xs" />
            <input
              type="text"
              placeholder="Cari product_code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-48"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddProduct}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
          >
            <FaPlus /> Tambah
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1"
          >
            <FaUpload /> Upload CSV
          </button>
        </div>
      </div>

      {/* Status */}
      {status.text && (
        <div className={`p-3 rounded-lg text-sm border mb-4 ${status.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : status.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
          {status.text}
        </div>
      )}

      {/* Tabel */}
      {loading ? (
        <div className="flex justify-center py-8">
          <FaSpinner className="animate-spin text-blue-600 text-2xl" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {DISPLAY_COLUMNS.map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      {col}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={DISPLAY_COLUMNS.length + 1} className="px-3 py-4 text-center text-gray-500">
                      Belum ada data produk.
                    </td>
                  </tr>
                ) : (
                  products.map((row) => (
                    <tr key={row.product_code} className="hover:bg-gray-50">
                      {DISPLAY_COLUMNS.map((col) => (
                        <td key={col} className="px-3 py-2 text-gray-700 text-xs">
                          {row[col] || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleEditProduct(row)}
                          className="text-blue-600 hover:text-blue-800 mr-2"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(row.product_code)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTrash />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-3 text-sm">
              <span className="text-gray-600">Halaman {page} dari {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Tambah/Edit */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {editingProduct ? 'Edit Produk' : 'Tambah Produk'}
            </h3>
            {renderFormFields()}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSaveProduct}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Simpan
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload CSV */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload CSV Produk</h3>
            <p className="text-sm text-gray-600 mb-3">
              Upload file CSV dengan header: <code className="bg-gray-100 px-1 rounded">{ALL_COLUMNS.join(', ')}</code>
            </p>
            <div className="mb-4">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleUploadCSV}
                disabled={uploadLoading || !uploadFile}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                {uploadLoading ? <FaSpinner className="animate-spin" /> : <FaFileCsv />}
                {uploadLoading ? 'Uploading...' : 'Upload'}
              </button>
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}