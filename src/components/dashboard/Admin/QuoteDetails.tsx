import React from 'react';
import { Timestamp } from 'firebase/firestore';

interface QuoteDetailsProps {
  quote: {
    id: string;
    customerEmail?: string;
    quoteType?: string;
    status?: string;
    budget?: string | number;
    budgetCurrency?: string;
    createdAt?: Timestamp | null;
    propertyType?: string;
    numberOfRooms?: number;
    devicesRequired?: string[];
    additionalNotes?: string;
    newRoomsToAutomate?: string[];
    roomsAlreadySmart?: string[];
    timeline?: string;
  };
  onCreateQuote: () => void;
}

const QuoteDetails: React.FC<QuoteDetailsProps> = ({ quote, onCreateQuote }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Quote Details</h2>
        <div className="h-1 w-20 bg-indigo-600 rounded"></div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer Email</h3>
            <p className="mt-1 text-gray-900 dark:text-white">{quote.customerEmail || 'N/A'}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Quote Type</h3>
            <p className="mt-1 text-gray-900 dark:text-white">{quote.quoteType || 'N/A'}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
            <p className="mt-1 text-gray-900 dark:text-white">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                quote.status === 'confirmed' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
              }`}>
                {quote.status || 'Pending'}
              </span>
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Budget</h3>
            <p className="mt-1 text-gray-900 dark:text-white">
              {quote.budget ? `${quote.budgetCurrency || '$'}${quote.budget}` : 'Not specified'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Submitted On</h3>
            <p className="mt-1 text-gray-900 dark:text-white">
              {quote.createdAt?.toDate ? 
                quote.createdAt.toDate().toLocaleString() : 
                'Date not available'}
            </p>
          </div>
          
          {quote.timeline && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Timeline</h3>
              <p className="mt-1 text-gray-900 dark:text-white">{quote.timeline}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {quote.propertyType && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Property Type</h3>
              <p className="mt-1 text-gray-900 dark:text-white">{quote.propertyType}</p>
            </div>
          )}
          
          {quote.numberOfRooms && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Number of Rooms</h3>
              <p className="mt-1 text-gray-900 dark:text-white">{quote.numberOfRooms}</p>
            </div>
          )}
        </div>

        {quote.newRoomsToAutomate && quote.newRoomsToAutomate.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">New Rooms to Automate</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {quote.newRoomsToAutomate.map((room, index) => (
                <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {room}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {quote.roomsAlreadySmart && quote.roomsAlreadySmart.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Rooms Already Smart</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {quote.roomsAlreadySmart.map((room, index) => (
                <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  {room}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {quote.devicesRequired && quote.devicesRequired.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Devices Required</h3>
            <ul className="mt-2 space-y-1">
              {quote.devicesRequired.map((device, index) => (
                <li key={index} className="text-gray-900 dark:text-white">• {device}</li>
              ))}
            </ul>
          </div>
        )}
        
        {quote.additionalNotes && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Additional Notes</h3>
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
              <p className="text-gray-900 dark:text-gray-200 whitespace-pre-line">
                {quote.additionalNotes}
              </p>
            </div>
          </div>
        )}
        
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            className="inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
            onClick={onCreateQuote}
          >
            Create Quote
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuoteDetails;
