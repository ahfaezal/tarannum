import React from "react";
import { ReferenceAudio } from "../services/referenceLibraryService";
import { Music } from "lucide-react";

interface ReferenceLibraryProps {
  references: ReferenceAudio[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

const ReferenceLibrary: React.FC<ReferenceLibraryProps> = ({
  references,
  selectedId,
  onSelect,
  isLoading = false,
  error = null,
}) => {
  return (
    <div className="relative">
      <select
        className="appearance-none bg-slate-50 border border-slate-300 rounded-lg pl-4 pr-10 h-10 text-sm focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer font-medium text-slate-700 w-full sm:min-w-[240px] min-w-0"
        value={selectedId || ""}
        onChange={(e) => onSelect(e.target.value)}
        disabled={isLoading}
      >
        <option value="">
          {isLoading
            ? "Loading references..."
            : references.length > 0
            ? "Select reference from library"
            : "No saved references yet"}
        </option>
        {references.map((ref) => (
          <option key={ref.id} value={ref.id}>
            {ref.filename || ref.title}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
        <Music size={16} />
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-500 max-w-xs truncate">{error}</p>
      )}
    </div>
  );
};

export default ReferenceLibrary;


