import React, { useState, useRef } from 'react';
import { Star, MessageSquare, Calendar, User, Heart, Filter, Users, Upload, X, CheckCircle2, Loader2, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useReviewsContext } from '../contexts/ReviewsContext';
import { type Review } from '../models/Collections';
import ReviewAnalytics from './ReviewAnalytics';

interface ReviewListProps {
  className?: string;
}

const ReviewList: React.FC<ReviewListProps> = ({ className = '' }) => {
  const context = useReviewsContext();
  
  if (!context) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
    </div>;
  }

  const {
    reviews,
    loading,
    error,
    sortOrder,
    setSortOrder,
    reviewsLimit,
    setReviewsLimit,
    hasMoreReviews,
    postAdminReply,
    toggleLike,
    submitReview,
    isAdmin,
    currentUser
  } = context;

  // Review form states
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadMore = () => {
    setReviewsLimit((prev: number) => prev + 5);
  };

  const onAdminReply = async (reviewId: string) => {
    const text = replyText[reviewId]?.trim();
    if (!text || !isAdmin) return;

    try {
      await postAdminReply(reviewId, text);
      setReplyText(prev => ({ ...prev, [reviewId]: '' }));
      setReplyingTo(null);
    } catch (err) {
      console.error('Error posting admin reply:', err);
      alert('Failed to post reply');
    }
  };

  const onLike = async (reviewId: string) => {
    try {
      await toggleLike(reviewId);
    } catch (err) {
      console.error('Error liking review:', err);
    }
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < rating
          ? 'text-yellow-500 fill-current'
          : 'text-gray-300 dark:text-gray-600'
          }`}
      />
    ));
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Unknown time';

    const date = timestamp?.toDate?.() || new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  // Star Rating Component
  const StarRating = ({ rating, setRating, interactive = false }: { rating: number, setRating?: (r: number) => void, interactive?: boolean }) => {
    const [hover, setHover] = useState(0);

    return (
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <motion.button
            key={star}
            whileHover={interactive ? { scale: 1.15, rotate: 5 } : {}}
            whileTap={interactive ? { scale: 0.9 } : {}}
            onClick={() => interactive && setRating?.(star)}
            onMouseEnter={() => interactive && setHover(star)}
            onMouseLeave={() => interactive && setHover(0)}
            className="focus:outline-none transition-all cursor-pointer"
            type="button"
          >
            <Star
              size={interactive ? 28 : 18}
              fill={(hover || rating) >= star ? "#009688" : "transparent"}
              color={(hover || rating) >= star ? "#009688" : "#94A3B8"}
              className={`transition-all duration-300 ${(hover || rating) >= star ? 'drop-shadow-[0_0_8px_rgba(0,150,136,0.3)]' : ''}`}
            />
          </motion.button>
        ))}
      </div>
    );
  };

  // Media Preview Component
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

  // Form handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles].slice(0, 8)); // Limit to 8 files
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
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
      await submitReview({ rating, comment, files });

      setIsSuccess(true);
      setRating(0);
      setComment('');
      setFiles([]);

      // Auto-hide success message after 5 seconds
      setTimeout(() => setIsSuccess(false), 5000);
    } catch (err: any) {
      console.error("Submission error:", err);
      alert(`Failed to save review: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${className}`}>
        <div className="text-red-500 text-center p-8 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 font-sans text-gray-900 dark:text-gray-100 py-8 ${className}`}>
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold text-gray-900 dark:text-white mb-2"
              >
                Customer Reviews
              </motion.h1>
              <p className="text-gray-600 dark:text-gray-300 text-lg">
                Share your experience and read what others are saying
              </p>
            </div>
          </div>

          {/* Main Layout: Left Form (Sticky) + Right Stats+Reviews */}
          <div className="flex flex-col lg:flex-row gap-8 p-8">
            {/* Left Side: Submit Form (Sticky) */}
            <div className="lg:w-1/3 lg:sticky lg:top-8 self-start">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6"
              >
                {!currentUser ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center"
                  >
                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
                      <User className="w-8 h-8 text-gray-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Share Your Experience</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Please log in to submit a review and upload photos of your installation.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const loginUrl = '/login?returnTo=' + encodeURIComponent(window.location.pathname);
                        window.location.href = loginUrl;
                      }}
                      className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-teal to-blue-500 text-white font-semibold rounded-lg hover:scale-[1.02] transition-all"
                    >
                      <MessageSquare className="w-5 h-5 mr-2" />
                      Log In to Review
                    </button>
                  </motion.div>
                ) : isSuccess ? (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center"
                  >
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-green-800 dark:text-green-400 mb-2">Thank You!</h2>
                    <p className="text-green-700 dark:text-green-500/80">
                      Your review has been submitted successfully and is now live.
                    </p>
                    <button
                      onClick={() => setIsSuccess(false)}
                      className="mt-8 text-sm font-medium text-green-700 underline underline-offset-4 hover:text-green-800"
                    >
                      Submit another review
                    </button>
                  </motion.div>
                ) : (
                  <motion.form
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    onSubmit={handleSubmit}
                    className="space-y-6"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">How would you rate our service?</label>
                      <StarRating rating={rating} setRating={setRating} interactive />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Detailed Review</label>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Tell us about installation, technician, and how your new smart home devices are working..."
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                        rows={4}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Add Photos or Videos</label>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-teal hover:bg-teal/5 transition-all cursor-pointer"
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          multiple
                          accept="image/*,video/*"
                          className="hidden"
                        />
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 text-gray-400 group-hover:text-teal group-hover:bg-teal/10 rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors">
                          <Upload className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Click to upload or drag and drop</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Up to 8 files (images or videos)</p>
                      </div>
                      {files.length > 0 && (
                        <MediaPreview files={files} onRemove={handleRemoveFile} />
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full flex items-center justify-center px-6 py-3 bg-gradient-to-r from-teal to-blue-500 text-white font-semibold rounded-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Submitting Review...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-5 h-5 mr-2" />
                          Submit Review
                        </>
                      )}
                    </button>
                  </motion.form>
                )}
              </motion.div>

            </div>

            {/* Right Side: Stats + Filter + Reviews */}
            <div className="lg:w-2/3 flex flex-col gap-6">
              {/* Analytics Section */}
              <ReviewAnalytics reviews={reviews} />

              {/* Filter/Sort */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-gray-700 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-600 p-4 flex-shrink-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 text-white shadow-lg">
                    <Filter className="w-5 h-5" />
                  </div>
                  <div className="flex-1 relative">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Show me</label>
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as any)}
                      className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer appearance-none relative z-10 pr-10"
                    >
                      <option value="latest">Latest First</option>
                      <option value="mostLiked">Most Liked</option>
                      <option value="highestRated">Highest Rated</option>
                      <option value="lowestRated">Lowest Rated</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 mt-2">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Reviews List - Scrollable */}
              <div className="flex-1 overflow-y-auto pr-2 min-h-0 scroll-smooth">
                {reviews.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="text-gray-500 text-lg mb-4">No reviews yet</div>
                    <div className="text-gray-400">Be the first to share your experience!</div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {reviews.map((review, index) => (
                      <motion.div
                        key={review.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-xl transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                              <User className="w-6 h-6 text-gray-500" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {review.userName}
                              </div>
                              <div className="flex items-center gap-1 mt-2">
                                {renderStars(review.rating)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => onLike(review.id!)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${review.isLiked
                                ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                              <Heart className={`w-4 h-4 ${review.isLiked ? 'fill-current text-red-600' : 'text-gray-600'}`} />
                              <span className="text-sm font-medium">
                                {review.likes || 0}
                              </span>
                            </button>
                            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {formatTimeAgo(review.createdAt)}
                            </div>
                          </div>
                        </div>

                        <div className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
                          {review.comment}
                        </div>

                        {review.media && review.media.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                            {review.media.map((media, mediaIndex) => (
                              <div key={mediaIndex} className="relative group">
                                {media.type === 'image' ? (
                                  <img
                                    src={media.url}
                                    alt="Review media"
                                    className="w-full h-32 object-cover rounded-lg cursor-pointer transition-transform group-hover:scale-105"
                                    onClick={() => window.open(media.url, '_blank')}
                                  />
                                ) : media.type === 'video' ? (
                                  <video
                                    src={media.url}
                                    className="w-full h-32 object-cover rounded-lg"
                                    controls
                                  />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}

                        {review.adminReply && (
                          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                              <span className="text-sm font-semibold text-teal-700 dark:text-teal-300">
                                {review.adminReply.author || 'Admin'} Response
                              </span>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">
                              {review.adminReply.text}
                            </p>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                              {formatTimeAgo(review.adminReply.createdAt)}
                            </div>
                          </div>
                        )}

                        {/* Admin Reply Form */}
                        {isAdmin && (
                          <div className="mt-4">
                            {replyingTo === review.id ? (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                              >
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  Post Admin Reply
                                </label>
                                <textarea
                                  value={replyText[review.id] || ''}
                                  onChange={(e) => setReplyText(prev => ({ ...prev, [review.id!]: e.target.value }))}
                                  placeholder="Write a professional response to this review..."
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                                  rows={3}
                                />
                                <div className="flex items-center gap-2 mt-3">
                                  <button
                                    onClick={() => onAdminReply(review.id!)}
                                    disabled={!replyText[review.id]?.trim()}
                                    className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Post Reply
                                  </button>
                                  <button
                                    onClick={() => {
                                      setReplyingTo(null);
                                      setReplyText(prev => ({ ...prev, [review.id!]: '' }));
                                    }}
                                    className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </motion.div>
                            ) : (
                              <button
                                onClick={() => setReplyingTo(review.id!)}
                                className="flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400 font-medium hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                              >
                                <MessageSquare className="w-4 h-4" />
                                {review.adminReply ? 'Edit Reply' : 'Reply as Admin'}
                              </button>
                            )}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Read More Reviews Button */}
                {hasMoreReviews && reviews.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-center mt-6"
                  >
                    <button
                      onClick={handleLoadMore}
                      className="px-6 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-all shadow-sm"
                    >
                      Read More Reviews
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewList;
