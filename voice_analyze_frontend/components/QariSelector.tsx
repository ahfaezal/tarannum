/**
 * Component for students to select and assign to a Qari.
 */
import React, { useEffect, useState } from "react";
import { getMyQari, assignToQari, getAvailableQaris } from "../services/platformService";
import { User, Check, AlertCircle, ChevronDown } from "lucide-react";

interface QariSelectorProps {
  onQariSelected?: () => void;
}

const QariSelector: React.FC<QariSelectorProps> = ({ onQariSelected }) => {
  const [qaris, setQaris] = useState<Array<{
    id: string;
    email: string;
    full_name?: string;
    is_approved: boolean;
    is_active: boolean;
  }>>([]);
  const [currentQari, setCurrentQari] = useState<{
    qari_id: string;
    qari_email: string;
    qari_name?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQariId, setSelectedQariId] = useState<string>("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [qariList, myQari] = await Promise.all([
        getAvailableQaris(),
        getMyQari(),
      ]);
      setQaris(qariList.qaris.filter((q) => q.is_approved && q.is_active));
      if (myQari.qari) {
        setCurrentQari(myQari.qari);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load Qaris");
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedQariId) {
      setError("Please select a Qari");
      return;
    }
    try {
      setAssigning(true);
      setError(null);
      await assignToQari(selectedQariId);
      await loadData();
      setSelectedQariId(""); // Reset selection
      onQariSelected?.();
    } catch (err: any) {
      setError(err.message || "Failed to assign to Qari");
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (currentQari) {
    return (
      <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-md">
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-800 text-lg">Your Qari</h3>
            <p className="text-sm text-gray-600">
              {currentQari.qari_name || currentQari.qari_email}
            </p>
          </div>
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="w-5 h-5 text-green-600" />
          </div>
        </div>
        <button
          onClick={() => {
            setCurrentQari(null);
            setSelectedQariId("");
          }}
          className="text-sm text-green-600 hover:text-green-700 font-medium underline"
        >
          Change Qari
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {qaris.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <p className="font-medium">No approved Qaris available at the moment.</p>
          <p className="text-sm mt-2">Please check back later.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Select Dropdown */}
          <div>
            <div className="relative">
              <select
                value={selectedQariId}
                onChange={(e) => {
                  setSelectedQariId(e.target.value);
                  setError(null);
                }}
                disabled={assigning}
                className="w-full px-4 py-3 pr-10 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none bg-white text-gray-800 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed transition-all"
              >
                <option value="">-- Select a Qari --</option>
                {qaris.map((qari) => (
                  <option key={qari.id} value={qari.id}>
                    {qari.full_name || "Qari"} ({qari.email})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
            {selectedQariId && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">
                      {qaris.find(q => q.id === selectedQariId)?.full_name || "Qari"}
                    </div>
                    <div className="text-sm text-gray-600">
                      {qaris.find(q => q.id === selectedQariId)?.email}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Select Button */}
          <button
            onClick={handleAssign}
            disabled={assigning || !selectedQariId}
            className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {assigning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Select This Qari
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default QariSelector;
