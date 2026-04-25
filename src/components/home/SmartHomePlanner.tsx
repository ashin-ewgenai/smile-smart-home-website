import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { db, auth } from '../../lib/firebase';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import { plannerLeadDoc } from '../../models/Collections';
import emailjs from '@emailjs/browser';

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

const DEFAULT_FORM: FormData = {
  spaceType: '',
  roomCount: '',
  goals: [],
  existingDevices: '',
  deviceDetails: '',
  budget: '',
  email: ''
};

const STEP_COUNT = 6;
const DRAFT_KEY = 'smarthome_planner_draft_v1';
const EMAILJS_SERVICE_ID = 'service_fd3vtgc';
const EMAILJS_TEMPLATE_ID = 'template_d6hadva';
const EMAILJS_PUBLIC_KEY = 'R0tIXRXubwM-BqDDW';

const STEP_TITLES: Record<number, string> = {
  1: 'Space Type',
  2: 'Room Count',
  3: 'Automation Priorities',
  4: 'Existing Devices',
  5: 'Budget Range',
  6: 'Contact Email'
};

const SmartHomePlanner = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [emailSendState, setEmailSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailSendMessage, setEmailSendMessage] = useState('');
  const startTsRef = useRef<number>(Date.now());
  const restoreDoneRef = useRef(false);

  const handleNext = () => {
    if (currentStep < 7) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    }
  };

  const trackPlannerEvent = (name: string, details: Record<string, unknown> = {}) => {
    try {
      const payload = { event: name, ...details };
      const win = window as Window & { dataLayer?: unknown[] };
      if (Array.isArray(win.dataLayer)) win.dataLayer.push(payload);
      window.dispatchEvent(new CustomEvent('planner-analytics', { detail: payload }));
    } catch {}
  };

  useEffect(() => {
    if (restoreDoneRef.current) return;
    restoreDoneRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { formData?: FormData; currentStep?: number };
      if (parsed?.formData) {
        setFormData({ ...DEFAULT_FORM, ...parsed.formData });
      }
      if (parsed?.currentStep && parsed.currentStep >= 1 && parsed.currentStep <= STEP_COUNT) {
        setCurrentStep(parsed.currentStep);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (currentStep <= STEP_COUNT) {
      trackPlannerEvent('planner_step_view', { step: currentStep, stepName: STEP_TITLES[currentStep] });
    }
  }, [currentStep]);

  useEffect(() => {
    try {
      if (currentStep <= STEP_COUNT) {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            formData,
            currentStep,
            updatedAt: Date.now()
          })
        );
      }
    } catch {}
  }, [formData, currentStep]);

  const handleSpaceTypeChange = (type: SpaceType) => {
    setFormData({ ...formData, spaceType: type });
    trackPlannerEvent('planner_step_complete', { step: 1, value: type });
    handleNext();
  };

  const handleRoomCountChange = (count: RoomCount) => {
    setFormData({ ...formData, roomCount: count });
    trackPlannerEvent('planner_step_complete', { step: 2, value: count });
    handleNext();
  };

  const handleGoalToggle = (goal: Goal) => {
    const updatedGoals = formData.goals.includes(goal)
      ? formData.goals.filter((g) => g !== goal)
      : [...formData.goals, goal];
    setFormData({ ...formData, goals: updatedGoals });
  };

  const handleExistingDevicesChange = (value: DeviceOwnership) => {
    if (value === 'No') {
      setFormData({ ...formData, existingDevices: value, deviceDetails: '' });
      trackPlannerEvent('planner_step_complete', { step: 4, value: value });
      handleNext();
      return;
    }
    setFormData({ ...formData, existingDevices: value });
    trackPlannerEvent('planner_step_complete', { step: 4, value: value });
    handleNext();
  };

  const handleDeviceDetailsChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setFormData({ ...formData, deviceDetails: e.target.value });
  };

  const handleBudgetChange = (budget: Budget) => {
    setFormData({ ...formData, budget });
    trackPlannerEvent('planner_step_complete', { step: 5, value: budget });
    handleNext();
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, email: e.target.value });
    if (emailSendState !== 'idle') {
      setEmailSendState('idle');
      setEmailSendMessage('');
    }
  };

  const handleSubmit = () => {
    trackPlannerEvent('planner_step_complete', {
      step: 6,
      hasEmail: Boolean(formData.email?.trim())
    });
    trackPlannerEvent('planner_complete', {
      stepCount: STEP_COUNT,
      goalsCount: formData.goals.length
    });
    setCurrentStep(7);
  };

  const getComplexityRecommendation = (): string => {
    const { goals, roomCount, budget } = formData;
    if (goals.length > 3 && (roomCount === '6+' || budget === 'Premium')) return 'Advanced';
    if (goals.length > 1 && (roomCount === '3-5' || budget === 'Standard')) return 'Intermediate';
    return 'Basic';
  };

  const getEstimatedRange = (): string => {
    if (formData.budget === 'Basic') return 'INR 41,500 - INR 1,24,500';
    if (formData.budget === 'Standard') return 'INR 1,24,500 - INR 2,90,500';
    if (formData.budget === 'Premium') return 'INR 2,90,500+';
    return 'Custom estimate after consultation';
  };

  const getRecommendedAreas = (): string[] => {
    const recommendations: string[] = [];
    if (formData.goals.includes('Security')) recommendations.push('Smart cameras and door locks');
    if (formData.goals.includes('Lighting')) recommendations.push('Smart lighting system with motion sensors');
    if (formData.goals.includes('Energy')) recommendations.push('Smart thermostats and energy monitoring');
    if (formData.goals.includes('Entertainment')) recommendations.push('Integrated audio/video system');
    if (formData.goals.includes('Climate')) recommendations.push('Zoned climate control');
    if (formData.goals.includes('Convenience')) recommendations.push('Voice assistants and automated routines');
    return recommendations.length > 0 ? recommendations : ['Basic smart home starter kit'];
  };

  const getTopRecommendations = (): string[] => {
    const areas = getRecommendedAreas();
    return areas.slice(0, 3);
  };

  const getFitReason = (): string => {
    const space = formData.spaceType || 'space';
    const size = formData.roomCount ? `${formData.roomCount} rooms` : 'your room layout';
    const goalsCount = formData.goals.length;
    const deviceContext =
      formData.existingDevices === 'Yes'
        ? 'It also considers the devices you already own for smoother integration.'
        : 'It focuses on a clean setup from scratch for easier adoption.';
    return `This plan is tuned for a ${space.toLowerCase()} with ${size} and ${goalsCount || 1} main automation priority.${goalsCount > 1 ? ' It balances coverage and usability across multiple needs.' : ''} ${deviceContext}`;
  };

  const persistLeadIfNeeded = async () => {
    if (!formData.email || hasSavedPlan) return;
    try {
      const emailKey = formData.email.trim().toLowerCase();
      const complexity = getComplexityRecommendation();
      const areas = getRecommendedAreas();
      const top3 = getTopRecommendations();
      const elapsedSec = Math.max(1, Math.round((Date.now() - startTsRef.current) / 1000));
      const lines: string[] = [
        'Your Smart Home Plan',
        `Recommended Setup: ${complexity}`,
        `Estimated Range: ${getEstimatedRange()}`,
        '',
        'Top Recommendations:',
        ...top3.map((a) => `- ${a}`),
        '',
        'Recommended Automation Areas:',
        ...areas.map((a) => `- ${a}`),
        '',
        'Why This Fits:',
        getFitReason(),
        '',
        'Your Preferences:',
        `- Space Type: ${formData.spaceType}`,
        `- Size: ${formData.roomCount} rooms`,
        `- Budget Range: ${formData.budget}`
      ];
      if (formData.existingDevices === 'Yes' && formData.deviceDetails) {
        lines.push(`- Existing Devices: ${formData.deviceDetails}`);
      }
      const planText = lines.join('\n');

      await setDoc(
        plannerLeadDoc(db, emailKey),
        {
          email: emailKey,
          uid: auth.currentUser?.uid || '',
          source: 'smart_home_planner',
          planText,
          formData,
          complexity,
          estimatedRange: getEstimatedRange(),
          topRecommendations: top3,
          recommendationReason: getFitReason(),
          recommendedAreas: areas,
          completionStep: 7,
          selectedGoalsCount: formData.goals.length,
          timeSpentSec: elapsedSec,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          status: 'new'
        },
        { merge: true }
      );
      setHasSavedPlan(true);
    } catch (err) {
      console.error('Error saving plan to Firestore:', err);
    }
  };

  useEffect(() => {
    if (currentStep === 7) {
      void persistLeadIfNeeded();
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }
  }, [currentStep]);

  const handleBookConsultation = () => {
    trackPlannerEvent('planner_cta_click', { cta: 'book_consultation' });
    window.location.href = '/contact';
  };

  const buildEmailBody = (): string => {
    const top3 = getTopRecommendations();
    const areas = getRecommendedAreas();
    const lines = [
      'Hello,',
      '',
      'Here are my Smart Home Planner details:',
      '',
      `Recommended Setup Tier: ${getComplexityRecommendation()}`,
      `Estimated Investment: ${getEstimatedRange()}`,
      '',
      'Top Recommendations:',
      ...top3.map((item) => `- ${item}`),
      '',
      'Recommended Automation Areas:',
      ...areas.map((item) => `- ${item}`),
      '',
      'Why This Plan Fits:',
      getFitReason(),
      '',
      'My Inputs:',
      `- Space Type: ${formData.spaceType || '-'}`,
      `- Room Count: ${formData.roomCount || '-'}`,
      `- Goals: ${formData.goals.length ? formData.goals.join(', ') : '-'}`,
      `- Existing Devices: ${formData.existingDevices || '-'}`,
      ...(formData.existingDevices === 'Yes' && formData.deviceDetails ? [`- Device Details: ${formData.deviceDetails}`] : []),
      `- Budget: ${formData.budget || '-'}`,
      '',
      'Please contact me with the next steps.',
      ''
    ];
    return lines.join('\n');
  };

  const handleEmailPlan = async () => {
    const to = formData.email.trim();
    if (!to) {
      trackPlannerEvent('planner_cta_click', { cta: 'email_plan_missing_email' });
      setCurrentStep(6);
      return;
    }
    const planRef = `PLN-${Date.now().toString().slice(-6)}`;
    const goals = formData.goals.length ? formData.goals.join(', ') : 'None selected';
    const top3 = getTopRecommendations();
    const templateParams = {
      to_email: to,
      name: to.split('@')[0] || 'Customer',
      quote_id: planRef,
      total: getEstimatedRange(),
      template_id: 'planner_summary',
      template_name: 'Smart Home Planner Summary',
      space_type: formData.spaceType || '-',
      room_count: formData.roomCount || '-',
      goals,
      existing_devices: formData.existingDevices || '-',
      device_details: formData.deviceDetails || 'None provided',
      budget: formData.budget || '-',
      recommendation_tier: getComplexityRecommendation(),
      recommendation_reason: getFitReason(),
      top_recommendations: top3.join(', '),
      planner_summary: buildEmailBody().replace(/\n/g, '<br/>')
    };

    setEmailSendState('sending');
    setEmailSendMessage('');
    trackPlannerEvent('planner_cta_click', { cta: 'email_plan', provider: 'emailjs' });

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );
      setEmailSendState('sent');
      setEmailSendMessage(`Planner details sent to ${to}.`);
    } catch (error) {
      console.error('Planner email send failed:', error);
      setEmailSendState('error');
      setEmailSendMessage('We could not send the planner email right now. Please try again.');
    }
  };

  const handleStartOver = () => {
    setFormData(DEFAULT_FORM);
    setCurrentStep(1);
    setHasSavedPlan(false);
    startTsRef.current = Date.now();
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };

  const SummaryEditRow = ({ label, value, step }: { label: string; value: string; step: number }) => (
    <li className="flex items-start justify-between gap-3">
      <div className="text-sm text-gray-700 dark:text-gray-300">
        <span className="font-medium">{label}:</span> {value}
      </div>
      <button
        type="button"
        onClick={() => setCurrentStep(step)}
        className="text-xs text-teal hover:underline shrink-0"
      >
        Edit
      </button>
    </li>
  );

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
                  onClick={() => handleSpaceTypeChange(type)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.spaceType === type ? 'border-teal bg-teal/10 dark:bg-teal/20' : 'border-gray-200 dark:border-gray-700 hover:border-teal'
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
                  onClick={() => handleRoomCountChange(count)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.roomCount === count ? 'border-teal bg-teal/10 dark:bg-teal/20' : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{count} Rooms</div>
                </button>
              ))}
            </div>
            <div className="flex justify-start">
              <button onClick={handlePrevious} className="text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal">
                Back
              </button>
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
                    formData.goals.includes(goal) ? 'border-teal bg-teal/10 dark:bg-teal/20' : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{goal}</div>
                </button>
              ))}
            </div>
            {formData.goals.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Choose at least one priority to continue.</p>
            )}
            <div className="flex justify-between pt-2">
              <button onClick={handlePrevious} className="text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal">
                Back
              </button>
              <button
                onClick={() => {
                  trackPlannerEvent('planner_step_complete', { step: 3, value: formData.goals });
                  handleNext();
                }}
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
                  onClick={() => handleExistingDevicesChange(option)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.existingDevices === option ? 'border-teal bg-teal/10 dark:bg-teal/20' : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{option}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
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
                { label: 'Basic', range: 'INR 41,500 - INR 1,24,500' },
                { label: 'Standard', range: 'INR 1,24,500 - INR 2,90,500' },
                { label: 'Premium', range: 'INR 2,90,500+' }
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={() => handleBudgetChange(option.label as Budget)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.budget === option.label ? 'border-teal bg-teal/10 dark:bg-teal/20' : 'border-gray-200 dark:border-gray-700 hover:border-teal'
                  }`}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{option.range}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
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
              <p className="text-sm text-gray-600 dark:text-gray-400">Optional, but recommended so we can send your plan.</p>
            </div>
            <div className="flex justify-between pt-2">
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
        const top3 = getTopRecommendations();
        const recommendedAreas = getRecommendedAreas();

        return (
          <div className="space-y-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">Your Smart Home Plan</h3>

            <div className="bg-teal/10 dark:bg-teal/20 p-4 rounded-lg space-y-1">
              <h4 className="font-medium text-teal">Recommended Setup Tier: {complexity}</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">Estimated Investment: {getEstimatedRange()}</p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Top Recommendations:</h4>
              <ul className="space-y-2">
                {top3.map((item, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-teal mr-2">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Why This Plan Fits:</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{getFitReason()}</p>
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
              <ul className="space-y-2">
                <SummaryEditRow label="Space Type" value={formData.spaceType || '-'} step={1} />
                <SummaryEditRow label="Size" value={formData.roomCount ? `${formData.roomCount} rooms` : '-'} step={2} />
                <SummaryEditRow label="Goals" value={formData.goals.length ? formData.goals.join(', ') : '-'} step={3} />
                <SummaryEditRow label="Budget Range" value={formData.budget || '-'} step={5} />
                {formData.existingDevices === 'Yes' && formData.deviceDetails && (
                  <SummaryEditRow label="Existing Devices" value={formData.deviceDetails} step={4} />
                )}
              </ul>
            </div>

            <div className="pt-4 space-y-3">
              <button onClick={() => void handleEmailPlan()} disabled={emailSendState === 'sending'} className="btn-primary w-full disabled:opacity-70 disabled:cursor-not-allowed">
                {emailSendState === 'sending' ? 'Sending Plan...' : 'Email My Plan'}
              </button>
              <button
                onClick={handleBookConsultation}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg py-3 px-4 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Book a Consultation
              </button>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Typical installation starts within 3-7 days after final quote approval.
              </div>
              {emailSendState === 'sent' && (
                <div className="text-sm text-teal">{emailSendMessage}</div>
              )}
              {emailSendState === 'error' && (
                <div className="text-sm text-red-600 dark:text-red-400">{emailSendMessage}</div>
              )}
            </div>

            <div className="text-center pt-2">
              <button onClick={handleStartOver} className="text-sm text-gray-600 dark:text-gray-400 hover:text-teal dark:hover:text-teal">
                Start Over
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (currentStep === 4 && formData.existingDevices === 'Yes') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-6">
          <div className="flex justify-between mb-2 text-xs text-gray-600 dark:text-gray-400">
            <span>Step 4 of 6 - Existing Devices</span>
            <span>Details</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-teal h-2 rounded-full transition-all duration-300" style={{ width: `${(4 / STEP_COUNT) * 100}%` }}></div>
          </div>
        </div>
        <div className="space-y-6">
          <h3 className="text-xl font-medium text-gray-900 dark:text-white">Tell us about your existing devices</h3>
          <textarea
            value={formData.deviceDetails}
            onChange={handleDeviceDetailsChange}
            placeholder="List any smart devices you already own (e.g., smart speakers, thermostats, lights, etc.)"
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal focus:border-transparent dark:bg-gray-800 dark:text-white"
          />
          <div className="flex justify-between pt-2">
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
      {currentStep <= STEP_COUNT && (
        <div className="mb-6">
          <div className="flex justify-between mb-2 text-xs text-gray-600 dark:text-gray-400">
            <span>{`Step ${currentStep} of ${STEP_COUNT} - ${STEP_TITLES[currentStep]}`}</span>
            <span>Complete</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-teal h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / STEP_COUNT) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {renderStep()}
    </div>
  );
};

export default SmartHomePlanner;
