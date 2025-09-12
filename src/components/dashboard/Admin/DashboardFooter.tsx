import React from 'react';

const DashboardFooter: React.FC = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="relative z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 w-full">
      <div className="w-full">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-3 flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              &copy; {currentYear} Smile Smart Home. All rights reserved.
            </div>
            <div className="flex space-x-6">
              <a href="/privacy-policy" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Privacy Policy
              </a>
              <a href="/terms-of-service" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Terms of Service
              </a>
              <a href="/contact" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Contact
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default DashboardFooter;
