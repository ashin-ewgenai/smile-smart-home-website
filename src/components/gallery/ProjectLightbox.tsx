import React, { useEffect } from 'react';

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

interface ProjectLightboxProps {
  project: Project;
  onClose: () => void;
}

const ProjectLightbox: React.FC<ProjectLightboxProps> = ({ project, onClose }) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-8">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-charcoal/90 backdrop-blur-xl"
      />

      <div
        className="relative w-full max-w-6xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors w-10 h-10 flex items-center justify-center"
        >
          ✕
        </button>

        <div className="w-full md:w-3/5 relative bg-black flex items-center justify-center">
          <img
            src={project.mainImage}
            alt={project.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          
          <div className="absolute bottom-8 left-8 right-8">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">{project.title}</h2>
            <p className="text-white/80 flex items-center">
              <span className="mr-2">📍</span>
              {project.location}
            </p>
          </div>
        </div>

        <div className="w-full md:w-2/5 p-8 md:p-12 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-bold text-teal uppercase tracking-widest mb-3">About the Project</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-lg">
                {project.description}
              </p>
            </section>

            <section>
              <h3 className="text-sm font-bold text-teal uppercase tracking-widest mb-4">Technical Specifications</h3>
              <ul className="grid grid-cols-1 gap-3">
                {project.techSpecs.map((spec, idx) => (
                  <li key={idx} className="flex items-start text-gray-700 dark:text-gray-200">
                    <span className="mr-3 text-teal">✓</span>
                    <span>{spec}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="grid grid-cols-2 gap-6 p-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              {project.stats.map((stat, idx) => (
                <div key={idx}>
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{stat.label}</div>
                  <div className="text-2xl font-bold text-teal">{stat.value}</div>
                </div>
              ))}
            </section>

            <div className="space-y-4 pt-4">
              <a 
                href="/room-visualizer" 
                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-teal to-blue-600 hover:from-teal/90 hover:to-blue-700 text-white px-8 py-4 rounded-xl font-bold transition-all duration-300 shadow-lg shadow-teal/20"
              >
                Experience in 3D Visualizer
              </a>
              <button 
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 hover:text-teal transition-colors font-medium"
              >
                Return to Gallery →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectLightbox;
