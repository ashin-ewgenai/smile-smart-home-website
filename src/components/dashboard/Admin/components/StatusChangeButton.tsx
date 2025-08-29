import React from 'react';

interface Props {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onSave: () => void;
  saving?: boolean;
}

const StatusChangeButton: React.FC<Props> = ({ value, options, onChange, onSave, saving }) => {
  return (
    <div className="flex items-center gap-2">
      <select
        className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <button
        className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm disabled:opacity-60"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Update'}
      </button>
    </div>
  );
};

export default StatusChangeButton;
