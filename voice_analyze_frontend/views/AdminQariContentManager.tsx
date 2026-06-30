import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Edit, FileAudio, Trash2, Upload, X } from "lucide-react";
import { deleteAdminQariContent, getAdminQariContent, QariContent } from "../services/platformService";
import { referenceLibraryService } from "../services/referenceLibraryService";
import ConfirmModal from "../components/ConfirmModal";

const formatDuration = (seconds?: number): string => {
  const safeSeconds = Number.isFinite(seconds || 0) ? seconds || 0 : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  return `${mins}m ${secs}s`;
};

const AdminQariContentManager: React.FC = () => {
  const navigate = useNavigate();
  const { qariId } = useParams<{ qariId: string }>();
  const [content, setContent] = useState<QariContent[]>([]);
  const [qari, setQari] = useState<{ id: string; email: string; full_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [maqam, setMaqam] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; contentId: string; filename: string }>({
    isOpen: false,
    contentId: "",
    filename: "",
  });

  const loadContent = async () => {
    if (!qariId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getAdminQariContent(qariId);
      setContent(data.content || []);
      setQari(data.qari);
    } catch (err: any) {
      setError(err.message || "Failed to load Qari content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, [qariId]);

  const handleUpload = async () => {
    if (!qariId || !selectedFile) return;

    try {
      setUploading(true);
      setError(null);
      await referenceLibraryService.uploadReference(
        selectedFile,
        title.trim() || selectedFile.name,
        maqam.trim() || undefined,
        setUploadProgress,
        false,
        qariId
      );
      setSelectedFile(null);
      setTitle("");
      setMaqam("");
      setUploadProgress(0);
      await loadContent();
    } catch (err: any) {
      setError(err.message || "Failed to upload content for Qari");
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!qariId || !deleteConfirm.contentId) return;

    try {
      await deleteAdminQariContent(qariId, deleteConfirm.contentId);
      setDeleteConfirm({ isOpen: false, contentId: "", filename: "" });
      await loadContent();
    } catch (err: any) {
      setError(err.message || "Failed to delete Qari content");
      setDeleteConfirm({ isOpen: false, contentId: "", filename: "" });
    }
  };

  const qariName = qari?.full_name || qari?.email || "Selected Qari";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate("/admin/users")}
          className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={18} />
          Back to User Management
        </button>
        <h1 className="text-3xl font-bold text-slate-800">Content Library: {qariName}</h1>
        <p className="mt-2 text-slate-600">
          Admin is managing surah uploads, text, and timing on behalf of this Qari.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Upload className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-800">Upload Surah for Qari</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/50">
            <FileAudio className="h-5 w-5 text-slate-500" />
            <span className="truncate">{selectedFile ? selectedFile.name : "Choose audio file"}</span>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
          </label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            className="rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="text"
            value={maqam}
            onChange={(event) => setMaqam(event.target.value)}
            placeholder="Maqam"
            className="rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {uploading ? `Uploading ${uploadProgress}%` : "Upload"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
            <BookOpen className="h-5 w-5 text-blue-600" />
            Qari Content Library
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {content.length} reference{content.length !== 1 ? "s" : ""} available for coaching.
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading content...</div>
        ) : content.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <BookOpen className="mx-auto mb-4 h-14 w-14 text-slate-300" />
            <p>No content yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {content.map((item) => (
              <div key={item.id} className="relative rounded-lg border border-slate-200 p-4 transition hover:bg-slate-50">
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <button
                    onClick={() => navigate(`/admin/qari/${qariId}/content/edit/${item.id}`)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                    title="Edit text and timing"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      setDeleteConfirm({
                        isOpen: true,
                        contentId: item.id,
                        filename: item.filename || item.reference_title || "Untitled",
                      })
                    }
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Delete from library"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="mb-1 pr-16 font-semibold text-slate-800">
                  {item.surah_name || item.reference_title || item.filename || "Untitled Reference"}
                </h3>
                <p className="mb-2 text-xs text-slate-500">{item.filename || item.reference_title || "No filename"}</p>
                {item.surah_number || item.surah_name ? (
                  <p className="text-sm text-slate-600">
                    {item.surah_name || `Surah ${item.surah_number}`}
                    {item.ayah_number && ` - Ayah ${item.ayah_number}`}
                  </p>
                ) : (
                  <p className="text-sm italic text-amber-600">Surah/Ayah not set</p>
                )}
                {item.maqam && (
                  <span className="mt-2 inline-block rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                    {item.maqam}
                  </span>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatDuration(item.reference_duration || item.duration)}</span>
                  <span className="font-medium text-slate-600">
                    {item.text_segments?.length || 0} text segment{(item.text_segments?.length || 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Delete Qari Content"
        message={`Remove "${deleteConfirm.filename}" from this Qari's content library?`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, contentId: "", filename: "" })}
      />
    </div>
  );
};

export default AdminQariContentManager;
