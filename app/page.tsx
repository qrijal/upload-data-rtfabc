'use client';
import { useState, useEffect } from 'react';
import {
  FaBoxes,
  FaChartLine,
  FaWarehouse,
  FaClipboardList,
  FaFileInvoice,
  FaFileContract,
  FaTruck,
  FaCalendarWeek,
  FaCalendarAlt,
  FaBox,
  FaHistory,
  FaSync,
  FaDatabase,
  FaPlusCircle,
  FaUpload,
} from 'react-icons/fa';

// Import komponen upload
import UploadSQPage from '@/app/upload-sq/page';
import UploadSOPage from '@/app/upload-so/page';
import UploadSJPage from '@/app/upload-sj/page';
import UploadStockPage from '@/app/upload-stock/page';
import MasterProductPage from '@/app/master/product/page'; // akan kita buat

// ============================================================
// PLACEHOLDER UNTUK MODUL YANG BELUM DIBUAT
// ============================================================
function PlaceholderModule({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-8 text-center">
      <div className="text-4xl mb-4">🚧</div>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">{title}</h2>
      <p className="text-gray-500">{description}</p>
      <p className="text-xs text-gray-400 mt-4">Modul ini sedang dalam pengembangan</p>
    </div>
  );
}

const SalesForceWeekly = () => <PlaceholderModule title="Sales Force Weekly" description="Upload dan kelola data sales force mingguan" />;
const SalesForceMonthly = () => <PlaceholderModule title="Sales Force Monthly" description="Upload dan kelola data sales force bulanan" />;
const StockAging = () => <PlaceholderModule title="Stock Aging" description="Upload dan kelola data aging stok" />;

// ============================================================
// DASHBOARD UTAMA
// ============================================================
export default function DashboardPage() {
  const [primaryTab, setPrimaryTab] = useState<'outbound' | 'salesforce' | 'stock' | 'master'>('outbound');
  const [secondaryTab, setSecondaryTab] = useState<string>('sq');
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/upload-logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Gagal ambil log:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handlePrimaryChange = (tab: 'outbound' | 'salesforce' | 'stock' | 'master') => {
    setPrimaryTab(tab);
    if (tab === 'outbound') setSecondaryTab('sq');
    else if (tab === 'salesforce') setSecondaryTab('weekly');
    else if (tab === 'stock') setSecondaryTab('daily');
    else if (tab === 'master') setSecondaryTab('product');
  };

  const renderContent = () => {
    if (primaryTab === 'outbound') {
      switch (secondaryTab) {
        case 'sq': return <UploadSQPage />;
        case 'so': return <UploadSOPage />;
        case 'sj': return <UploadSJPage />;
        default: return null;
      }
    }
    if (primaryTab === 'salesforce') {
      switch (secondaryTab) {
        case 'weekly': return <SalesForceWeekly />;
        case 'monthly': return <SalesForceMonthly />;
        default: return null;
      }
    }
    if (primaryTab === 'stock') {
      switch (secondaryTab) {
        case 'daily': return <UploadStockPage />;
        case 'aging': return <StockAging />;
        default: return null;
      }
    }
    if (primaryTab === 'master') {
      switch (secondaryTab) {
        case 'product': return <MasterProductPage />;
        // case 'branch': return <MasterBranchPage />; // nanti
        default: return null;
      }
    }
    return null;
  };

  const primaryTabs = [
    { key: 'outbound', label: 'Outbound', icon: <FaBoxes /> },
    { key: 'salesforce', label: 'Sales Force', icon: <FaChartLine /> },
    { key: 'stock', label: 'Stock', icon: <FaWarehouse /> },
    { key: 'master', label: 'Master Data', icon: <FaDatabase /> },
  ];

  const getSecondaryTabs = () => {
    if (primaryTab === 'outbound') {
      return [
        { key: 'sq', label: 'SQ', icon: <FaFileInvoice /> },
        { key: 'so', label: 'SO', icon: <FaFileContract /> },
        { key: 'sj', label: 'SJ', icon: <FaTruck /> },
      ];
    }
    if (primaryTab === 'salesforce') {
      return [
        { key: 'weekly', label: 'Weekly', icon: <FaCalendarWeek /> },
        { key: 'monthly', label: 'Monthly', icon: <FaCalendarAlt /> },
      ];
    }
    if (primaryTab === 'stock') {
      return [
        { key: 'daily', label: 'Daily Stock', icon: <FaBox /> },
        { key: 'aging', label: 'Stock Aging', icon: <FaHistory /> },
      ];
    }
    if (primaryTab === 'master') {
      return [
        { key: 'product', label: 'Product', icon: <FaPlusCircle /> },
        // { key: 'branch', label: 'Branch', icon: <FaBuilding /> },
      ];
    }
    return [];
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FaClipboardList className="text-blue-600" /> Dashboard Upload
          </h1>
        </div>

        {/* Primary Tabs */}
        <div className="bg-white rounded-t-lg shadow-sm border-b border-gray-200 px-4">
          <div className="flex flex-wrap gap-1">
            {primaryTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handlePrimaryChange(tab.key as any)}
                className={`px-4 py-3 font-medium text-sm flex items-center gap-2 transition-colors ${
                  primaryTab === tab.key
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Tabs */}
        <div className="bg-white border-b border-gray-200 px-4 py-1">
          <div className="flex flex-wrap gap-1">
            {getSecondaryTabs().map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSecondaryTab(tab.key)}
                className={`px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  secondaryTab === tab.key
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Konten */}
        <div className="bg-white rounded-b-lg shadow-md p-4">
          {renderContent()}
        </div>

        {/* Log Aktivitas */}
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
              <FaHistory /> Aktivitas Terakhir
            </h2>
            <button onClick={fetchLogs} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <FaSync /> Refresh
            </button>
          </div>
          {loadingLogs ? (
            <p className="text-gray-500 text-sm">Memuat log...</p>
          ) : logs.length === 0 ? (
            <p className="text-gray-500 text-sm">Belum ada aktivitas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-gray-600">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="py-2 px-3 font-medium">Modul</th>
                    <th className="py-2 px-3 font-medium">File</th>
                    <th className="py-2 px-3 font-medium">Baris</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-gray-100">
                      <td className="py-2 px-3 font-mono text-xs">{log.module}</td>
                      <td className="py-2 px-3 truncate max-w-xs">{log.file_name || '-'}</td>
                      <td className="py-2 px-3">{log.rows_count}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : log.status === 'partial'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs">
                        {new Date(log.created_at).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}