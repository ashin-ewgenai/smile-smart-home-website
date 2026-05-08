import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { COLLECTION_REVIEWS, type Review } from '@/models/Collections';
import { Star, Trash2, CheckCircle, Clock, MessageSquare, X, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AdminReviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTION_REVIEWS), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Review[];
      setReviews(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this review?")) {
      try {
        await deleteDoc(doc(db, COLLECTION_REVIEWS, id));
      } catch (err) {
        console.error("Delete failed:", err);
        alert("Failed to delete review.");
      }
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'approved' ? 'pending' : 'approved';
    try {
      await updateDoc(doc(db, COLLECTION_REVIEWS, id), { status: newStatus });
    } catch (err) {
      console.error("Status update failed:", err);
    }
  };

  const handleReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, COLLECTION_REVIEWS, reviewId), {
        adminReply: {
          text: replyText.trim(),
          author: auth.currentUser?.displayName || "Admin",
          createdAt: serverTimestamp()
        }
      });
      setReplyingTo(null);
      setReplyText("");
    } catch (err) {
      console.error("Reply failed:", err);
      alert("Failed to post reply.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateValue: any): string => {
    if (!dateValue) return 'Just now';
    try {
      const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
      return date.toLocaleDateString();
    } catch {
      return 'Just now';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Review Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage customer feedback and respond to reviews</p>
        </div>
        <div className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold">
          Total: {reviews.length}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnimatePresence>
          {reviews.map((review) => (
            <motion.div 
              key={review.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col h-full"
            >
              <div className="p-6 flex flex-col h-full">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal/10 text-teal flex items-center justify-center font-bold text-sm">
                      {review.userName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-1">{review.userName}</h3>
                      <div className="flex items-center gap-1 my-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`h-2.5 w-2.5 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 dark:text-gray-700'}`} 
                          />
                        ))}
                      </div>
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest">{formatDate(review.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => toggleStatus(review.id!, review.status || 'approved')}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                        review.status === 'approved' 
                          ? 'bg-green-50 text-green-600 border border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/30' 
                          : 'bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30'
                      }`}
                    >
                      {review.status === 'approved' ? 'Visible' : 'Hidden'}
                    </button>
                    <button 
                      onClick={() => handleDelete(review.id!)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1">
                  <p className="text-gray-700 dark:text-gray-300 text-sm italic leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 break-words">
                    "{review.comment}"
                  </p>
                </div>

                {review.adminReply && !replyingTo && (
                  <div className="mt-4 p-4 bg-teal/5 dark:bg-teal-900/10 rounded-xl border border-teal-100/50 dark:border-teal-800/30 relative">
                    <div className="text-[9px] font-black text-teal uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <CheckCircle className="h-2.5 w-2.5" /> Team Response
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 italic break-words">"{review.adminReply.text}"</p>
                    <div className="text-[9px] text-gray-400 mt-2 flex justify-between">
                      <span>— {review.adminReply.author}</span>
                      <span>{formatDate(review.adminReply.createdAt)}</span>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-50 dark:border-gray-800">
                  {replyingTo === review.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write a thoughtful response..."
                        className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-teal dark:focus:border-teal focus:ring-0 text-xs transition-all outline-none min-h-[100px]"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => setReplyingTo(null)}
                          className="px-3 py-2 text-[10px] font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => handleReply(review.id!)}
                          disabled={isSubmitting || !replyText.trim()}
                          className="flex items-center gap-2 px-4 py-2 bg-teal text-white text-[10px] font-black rounded-lg hover:bg-teal/90 disabled:opacity-50 transition-all shadow-lg shadow-teal/20"
                        >
                          {isSubmitting ? (
                            "Posting..."
                          ) : (
                            <>
                              <Send className="h-3 w-3" /> 
                              Post Response
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => {
                        setReplyingTo(review.id!);
                        setReplyText(review.adminReply?.text || "");
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-gray-300 text-[10px] font-black rounded-xl hover:bg-teal hover:text-white transition-all border border-slate-200 dark:border-slate-700 hover:border-teal"
                    >
                      <MessageSquare className="h-3 w-3" />
                      {review.adminReply ? "Edit Response" : "Respond to Customer"}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {reviews.length === 0 && (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
          <p className="text-gray-500">No reviews to manage yet.</p>
        </div>
      )}
    </div>
  );
};

export default AdminReviews;
