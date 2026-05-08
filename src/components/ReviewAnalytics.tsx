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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-3xl bg-white dark:bg-charcoal border border-slate-100 dark:border-white/10 shadow-soft mb-8"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-black text-slate-800 dark:text-white">
          Review summary
        </h3>
        <button className="text-slate-400 hover:text-teal transition-colors">
          <Info size={18} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
        {/* Left side: Bars */}
        <div className="flex-1 w-full space-y-3">
          {starDistribution.map(({ stars, percentage }) => (
            <div key={stars} className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-600 dark:text-gray-400 w-3">{stars}</span>
              <div className="flex-1 h-2.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-yellow-400 rounded-full"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Right side: Score */}
        <div className="flex flex-col items-center justify-center sm:min-w-[140px] text-center pt-1">
          <div className="text-5xl font-black text-slate-900 dark:text-white mb-1">
            {averageRating}
          </div>
          <div className="flex gap-0.5 mb-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star 
                key={s} 
                size={16} 
                fill={s <= Math.round(averageRatingNum) ? "#FACC15" : "transparent"}
                color={s <= Math.round(averageRatingNum) ? "#FACC15" : "#E2E8F0"}
                className={s <= Math.round(averageRatingNum) ? 'drop-shadow-[0_0_4px_rgba(250,204,21,0.2)]' : ''}
              />
            ))}
          </div>
          <div className="text-sm font-black text-slate-500 dark:text-gray-400">
            {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ReviewAnalytics;


