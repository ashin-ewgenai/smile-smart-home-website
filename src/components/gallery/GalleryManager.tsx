import React, { useState, useMemo } from 'react';
import ProjectCard from './ProjectCard';
import ProjectLightbox from './ProjectLightbox';

// Hardcoded data within component for maximum stability
const projects = [
  {
    id: '1',
    title: 'Smart Lighting System',
    category: 'Lighting',
    description: 'Automated lighting with voice control and scheduling for a modern family home.',
    location: 'Suburban Home, California',
    mainImage: 'https://images.pexels.com/photos/1571468/pexels-photo-1571468.jpeg?auto=compress&cs=tinysrgb&w=1200',
    nightImage: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-modern-apartment-with-smart-home-system-41312-large.mp4',
    stats: [{ label: 'Efficiency', value: '+40%' }, { label: 'Coverage', value: '100%' }],
    techSpecs: ['Lutron Control', 'RGBW Support', 'Voice Activation', 'Smart Scheduling']
  },
  {
    id: '2',
    title: 'Security Camera Network',
    category: 'Security',
    description: 'Complete perimeter security with HD cameras and mobile monitoring.',
    location: 'Downtown Apartment, Texas',
    mainImage: 'https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg?auto=compress&cs=tinysrgb&w=1200',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-security-camera-moving-and-filming-41315-large.mp4',
    stats: [{ label: 'Coverage', value: '100%' }, { label: 'Alerts', value: 'Instant' }],
    techSpecs: ['AI Motion Detection', 'Smart Locks', 'Biometric Entry', 'Remote Access']
  },
  {
    id: '3',
    title: 'Climate Control System',
    category: 'Climate',
    description: 'Smart thermostats with zone control for optimal comfort and efficiency.',
    location: 'Family Home, Florida',
    mainImage: 'https://images.pexels.com/photos/1643383/pexels-photo-1643383.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [{ label: 'Savings', value: '25%' }, { label: 'Zones', value: '4' }],
    techSpecs: ['Nest Pro', 'Humidifier Control', 'Air Purification', 'Remote Monitoring']
  },
  {
    id: '4',
    title: 'Entertainment Hub',
    category: 'Entertainment',
    description: 'Multi-room audio system with smart TV integration and streaming setup.',
    location: 'Urban Loft, Colorado',
    mainImage: 'https://images.pexels.com/photos/4352247/pexels-photo-4352247.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [{ label: 'Zones', value: '4' }, { label: 'Audio', value: 'Lossless' }],
    techSpecs: ['Sonos Integration', 'In-ceiling Speakers', 'Multi-room Sync', 'Voice Control']
  },
  {
    id: '5',
    title: 'Smart Access Control',
    category: 'Security',
    description: 'Keyless entry system with remote access and visitor management.',
    location: 'Modern Villa, Nevada',
    mainImage: 'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [{ label: 'Reliability', value: '99.9%' }, { label: 'Security', value: 'Level 5' }],
    techSpecs: ['Keyless Entry', 'Visitor Logs', 'Remote Unlock', 'Encrypted Hub']
  },
  {
    id: '6',
    title: 'Complete Home Automation',
    category: 'Full Automation',
    description: 'Full smart home integration with unified control and automation.',
    location: 'Luxury Estate, Arizona',
    mainImage: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [{ label: 'Reliability', value: '99.9%' }, { label: 'Satisfaction', value: '100%' }],
    techSpecs: ['Unified Control4 App', 'Smart Scenes', 'Voice Command', 'Remote Access']
  }
];

const categories = ['All', 'Security', 'Lighting', 'Entertainment', 'Climate', 'Full Automation'] as const;

const GalleryManager: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<typeof categories[number]>('All');
  const [selectedProject, setSelectedProject] = useState<any | null>(null);

  const filtered = useMemo(() => {
    if (activeCategory === 'All') return projects;
    return projects.filter(p => p.category === activeCategory);
  }, [activeCategory]);

  return (
    <div className="space-y-12 py-10">
      {/* Category Filter */}
      <div className="flex flex-wrap justify-center gap-3">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 border ${
              activeCategory === category
                ? 'bg-teal text-white border-teal shadow-lg'
                : 'bg-charcoal/5 dark:bg-gray-800/50 text-charcoal dark:text-white border-charcoal/10 hover:border-teal/50'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Project Grid */}
      <div className="min-h-[600px] relative">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map((project) => (
            <div key={project.id}>
              <ProjectCard 
                project={project as any} 
                onClick={() => setSelectedProject(project)} 
              />
            </div>
          ))}
        </div>
        
        {filtered.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 italic">
            No projects found in this category.
          </div>
        )}
      </div>

      {/* Project Lightbox Modal */}
      {selectedProject && (
        <ProjectLightbox 
          project={selectedProject} 
          onClose={() => setSelectedProject(null)} 
        />
      )}
    </div>
  );
};

export default GalleryManager;
