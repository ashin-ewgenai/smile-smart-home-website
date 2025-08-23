import React, { useEffect, useMemo, useState } from 'react';

interface Device {
  id: string;
  name: string;
  type: string;
  brand: string;
  room: string;
  status: 'installed' | 'pending' | 'maintenance' | string;
  lastSeen: string;
  model: string;
  installedAt: string;
  fw: string;
  mac: string;
  ip: string;
  protocol: string;
  linked: string;
  serial: string;
  notes: string;
  support: string;
  manual: string;
  faq: string;
}

interface AvailableDevice {
  id: string;
  name: string;
  type: string;
  model: string;
  desc: string;
}

const initialDevices: Device[] = [
  { id: 'd1', name: 'Living Room Camera', type: 'Camera', brand: 'AcmeCam X2', room: 'Living Room', status: 'installed', lastSeen: 'Just now', model: 'X2', installedAt: '2024-09-12', fw: '2.1.4', mac: '00:1A:7D:9B:00:01', ip: '192.168.1.21', protocol: 'Wi‑Fi', linked: 'Google Home', serial: 'CAMX2-001-ABCD', notes: 'Watching the front door', support: '#', manual: '#', faq: '#' },
  { id: 'd2', name: 'Front Door Lock', type: 'Smart Lock', brand: 'SecureLock Pro', room: 'Entrance', status: 'maintenance', lastSeen: '2 min ago', model: 'SL-Pro', installedAt: '2024-08-03', fw: '5.8.0', mac: '00:1A:7D:9B:00:02', ip: '192.168.1.34', protocol: 'Zigbee', linked: 'Alexa', serial: 'SLP-2233-XY', notes: 'Auto-lock at night', support: '#', manual: '#', faq: '#' },
  { id: 'd3', name: 'Bedroom Light', type: 'Smart Bulb', brand: 'BrightLite', room: 'Bedroom', status: 'maintenance', lastSeen: '3 hrs ago', model: 'BL-Color', installedAt: '2024-11-20', fw: '1.0.9', mac: '00:1A:7D:9B:00:03', ip: '192.168.1.45', protocol: 'Zigbee', linked: 'Google Home', serial: 'BL-C-9902', notes: '', support: '#', manual: '#', faq: '#' },
  { id: 'd4', name: 'Kitchen Thermostat', type: 'Thermostat', brand: 'ThermoMax', room: 'Kitchen', status: 'installed', lastSeen: '—', model: 'TX-10', installedAt: '2025-01-05', fw: '3.4.2', mac: '00:1A:7D:9B:00:04', ip: '192.168.1.52', protocol: 'Wi‑Fi', linked: 'IFTTT', serial: 'TX10-A1', notes: 'Schedule @ 7am/7pm', support: '#', manual: '#', faq: '#' },
  { id: 'd5', name: 'Garage Door Sensor', type: 'Sensor', brand: 'SenseIt', room: 'Garage', status: 'pending', lastSeen: '—', model: 'SEN-M', installedAt: '2024-10-01', fw: '0.9.2', mac: '00:1A:7D:9B:00:05', ip: '192.168.1.88', protocol: 'BLE', linked: '-', serial: 'SNS-009', notes: 'Pending pairing', support: '#', manual: '#', faq: '#' },
];

const initialAvailable: AvailableDevice[] = [
  { id: 'a1', name: 'Outdoor Camera', type: 'Camera', model: 'Cam-Outdoor X', desc: 'Weatherproof camera with night vision and motion alerts.' },
  { id: 'a2', name: 'Smart Plug', type: 'Outlet', model: 'Plug Mini', desc: 'Control any appliance remotely and monitor energy usage.' },
  { id: 'a3', name: 'Air Quality Sensor', type: 'Sensor', model: 'AQ-200', desc: 'Tracks PM2.5, CO₂ and humidity with realtime alerts.' },
  { id: 'a4', name: 'Smart Doorbell', type: 'Doorbell', model: 'Ring-X', desc: 'HD video doorbell with two-way audio and motion detection.' },
];

function StatusBadge({ status }: { status: Device['status'] }) {
  const map: Record<string, string> = {
    installed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    maintenance: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  };
  const dot: Record<string, string> = {
    installed: 'bg-blue-500',
    pending: 'bg-amber-500',
    maintenance: 'bg-violet-500',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] || 'bg-gray-400'}`} />
      {status}
    </span>
  );
}

const typeIcon = (t: string) => ({
  'Camera': '📷', 'Smart Lock': '🔒', 'Smart Bulb': '💡', 'Thermostat': '🌡️', 'Sensor': '📟'
}[t] || '🔧');

const AboutDevices: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [available, setAvailable] = useState<AvailableDevice[]>(initialAvailable);

  const [query, setQuery] = useState('');
  const [room, setRoom] = useState('all');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [group, setGroup] = useState(false);

  const rooms = useMemo(() => Array.from(new Set(devices.map(d => d.room))).sort(), [devices]);
  const types = useMemo(() => Array.from(new Set(devices.map(d => d.type))).sort(), [devices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter(d => {
      const text = `${d.name} ${d.type} ${d.brand} ${d.model} ${d.room}`.toLowerCase();
      return (!q || text.includes(q)) &&
        (room === 'all' || d.room === room) &&
        (type === 'all' || d.type === type) &&
        (status === 'all' || d.status === status);
    });
  }, [devices, query, room, type, status]);

  const [details, setDetails] = useState<Device | null>(null);
  useEffect(() => {
    // lock body scroll when modal open (client-only)
    if (details) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [details]);

  function onAddDevice(id: string) {
    const d = available.find(x => x.id === id);
    if (!d) return;
    setAvailable(prev => prev.filter(x => x.id !== id));
    setDevices(prev => ([
      ...prev,
      {
        id: `new-${id}`,
        name: d.name,
        type: d.type,
        brand: '-',
        room: '-',
        status: 'pending',
        lastSeen: '—',
        model: d.model,
        installedAt: '-',
        fw: '-',
        mac: '-',
        ip: '-',
        protocol: '-',
        linked: '-',
        serial: '-',
        notes: d.desc,
        support: '#',
        manual: '#',
        faq: '#',
      }
    ]));
  }

  const grouped = useMemo(() => {
    const acc: Record<string, Device[]> = {};
    for (const d of filtered) {
      (acc[d.room] = acc[d.room] || []).push(d);
    }
    return acc;
  }, [filtered]);

  return (
    <section className="p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">my devices</h1>
          <p className="text-sm text-gray-400">Informational-only view of your smart devices</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              type="text"
              placeholder="Search devices..."
              className="pl-9 pr-3 py-2 w-64 rounded-md border border-gray-700 bg-gray-900 text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
          </label>
          <select value={room} onChange={e => setRoom(e.target.value)} className="px-3 py-2 rounded-md border border-gray-700 bg-gray-900 text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="all">All Rooms</option>
            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 rounded-md border border-gray-700 bg-gray-900 text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="all">All Types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-md border border-gray-700 bg-gray-900 text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="all">All Status</option>
            <option value="installed">Installed</option>
            <option value="pending">Pending</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-gray-300 select-none">
            <input type="checkbox" checked={group} onChange={e => setGroup(e.target.checked)} className="rounded border-gray-600 text-teal-600 focus:ring-teal-500" />
            Group by room
          </label>
        </div>
      </div>

      {/* Room overview chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setRoom('all')} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${room === 'all' ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-700 text-gray-200 hover:bg-gray-800'}`}>
          <strong className="font-semibold">All</strong>
          <span className={room === 'all' ? 'text-white/80' : 'text-gray-400'}>{devices.length}</span>
        </button>
        {rooms.map(r => (
          <button key={r} onClick={() => setRoom(r)} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${room === r ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-700 text-gray-200 hover:bg-gray-800'}`}>
            <strong className="font-semibold">{r}</strong>
            <span className={room === r ? 'text-white/80' : 'text-gray-400'}>{devices.filter(d => d.room === r).length}</span>
          </button>
        ))}
      </div>

      {/* Devices list */}
      {!group && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(d => (
            <div key={d.id} className="bg-gray-900 rounded-lg shadow-md border border-gray-800 p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center text-lg">{typeIcon(d.type)}</div>
                  <div>
                    <div className="text-sm font-semibold text-white">{d.name}</div>
                    <div className="text-xs text-gray-400">{d.type} • {d.brand}</div>
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </div>
              <div className="text-xs text-gray-400 flex flex-wrap gap-3">
                <span>Room: <span className="text-gray-200">{d.room}</span></span>
                <span>Model: <span className="text-gray-200">{d.model}</span></span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <button onClick={() => setDetails(d)} className="px-3 py-1.5 text-sm rounded-md border border-gray-700 hover:bg-gray-800">View Details</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grouped by room */}
      {group && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([r, list]) => (
            <div key={r} className="md:col-span-2 xl:col-span-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">{r}</h3>
                <span className="text-xs text-gray-500">{list.length} device(s)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {list.map(d => (
                  <div key={d.id} className="bg-gray-900 rounded-lg shadow-md border border-gray-800 p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 flex items-center justify-center text-lg">{typeIcon(d.type)}</div>
                        <div>
                          <div className="text-sm font-semibold text-white">{d.name}</div>
                          <div className="text-xs text-gray-400">{d.type} • {d.brand}</div>
                        </div>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="text-xs text-gray-400 flex flex-wrap gap-3">
                      <span>Room: <span className="text-gray-200">{d.room}</span></span>
                      <span>Model: <span className="text-gray-200">{d.model}</span></span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <button onClick={() => setDetails(d)} className="px-3 py-1.5 text-sm rounded-md border border-gray-700 hover:bg-gray-800">View Details</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add More Devices */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-white">Add More Devices</h2>
        <p className="text-sm text-gray-400">Explore and add new smart devices available for your home.</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {available.map(a => (
            <div key={a.id} className="bg-gray-900 rounded-lg shadow-md border border-gray-800 p-4 flex flex-col gap-3 hover:shadow-lg transition-shadow">
              <div>
                <div className="text-sm font-semibold text-white">{a.name}</div>
                <div className="text-xs text-gray-400">{a.type} • Model: {a.model}</div>
              </div>
              <p className="text-sm text-gray-300 line-clamp-2">{a.desc}</p>
              <div className="mt-1 flex items-center gap-2">
                <button onClick={() => onAddDevice(a.id)} className="px-3 py-1.5 text-sm rounded-md border border-teal-500 bg-teal-600 text-white hover:bg-teal-700 focus:ring-2 focus:ring-teal-500">Add Device</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Details Modal */}
      {details && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={(e) => { if (e.currentTarget === e.target) setDetails(null); }}>
          <div className="relative w-full max-w-2xl">
            <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-base font-semibold text-white">Device Details</h3>
                <button onClick={() => setDetails(null)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-700 text-gray-200 hover:bg-gray-800">Close</button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto overscroll-contain touch-pan-y px-5 py-4 text-sm text-gray-200">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div><dt className="text-gray-400">Device</dt><dd className="text-white">{details.name}</dd></div>
                  <div><dt className="text-gray-400">Type</dt><dd>{details.type}</dd></div>
                  <div><dt className="text-gray-400">Brand/Model</dt><dd>{details.brand} / {details.model}</dd></div>
                  <div><dt className="text-gray-400">Room</dt><dd>{details.room}</dd></div>
                  <div><dt className="text-gray-400">Status</dt><dd>{details.status}</dd></div>
                  <div><dt className="text-gray-400">Installed</dt><dd>{details.installedAt}</dd></div>
                  <div><dt className="text-gray-400">Firmware</dt><dd>{details.fw}</dd></div>
                  <div><dt className="text-gray-400">Network</dt><dd>MAC {details.mac} • IP {details.ip} • {details.protocol}</dd></div>
                  <div><dt className="text-gray-400">Linked Services</dt><dd>{details.linked}</dd></div>
                  <div><dt className="text-gray-400">Serial/QR</dt><dd>{details.serial}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-gray-400">Notes</dt><dd>{details.notes || '—'}</dd></div>
                </dl>
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-white mb-1">Support & Docs</h4>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <a href={details.support} target="_blank" className="px-3 py-1.5 rounded-md border border-gray-700 hover:bg-gray-800">Manufacturer</a>
                    <a href={details.manual} target="_blank" className="px-3 py-1.5 rounded-md border border-gray-700 hover:bg-gray-800">User Manual</a>
                    <a href={details.faq} target="_blank" className="px-3 py-1.5 rounded-md border border-gray-700 hover:bg-gray-800">Troubleshooting</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AboutDevices;
