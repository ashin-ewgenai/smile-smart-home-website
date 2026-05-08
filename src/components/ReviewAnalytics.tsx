import React from 'react';
import { Star, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { type Review } from '../models/Collections';

interface ReviewAnalyticsProps {
  reviews: Review[];
  loading?: boolean;
}

const ReviewAnalytics: React.FC<ReviewAnalyticsProps> = ({ reviews, loading = false }) => {
  const totalReviews = reviews.length;
  
  // Calculate average rating
  const averageRatingNum = totalReviews > 0
    ? (reviews.reduce((sum, review) => sum + (review.rating || 0), 0) / totalReviews)
    : 0;
  
  const averageRating = averageRatingNum.toFixed(1);

  // Calculate star distribution
  const starDistribution = [5, 4, 3, 2, 1].map(stars => {
    const count = reviews.filter(review => Math.round(review.rating) === stars).length;
    const percentage = totalReviews > 0 ? (count / totalReviews * 100) : 0;
    return { stars, count, percentage };
  });

  // Helper for partial stars using SVG gradients for a "structured" look
  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => {
          const fillPercentage = Math.max(0, Math.min(100, (rating - (s - 1)) * 100));
          const gradientId = `star-grad-${s}-${rating}`.replace('.', '-');
          
          return (
            <div key={s} className="relative w-[18px] h-[18px] sm:w-5 sm:h-5">
              <svg viewBox="0 0 24 24" className="w-full h-full drop-shadow-[0_0_8px_rgba(250,204,21,0.2)]">
                <defs>
                  <linearGradient id={gradientId}>
                    <stop offset={`${fillPercentage}%`} stopColor="#FACC15" />
                    <stop offset={`${fillPercentage}%`} stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill={`url(#${gradientId})`}
                  stroke="#FACC15"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          );
        })}
      </div>
    );
  };



  if (loading) {
    return (
      <div className="p-6 rounded-3xl bg-white dark:bg-charcoal border border-slate-100 dark:border-white/10 animate-pulse mb-8 shadow-soft">
        <div className="flex justify-between mb-6">
          <div className="h-6 w-32 bg-slate-100 dark:bg-white/5 rounded" />
          <div className="h-5 w-5 bg-slate-100 dark:bg-white/5 rounded-full" />
        </div>
        <div className="flex gap-8">
          <div className="flex-1 space-y-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-2 bg-slate-50 dark:bg-white/5 rounded-full w-full" />)}
          </div>
          <div className="w-24 h-24 bg-slate-50 dark:bg-white/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      whileHover={{ y: -4 }}
      className="p-6 rounded-3xl bg-white dark:bg-charcoal border border-slate-100 dark:border-white/10 shadow-soft mb-8 group/card transition-all duration-500"
    >
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
          Review summary
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
        </h3>
        <button className="text-slate-400 hover:text-teal transition-all hover:scale-110">
          <Info size={18} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 lg:gap-12">
        {/* Left side: Bars */}
        <motion.div 
          className="flex-1 w-full space-y-5"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1 } }
          }}
        >
          {starDistribution.map(({ stars, count, percentage }) => (
            <motion.div 
              key={stars} 
              variants={{
                hidden: { opacity: 0, x: -10 },
                visible: { opacity: 1, x: 0 }
              }}
              className="flex items-center gap-4 group"
            >
              <div className="flex items-center gap-1.5 w-8">
                <span className="text-sm font-black text-slate-700 dark:text-gray-300">{stars}</span>
                <Star size={14} fill="#FACC15" color="#FACC15" className="opacity-70 group-hover:scale-110 transition-transform" />
              </div>
              <div className="flex-1 h-3.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden relative shadow-inner">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  className="h-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 bg-[length:200%_100%] rounded-full shadow-[0_0_15px_rgba(250,204,21,0.4)] relative animate-shimmer"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent opacity-60" />
                </motion.div>
              </div>
              <span className="text-xs font-black text-slate-400 dark:text-gray-500 w-10 text-right tabular-nums group-hover:text-slate-600 transition-colors">
                {count}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Right side: Score */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3, type: "spring", stiffness: 100 }}
          className="flex flex-col items-center justify-center sm:min-w-[160px] text-center pt-2 border-l border-slate-100 dark:border-white/5 pl-8 lg:pl-12 hidden sm:flex"
        >
          <div className="text-7xl font-black text-slate-900 dark:text-white mb-2 tracking-tighter drop-shadow-sm">
            {averageRating}
          </div>
          <div className="mb-3">
            {renderStars(averageRatingNum)}
          </div>
          <div className="text-xs font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest bg-slate-50 dark:bg-white/5 px-3 py-1 rounded-full border border-slate-100 dark:border-white/10">
            {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
          </div>
        </motion.div>

        {/* Mobile Score (centered, no border) */}
        <div className="flex flex-col items-center justify-center w-full text-center sm:hidden border-t border-slate-100 dark:border-white/5 pt-8 mt-4">
          <div className="text-6xl font-black text-slate-900 dark:text-white mb-2">
            {averageRating}
          </div>
          <div className="mb-3">
            {renderStars(averageRatingNum)}
          </div>
          <div className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest bg-slate-50 dark:bg-white/5 px-3 py-1.5 rounded-full border border-slate-100 dark:border-white/10">
            {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
          </div>
        </div>
      </div>
    </motion.div>


  );
};

export default ReviewAnalytics;


