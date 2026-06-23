"use client";

import { useState } from "react";

export default function DownloadProductPage() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | null; text: string }>({
    type: null,
    text: "",
  });

  const handleDownload = async () => {
    setIsDownloading(true);
    setStatusMessage({ type: null, text: "" });

    try {
      const response = await fetch("/api/download-products");

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal menarik data.");
      }

      // 1. PERBAIKAN: Ambil data sebagai blob (biner), bukan text lagi
      const blobData = await response.blob();
      
      // 2. PERBAIKAN: Gunakan format MIME type khusus untuk Excel (.xlsx)
      const excelBlob = new Blob([blobData], { 
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
      });
      
      // 3. PERBAIKAN: Ubah default nama file cadangan ke ekstensi .xlsx
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `dim_product_ALL_${new Date().toISOString().split("T")[0]}.xlsx`;
      
      if (contentDisposition && contentDisposition.includes("filename=")) {
        filename = contentDisposition.split("filename=")[1].replace(/"/g, "");
      }

      const url = window.URL.createObjectURL(excelBlob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      setStatusMessage({ type: "success", text: `🔥 Sukses mengunduh file Excel bersih!` });
    } catch (error: any) {
      setStatusMessage({ type: "error", text: error.message });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
        <div className="mb-6 text-center">
          <div className="mx-auto w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Full Database Export</h1>
          <p className="text-xs text-slate-400 mt-1">
            Menembak bypass pagination Supabase untuk mendownload <span className="text-amber-400 font-semibold">100% Seluruh Baris</span> dari <code className="text-red-400">dim_product</code> ke format <span className="text-emerald-400 font-semibold">Excel</span>.
          </p>
        </div>

        {statusMessage.text && (
          <div
            className={`mb-5 p-4 rounded-xl text-xs font-medium ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-3 ${
            isDownloading
              ? "bg-blue-600/50 text-blue-200 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 active:scale-[0.98] shadow-lg shadow-blue-500/20"
          }`}
        >
          {isDownloading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Looping Chunk Data Supabase...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download Excel Tanpa Batas</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}