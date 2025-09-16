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
  onBack?: () => void;
}

const QuoteDetails: React.FC<QuoteDetailsProps> = ({ quote, onCreateQuote, onBack }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Quote Details</h2>
          <div className="h-1 w-20 bg-teal-600 rounded-full"></div>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-xs sm:text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 whitespace-nowrap mt-2 sm:mt-0 self-start sm:self-auto"
          >
            ← Back to List
          </button>
        )}
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
                <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
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
            className="inline-flex justify-center rounded-full border border-transparent px-4 py-2 text-sm font-medium text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-offset-2 bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
            onClick={onCreateQuote}
          >
            Create Estimation Quote
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuoteDetails;
