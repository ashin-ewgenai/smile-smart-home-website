import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
}

/**
 * GlassCard
 * A reusable glassmorphism container that respects the app's teal/charcoal palette.
 * Usage:
 * <GlassCard className="p-6"> ... </GlassCard>
 */
const GlassCard: React.FC<GlassCardProps> = ({ as, className = '', children, ...rest }) => {
  const Tag = (as || 'section') as React.ElementType;
  const classes = [
    'glass-surface',
    // default padding and rounded; allow override by consumer
    'rounded-2xl',
    'shadow-soft-lg',
    'border',
    'border-white/40',
    'dark:border-white/10',
  ]
    .concat(className)
    .join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
};

export default GlassCard;
