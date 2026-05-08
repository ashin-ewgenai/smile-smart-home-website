import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  limit, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  arrayUnion, 
  arrayRemove 
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db, uploadReviewMedia } from '@/lib/firebase';
import { type Review, COLLECTION_REVIEWS } from '@/models/Collections';

export type SortOrder = 'latest' | 'mostLiked' | 'highestRated' | 'lowestRated';

interface ReviewsContextType {
  reviews: Review[];
  loading: boolean;
  error: string | null;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  reviewsLimit: number;
  setReviewsLimit: (limit: number | ((prev: number) => number)) => void;
  hasMoreReviews: boolean;
  toggleLike: (reviewId: string) => Promise<void>;
  submitReview: (data: { rating: number; comment: string; files: File[] }) => Promise<void>;
  postAdminReply: (reviewId: string, text: string) => Promise<void>;
  isAdmin: boolean;
  currentUser: User | null;
}

const ReviewsContext = createContext<ReviewsContextType | undefined>(undefined);

export const useReviewsContext = () => {
  const context = useContext(ReviewsContext);
  return context;
};

export const ReviewsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [reviewsLimit, setReviewsLimit] = useState(5);
  const [hasMoreReviews, setHasMoreReviews] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isAdmin, setIsAdmin] = useState(false);
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());

  // Track auth state and admin role
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
      
      if (u) {
        // Simple check for admin role - in a real app, this might come from custom claims
        // or a dedicated 'Admins' collection. Here we match existing logic.
        const userRole = localStorage.getItem('userRole');
        if (userRole) {
          const roleNorm = userRole.toLowerCase().replace(/[_-]+/g, ' ').trim();
          setIsAdmin(roleNorm === 'admin' || roleNorm === 'super admin');
        }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listener with sorting and pagination
  useEffect(() => {
    setLoading(true);
    setError(null);

    let orderedQuery;
    const base = collection(db, COLLECTION_REVIEWS);

    const sortField = sortOrder === 'mostLiked' ? 'likes' : 
                     sortOrder === 'highestRated' ? 'rating' : 
                     sortOrder === 'lowestRated' ? 'rating' : 'createdAt';
    
    const sortDir = sortOrder === 'lowestRated' ? 'asc' : 'desc';

    orderedQuery = query(base, orderBy(sortField, sortDir as any), limit(reviewsLimit + 1));

    const unsub = onSnapshot(
      orderedQuery,
      (snapshot) => {
        const uid = auth.currentUser?.uid ?? null;
        const docs = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            isLiked: uid ? (Array.isArray(data.likedBy) && data.likedBy.includes(uid)) : false,
          } as Review;
        });

        setHasMoreReviews(docs.length > reviewsLimit);
        setReviews(docs.slice(0, reviewsLimit));
        setLoading(false);
      },
      (err) => {
        console.error('[ReviewsContext] snapshot error:', err);
        setError('Failed to load reviews.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [sortOrder, reviewsLimit]);

  // Like / Unlike functionality
  const toggleLike = useCallback(async (reviewId: string) => {
    if (!currentUser) {
      alert('Please log in to like reviews.');
      return;
    }
    if (likingIds.has(reviewId)) return;

    const uid = currentUser.uid;
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) return;

    const isCurrentlyLiked = review.isLiked ?? false;
    const newLikes = isCurrentlyLiked
      ? Math.max(0, (review.likes ?? 0) - 1)
      : (review.likes ?? 0) + 1;

    // Optimistic update
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, likes: newLikes, isLiked: !isCurrentlyLiked } : r
      )
    );

    setLikingIds((s) => new Set(s).add(reviewId));
    try {
      await updateDoc(doc(db, COLLECTION_REVIEWS, reviewId), {
        likes: newLikes,
        likedBy: isCurrentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      });
    } catch (err) {
      console.error('[ReviewsContext] toggleLike error:', err);
      // Rollback
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, likes: review.likes ?? 0, isLiked: isCurrentlyLiked }
            : r
        )
      );
    } finally {
      setLikingIds((s) => {
        const next = new Set(s);
        next.delete(reviewId);
        return next;
      });
    }
  }, [currentUser, reviews, likingIds]);

  // Submit review functionality
  const submitReview = useCallback(async (data: { rating: number; comment: string; files: File[] }) => {
    if (!auth.currentUser) {
      throw new Error('You must be logged in to submit a review.');
    }

    const media: Array<{ url: string; type: 'image' | 'video' }> = [];
    for (const file of data.files) {
      const url = await uploadReviewMedia(file, auth.currentUser.uid);
      media.push({ url, type: file.type.startsWith('video/') ? 'video' : 'image' });
    }

    const payload = {
      uid: auth.currentUser.uid,
      userName: auth.currentUser.displayName || 'Anonymous',
      rating: data.rating,
      comment: data.comment.trim(),
      media,
      createdAt: serverTimestamp(),
      status: 'approved',
      likes: 0,
      likedBy: [],
    };

    await addDoc(collection(db, COLLECTION_REVIEWS), payload);
  }, []);

  // Post Admin Reply functionality
  const postAdminReply = useCallback(async (reviewId: string, text: string) => {
    if (!isAdmin || !currentUser) {
      throw new Error('Unauthorized: Admin access required.');
    }

    const reviewRef = doc(db, COLLECTION_REVIEWS, reviewId);
    const replyData = {
      text,
      createdAt: serverTimestamp(),
      author: currentUser.displayName || 'Admin',
      authorId: currentUser.uid
    };

    await updateDoc(reviewRef, { adminReply: replyData });
  }, [isAdmin, currentUser]);

  return (
    <ReviewsContext.Provider value={{
      reviews,
      loading,
      error,
      sortOrder,
      setSortOrder,
      reviewsLimit,
      setReviewsLimit,
      hasMoreReviews,
      toggleLike,
      submitReview,
      postAdminReply,
      isAdmin,
      currentUser
    }}>
      {children}
    </ReviewsContext.Provider>
  );
};
