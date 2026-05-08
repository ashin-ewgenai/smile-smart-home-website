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
  ThumbsUp,
  ChevronDown,
  Reply,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  collection, 
  query, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTION_REVIEWS } from '@/models/Collections';
import { ReviewsProvider, useReviewsContext } from '@/contexts/ReviewsContext';
import ReviewAnalytics from '@/components/ReviewAnalytics';

// --- Components ---

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

// --- Main Page Component ---

const ReviewsRatingsContent = () => {
  const context = useReviewsContext();
  
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [allReviews, setAllReviews] = useState<any[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch all reviews for analytics independently
    const q = query(collection(db, COLLECTION_REVIEWS));
    const unsub = onSnapshot(q, (snapshot) => {
      setAllReviews(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  if (!context) return null;

  const { 
    reviews, 
    loading, 
    error, 
    submitReview, 
    toggleLike, 
    postAdminReply,
    sortOrder, 
    setSortOrder,
    hasMoreReviews,
    setReviewsLimit,
    isAdmin,
    currentUser: user
  } = context;

  const handleReplySubmit = async (reviewId: string) => {
    if (!replyText.trim()) return;
    
    setIsReplying(true);
    try {
      await postAdminReply(reviewId, replyText);
      setReplyText('');
      setReplyingTo(null);
    } catch (err) {
      console.error("Reply error:", err);
      alert("Failed to post reply.");
    } finally {
      setIsReplying(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles].slice(0, 8)); // Limit to 8 files
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      alert("Please select a star rating.");
      return;
    }
    if (!comment.trim()) {
      alert("Please write a short comment about your experience.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await submitReview({ rating, comment, files }) as any;
      
      // If we got here without throwing, it's successful
      setIsSuccess(true);
      setRating(0);
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
          <svg width="100%" height="100%"><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1"/></pattern><rect width="100%" height="100%" fill="url(#grid)" /></svg>
        </div>
        
        <div className="container max-w-6xl mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-display font-black mb-4 bg-gradient-to-r from-teal to-blue-500 bg-clip-text text-transparent italic">
              Customer Experiences
            </h1>
            <p className="text-slate-500 dark:text-gray-400 max-w-2xl mx-auto text-lg font-medium">
              We take pride in our work and value your feedback. Read about how we've transformed homes and share your own story.
            </p>
          </motion.div>

          <ReviewAnalytics reviews={allReviews} loading={loading && allReviews.length === 0} />
        </div>
      </section>

      <div className="container max-w-6xl mx-auto px-4 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-5">
          <div className="sticky top-24">
            {!user ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-8 rounded-3xl glass-surface border border-slate-100 dark:border-white/10 shadow-soft text-center"
              >
                <div className="w-16 h-16 bg-teal/10 text-teal rounded-full flex items-center justify-center mx-auto mb-6">
                  <User size={32} />
                </div>
                <h2 className="text-xl font-black mb-2 dark:text-white">Share Your Experience</h2>
                <p className="text-slate-500 dark:text-gray-400 mb-6">
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
                className="p-8 rounded-3xl glass-surface border border-slate-100 dark:border-white/10 shadow-soft"
              >
                <h2 className="text-2xl font-black mb-6 flex items-center gap-3 dark:text-white">
                  <span className="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center">
                    <MessageSquare size={18} />
                  </span>
                  Leave a Review
                </h2>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-black text-slate-600 dark:text-gray-400 uppercase tracking-wide mb-2">How would you rate our service?</label>
                    <StarRating rating={rating} setRating={setRating} interactive />
                  </div>

                  <div>
                    <label className="block text-sm font-black text-slate-600 dark:text-gray-400 uppercase tracking-wide mb-2">Detailed Review</label>
                    <textarea 
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Tell us about the installation, the technician, and how your new smart home devices are working..."
                      className="pill-textarea w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black text-slate-600 dark:text-gray-400 uppercase tracking-wide mb-2">Add Photos or Videos</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="group cursor-pointer border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center hover:border-teal hover:bg-teal/5 transition-all"
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        multiple 
                        accept="image/*,video/*"
                        className="hidden"
                      />
                      <div className="w-12 h-12 bg-slate-50 dark:bg-white/5 text-slate-400 group-hover:text-teal group-hover:bg-teal/10 rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors">
                        <Upload size={24} />
                      </div>
                      <p className="text-sm font-black dark:text-gray-300">Click to upload or drag and drop</p>
                      <p className="text-xs text-slate-400 mt-1 font-medium">Up to 8 files (images or videos)</p>
                    </div>
                    
                    {files.length > 0 && (
                      <MediaPreview 
                        files={files} 
                        onRemove={(idx) => setFiles(prev => prev.filter((_, i) => i !== idx))} 
                      />
                    )}
                  </div>

                  <button 
                    disabled={isSubmitting}
                    className="w-full py-4 bg-gradient-to-r from-teal to-blue-500 text-white font-black rounded-xl hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal/20 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Uploading...
                      </>
                    ) : (
                      'Post Review'
                    )}
                  </button>
                </div>
              </motion.form>
            )}
          </div>
        </div>

        {/* Right Column: Reviews List */}
        <div className="lg:col-span-7">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black dark:text-white">Community Feedback</h2>
              <div className="text-sm font-black text-slate-400 uppercase tracking-widest mt-1">
                {reviews.length} Experiences
              </div>
            </div>

            <div className="relative inline-block text-left">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="appearance-none bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 pr-10 text-sm font-black focus:ring-2 focus:ring-teal/50 outline-none transition-all cursor-pointer dark:text-white"
              >
                <option value="latest">Latest First</option>
                <option value="mostLiked">Most Liked</option>
                <option value="highestRated">Highest Rated</option>
                <option value="lowestRated">Lowest Rated</option>
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
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
              <div className="space-y-6">
                {reviews.map((review, idx) => (
                  <motion.div 
                    key={review.id || idx}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-6 md:p-8 rounded-3xl glass-surface border border-slate-100 dark:border-white/10 shadow-soft"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-teal text-white flex items-center justify-center font-black text-lg shadow-lg shadow-teal/20">
                          {review.userName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-lg dark:text-white">{review.userName}</h4>
                            {review.status === 'approved' && (
                              <CheckCircle2 size={14} className="text-teal" />
                            )}
                          </div>
                          <StarRating rating={review.rating} interactive={false} />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 bg-slate-50 dark:bg-white/5 px-3 py-1.5 rounded-full border border-slate-100 dark:border-white/10">
                          <Calendar size={12} className="text-teal" />
                          {formatDate(review.createdAt)}
                        </div>
                      </div>
                    </div>

                    <p className="text-slate-700 dark:text-gray-300 leading-relaxed mb-6 italic font-medium">
                      "{review.comment}"
                    </p>

                    {review.media && review.media.length > 0 && (
                      <div className="flex flex-wrap gap-3 mb-6">
                        {review.media.map((item, mIdx) => (
                          <div 
                            key={mIdx} 
                            className="relative group w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden cursor-pointer border border-slate-100 dark:border-white/10"
                            onClick={() => window.open(item.url, '_blank')}
                          >
                            <img 
                              src={item.type === 'video' ? 'https://via.placeholder.com/150/000000/FFFFFF?text=PLAY+VIDEO' : item.url} 
                              alt="review media" 
                              className="w-full h-full object-cover transition-transform group-hover:scale-110"
                            />
                            {item.type === 'video' && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <Video size={24} className="text-white drop-shadow-lg" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-white/5">
                      <button
                        onClick={() => review.id && toggleLike(review.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-black text-xs uppercase tracking-widest ${
                          (review as any).isLiked 
                            ? 'bg-teal text-white shadow-lg shadow-teal/20' 
                            : 'bg-slate-50 dark:bg-white/5 text-slate-500 hover:bg-teal/10 hover:text-teal'
                        }`}
                      >
                        <ThumbsUp size={14} className={(review as any).isLiked ? 'fill-current' : ''} />
                        {(review as any).likes || 0} Likes
                      </button>

                      {(review as any).adminReply && (
                        <div className="flex items-center gap-2 text-[10px] font-black text-teal uppercase tracking-widest">
                          <MessageSquare size={12} />
                          Admin Replied
                        </div>
                      )}
                      {isAdmin && !(review as any).adminReply && (
                        <button
                          onClick={() => setReplyingTo(replyingTo === review.id ? null : (review.id || null))}
                          className="flex items-center gap-2 text-[10px] font-black text-blue-500 uppercase tracking-widest hover:text-blue-600 transition-colors"
                        >
                          <Reply size={12} />
                          {replyingTo === review.id ? 'Cancel' : 'Reply'}
                        </button>
                      )}
                    </div>

                    {isAdmin && replyingTo === review.id && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-black">
                            A
                          </div>
                          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Post Admin Reply</span>
                        </div>
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your professional response here..."
                          className="w-full bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800/30 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all min-h-[80px]"
                        />
                        <div className="flex justify-end mt-3">
                          <button
                            disabled={isReplying || !replyText.trim()}
                            onClick={() => review.id && handleReplySubmit(review.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-all"
                          >
                            {isReplying ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            {isReplying ? 'Posting...' : 'Send Reply'}
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {(review as any).adminReply && (
                      <div className="mt-4 p-4 rounded-2xl bg-teal/5 border border-teal/10">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-teal text-white flex items-center justify-center text-[10px] font-black">
                            S
                          </div>
                          <span className="text-[10px] font-black text-teal uppercase tracking-widest">Smile Smart Homes Support</span>
                          <span className="text-[10px] text-slate-400 font-medium ml-auto">{formatDate((review as any).adminReply.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-gray-400 italic">
                          "{(review as any).adminReply.text}"
                        </p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>

          {hasMoreReviews && (
            <div className="mt-12 text-center">
              <button
                onClick={() => setReviewsLimit(prev => prev + 5)}
                className="px-8 py-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/10 transition-all shadow-soft"
              >
                Read More Reviews
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ReviewsRatingsPage = () => {
  return (
    <ReviewsProvider>
      <ReviewsRatingsContent />
    </ReviewsProvider>
  );
};

export default ReviewsRatingsPage;
