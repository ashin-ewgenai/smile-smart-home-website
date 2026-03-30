/**
 * useQuoteRequest — handles the "Plan this space" CTA from the Interactive Floorplan Tour.
 *
 * Writes to `contactRequests` — this collection already allows public writes
 * in the existing Firestore rules (no auth required, no deployment needed).
 * The admin sees submissions in the Contact Submissions section.
 */
import { collection, addDoc, serverTimestamp, getFirestore } from 'firebase/firestore';

export type SpaceType = 'home' | 'office' | 'apartment';

export interface SpaceRequestPayload {
  email: string;
  spaceType: SpaceType;
  roomTitle: string;
  roomDescription: string;
  roomTags: string[];
}

export async function submitSpaceRequest(payload: SpaceRequestPayload): Promise<void> {
  const db = getFirestore();

  const spaceLabel: Record<SpaceType, string> = {
    home: 'Home',
    office: 'Office',
    apartment: 'Apartment',
  };

  // contactRequests allows public addDoc with these exact fields
  await addDoc(collection(db, 'contactRequests'), {
    fullName: '',
    email: payload.email.toLowerCase().trim(),
    phone: '',
    message: `[Floorplan Request — ${spaceLabel[payload.spaceType]}] ${payload.roomTitle}: ${payload.roomDescription} | Features: ${payload.roomTags.join(', ')}`,
    service: payload.roomTitle,
    status: 'new',
    createdAt: serverTimestamp(),
  });
}

/** Legacy scroll helper — kept for other CTAs */
export function useQuoteRequest() {
  const requestQuote = (spaceType?: SpaceType) => {
    if (typeof window !== 'undefined') {
      const plannerEl = document.getElementById('planner');
      if (plannerEl) {
        if (spaceType) {
          const url = new URL(window.location.href);
          url.searchParams.set('space', spaceType);
          window.history.replaceState({}, '', url.toString());
        }
        plannerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };
  return { requestQuote };
}
