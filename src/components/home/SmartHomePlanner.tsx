import { useState } from 'react';

type SpaceType = 'Home' | 'Apartment' | 'Office' | '';
type RoomCount = '1-2' | '3-5' | '6+' | '';
type Goal = 'Lighting' | 'Security' | 'Energy' | 'Entertainment' | 'Climate' | 'Convenience';
type Budget = 'Basic' | 'Standard' | 'Premium' | '';
type DeviceOwnership = 'Yes' | 'No' | '';

interface FormData {
  spaceType: SpaceType;
  roomCount: RoomCount;
  goals: Goal[];
  existingDevices: DeviceOwnership;
  deviceDetails: string;
  budget: Budget;
  email: string;
}

const SmartHomePlanner = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    spaceType: '',
    roomCount: '',
    goals: [],
    existingDevices: '',
    deviceDetails: '',
    budget: '',
    email: ''
  });
  
  const totalSteps = 7; // Including summary step
  
  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleSpaceTypeChange = (type: SpaceType) => {
    setFormData({ ...formData, spaceType: type });
  };
  
  const handleRoomCountChange = (count: RoomCount) => {
    setFormData({ ...formData, roomCount: count });
  };
  
  const handleGoalToggle = (goal: Goal) => {
    const updatedGoals = formData.goals.includes(goal)
      ? formData.goals.filter(g => g !== goal)
      : [...formData.goals, goal];
    
    setFormData({ ...formData, goals: updatedGoals });
  };
  
  const handleExistingDevicesChange = (value: DeviceOwnership) => {
    setFormData({ ...formData, existingDevices: value });
  };
  
  const handleDeviceDetailsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData({ ...formData, deviceDetails: e.target.value });
  };
  
  const handleBudgetChange = (budget: Budget) => {
    setFormData({ ...formData, budget: budget });
  };
  
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, email: e.target.value });
  };
  
  const handleSubmit = async () => {
    // Optional: Send data to backend if email is provided
    if (formData.email) {
      try {
        // This is a placeholder for an actual API call
        console.log('Submitting plan data:', formData);
        // You would typically have an API endpoint to handle this
        // await fetch('/api/submit-plan', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(formData)
        // });
      } catch (error) {
        console.error('Error submitting plan:', error);
      }
    }
    
    // Move to summary step regardless of submission
    setCurrentStep(totalSteps);
  };
  
  const handleBookConsultation = () => {
    // Navigate to contact page
    window.location.href = '/contact';
  };
  
  // Helper function to determine recommended setup complexity
  const getComplexityRecommendation = (): string => {
    const { goals, roomCount, budget } = formData;
    
    if (goals.length > 3 && (roomCount === '6+' || budget === 'Premium')) {
      return 'Advanced';
    } else if (goals.length > 1 && (roomCount === '3-5' || budget === 'Standard')) {
      return 'Intermediate';
    } else {
      return 'Basic';
    }
  };
  
  // Helper function to get recommended areas based on goals
  const getRecommendedAreas = (): string[] => {
    const recommendations: string[] = [];
    
    if (formData.goals.includes('Security')) {
      recommendations.push('Smart cameras and door locks');
    }
    
    if (formData.goals.includes('Lighting')) {
      recommendations.push('Smart lighting system with motion sensors');
    }
    
    if (formData.goals.includes('Energy')) {
      recommendations.push('Smart thermostats and energy monitoring');
    }
    
    if (formData.goals.includes('Entertainment')) {
      recommendations.push('Integrated audio/video system');
    }
    
    if (formData.goals.includes('Climate')) {
      recommendations.push('Zoned climate control');
    }
    
    if (formData.goals.includes('Convenience')) {
      recommendations.push('Voice assistants and automated routines');
    }
    
    return recommendations.length > 0 ? recommendations : ['Basic smart home starter kit'];
  };
  
  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">What type of space do you want to automate?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['Home', 'Apartment', 'Office'] as SpaceType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    handleSpaceTypeChange(type);
                    handleNext();
                  }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.spaceType === type
                      ? 'border-teal bg-teal/10 dark:bg-teal/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{type}</div>
                </button>
              ))}
            </div>
          </div>
        );
        
      case 2:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">How many rooms do you have?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['1-2', '3-5', '6+'] as RoomCount[]).map((count) => (
                <button
                  key={count}
                  onClick={() => {
                    handleRoomCountChange(count);
                    handleNext();
                  }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.roomCount === count
                      ? 'border-teal bg-teal/10 dark:bg-teal/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{count} Rooms</div>
                </button>
              ))}
            </div>
          </div>
        );
        
      case 3:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">What are your primary automation goals?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Select all that apply</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {(['Lighting', 'Security', 'Energy', 'Entertainment', 'Climate', 'Convenience'] as Goal[]).map((goal) => (
                <button
                  key={goal}
                  onClick={() => handleGoalToggle(goal)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.goals.includes(goal)
                      ? 'border-teal bg-teal/10 dark:bg-teal/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{goal}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={handlePrevious} className="text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal">
                Back
              </button>
              <button 
                onClick={handleNext} 
                className="btn-primary text-sm py-2 px-4"
                disabled={formData.goals.length === 0}
              >
                Next
              </button>
            </div>
          </div>
        );
        
      case 4:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">Do you already have smart devices?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['Yes', 'No'] as DeviceOwnership[]).map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    handleExistingDevicesChange(option);
                    if (option === 'No') {
                      setFormData({ ...formData, existingDevices: option, deviceDetails: '' });
                      handleNext();
                    } else {
                      handleNext();
                    }
                  }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.existingDevices === option
                      ? 'border-teal bg-teal/10 dark:bg-teal/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{option}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={handlePrevious} className="text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal">
                Back
              </button>
            </div>
          </div>
        );
        
      case 5:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">What's your budget range?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Basic', range: '$500 - $1,500' },
                { label: 'Standard', range: '$1,500 - $3,500' },
                { label: 'Premium', range: '$3,500+' }
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={() => {
                    handleBudgetChange(option.label as Budget);
                    handleNext();
                  }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.budget === option.label
                      ? 'border-teal bg-teal/10 dark:bg-teal/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{option.range}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={handlePrevious} className="text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal">
                Back
              </button>
            </div>
          </div>
        );
        
      case 6:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">Want to receive your plan by email? (Optional)</h3>
            <div className="space-y-4">
              <input
                type="email"
                placeholder="your.email@example.com"
                value={formData.email}
                onChange={handleEmailChange}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This is optional. We'll send your personalized plan to this email.
              </p>
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={handlePrevious} className="text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal">
                Back
              </button>
              <button onClick={handleSubmit} className="btn-primary text-sm py-2 px-4">
                View My Plan
              </button>
            </div>
          </div>
        );
        
      case 7:
        const complexity = getComplexityRecommendation();
        const recommendedAreas = getRecommendedAreas();
        
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">Your Smart Home Plan</h3>
            
            <div className="bg-teal/10 dark:bg-teal/20 p-4 rounded-lg">
              <h4 className="font-medium text-teal">Recommended Setup: {complexity}</h4>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Recommended Automation Areas:</h4>
              <ul className="space-y-2">
                {recommendedAreas.map((area, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-teal mr-2">✓</span>
                    <span>{area}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Your Preferences:</h4>
              <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                <li><span className="font-medium">Space Type:</span> {formData.spaceType}</li>
                <li><span className="font-medium">Size:</span> {formData.roomCount} rooms</li>
                <li><span className="font-medium">Budget Range:</span> {formData.budget}</li>
                {formData.existingDevices === 'Yes' && formData.deviceDetails && (
                  <li><span className="font-medium">Existing Devices:</span> {formData.deviceDetails}</li>
                )}
              </ul>
            </div>
            
            <div className="pt-6">
              <p className="mb-4 text-gray-700 dark:text-gray-300">
                Ready to bring this plan to life? Book a free virtual consultation with our smart home experts.
              </p>
              <button onClick={handleBookConsultation} className="btn-primary w-full">
                Book a Virtual Consultation
              </button>
            </div>
            
            <div className="text-center pt-4">
              <button 
                onClick={() => setCurrentStep(1)} 
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal"
              >
                Start Over
              </button>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  // If we're on step 4 (device details) and user selected "Yes" to having existing devices
  if (currentStep === 4 && formData.existingDevices === 'Yes') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="space-y-6">
          <h3 className="text-xl font-medium text-gray-900 dark:text-white">Tell us about your existing devices</h3>
          <textarea
            value={formData.deviceDetails}
            onChange={handleDeviceDetailsChange}
            placeholder="List any smart devices you already own (e.g., smart speakers, thermostats, lights, etc.)"
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal focus:border-transparent dark:bg-gray-800 dark:text-white"
          />
          <div className="flex justify-between pt-4">
            <button onClick={handlePrevious} className="text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal">
              Back
            </button>
            <button onClick={handleNext} className="btn-primary text-sm py-2 px-4">
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      {/* Progress indicator */}
      {currentStep < totalSteps && (
        <div className="mb-6">
          <div className="flex justify-between mb-2 text-xs text-gray-600 dark:text-gray-400">
            <span>Start</span>
            <span>Complete</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-teal h-2 rounded-full transition-all duration-300" 
              style={{ width: `${(currentStep / (totalSteps - 1)) * 100}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {/* Step content */}
      {renderStep()}
    </div>
  );
};

export default SmartHomePlanner;
