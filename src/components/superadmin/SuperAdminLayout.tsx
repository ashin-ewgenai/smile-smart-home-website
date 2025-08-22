import React from 'react';
import { handleLogout as adminLogout } from '../dashboard/Admin/LogoutHandler';

interface Props { children: React.ReactNode; }

export default function SuperAdminLayout({ children }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <a href="/" className="font-semibold">Smile Smart Homes</a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/" className="hover:underline">Home</a>
            <button onClick={adminLogout} className="px-3 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600">Logout</button>
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
