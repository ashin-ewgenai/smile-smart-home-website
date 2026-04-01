import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Trash2, 
  Settings2, 
  ChevronRight, 
  ArrowLeft, 
  Save, 
  Sparkles,
  Info,
  CheckCircle2,
  X,
  PlusCircle,
  Lightbulb,
  Lock,
  Thermometer,
  Zap,
  Loader2
} from 'lucide-react';
import { useSceneManagement, getIconByName, SCENE_TEMPLATES } from '../hooks/useSceneManagement';

export const SceneBuilder: React.FC = () => {
  const {
    scenes,
    isEditing,
    currentScene,
    sceneLoading,
    startNewScene,
    editScene,
    addAction,
    updateAction,
    removeAction,
    handleSave,
    cancelEdit,
    deleteScene,
    templates,
    devices
  } = useSceneManagement();

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.3 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: (i: number) => ({
      opacity: 1, 
      x: 0, 
      transition: { delay: i * 0.1, duration: 0.4 }
    })
  };

  const onboardingSteps = [
    { title: '1. Select Blueprint', desc: 'Choose a template or start from scratch.' },
    { title: '2. Link Devices', desc: 'Connect your lights, locks, and sensors.' },
    { title: '3. Set Actions', desc: 'Define exactly what happens on activation.' }
  ];

  if (isEditing && currentScene) {
    return (
      <div className="max-w-4xl mx-auto p-4 py-12">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="bg-white dark:bg-gray-900 rounded-[40px] shadow-2xl border border-slate-100 dark:border-gray-800 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-teal to-blue-600 p-10 text-white relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Sparkles size={120} />
            </div>
            <div className="relative z-10 flex justify-between items-start mb-8">
              <button 
                onClick={cancelEdit}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all backdrop-blur-md"
                title="Cancel"
              >
                <ArrowLeft size={24} />
              </button>
              <div className="bg-white/20 p-5 rounded-[32px] backdrop-blur-xl border border-white/30 shadow-2xl">
                {React.createElement(getIconByName(currentScene.icon || 'Home'), { size: 48 })}
              </div>
            </div>
            <h2 className="text-4xl font-bold mb-2">Configure Scene</h2>
            <p className="text-teal-50 font-medium opacity-90 max-w-md">Design the perfect atmosphere for "{currentScene.name}".</p>
          </div>

          <div className="p-10">
            <div className="space-y-10">
              {/* Scene Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-xs font-bold text-slate-400 dark:text-gray-500 mb-3 uppercase tracking-[0.2em]">Scene Name</label>
                  <input
                    type="text"
                    value={currentScene.name || ''}
                    onChange={(e) => updateAction(-1, { deviceId: 'INTERNAL', action: 'RENAME', value: e.target.value })}
                    className="w-full bg-soft-gray dark:bg-charcoal/50 border-2 border-slate-100 dark:border-gray-800 rounded-2xl px-6 py-4 focus:border-teal transition-all outline-none text-slate-800 dark:text-white font-bold text-lg"
                    placeholder="e.g. My Custom Scene"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 dark:text-gray-500 mb-3 uppercase tracking-[0.2em]">Visual Icon</label>
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                    {['Sun', 'Moon', 'Shield', 'Film', 'Home', 'Coffee', 'Wind', 'Monitor', 'Gamepad', 'Leaf'].map(icon => (
                      <button
                        key={icon}
                        onClick={() => updateAction(-1, { deviceId: 'INTERNAL', action: 'ICON', value: icon })}
                        className={`p-4 rounded-2xl border-2 transition-all shrink-0 ${currentScene.icon === icon ? 'border-teal bg-teal/5 text-teal shadow-lg shadow-teal/10' : 'border-slate-50 dark:border-gray-800 text-slate-400 hover:border-teal/30 hover:bg-teal/5'}`}
                      >
                        {React.createElement(getIconByName(icon), { size: 24 })}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions List */}
              <div>
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                      Device Actions
                    </h3>
                    <p className="text-sm text-slate-400 font-medium mt-1">Specify what happens when this scene is activated.</p>
                  </div>
                  <div className="relative group">
                    <button className="bg-charcoal dark:bg-white text-white dark:text-charcoal px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:scale-105 transition-all shadow-xl">
                      <PlusCircle size={20} /> Add Item
                    </button>
                    <div className="absolute right-0 top-full mt-3 w-80 bg-white dark:bg-gray-900 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-100 dark:border-gray-800 p-3 z-20 hidden group-focus-within:block group-hover:block transition-all animate-in fade-in slide-in-from-top-2">
                       <div className="text-xs font-bold text-slate-400 p-2 uppercase tracking-widest mb-2 border-b border-slate-50 dark:border-gray-800">Your Connected Devices</div>
                      <div className="max-h-72 overflow-y-auto custom-scrollbar pr-1">
                        {devices.map(device => (
                          <button
                            key={device.id}
                            onClick={() => addAction(device.id, device.deviceName || 'New Device')}
                            className="w-full text-left p-4 hover:bg-soft-gray dark:hover:bg-charcoal/50 rounded-2xl transition-all flex items-center gap-4 group/item"
                          >
                            <div className="p-3 bg-slate-50 dark:bg-gray-800 rounded-xl group-hover/item:bg-teal group-hover/item:text-white transition-colors">
                              <Zap size={16} />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-slate-800 dark:text-white truncate">{device.deviceName}</div>
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">{device.type}</div>
                            </div>
                          </button>
                        ))}
                        {devices.length === 0 && <div className="p-8 text-center text-slate-400 text-sm ">No devices found</div>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {currentScene.actions?.length === 0 && (
                    <div className="text-center py-20 bg-soft-gray dark:bg-charcoal/30 rounded-[40px] border-2 border-dashed border-slate-200 dark:border-gray-800">
                      <div className="p-6 bg-white dark:bg-gray-800 rounded-full w-fit mx-auto mb-6 shadow-xl border border-slate-50 dark:border-gray-700">
                        <PlusCircle size={40} className="text-teal/30" />
                      </div>
                      <h4 className="text-lg font-bold text-slate-400">Your layout is empty</h4>
                      <p className="text-slate-400 text-sm mt-1">Add devices to build your automation routine.</p>
                    </div>
                  )}
                  {currentScene.actions?.map((action, idx) => (
                    <motion.div
                      key={`${action.deviceId}-${idx}`}
                      variants={itemVariants}
                      custom={idx}
                      initial="hidden"
                      animate="visible"
                      className="bg-soft-gray dark:bg-charcoal/50 p-6 rounded-3xl border-2 border-transparent hover:border-teal/20 transition-all group"
                    >
                      <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
                        <div className="flex-1 flex items-center gap-5">
                          <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-slate-50 dark:border-gray-700 text-teal">
                            <Lightbulb size={24} />
                          </div>
                          <div>
                            <div className="font-bold text-lg text-slate-800 dark:text-white">{action.deviceName}</div>
                            <div className="text-[10px] uppercase font-bold text-teal tracking-[0.2em]">{action.action} {action.value ? `\u00B7 ${action.value}` : ''}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full lg:w-auto">
                          <div className="flex-1 lg:w-48">
                            <select
                              value={action.action}
                              onChange={(e) => updateAction(idx, { action: e.target.value })}
                              className="w-full bg-white dark:bg-gray-800 border-2 border-slate-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-teal cursor-pointer shadow-sm"
                            >
                              <option value="on">Power On</option>
                              <option value="off">Power Off</option>
                              <option value="dim">Dim Level</option>
                              <option value="lock">Lock Secure</option>
                              <option value="unlock">Unlock Access</option>
                              <option value="set_temp">Set Temperature</option>
                            </select>
                          </div>

                          {['dim', 'set_temp'].includes(action.action) && (
                            <div className="relative">
                              <input
                                type="number"
                                value={action.value || 50}
                                onChange={(e) => updateAction(idx, { value: parseInt(e.target.value) })}
                                className="w-24 bg-white dark:bg-gray-800 border-2 border-slate-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-teal pr-8"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 capitalize">
                                {action.action === 'dim' ? '%' : '°'}
                              </span>
                            </div>
                          )}

                          <button 
                            onClick={() => removeAction(idx)}
                            className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )) as any}
                </div>
              </div>

              {/* Save Controls */}
              <div className="pt-10 border-t border-slate-50 dark:border-gray-800 flex flex-col sm:flex-row gap-4 justify-between items-center">
                 <button 
                  onClick={cancelEdit}
                  className="px-8 py-4 rounded-2xl font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all flex items-center gap-2"
                >
                  <X size={18} /> Discard
                </button>
                <button 
                  onClick={handleSave}
                  disabled={sceneLoading || !currentScene.name}
                  className="w-full sm:w-auto bg-gradient-to-r from-teal to-blue-600 text-white px-12 py-5 rounded-[24px] font-bold flex items-center justify-center gap-3 hover:scale-[1.02] transition-all disabled:opacity-50 shadow-[0_10px_30px_rgba(0,150,136,0.3)]"
                >
                  {sceneLoading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                  Store Master Scene
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      {/* Dynamic Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-16 gap-8 relative">
        <div className="absolute -top-12 -left-12 w-64 h-64 bg-teal/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
             <div className="h-1 w-12 bg-teal rounded-full"></div>
             <span className="text-xs font-bold text-teal uppercase tracking-[0.4em]">Home Automation</span>
          </div>
          <h1 className="text-5xl lg:text-6xl font-bold text-charcoal dark:text-white mb-4 tracking-tight">Smart Scenes</h1>
          <p className="text-slate-500 font-medium text-lg max-w-xl">Master your environment. Create, edit, and deploy home routines with one single tap.</p>
        </div>
        <div className="relative z-10 flex gap-4">
          <button 
            onClick={() => setShowHelp(true)}
            className="p-5 bg-white dark:bg-gray-900 text-slate-400 hover:text-teal rounded-2xl border-2 border-slate-50 dark:border-gray-800 transition-all"
            title="How it Works"
          >
            <Info size={24} />
          </button>
          <button 
            onClick={() => startNewScene()}
            className="bg-gradient-to-r from-teal to-blue-600 text-white px-10 py-5 rounded-[24px] font-bold flex items-center justify-center gap-3 hover:shadow-[0_15px_40px_rgba(0,150,136,0.3)] hover:scale-[1.05] transition-all group whitespace-nowrap"
          >
            <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
            Build New Scene
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-12">
        
        {/* Templates Section */}
        <div className="xl:col-span-1 space-y-8">
          <div className="flex items-center gap-3 text-slate-800 dark:text-white font-bold text-xl px-2 uppercase tracking-wide">
            <Sparkles className="text-teal" size={24} />
            Blueprints
          </div>
          <div className="space-y-5">
            {templates.map((template, i) => (
              <motion.button
                 key={template.name}
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: i * 0.1 }}
                 onClick={() => startNewScene(template)}
                 className="w-full group bg-white dark:bg-gray-900 p-8 rounded-[32px] border-2 border-slate-50 dark:border-gray-800 hover:border-teal transition-all text-left relative overflow-hidden shadow-sm hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
              >
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity scale-150 group-hover:scale-[1.7] transition-transform duration-700">
                  {React.createElement(getIconByName(template.icon), { size: 100 })}
                </div>
                <div className="flex items-center gap-5 mb-6 relative z-10">
                  <div className="p-4 bg-soft-gray dark:bg-charcoal/50 text-teal rounded-2xl group-hover:bg-teal group-hover:text-white transition-all duration-300">
                    {React.createElement(getIconByName(template.icon), { size: 24 })}
                  </div>
                  <div className="font-bold text-xl text-slate-800 dark:text-white tracking-tight">{template.name}</div>
                </div>
                <p className="text-slate-500 dark:text-gray-400 font-medium leading-relaxed mb-6 group-hover:text-slate-600 dark:group-hover:text-gray-200 transition-colors">
                  {template.description}
                </p>
                <div className="flex items-center gap-2 text-[10px] font-bold text-teal uppercase tracking-[0.3em] opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                  Execute Blueprint <ChevronRight size={14} />
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Existing Scenes Section */}
        <div className="xl:col-span-3">
          {scenes.length === 0 ? (
            <div className="space-y-12">
               {/* Quick Start Guide Banner */}
               <div className="bg-gradient-to-br from-teal/10 to-blue-600/10 rounded-[60px] p-12 border-2 border-white dark:border-gray-800 relative overflow-hidden group">
                  <div className="absolute right-0 top-0 p-12 opacity-5 scale-150 rotate-12 group-hover:rotate-0 transition-transform duration-1000">
                     <Sparkles size={160} />
                  </div>
                  <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
                     {onboardingSteps.map((step, i) => (
                       <div key={i} className="space-y-3">
                          <div className="text-teal font-bold">{step.title}</div>
                          <p className="text-slate-500 text-sm font-medium">{step.desc}</p>
                       </div>
                     ))}
                  </div>
               </div>

               {/* Suggested Blueprints Header */}
               <div className="flex items-center justify-between px-2">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-widest">Recommended for You</h2>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-gray-800 px-4 py-1.5 rounded-full">New Account Suggestions</div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {templates.slice(0, 4).map((template, i) => (
                    <motion.div
                      key={template.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="bg-white dark:bg-gray-900 rounded-[50px] p-10 border-2 border-slate-50 dark:border-gray-800 hover:border-teal/30 transition-all group shadow-sm hover:shadow-2xl relative"
                    >
                      <div className="flex justify-between items-start mb-8">
                        <div className="p-6 bg-soft-gray dark:bg-charcoal/50 text-teal rounded-[32px] group-hover:scale-110 group-hover:bg-teal group-hover:text-white transition-all duration-500">
                          {React.createElement(getIconByName(template.icon), { size: 40 })}
                        </div>
                        <div className="bg-teal/5 text-teal px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest">Blueprint</div>
                      </div>
                      <h3 className="text-3xl font-bold text-slate-800 dark:text-white mb-3">{template.name}</h3>
                      <p className="text-slate-400 mb-10 font-medium">{template.description}</p>
                      <button 
                        onClick={() => startNewScene(template)}
                        className="w-full bg-charcoal dark:bg-white text-white dark:text-charcoal py-5 rounded-[24px] font-bold hover:bg-teal hover:text-white transition-all shadow-xl flex items-center justify-center gap-3"
                      >
                        Customize Example
                        <ChevronRight size={20} />
                      </button>
                    </motion.div>
                  ))}
               </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-8 px-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-widest">Active Inventory</h2>
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-teal animate-pulse"></span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{scenes.length} Scenes Online</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {scenes.map((scene, i) => (
                  <motion.div
                    key={scene.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white dark:bg-gray-900 rounded-[40px] p-8 border-2 border-slate-50 dark:border-gray-800 hover:border-teal/30 transition-all group shadow-sm hover:shadow-[0_30px_60px_rgba(0,0,0,0.12)] relative"
                  >
                    <div className="flex justify-between items-start mb-10">
                      <div className="p-6 bg-gradient-to-br from-teal to-blue-600 text-white rounded-[32px] shadow-2xl group-hover:scale-110 transition-transform duration-500 border border-white/20">
                        {React.createElement(getIconByName(scene.icon || 'Home'), { size: 36 })}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => editScene(scene)}
                          className="p-3 bg-soft-gray dark:bg-gray-800 text-slate-400 hover:text-teal hover:bg-teal/5 rounded-2xl transition-all"
                          title="Edit Master"
                        >
                          <Settings2 size={20} />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm(scene.id)}
                          className="p-3 bg-soft-gray dark:bg-gray-800 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-2xl transition-all"
                          title="Delete Scene"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                    
                    <h3 className="text-3xl font-bold text-slate-800 dark:text-white mb-3 tracking-tight">{scene.name}</h3>
                    <div className="flex items-center gap-3 mb-10">
                      <div className="flex -space-x-2">
                        {(scene.actions || []).slice(0, 3).map((_, idx) => (
                          <div key={idx} className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-900 bg-teal/20 flex items-center justify-center text-[8px] font-bold text-teal">
                              D
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{scene.actions?.length || 0} Linked Actions</span>
                    </div>

                    <button className="w-full bg-charcoal dark:bg-white text-white dark:text-charcoal py-5 rounded-[24px] font-bold flex items-center justify-center gap-3 group-hover:bg-teal group-hover:text-white group-hover:shadow-[0_10px_30px_rgba(0,150,136,0.2)] transition-all active:scale-95 text-lg">
                      <CheckCircle2 size={22} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      Deploy Scene
                    </button>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHelp(false)}
              className="absolute inset-0 bg-charcoal/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative bg-white dark:bg-gray-900 rounded-[60px] shadow-2xl p-16 max-w-4xl w-full border border-slate-100 dark:border-gray-800 overflow-hidden"
            >
              <div className="absolute -right-24 -top-24 w-96 h-96 bg-teal/5 rounded-full blur-3xl"></div>
              <button 
                onClick={() => setShowHelp(false)}
                className="absolute top-10 right-10 p-3 text-slate-400 hover:text-charcoal dark:hover:text-white transition-colors"
              >
                <X size={32} />
              </button>

              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-8">
                   <div className="p-4 bg-teal/10 rounded-[24px] text-teal">
                      <Info size={32} />
                   </div>
                   <h2 className="text-4xl font-bold text-slate-800 dark:text-white">How Scenes Work</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                   <div className="space-y-8">
                      <div>
                         <h4 className="text-xl font-bold text-teal mb-2">The Blueprint Concept</h4>
                         <p className="text-slate-500 font-medium">A scene is a collection of actions across multiple devices. Instead of turning on 10 lights one by one, you create a "Movie" scene that dims them all at once.</p>
                      </div>
                      <div className="p-8 bg-soft-gray dark:bg-charcoal/50 rounded-[40px] border border-slate-50 dark:border-gray-800">
                         <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 bg-teal text-white rounded-full flex items-center justify-center font-bold">1</div>
                            <span className="font-bold dark:text-white">Choose a Trigger Icon</span>
                         </div>
                         <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 bg-teal text-white rounded-full flex items-center justify-center font-bold">2</div>
                            <span className="font-bold dark:text-white">Select Connected Devices</span>
                         </div>
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-teal text-white rounded-full flex items-center justify-center font-bold">3</div>
                            <span className="font-bold dark:text-white">Define Power/Level/Status</span>
                         </div>
                      </div>
                   </div>
                   <div className="bg-slate-50 dark:bg-gray-800 p-10 rounded-[60px] shadow-inner relative group border-4 border-white dark:border-gray-900">
                      <div className="absolute inset-0 bg-gradient-to-br from-teal/5 to-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <div className="space-y-6 relative">
                         <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-xl flex items-center gap-4 grayscale group-hover:grayscale-0 transition-all">
                            <div className="p-3 bg-teal/10 text-teal rounded-xl"><Lightbulb size={24} /></div>
                            <div className="flex-1 font-bold text-slate-800 dark:text-white">Living Room Light <span className="text-teal font-bold  ml-2">Dim 20%</span></div>
                         </div>
                         <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-xl flex items-center gap-4 grayscale group-hover:grayscale-0 transition-all delay-75">
                            <div className="p-3 bg-teal/10 text-teal rounded-xl"><Lock size={24} /></div>
                            <div className="flex-1 font-bold text-slate-800 dark:text-white">Main Door <span className="text-teal font-bold  ml-2">Locked</span></div>
                         </div>
                      </div>
                      <div className="mt-10 text-center">
                         <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em]">Visual Logic Preview</div>
                      </div>
                   </div>
                </div>
                
                <div className="mt-16 flex justify-center">
                   <button 
                     onClick={() => { setShowHelp(false); startNewScene(); }}
                     className="bg-charcoal dark:bg-white text-white dark:text-charcoal px-12 py-5 rounded-[24px] font-bold  shadow-2xl hover:scale-105 transition-all text-xl"
                   >
                     Let's Build One
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-charcoal/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative bg-white dark:bg-gray-900 rounded-[50px] shadow-2xl p-12 max-w-md w-full text-center border border-slate-100 dark:border-gray-800"
            >
              <div className="p-8 bg-red-50 dark:bg-red-900/10 text-red-500 rounded-full w-fit mx-auto mb-8 shadow-inner">
                <Trash2 size={48} />
              </div>
              <h3 className="text-3xl font-bold text-slate-800 dark:text-white mb-4">Decommission Scene?</h3>
              <p className="text-slate-400 mb-10 font-medium text-lg leading-relaxed">This automation will be permanently erased. Proceed with caution.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-8 py-5 rounded-[24px] font-bold text-slate-400 bg-soft-gray dark:bg-gray-800 hover:text-slate-600 transition-all font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    deleteScene(deleteConfirm);
                    setDeleteConfirm(null);
                  }}
                  className="px-8 py-5 rounded-[24px] font-bold text-white bg-red-500 hover:bg-red-600 shadow-xl shadow-red-500/20 transition-all"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
