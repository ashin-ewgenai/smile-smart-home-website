import type { FC } from 'react';

interface NotificationBadgeProps {
  count: number;
  className?: string;
}

export const NotificationBadge: FC<NotificationBadgeProps> = ({ count, className = '' }) => {
  if (count <= 0) return null;

  return (
    <span 
      className={`absolute -top-1 -right-1 min-w-[1.1rem] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shadow ${className}`}
      aria-label={`${count} unread notifications`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
};
