import { useState, useEffect, useCallback } from 'react';
import { 
  getFirestore, 
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
  arrayRemove,
  increment
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, uploadReviewMedia, db } from '@/lib/firebase';
import { type Review, COLLECTION_REVIEWS } from '@/models/Collections';

export function useReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin role
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // 1. Try localStorage (fastest)
        const userRole = localStorage.getItem('userRole');
        if (userRole) {
          const roleNorm = userRole.toLowerCase().replace(/[_-]+/g, ' ').trim();
          if (roleNorm === 'admin' || roleNorm === 'super admin') {
            setIsAdmin(true);
            return;
          }
        }

        // 2. Fallback: Check Firestore Accounts collection
        try {
          const { getFirestore, doc, getDoc } = await import('firebase/firestore');
          const accountDoc = await getDoc(doc(db, 'Accounts', u.uid));
          if (accountDoc.exists()) {
            const data = accountDoc.data();
            const roleNorm = (data.Role || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
            setIsAdmin(roleNorm === 'admin' || roleNorm === 'super admin');
          }
        } catch (err) {
          console.error("Error checking admin role in Firestore:", err);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  // Fetch reviews (real-time)
  useEffect(() => {
    const q = query(
      collection(db, COLLECTION_REVIEWS),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Review[];
      setReviews(docs);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching reviews:", err);
      setError("Failed to load reviews.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const submitReview = async (data: {
    rating: number;
    comment: string;
    files: File[];
    userName?: string;
  }) => {
    if (!auth.currentUser) {
      throw new Error("You must be logged in to submit a review.");
    }

    setLoading(true);
    setError(null);
    try {
      const mediaUrls: Array<{ url: string, type: 'image' | 'video' }> = [];
      for (const file of data.files) {
        const url = await uploadReviewMedia(file, auth.currentUser.uid);
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        mediaUrls.push({ url, type });
      }

      const reviewData = {
        uid: auth.currentUser.uid,
        userName: data.userName || auth.currentUser.displayName || "Anonymous",
        rating: data.rating,
        comment: data.comment.trim(),
        media: mediaUrls,
        createdAt: serverTimestamp(),
        status: 'approved',
        likes: 0,
        likedBy: []
      };

      const docRef = await addDoc(collection(db, COLLECTION_REVIEWS), reviewData);
      
      setLoading(false);
      return { status: "ok", id: docRef.id };
    } catch (err: any) {
      console.error("Error submitting review:", err);
      setError(err.message || "Failed to submit review.");
      setLoading(false);
      throw err;
    }
  };

  const toggleLike = async (reviewId: string) => {
    if (!auth.currentUser) {
      alert("Please log in to like reviews.");
      return;
    }

    const uid = auth.currentUser.uid;
    const review = reviews.find(r => r.id === reviewId);
    if (!review) return;

    const isCurrentlyLiked = Array.isArray(review.likedBy) && review.likedBy.includes(uid);
    const newLikes = isCurrentlyLiked 
      ? Math.max(0, (review.likes || 0) - 1)
      : (review.likes || 0) + 1;

    // Optimistic Update
    setReviews(prev => prev.map(r => 
      r.id === reviewId 
        ? { 
            ...r, 
            likes: newLikes, 
            likedBy: isCurrentlyLiked 
              ? (r.likedBy || []).filter(id => id !== uid)
              : [...(r.likedBy || []), uid]
          } 
        : r
    ));

    // Perform Atomic Firestore Update
    try {
      await updateDoc(doc(db, COLLECTION_REVIEWS, reviewId), {
        likes: isCurrentlyLiked ? increment(-1) : increment(1),
        likedBy: isCurrentlyLiked ? arrayRemove(uid) : arrayUnion(uid)
      });
    } catch (err: any) {
      console.error("Error toggling like in Firestore:", err);
      // Revert optimistic update on error
      setReviews(prev => prev.map(r => 
        r.id === reviewId 
          ? { 
              ...r, 
              likes: isCurrentlyLiked ? (r.likes || 0) + 1 : Math.max(0, (r.likes || 0) - 1), 
              likedBy: isCurrentlyLiked 
                ? [...(r.likedBy || []), uid]
                : (r.likedBy || []).filter(id => id !== uid)
            } 
          : r
      ));
      setError("Failed to sync like with server.");
    }
  };

  const postAdminReply = async (reviewId: string, text: string) => {
    if (!isAdmin || !auth.currentUser) {
      throw new Error("Unauthorized: Admin access required.");
    }

    try {
      await updateDoc(doc(db, COLLECTION_REVIEWS, reviewId), {
        adminReply: {
          text: text.trim(),
          author: auth.currentUser.displayName || "Admin",
          createdAt: serverTimestamp()
        }
      });
    } catch (err) {
      console.error("Error posting admin reply:", err);
      throw err;
    }
  };

  return {
    reviews,
    loading,
    error,
    isAdmin,
    submitReview,
    toggleLike,
    postAdminReply
  };
}
