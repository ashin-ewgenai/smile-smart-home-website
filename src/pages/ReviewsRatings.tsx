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
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { useReviews } from '@/hooks/useReviews';

// --- Components ---

const StarRating = ({ rating, setRating, interactive = false }: { rating: number, setRating?: (r: number) => void, interactive?: boolean }) => {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <motion.button
          key={star}
          whileHover={interactive ? { scale: 1.2 } : {}}
          whileTap={interactive ? { scale: 0.9 } : {}}
          onClick={() => interactive && setRating?.(star)}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          className={`focus:outline-none transition-colors ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
          type="button"
        >
          <Star
            size={24}
            fill={(hover || rating) >= star ? "#F59E0B" : "transparent"}
            color={(hover || rating) >= star ? "#F59E0B" : "#D1D5DB"}
            className="transition-colors duration-200"
          />
        </motion.button>
      ))}
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
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { reviews, loading, error, submitReview } = useReviews();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans text-charcoal dark:text-gray-100 pb-20">
      {/* Header / Hero */}
      <section className="relative py-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
          <svg width="100%" height="100%"><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1"/></pattern><rect width="100%" height="100%" fill="url(#grid)" /></svg>
        </div>
        
        <div className="container max-w-6xl mx-auto px-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-teal to-blue-600 bg-clip-text text-transparent">
              Customer Experiences
            </h1>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
              We take pride in our work and value your feedback. Read about how we've transformed homes and share your own story.
            </p>
          </motion.div>
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
                className="p-8 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none text-center"
              >
                <div className="w-16 h-16 bg-teal/10 text-teal rounded-full flex items-center justify-center mx-auto mb-6">
                  <User size={32} />
                </div>
                <h2 className="text-xl font-bold mb-2">Share Your Experience</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  Please log in to submit a review and upload photos of your installation.
                </p>
                <a 
                  href="/auth" 
                  className="inline-flex items-center justify-center px-6 py-3 bg-teal text-white font-semibold rounded-xl hover:bg-teal-600 transition-all w-full shadow-lg shadow-teal/20"
                >
                  Log In to Review
                </a>
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
                <h2 className="text-2xl font-bold text-green-800 dark:text-green-400 mb-2">Thank You!</h2>
                <p className="text-green-700 dark:text-green-500/80">
                  Your review has been submitted successfully and is now live.
                </p>
                <button 
                  onClick={() => setIsSuccess(false)}
                  className="mt-8 text-sm font-semibold text-green-700 underline underline-offset-4 hover:text-green-800"
                >
                  Submit another review
                </button>
              </motion.div>
            ) : (
              <motion.form 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={handleSubmit}
                className="p-8 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none"
              >
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center">
                    <MessageSquare size={18} />
                  </span>
                  Leave a Review
                </h2>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">How would you rate our service?</label>
                    <StarRating rating={rating} setRating={setRating} interactive />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Detailed Review</label>
                    <textarea 
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Tell us about the installation, the technician, and how your new smart home devices are working..."
                      className="w-full h-32 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-teal focus:border-transparent transition-all outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Add Photos or Videos</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="group cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-6 text-center hover:border-teal hover:bg-teal/5 transition-all"
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        multiple 
                        accept="image/*,video/*"
                        className="hidden"
                      />
                      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 text-gray-400 group-hover:text-teal group-hover:bg-teal/10 rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors">
                        <Upload size={24} />
                      </div>
                      <p className="text-sm font-medium">Click to upload or drag and drop</p>
                      <p className="text-xs text-gray-400 mt-1">Up to 8 files (images or videos)</p>
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
                    className="w-full py-4 bg-teal text-white font-bold rounded-xl hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal/20 flex items-center justify-center gap-2"
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
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Community Feedback</h2>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing {reviews.length} reviews
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Loader2 className="animate-spin mb-4" size={40} />
                <p>Loading the latest reviews...</p>
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Star size={32} />
                </div>
                <h3 className="text-lg font-bold">No reviews yet</h3>
                <p className="text-gray-500 max-w-xs mx-auto mt-2">
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
                    className="p-6 md:p-8 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-teal/10 text-teal flex items-center justify-center font-bold text-lg">
                          {review.userName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-lg">{review.userName}</h4>
                          <StarRating rating={review.rating} />
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-full">
                        <Calendar size={14} />
                        {review.createdAt ? new Date(review.createdAt as any).toLocaleDateString() : 'Just now'}
                      </div>
                    </div>

                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6 italic">
                      "{review.comment}"
                    </p>

                    {review.media && review.media.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-4">
                        {review.media.map((item, mIdx) => (
                          <div 
                            key={mIdx} 
                            className="relative group w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden cursor-pointer"
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
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ReviewsRatingsPage;
