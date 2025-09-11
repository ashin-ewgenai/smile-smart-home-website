import React, { useEffect, useState } from 'react';
import { states as FallbackStates, districtsByState as FallbackDistricts } from '../../data/indiaLocations.js';

export interface LocationValue {
  country: 'India';
  state: string;
  district: string;
}

interface LocationSelectorProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  className?: string;
  disabled?: boolean;
  showLabels?: boolean;
  required?: boolean;
}

export const getDistrictsForState = (state: string): string[] => {
  // Fallback helper (used only if runtime JSON is unavailable)
  const map = FallbackDistricts as unknown as Record<string, string[]>;
  const list = map[state];
  return Array.isArray(list) ? list : [];
};

const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  className = '',
  disabled = false,
  showLabels = true,
  required = false,
}) => {
  // Load full dataset from public if available
  const [stateList, setStateList] = useState<string[]>(FallbackStates);
  const [districtMap, setDistrictMap] = useState<Record<string, string[]>>(FallbackDistricts as unknown as Record<string, string[]>);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/data/indiaDistricts.json', { cache: 'force-cache' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !Array.isArray(data.states)) return;
        const sList: string[] = [];
        const dMap: Record<string, string[]> = {};
        for (const item of data.states) {
          const st = String(item.state || '');
          const ds = Array.isArray(item.districts) ? item.districts.map((d: any) => String(d)) : [];
          if (st) {
            sList.push(st);
            dMap[st] = ds;
          }
        }
        if (mounted && sList.length) {
          setStateList(sList);
          setDistrictMap(dMap);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextState = e.target.value;
    onChange({ country: 'India', state: nextState, district: '' });
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextDistrict = e.target.value;
    onChange({ country: 'India', state: value.state, district: nextDistrict });
  };

  const districts = (districtMap[value.state] as string[] | undefined) ?? [];
  const districtDisabled = disabled || !value.state || districts.length === 0;

  return (
    <div className={className}>
      {/* Country */}
      <div className="mb-4">
        {showLabels && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Country
          </label>
        )}
        <input
          type="text"
          value="India"
          readOnly
          className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {/* State */}
      <div className="mb-4">
        {showLabels && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            State
          </label>
        )}
        <select
          value={value.state}
          onChange={handleStateChange}
          disabled={disabled}
          required={required}
          className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Select a state/UT</option>
          {stateList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* District */}
      <div>
        {showLabels && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            District
          </label>
        )}
        <select
          value={value.district}
          onChange={handleDistrictChange}
          disabled={districtDisabled}
          required={required}
          className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-900 dark:disabled:text-gray-500"
        >
          <option value="">{!value.state ? 'Select a state first' : (districts.length === 0 ? 'No districts data for selected state' : 'Select a district')}</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default LocationSelector;
