import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTION_REVIEWS, type Review } from '@/models/Collections';
import { Star, Trash2, CheckCircle, Clock, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AdminReviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customer Reviews</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Total Reviews: {reviews.length}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Rating</th>
                <th className="px-6 py-4">Comment</th>
                <th className="px-6 py-4">Media</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <AnimatePresence>
                {reviews.map((review) => (
                  <motion.tr 
                    key={review.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900 dark:text-white">{review.userName}</div>
                      <div className="text-xs text-gray-500 font-mono">{review.uid?.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`h-3 w-3 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} 
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{review.comment}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {review.media && review.media.length > 0 ? (
                        <div className="flex -space-x-2">
                          {review.media.map((m, i) => (
                            <a 
                              key={i} 
                              href={m.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="h-8 w-8 rounded-full border-2 border-white dark:border-gray-900 bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:scale-110 transition-transform"
                              title={`View ${m.type}`}
                            >
                              <ImageIcon className="h-4 w-4 text-gray-500" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button 
                        onClick={() => toggleStatus(review.id!, review.status || 'approved')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          review.status === 'approved' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}
                      >
                        {review.status === 'approved' ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {review.status === 'approved' ? 'Approved' : 'Pending'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button 
                        onClick={() => handleDelete(review.id!)}
                        className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Delete Review"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {reviews.length === 0 && (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400 italic">
              No reviews found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminReviews;
