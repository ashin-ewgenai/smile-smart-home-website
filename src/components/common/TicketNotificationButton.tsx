import { useState, useRef, useEffect } from 'react';
import { useTicketNotifications } from '@/hooks/useTicketNotifications';
import { useUnconfirmedQuotesCount } from '@/hooks/useUnconfirmedQuotesCount';
import { useUnclosedServiceRequestsCount } from '@/hooks/useUnclosedServiceRequestsCount';
import { collection, query, where, onSnapshot, getFirestore } from 'firebase/firestore';

interface RequestItem {
  id: string;
  type: 'ticket' | 'quote' | 'service';
  title: string;
  status: string;
  link: string;
}

interface TicketNotificationButtonProps {
  userId: string | null;
  className?: string;
  onItemClick?: (item: RequestItem) => void;
  disablePopup?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  totalAlerts?: number;
}

export const TicketNotificationButton = ({
  userId,
  className = '',
  onItemClick,
  disablePopup = false,
  onClick,
  totalAlerts: propTotalAlerts,
}: TicketNotificationButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { unresolvedCount: unresolvedTickets } = useTicketNotifications(userId);
  const unconfirmedQuotes = useUnconfirmedQuotesCount(userId);
  const unclosedServiceRequests = useUnclosedServiceRequestsCount(userId);
  const calculatedTotalAlerts = unresolvedTickets + unconfirmedQuotes + unclosedServiceRequests;
  const totalAlerts = typeof propTotalAlerts !== 'undefined' ? propTotalAlerts : calculatedTotalAlerts;
  const hasAlerts = totalAlerts > 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load requests when userId changes
  useEffect(() => {
    if (!userId) return;
    
    const db = getFirestore();
    const requests: RequestItem[] = [];
    
    // Load tickets
    const ticketsQuery = query(
      collection(db, 'Support_Tickets'),
      where('uid', '==', userId),
      where('status', '!=', 'Resolved')
    );
    
    const unsubscribeTickets = onSnapshot(ticketsQuery, (snapshot) => {
      const ticketRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        type: 'ticket' as const,
        title: doc.data().subject || 'No Subject',
        status: doc.data().status || 'Open',
        link: `/support/tickets/${doc.id}`
      }));
      updateRequests(ticketRequests, 'ticket');
    });
    
    // Load quotes (you'll need to adjust the collection path as needed)
    const quotesQuery = query(
      collection(db, 'quotes'),
      where('userUid', '==', userId),
      where('status', '!=', 'confirmed')
    );
    
    const unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
      const quoteRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        type: 'quote' as const,
        title: doc.data().quoteType || 'Quote Request',
        status: doc.data().status || 'Pending',
        link: `/quotes/${doc.id}`
      }));
      updateRequests(quoteRequests, 'quote');
    });
    
    // Load service requests
    const serviceRequestsQuery = query(
      collection(db, 'Service_Requests', userId, 'Requests_List'),
      where('status', '!=', 'closed')
    );
    
    const unsubscribeServiceRequests = onSnapshot(serviceRequestsQuery, (snapshot) => {
      const serviceRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        type: 'service' as const,
        title: doc.data().title || 'Service Request',
        status: doc.data().status || 'Open',
        link: `/service-requests/${userId}/requests/${doc.id}`
      }));
      updateRequests(serviceRequests, 'service');
    });
    
    const updateRequests = (newRequests: RequestItem[], type: 'ticket' | 'quote' | 'service') => {
      setRequests(prev => [
        ...prev.filter(r => r.type !== type),
        ...newRequests
      ]);
    };
    
    return () => {
      unsubscribeTickets();
      unsubscribeQuotes();
      unsubscribeServiceRequests();
    };
  }, [userId]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    }
    if (!disablePopup) {
      setIsOpen(!isOpen);
    }
  };
  
  const handleItemClick = (e: React.MouseEvent, item: RequestItem) => {
    e.stopPropagation();
    if (onItemClick) {
      onItemClick(item);
    } else {
      // Default behavior if no handler is provided
      window.location.href = item.link;
    }
    setIsOpen(false);
  };

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('resolved') || statusLower.includes('closed') || statusLower.includes('completed')) {
      return 'bg-green-100 text-green-800';
    } else if (statusLower.includes('pending') || statusLower.includes('in progress')) {
      return 'bg-yellow-100 text-yellow-800';
    } else if (statusLower.includes('open') || statusLower.includes('new')) {
      return 'bg-blue-100 text-blue-800';
    }
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleClick}
        className={`relative w-8 h-8 transition-colors duration-150 inline-flex items-center justify-center ${className} ${
          hasAlerts ? 'text-red-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
        aria-label={`${totalAlerts} pending items`}
        title={`${totalAlerts} pending items`}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="24" 
          height="24" 
          viewBox="0 0 24 24" 
          fill={hasAlerts ? 'currentColor' : 'none'} 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="lucide lucide-bell h-5 w-5"
        >
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
        {hasAlerts && (
          <span className="absolute -top-1 -right-1 text-red-600 dark:text-red-500 text-sm font-bold">
            {totalAlerts > 9 ? '9+' : totalAlerts}
          </span>
        )}
      </button>

      {/* Simple Popup with request counts - only show if not disabled */}
      {!disablePopup && isOpen && hasAlerts && (
        <div className="absolute right-0 bottom-full mb-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-md shadow-lg z-50 min-w-[180px]">
          <div className="space-y-1">
            {unresolvedTickets > 0 && (
              <div className="flex justify-between items-center">
                <span>Tickets:</span>
                <span className="font-medium">{unresolvedTickets}</span>
              </div>
            )}
            {unconfirmedQuotes > 0 && (
              <div className="flex justify-between items-center">
                <span>Quotes:</span>
                <span className="font-medium">{unconfirmedQuotes}</span>
              </div>
            )}
            {unclosedServiceRequests > 0 && (
              <div className="flex justify-between items-center">
                <span>Service Requests:</span>
                <span className="font-medium">{unclosedServiceRequests}</span>
              </div>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
            <div className="flex justify-between items-center font-semibold pt-1">
              <span>Total:</span>
              <span>{totalAlerts} item{totalAlerts !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
