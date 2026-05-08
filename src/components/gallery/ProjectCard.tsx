import React, { useState, useRef } from 'react';

interface Project {
  id: string;
  title: string;
  category: string;
  description: string;
  location: string;
  mainImage: string;
  nightImage?: string;
  videoUrl?: string;
  stats: { label: string; value: string }[];
  techSpecs: string[];
}

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  const [isNight, setIsNight] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div 
      className="group relative rounded-2xl overflow-hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-white/20 shadow-lg hover:shadow-2xl transition-all duration-500 h-full flex flex-col cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {/* Image/Video Container */}
      <div className="relative h-64 overflow-hidden bg-gray-200 dark:bg-gray-800">
        <img 
          src={isNight && project.nightImage ? project.nightImage : project.mainImage}
          alt={project.title}
          className={`w-full h-full object-cover transition-all duration-700 ${isHovered && project.videoUrl ? 'opacity-30 scale-110' : 'opacity-100 scale-100'}`}
        />

        {project.videoUrl && (
          <video
            ref={videoRef}
            src={project.videoUrl}
            muted
            loop
            playsInline
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 pointer-events-none ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {project.nightImage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsNight(!isNight);
            }}
            className="absolute top-4 left-4 p-2 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/60 transition-colors z-20 flex items-center justify-center w-10 h-10"
          >
            {isNight ? '☀️' : '🌙'}
          </button>
        )}

        <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-teal/90 backdrop-blur-sm text-white text-xs font-bold shadow-lg z-20">
          {project.category}
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col relative">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-charcoal dark:text-white mb-1 group-hover:text-teal transition-colors">
            {project.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
            <span className="mr-2">📍</span>
            {project.location}
          </p>
        </div>

        <p className="text-gray-600 dark:text-gray-300 text-sm line-clamp-2 mb-6 flex-1">
          {project.description}
        </p>

        {/* Specs Overlay */}
        <div className={`absolute inset-0 bg-teal/95 backdrop-blur-md p-6 flex flex-col justify-center transition-all duration-500 z-30 ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          <h4 className="text-white font-bold mb-4 flex items-center gap-2">
            <span>⚙️</span> Technical Specs
          </h4>
          <ul className="space-y-2">
            {project.techSpecs.map((spec, i) => (
              <li key={i} className="text-white/90 text-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-white rounded-full" />
                {spec}
              </li>
            ))}
          </ul>
          <div className="mt-6 text-white text-xs font-bold flex items-center gap-2">
            <span>Click to view case study</span>
            <span>→</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          {project.stats.map((stat, idx) => (
            <div key={idx}>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{stat.label}</div>
              <div className="text-lg font-bold text-teal">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
