import { useState, useEffect } from 'react';
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  limit,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, uploadReviewMedia, db } from '@/lib/firebase';
import { type Review, COLLECTION_REVIEWS } from '@/models/Collections';

export function useReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      // 1. Upload media if any
      const mediaUrls: Array<{ url: string, type: 'image' | 'video' }> = [];
      for (const file of data.files) {
        const url = await uploadReviewMedia(file, auth.currentUser.uid);
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        mediaUrls.push({ url, type });
      }

      // 2. Direct Firestore write (No Cloud Function needed)
      const reviewData = {
        uid: auth.currentUser.uid,
        userName: data.userName || auth.currentUser.displayName || "Anonymous",
        rating: data.rating,
        comment: data.comment.trim(),
        media: mediaUrls,
        createdAt: serverTimestamp(),
        status: 'approved' // Set to approved by default for now
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

  return {
    reviews,
    loading,
    error,
    submitReview
  };
}
