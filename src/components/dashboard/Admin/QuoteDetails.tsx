import React from 'react';
import { Timestamp } from 'firebase/firestore';
import { ArrowLeft, FileText, Clock, CheckCircle, DollarSign, Calendar, Layers, Smartphone, AlertCircle } from 'lucide-react';

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
  onMarkAsPaid?: () => void;
  onBack?: () => void;
}

const QuoteDetails: React.FC<QuoteDetailsProps> = ({ quote, onCreateQuote, onMarkAsPaid, onBack }) => {
  const formatDate = (date: Timestamp | null | undefined) => {
    if (!date?.toDate) return 'Date not available';
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date.toDate());
    } catch {
      return date.toDate().toLocaleString();
    }
  };

  const StatusBadge = ({ status }: { status?: string }) => {
    const s = (status || 'pending').toLowerCase();
    const isPaid = s === 'paid';
    const isConfirmed = s === 'confirmed';
    
    const styles = isPaid
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
      : isConfirmed
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    
    const Icon = isPaid ? CheckCircle : isConfirmed ? CheckCircle : Clock;
    
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${styles} border border-white/20`}> 
        <Icon className="w-4 h-4 mr-1" />
        {status || 'Pending'}
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800">
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-lg sm:text-xl font-bold text-white inline-flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Quote Details
          </h2>
        </div>
        <StatusBadge status={quote.status} />
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
                <FileText className="w-3.5 h-3.5 text-teal-700 dark:text-teal-300" />
              </span>
              Customer Email
            </h3>
            <p className="mt-1 text-gray-900 dark:text-white font-medium">{quote.customerEmail || 'N/A'}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Quote Type</h3>
            <p className="mt-1 text-gray-900 dark:text-white">{quote.quoteType || 'N/A'}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
            <p className="mt-1 text-gray-900 dark:text-white">
              <StatusBadge status={quote.status} />
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Budget
            </h3>
            <p className="mt-1 text-gray-900 dark:text-white font-medium">
              {quote.budget ? `${quote.budgetCurrency || '$'}${quote.budget}` : 'Not specified'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Submitted On
            </h3>
            <p className="mt-1 text-gray-900 dark:text-white">{formatDate(quote.createdAt)}</p>
          </div>
          
          {quote.timeline && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Timeline
              </h3>
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
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              New Rooms to Automate
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {quote.newRoomsToAutomate.map((room, index) => (
                <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
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
                <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {room}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {quote.devicesRequired && quote.devicesRequired.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Devices Required
            </h3>
            <ul className="mt-2 space-y-2">
              {quote.devicesRequired.map((device, index) => (
                <li key={index} className="flex items-start">
                  <span className="flex-shrink-0 h-5 w-5 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mt-0.5 mr-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400" />
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">{device}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {quote.additionalNotes && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Additional Notes
            </h3>
            <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
              <p className="text-gray-900 dark:text-gray-200 whitespace-pre-line">{quote.additionalNotes}</p>
            </div>
          </div>
        )}
        
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow focus:outline-none focus:ring-2 focus:ring-offset-2 bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
            onClick={onCreateQuote}
          >
            <FileText className="w-4 h-4 mr-2" />
            Create Estimation Quote
          </button>

          {quote.status?.toLowerCase() === 'confirmed' && onMarkAsPaid && (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow focus:outline-none focus:ring-2 focus:ring-offset-2 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
              onClick={onMarkAsPaid}
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Mark as Paid
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuoteDetails;
