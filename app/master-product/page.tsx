'use client';
import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { FaPlus, FaUpload, FaEdit, FaTrash, FaSearch, FaSpinner } from 'react-icons/fa';

type Product = {
  product_code: string;
  product_name: string;
  accessories_category?: string;
  uom?: string;
  brand?: string;
  product_category?: string;
  product_non_active?: string;
  product_principle?: string;
  product_for_factory?: string;
  finish_good?: string;
  qty_convert?: number;
  uom_2?: string;
  size_product?: string;
  sub_category?: string;
  sub_category_2?: string;
  color_product?: string;
  key_product?: string;
  base_weight?: number;
  length?: number;
  weight?: number;
  created_at?: string;
};

export default function MasterProductPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // State untuk modal tambah/edit
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({});

  // State untuk upload CSV
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const limit = 50;

  // Fetch products
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dim-product?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (res.ok) {
        setProducts(json.data || []);
        setTotal(json.total || 0);
        setTotalPages(json.totalPages || 1);
      } else {
        alert('Gagal mengambil data: ' + json.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [page, search]);

  // Handle form submit (tambah/edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData };
    // Hapus field yang kosong (optional)
    Object.keys(payload).forEach(key => {
      if (payload[key as keyof Product] === '' || payload[key as keyof Product] === undefined) {
        delete payload[key as keyof Product];
      }
    });

    try {
      const res = await fetch('/api/dim-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        alert('Berhasil menyimpan produk');
        setShowModal(false);
        setFormData({});
        setEditingProduct(null);
        fetchProducts();
      } else {
        alert('Gagal: ' + json.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Handle upload CSV
  const handleUploadCSV = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const text = await uploadFile.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: async (results) => {
          const data = results.data as any[];
          const res = await fetch('/api/upload-dim-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: data, fileName: uploadFile.name }),
          });
          const json = await res.json();
          if (res.ok) {
            alert(`Berhasil upload ${json.count} produk`);
            setUploadFile(null);
            if (fileRef.current) fileRef.current.value = '';
            fetchProducts();
          } else {
            alert('Gagal: ' + json.error);
          }
          setUploading(false);
        },
        error: (err) => {
          alert('Error parsing CSV: ' + err.message);
          setUploading(false);
        }
      });
    } catch (err: any) {
      alert('Error: ' + err.message);
      setUploading(false);
    }
  };

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({ ...product });
    } else {
      setEditingProduct(null);
      setFormData({});
    }
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">📦 Master Product</h1>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-4 mb-6 items-center justify-between bg-white p-4 rounded-lg shadow">
          <div className="flex items-center gap-2">
            <button
              onClick={() => openModal()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
            >
              <FaPlus /> Tambah
            </button>
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                ref={fileRef}
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"
              >
                <FaUpload /> Pilih CSV
              </button>
              {uploadFile && (
                <span className="ml-2 text-sm text-gray-600">{uploadFile.name}</span>
              )}
              {uploadFile && (
                <button
                  onClick={handleUploadCSV}
                  disabled={uploading}
                  className="ml-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {uploading ? <FaSpinner className="animate-spin" /> : 'Upload'}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FaSearch className="text-gray-400" />
            <input
              type="text"
              placeholder="Cari product_code / nama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Product Code</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Product Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Brand</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">UOM</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Qty Convert</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-6 text-gray-500">Loading...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-gray-500">Tidak ada data</td></tr>
              ) : (
                products.map((p) => (
                  <tr key={p.product_code} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{p.product_code}</td>
                    <td className="px-4 py-2">{p.product_name}</td>
                    <td className="px-4 py-2">{p.brand || '-'}</td>
                    <td className="px-4 py-2">{p.uom || '-'}</td>
                    <td className="px-4 py-2 text-center">{p.qty_convert ?? 1}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => openModal(p)}
                        className="text-blue-600 hover:text-blue-800 mr-2"
                      >
                        <FaEdit />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Hapus ${p.product_code}?`)) return;
                          try {
                            const res = await fetch(`/api/dim-product?product_code=${p.product_code}`, { method: 'DELETE' });
                            if (res.ok) {
                              fetchProducts();
                            } else {
                              const json = await res.json();
                              alert('Gagal hapus: ' + json.error);
                            }
                          } catch (err: any) {
                            alert('Error: ' + err.message);
                          }
                        }}
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
        <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
          <span>Total {total} produk</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1">Halaman {page} dari {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {/* Modal Tambah/Edit */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-xl font-bold mb-4">{editingProduct ? 'Edit Produk' : 'Tambah Produk'}</h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys({
                  product_code: 'text',
                  product_name: 'text',
                  accessories_category: 'text',
                  uom: 'text',
                  brand: 'text',
                  product_category: 'text',
                  product_non_active: 'text',
                  product_principle: 'text',
                  product_for_factory: 'text',
                  finish_good: 'text',
                  qty_convert: 'number',
                  uom_2: 'text',
                  size_product: 'text',
                  sub_category: 'text',
                  sub_category_2: 'text',
                  color_product: 'text',
                  base_weight: 'number',
                  length: 'number',
                  weight: 'number',
                }).map(([field, type]) => (
                  <div key={field} className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 capitalize">{field.replace(/_/g, ' ')}</label>
                    <input
                      type={type}
                      value={formData[field as keyof Product] || ''}
                      onChange={(e) => setFormData({ ...formData, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-2 focus:ring-blue-400"
                      required={field === 'product_code'}
                      disabled={editingProduct?.product_code !== undefined && field === 'product_code'}
                    />
                  </div>
                ))}
                <div className="col-span-2 flex gap-4 mt-4">
                  <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                    Simpan
                  </button>
                  <button type="button" onClick={() => setShowModal(false)} className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400">
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}