import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

interface User { name: string; email: string }
interface UserDevicesMap { [email: string]: string[] }

const STORAGE_KEY = 'adminUsers';
const DEVICES_KEY = 'adminUserDevicesMap';

const defaultUsers: User[] = [
  { name: 'John Doe', email: 'john@example.com' },
  { name: 'Jane Smith', email: 'jane@example.com' },
  { name: 'Robert Johnson', email: 'robert@example.com' },
  { name: 'Emily Davis', email: 'emily@example.com' },
  { name: 'Michael Wilson', email: 'michael@example.com' },
];

function loadUsers(): User[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultUsers;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as User[] : defaultUsers;
  } catch {
    return defaultUsers;
  }
}

function saveUsers(users: User[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function loadUserDevices(): UserDevicesMap {
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as UserDevicesMap) : {};
  } catch {
    return {};
  }
}

function saveUserDevices(map: UserDevicesMap) {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(map));
}

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [devMap, setDevMap] = useState<UserDevicesMap>({});

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');

  // seed initial storage if empty
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      saveUsers(defaultUsers);
    }
    if (!localStorage.getItem(DEVICES_KEY)) {
      const seed: UserDevicesMap = {
        'john@example.com': ['Living Room Camera', 'Front Door Lock'],
        'jane@example.com': ['Kitchen Smoke Sensor'],
        'robert@example.com': [],
        'emily@example.com': ['Hallway Thermostat', 'Porch Light'],
        'michael@example.com': ['Garage Sensor'],
      };
      const normalized: UserDevicesMap = {};
      Object.keys(seed).forEach(k => { normalized[k.toLowerCase()] = seed[k]; });
      saveUserDevices(normalized);
    }
    setUsers(loadUsers());
    setDevMap(loadUserDevices());
  }, []);

  const rows = useMemo(() => users.map((u, idx) => {
    const devices = devMap[u.email.toLowerCase()] || [];
    return { ...u, idx, deviceCount: devices.length };
  }), [users, devMap]);

  function openAdd() {
    setModalMode('add');
    setEditIndex(null);
    setFormName('');
    setFormEmail('');
    setShowModal(true);
  }

  function openEdit(index: number) {
    const u = users[index];
    if (!u) return;
    setModalMode('edit');
    setEditIndex(index);
    setFormName(u.name);
    setFormEmail(u.email);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditIndex(null);
    setFormName('');
    setFormEmail('');
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = formName.trim();
    const email = formEmail.trim();
    if (!name || !email) return;

    const dup = users.some((u, i) => u.email.toLowerCase() === email.toLowerCase() && i !== editIndex);
    if (dup) {
      alert('A user with this email already exists.');
      return;
    }

    const next = [...users];
    if (modalMode === 'add' || editIndex === null) {
      next.push({ name, email });
    } else {
      next[editIndex] = { name, email };
    }
    setUsers(next);
    saveUsers(next);
    closeModal();
  }

  function onDelete(index: number) {
    if (!confirm('Delete this user?')) return;
    const next = [...users];
    next.splice(index, 1);
    setUsers(next);
    saveUsers(next);
  }

  return (
    <section className="bg-white/0 p-0">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Users</h1>
          <div className="flex gap-2">
            <button onClick={openAdd} className="inline-flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              <span>Add User</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Devices</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map(({ name, email, idx, deviceCount }) => (
                <tr key={email}>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900 dark:text-white">{name}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500 dark:text-gray-400">{email}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="inline-grid grid-cols-[9rem_auto] items-center justify-center gap-4">
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
                        </span>
                      </div>
                      <div className="whitespace-nowrap">
                        <Link to={`/dashboard/admin/devices?userEmail=${encodeURIComponent(email)}`} className="text-teal-600 dark:text-teal-400 hover:underline text-xs">View</Link>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Link to={`/dashboard/admin/estimates?userName=${encodeURIComponent(name)}&userEmail=${encodeURIComponent(email)}`} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded">Estimate</Link>
                      <button onClick={() => openEdit(idx)} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded border border-gray-300 dark:border-gray-600">Edit</button>
                      <button onClick={() => onDelete(idx)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-lg mx-4 p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{modalMode === 'add' ? 'Add User' : 'Edit User'}</h2>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} type="email" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500" required />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded border border-gray-300 dark:border-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminUsers;
