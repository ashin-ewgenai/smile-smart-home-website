import type { FC } from 'react';
import { useUnconfirmedQuotesCount } from '@/hooks/useUnconfirmedQuotesCount';
import { NotificationBadge } from './NotificationBadge';

interface QuoteNotificationButtonProps {
  userId: string | null;
  className?: string;
  onClick?: () => void;
}

export const QuoteNotificationButton: FC<QuoteNotificationButtonProps> = ({
  userId,
  className = '',
  onClick,
}) => {
  const unconfirmedCount = useUnconfirmedQuotesCount(userId);
  const hasUnconfirmed = unconfirmedCount > 0;

  return (
    <button
      onClick={onClick}
      className={`relative w-8 h-8 rounded-full transition-colors duration-150 inline-flex items-center justify-center ${className} ${
        hasUnconfirmed ? 'text-yellow-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
      }`}
      aria-label={hasUnconfirmed ? `You have ${unconfirmedCount} unconfirmed quotes` : 'No unconfirmed quotes'}
      title={hasUnconfirmed ? `${unconfirmedCount} unconfirmed quotes` : 'No unconfirmed quotes'}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill={hasUnconfirmed ? 'currentColor' : 'none'} 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="lucide lucide-file-text h-5 w-5"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
      <NotificationBadge count={unconfirmedCount} />
    </button>
  );
};
