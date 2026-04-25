export interface Project {
  id: string;
  title: string;
  category: 'Security' | 'Lighting' | 'Entertainment' | 'Climate' | 'Full Automation';
  description: string;
  location: string;
  mainImage: string;
  nightImage?: string;
  videoUrl?: string;
  stats: { label: string; value: string }[];
  techSpecs: string[];
}

const projects: Project[] = [
  {
    id: '1',
    title: 'Smart Home Security',
    category: 'Security',
    description: 'Advanced security systems with AI motion detection and 24/7 monitoring.',
    location: 'Miami, FL',
    mainImage: 'https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg?auto=compress&cs=tinysrgb&w=1200',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-security-camera-moving-and-filming-41315-large.mp4',
    stats: [
      { label: 'Coverage', value: '100%' },
      { label: 'Alerts', value: 'Instant' }
    ],
    techSpecs: ['AI Motion Detection', 'Smart Locks', 'Biometric Entry', 'Remote Access']
  },
  {
    id: '2',
    title: 'Whole Home Audio',
    category: 'Entertainment',
    description: 'Crystal clear sound in every room with integrated multi-zone audio control.',
    location: 'Austin, TX',
    mainImage: 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [
      { label: 'Zones', value: '8+' },
      { label: 'Quality', value: 'Lossless' }
    ],
    techSpecs: ['Sonos Integration', 'In-ceiling Speakers', 'Multi-room Sync', 'Voice Control']
  },
  {
    id: '3',
    title: 'Smart Lighting',
    category: 'Lighting',
    description: 'Atmospheric lighting with smart control and energy-efficient automation.',
    location: 'New York, NY',
    mainImage: 'https://images.pexels.com/photos/1571468/pexels-photo-1571468.jpeg?auto=compress&cs=tinysrgb&w=1200',
    nightImage: 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [
      { label: 'Efficiency', value: '+40%' },
      { label: 'Scenes', value: 'Unlimited' }
    ],
    techSpecs: ['Lutron Control', 'RGBW Support', 'Astronomical Clock', 'Occupancy Sensors']
  },
  {
    id: '4',
    title: 'Climate Control',
    category: 'Climate',
    description: 'Perfect temperature management with intelligent zoning and air quality monitoring.',
    location: 'Chicago, IL',
    mainImage: 'https://images.pexels.com/photos/1643383/pexels-photo-1643383.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [
      { label: 'Zones', value: '4' },
      { label: 'Savings', value: '25%' }
    ],
    techSpecs: ['Nest Pro', 'Humidifier Control', 'Air Purification', 'Remote Monitoring']
  },
  {
    id: '5',
    title: 'Energy Management',
    category: 'Full Automation',
    description: 'Save energy with smart monitoring and automated solar harvesting.',
    location: 'Seattle, WA',
    mainImage: 'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [
      { label: 'Power Save', value: '35%' },
      { label: 'Reliability', value: '99.9%' }
    ],
    techSpecs: ['Solar Tracking', 'Smart Grid', 'Battery Backup', 'Usage Analysis']
  },
  {
    id: '6',
    title: 'Home Cinema',
    category: 'Entertainment',
    description: 'The ultimate theater experience with 4K projection and immersive Dolby Atmos.',
    location: 'Los Angeles, CA',
    mainImage: 'https://images.pexels.com/photos/4352247/pexels-photo-4352247.jpeg?auto=compress&cs=tinysrgb&w=1200',
    stats: [
      { label: 'Audio', value: '9.2.4' },
      { label: 'Visual', value: '8K Ready' }
    ],
    techSpecs: ['Laser Projection', 'Acoustic Panels', 'Automated Seating', 'Control4 UI']
  }
];

export default projects;
