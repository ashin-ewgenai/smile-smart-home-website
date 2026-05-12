import React, { useState, useRef, useEffect } from 'react';
import {
  Star,
  Upload,
  Image as ImageIcon,
  Video,
  X,
  CheckCircle2,
  Loader2,
  MessageSquare,
  User,
  Calendar,
  Heart
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy, limit as limitFn } from 'firebase/firestore';
import { useReviews } from '@/hooks/useReviews';
import ReviewAnalytics from '@/components/ReviewAnalytics';

// --- Components ---

const ExpandableText = ({ text, limit = 300 }: { text: string; limit?: number }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (text.length <= limit) {
    return <p className="text-slate-700 dark:text-gray-200 text-lg leading-relaxed pl-8 italic font-medium break-words relative z-10">{text}</p>;
  }

  return (
    <div className="relative z-10">
      <p className="text-slate-700 dark:text-gray-200 text-lg leading-relaxed pl-8 italic font-medium break-words">
        {isExpanded ? text : `${text.slice(0, limit)}...`}
      </p>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="ml-8 mt-2 text-sm font-black text-teal hover:text-teal-600 transition-colors uppercase tracking-widest flex items-center gap-1 group"
      >
        {isExpanded ? 'Show Less' : 'Read Full Review'}
        <motion.span
          animate={{ x: isExpanded ? 0 : 3 }}
          transition={{ repeat: Infinity, duration: 1, repeatType: 'reverse' }}
        >
          {isExpanded ? '↑' : '→'}
        </motion.span>
      </button>
    </div>
  );
};

// Safe date formatting helper
const formatDate = (dateValue: any): string => {
  if (!dateValue) return 'Just now';

  try {
    let date: Date;

    if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (typeof dateValue === 'object' && dateValue.toDate) {
      date = dateValue.toDate();
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else {
      return 'Just now';
    }

    if (isNaN(date.getTime())) {
      return 'Just now';
    }

    return Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  } catch (error) {
    return 'Just now';
  }
};

const StarRating = ({ rating, setRating, interactive = false }: { rating: number, setRating?: (r: number) => void, interactive?: boolean }) => {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => {
        if (interactive) {
          return (
            <motion.button
              key={star}
              whileHover={{ scale: 1.15, rotate: 5 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setRating?.(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              className="focus:outline-none transition-all cursor-pointer"
              type="button"
            >
              <Star
                size={28}
                fill={(hover || rating) >= star ? "#009688" : "transparent"}
                color={(hover || rating) >= star ? "#009688" : "#94A3B8"}
                className={`transition-all duration-300 ${(hover || rating) >= star ? 'drop-shadow-[0_0_8px_rgba(0,150,136,0.3)]' : ''}`}
              />
            </motion.button>
          );
        } else {
          return (
            <div key={star} className="transition-all">
              <Star
                size={18}
                fill={rating >= star ? "#009688" : "transparent"}
                color={rating >= star ? "#009688" : "#94A3B8"}
                className={`transition-all duration-300 ${rating >= star ? 'drop-shadow-[0_0_8px_rgba(0,150,136,0.3)]' : ''}`}
              />
            </div>
          );
        }
      })}
    </div>
  );
};

const MediaPreview = ({ files, onRemove }: { files: File[], onRemove: (index: number) => void }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
      {files.map((file, index) => {
        const isVideo = file.type.startsWith('video/');
        const url = URL.createObjectURL(file);

        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            key={index}
            className="relative group aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
          >
            {isVideo ? (
              <video src={url} className="w-full h-full object-cover" />
            ) : (
              <img src={url} alt="preview" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={() => onRemove(index)}
                className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] rounded uppercase font-bold tracking-wider">
              {isVideo ? 'Video' : 'Image'}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

// --- Main Page Component ---

const ReviewsRatingsPage = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [rating, setRating] = useState(1);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasUserRated, setHasUserRated] = useState(false);
  const [userExistingRating, setUserExistingRating] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { reviews, loading, error, submitReview, toggleLike } = useReviews();

  // Pagination & Sorting states
  const [visibleCount, setVisibleCount] = useState(5);
  const [sortBy, setSortBy] = useState<'latest' | 'highest' | 'lowest' | 'engagement'>('latest');

  // User rating map to track original saved rating for each user
  const userRatingMap = React.useMemo(() => {
    const map = new Map<string, number>();
    reviews.forEach(review => {
      if (review.uid && review.rating > 0 && !map.has(review.uid)) {
        map.set(review.uid, review.rating);
      }
    });
    return map;
  }, [reviews]);

  // Sorted reviews
  const sortedReviews = React.useMemo(() => {
    const arr = [...reviews];
    if (sortBy === 'highest') return arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sortBy === 'lowest') return arr.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    if (sortBy === 'engagement') return arr.sort((a, b) => (b.likes || 0) - (a.likes || 0));

    // Default: latest (safely handle Firestore Timestamp or regular Date)
    const getTimestamp = (val: any) => {
      if (!val) return 0;
      if (typeof val.toDate === 'function') return val.toDate().getTime();
      if (val instanceof Date) return val.getTime();
      return new Date(val).getTime() || 0;
    };
    return arr.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
  }, [reviews, sortBy]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Check if user has already submitted a star rating
  useEffect(() => {
    const checkUserRating = async () => {
      if (!user) {
        setHasUserRated(false);
        setUserExistingRating(0);
        return;
      }

      try {
        const reviewsQuery = query(
          collection(db, 'reviews'),
          where('uid', '==', user.uid),
          where('rating', '>', 0),
          orderBy('createdAt', 'desc'),
          limitFn(1)
        );

        const querySnapshot = await getDocs(reviewsQuery);
        const hasExistingRating = !querySnapshot.empty;
        setHasUserRated(hasExistingRating);

        // Store the actual rating value
        if (hasExistingRating && !querySnapshot.empty) {
          const userReview = querySnapshot.docs[0]?.data();
          const savedRating = userReview?.rating || 0;
          setUserExistingRating(savedRating);
          // Ensure hasUserRated is set to true when rating is found
          setHasUserRated(true);
        } else {
          // Ensure hasUserRated is set to false when no rating is found
          setHasUserRated(false);
          setUserExistingRating(0);
        }
      } catch (error) {
        console.error('Error checking user rating:', error);
        setHasUserRated(false);
        setUserExistingRating(0);
      }
    };

    checkUserRating();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles].slice(0, 8)); // Limit to 8 files
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      alert("Please write a short comment about your experience.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Only submit rating if user hasn't rated before
      const reviewData: { comment: string; files: File[]; rating: number; userName?: string } = hasUserRated 
        ? { rating: 0, comment, files } 
        : { rating, comment, files };
      
      const response = await submitReview(reviewData) as any;

      // If we got here without throwing, it's successful
      setIsSuccess(true);
      
      // Update hasUserRated state immediately after successful rating submission
      if (!hasUserRated && rating > 0) {
        setHasUserRated(true);
        setUserExistingRating(rating); // Store the submitted rating
      }
      
      // Only reset rating for new users, preserve for existing users
      if (!hasUserRated) {
        setRating(1); // Reset to default for new users
      }
      setComment('');
      setFiles([]);

      // Auto-hide success message after 5 seconds
      setTimeout(() => setIsSuccess(false), 5000);
    } catch (err: any) {
      console.error("Submission error:", err);
      // More user friendly message for Firestore permission issues
      const msg = err.message?.includes('permission')
        ? "Permission denied. Check Firestore security rules."
        : (err.message || "Failed to save review.");
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-charcoal font-sans text-charcoal dark:text-gray-100 pb-20">
      {/* Header / Hero */}
      <section className="relative py-20 bg-white dark:bg-charcoal border-b border-slate-100 dark:border-white/10 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
          <svg width="100%" height="100%"><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" /></pattern><rect width="100%" height="100%" fill="url(#grid)" /></svg>
        </div>

        <div className="container max-w-6xl mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-display font-black mb-4 bg-gradient-to-r from-teal to-blue-500 bg-clip-text text-transparent italic">
              Customer Experiences
            </h1>
            <p className="text-slate-500 dark:text-gray-400 max-w-2xl mx-auto text-lg font-medium">
              We take pride in our work and value your feedback. Read about how we've transformed homes and share your own story.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="container max-w-6xl mx-auto px-4 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-12">

        {/* Left Column: Form */}
        <div className="lg:col-span-5">
          <div className="sticky top-24">
            <ReviewAnalytics reviews={reviews} loading={loading} />
            {!user ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`
                  p-8 rounded-[2rem] transition-all relative overflow-hidden group
                  bg-white/90 dark:bg-[#1e293b]/40 
                  backdrop-blur-xl border border-gray-100 dark:border-white/5
                  shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)]
                  hover:shadow-[0_30px_60px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_30px_60px_rgba(0,0,0,0.5)]
                  text-center
                `}
              >
                {/* Decorative Gradient Glow (Dark mode only) */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-teal/20 via-blue-500/10 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none" />
                
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-teal/10 text-teal rounded-full flex items-center justify-center mx-auto mb-6">
                    <User size={32} />
                  </div>
                  <h2 className="text-xl font-black mb-2 dark:text-white">Share Your Experience</h2>
                  <p className="text-slate-500 dark:text-gray-400 mb-6 font-medium">
                    Please log in to submit a review and upload photos of your installation.
                  </p>
                  <button
                    type="button"
                    data-open-auth="login"
                    onClick={() => {
                      sessionStorage.setItem('authReturnTo', '/reviews');
                      (window as any).__authOpen?.('login');
                    }}
                    className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-teal to-blue-500 text-white font-black rounded-xl hover:scale-[1.02] transition-all w-full shadow-lg shadow-teal/20"
                  >
                    Log In to Review
                  </button>
                </div>
              </motion.div>
            ) : isSuccess ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="p-10 rounded-3xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-center"
              >
                <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30">
                  <CheckCircle2 size={40} />
                </div>
                <h2 className="text-2xl font-black text-green-800 dark:text-green-400 mb-2">Thank You!</h2>
                <p className="text-green-700 dark:text-green-500/80 font-medium">
                  Your review has been submitted successfully and is now live.
                </p>
                <button
                  onClick={() => setIsSuccess(false)}
                  className="mt-8 text-sm font-black text-green-700 underline underline-offset-4 hover:text-green-800"
                >
                  Submit another review
                </button>
              </motion.div>
            ) : (
              <motion.form
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={handleSubmit}
                className={`
                  p-8 rounded-[2rem] transition-all relative overflow-hidden group
                  bg-white/90 dark:bg-[#1e293b]/40 
                  backdrop-blur-xl border border-gray-100 dark:border-white/5
                  shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)]
                  hover:shadow-[0_30px_60px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_30px_60px_rgba(0,0,0,0.5)]
                `}
              >
                {/* Decorative Gradient Glow (Dark mode only) */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-teal/20 via-blue-500/10 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none" />

                <div className="relative z-10">
                  <h2 className="text-2xl font-black mb-6 flex items-center gap-3 dark:text-white">
                    <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal flex items-center justify-center shadow-inner">
                      <MessageSquare size={20} />
                    </span>
                    Leave a Review
                  </h2>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-black text-slate-600 dark:text-gray-400 uppercase tracking-widest mb-3 ml-1">How would you rate our service?</label>
                      <StarRating rating={hasUserRated ? userExistingRating : rating} setRating={setRating} interactive={!hasUserRated} />
                      {/* Debug: {hasUserRated ? 'User has rated - non-interactive' : 'User can rate - interactive'} */}
                    </div>

                    <div>
                      <label className="block text-sm font-black text-slate-600 dark:text-gray-400 uppercase tracking-widest mb-3 ml-1">Detailed Review</label>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Tell us about the installation, the technician, and how your new smart home devices are working..."
                        className="pill-textarea w-full bg-white/50 dark:bg-black/20 border-gray-100 dark:border-white/5 focus:ring-teal/30 focus:border-teal rounded-2xl p-5 text-sm font-medium transition-all min-h-[150px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-black text-slate-600 dark:text-gray-400 uppercase tracking-widest mb-3 ml-1">Add Photos or Videos</label>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="group/upload cursor-pointer border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-8 text-center hover:border-teal hover:bg-teal/5 transition-all duration-300"
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          multiple
                          accept="image/*,video/*"
                          className="hidden"
                        />
                        <div className="w-14 h-14 bg-slate-50 dark:bg-white/5 text-slate-400 group-hover/upload:text-teal group-hover/upload:bg-teal/10 group-hover/upload:scale-110 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-500">
                          <Upload size={28} />
                        </div>
                        <p className="text-sm font-black dark:text-gray-200 group-hover/upload:text-teal transition-colors">Click to upload or drag and drop</p>
                        <p className="text-[11px] text-slate-400 mt-2 font-bold uppercase tracking-wider">Up to 8 files (images or videos)</p>
                      </div>

                      {files.length > 0 && (
                        <MediaPreview
                          files={files}
                          onRemove={(idx) => setFiles(prev => prev.filter((_, i) => i !== idx))}
                        />
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-4 bg-gradient-to-r from-teal to-blue-500 text-white font-black rounded-2xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-teal/20 flex items-center justify-center gap-3 group/btn"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <span>Post Review</span>
                          <motion.div
                            animate={{ x: [0, 5, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                          >
                            <CheckCircle2 size={18} />
                          </motion.div>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </div>
        </div>

        {/* Right Column: Reviews List */}
        <div className="lg:col-span-7">
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-black dark:text-white flex items-center gap-3">
              Community Feedback
            </h2>

            <div className="flex items-center gap-2">
              <div className="flex bg-slate-50 dark:bg-white/5 p-1 rounded-xl border border-slate-100 dark:border-white/10 shadow-sm">
                {[
                  { id: 'latest', label: 'Latest' },
                  { id: 'highest', label: 'Highest Rated' },
                  { id: 'lowest', label: 'Lowest Rated' },
                  { id: 'engagement', label: 'Highest Liked' }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setSortBy(option.id as any)}
                    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${sortBy === option.id
                      ? 'bg-white dark:bg-white/10 text-teal shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
                      }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Loader2 className="animate-spin mb-4" size={40} />
                <p className="font-bold">Loading experiences...</p>
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-20 glass-surface rounded-3xl border border-slate-100 dark:border-white/10">
                <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Star size={32} />
                </div>
                <h3 className="text-lg font-black dark:text-white">No reviews yet</h3>
                <p className="text-slate-500 dark:text-gray-400 max-w-xs mx-auto mt-2 font-medium">
                  Be the first one to share your smart home transformation journey!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedReviews.slice(0, visibleCount).map((review) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -5, transition: { duration: 0.2 } }}
                    className={`
                      p-8 rounded-[2rem] transition-all relative overflow-hidden group
                      bg-white/90 dark:bg-[#1e293b]/40 
                      backdrop-blur-xl border border-gray-100 dark:border-white/5
                      shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)]
                      hover:shadow-[0_30px_60px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_30px_60px_rgba(0,0,0,0.5)]
                    `}
                  >
                    {/* Decorative Gradient Glow (Dark mode only) */}
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-teal/20 via-blue-500/10 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none" />

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 relative z-10">
                      <div className="flex items-center gap-5">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal to-blue-500 text-white flex items-center justify-center font-black text-2xl shadow-xl shadow-teal/20 transform -rotate-3 group-hover:rotate-0 transition-transform duration-500">
                            {review.userName.charAt(0).toUpperCase()}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-4 border-white dark:border-[#1e293b] rounded-full shadow-lg" />
                        </div>
                        <div>
                          <h4 className="font-black text-xl dark:text-white tracking-tight group-hover:text-teal transition-colors">{review.userName}</h4>
                          <div className="mt-1 flex flex-col gap-1">
                            <StarRating rating={review.rating > 0 ? review.rating : (review.uid ? userRatingMap.get(review.uid) || 0 : 0)} interactive={false} />
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Verified Customer
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-[11px] font-black text-slate-400 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2 bg-slate-50 dark:bg-white/5 px-4 py-2 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                          <Calendar size={14} className="text-teal" />
                          {formatDate(review.createdAt)}
                        </div>
                        
                        <button
                          onClick={() => toggleLike(review.id!)}
                          className={`group flex items-center gap-2 px-4 py-2 rounded-2xl transition-all border ${user && review.likedBy?.includes(user.uid)
                            ? 'bg-red-500 text-white border-red-500 shadow-xl shadow-red-500/30'
                            : 'bg-white/80 dark:bg-white/5 border-gray-100 dark:border-white/10 text-slate-400 dark:text-gray-500 hover:text-red-500 hover:border-red-500/50 hover:bg-red-50/50 shadow-sm'
                            }`}
                        >
                          <Heart
                            size={16}
                            className={`transition-transform duration-300 group-hover:scale-125 ${user && review.likedBy?.includes(user.uid) ? 'fill-current animate-pulse' : ''
                              }`}
                          />
                          <span className="text-xs font-black tabular-nums">{review.likes || 0}</span>
                        </button>
                      </div>
                    </div>

                    <div className="relative z-10 mb-8">
                      <div className="absolute -top-6 -left-4 text-teal/5 dark:text-teal/10 select-none">
                        <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V12C14.017 12.5523 13.5693 13 13.017 13H11.017V21H14.017ZM5.017 21L5.017 18C5.017 16.8954 5.91243 16 7.017 16H10.017C10.5693 16 11.017 15.5523 11.017 15V9C11.017 8.44772 10.5693 8 10.017 8H6.017C5.46472 8 5.017 8.44772 5.017 9V12C5.017 12.5523 4.56929 13 4.017 13H2.017V21H5.017Z" />
                        </svg>
                      </div>
                      <ExpandableText text={review.comment} limit={300} />
                    </div>

                    {review.media && review.media.length > 0 && (
                      <div className="flex flex-wrap gap-4 mb-8 relative z-10">
                        {review.media.map((item, mIdx) => (
                          <motion.div
                            key={mIdx}
                            whileHover={{ scale: 1.05, y: -5 }}
                            className="relative group/media w-28 h-28 rounded-3xl overflow-hidden cursor-pointer border-4 border-white dark:border-white/10 shadow-xl shadow-black/10"
                            onClick={() => window.open(item.url, '_blank')}
                          >
                            <img
                              src={item.type === 'video' ? 'https://via.placeholder.com/150/000000/FFFFFF?text=PLAY+VIDEO' : item.url}
                              alt="review media"
                              className="w-full h-full object-cover transition-transform duration-700 group-hover/media:scale-110"
                            />
                            {item.type === 'video' && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md border border-white/30">
                                  <Video size={20} className="text-white fill-current" />
                                </div>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-teal/20 opacity-0 group-hover/media:opacity-100 transition-opacity duration-300" />
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {review.adminReply && (
                      <div className="mt-4 p-8 rounded-[2.5rem] bg-gradient-to-br from-teal/5 to-blue-500/5 dark:from-teal-900/20 dark:to-blue-900/20 border border-teal-100/50 dark:border-teal-800/30 relative overflow-hidden group/reply z-10">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-teal/10 dark:bg-teal-500/10 rounded-full -mr-24 -mt-24 blur-3xl transition-transform duration-700 group-hover/reply:scale-150" />
                        <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
                            <span className="px-3 py-1 bg-teal text-white text-[11px] font-black rounded-xl uppercase tracking-widest shadow-lg shadow-teal/30">
                              Official Response
                            </span>
                          </div>
                          <p className="text-[15px] text-slate-700 dark:text-gray-200 font-bold italic mb-6 leading-relaxed">
                            "{review.adminReply.text}"
                          </p>
                          <div className="flex items-center gap-3 text-[11px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest">
                            <div className="w-8 h-[2px] bg-teal/20 rounded-full" />
                            <span className="hover:text-teal transition-colors">{review.adminReply.author}</span>
                            <span className="text-slate-300 dark:text-gray-700">•</span>
                            <span className="text-slate-400 dark:text-gray-500">{formatDate(review.adminReply.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {reviews.length > 5 && (
                  <div className="flex justify-center pt-4">
                    {visibleCount < reviews.length ? (
                      <button
                        onClick={() => setVisibleCount(reviews.length)}
                        className="px-8 py-3 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400 text-xs font-black rounded-xl border border-slate-100 dark:border-white/10 hover:bg-teal hover:text-white hover:border-teal transition-all shadow-sm"
                      >
                        View All Reviews ({reviews.length - 5} more)
                      </button>
                    ) : (
                      <button
                        onClick={() => setVisibleCount(5)}
                        className="px-8 py-3 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400 text-xs font-black rounded-xl border border-slate-100 dark:border-white/10 hover:bg-slate-100 transition-all shadow-sm"
                      >
                        View Less
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ReviewsRatingsPage;
