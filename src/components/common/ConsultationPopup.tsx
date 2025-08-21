import { useEffect, useState } from 'react';

const ConsultationPopup = () => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Check if popup has already been shown in this session
    const hasPopupShown = sessionStorage.getItem('consultationPopupShown');
    
    if (!hasPopupShown) {
      // Set a timeout to show the popup after 60 seconds
      const timer = setTimeout(() => {
        setIsVisible(true);
        // Mark popup as shown for this session
        sessionStorage.setItem('consultationPopupShown', 'true');
      }, 60000); // 60 seconds
      
      // Clean up the timeout on component unmount
      return () => clearTimeout(timer);
    }
  }, []);
  
  const handleClose = () => {
    setIsVisible(false);
  };
  
  const handleBookNow = () => {
    // Close the popup
    setIsVisible(false);
    
    // Navigate to the contact page
    window.location.href = '/contact';
  };
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed top-8 right-8 z-50 max-w-md w-full animate-fade-in">
      {/* Modal */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-5 w-full">
        {/* Close button */}
        <button 
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        
        <h3 className="text-xl font-medium mb-3 text-gray-900 dark:text-white pr-6">
          Virtual Consultation
        </h3>
        
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Need expert help with your smart home setup? Book a free virtual consultation today.
        </p>
        
        <div className="flex gap-3">
          <button 
            onClick={handleBookNow} 
            className="btn-primary text-sm py-2 px-4"
          >
            Book Now
          </button>
          
          <button 
            onClick={handleClose} 
            className="btn-secondary text-sm py-2 px-4"
          >
            No Thanks
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConsultationPopup;
