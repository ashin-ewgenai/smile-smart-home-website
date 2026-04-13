import { useState, useCallback, useMemo } from 'react';
import { useDevices } from '../contexts/DevicesContext';
import { 
  Sun, 
  Moon, 
  Film, 
  Shield, 
  Home, 
  Lock, 
  Thermometer, 
  Lightbulb,
  Coffee,
  Wind,
  Monitor,
  Gamepad,
  Leaf,
  Sparkles
} from 'lucide-react';
import type { Scene, SceneAction } from '../models/Collections';

export const SCENE_TEMPLATES = [
  {
    name: 'Good Morning',
    icon: 'Sun',
    description: 'Start your day with perfect lighting and a warm home.',
    defaultActions: [
      { action: 'on', value: 100, category: 'Lighting' },
      { action: 'on', category: 'Coffee Maker' }
    ]
  },
  {
    name: 'Away Mode',
    icon: 'Shield',
    description: 'Secure your home and save energy while you are out.',
    defaultActions: [
      { action: 'off', category: 'Lighting' },
      { action: 'lock', category: 'Security' },
      { action: 'set_temp', value: 68, category: 'Thermostat' }
    ]
  },
  {
    name: 'Movie Night',
    icon: 'Film',
    description: 'Dim the lights and get ready for a cinematic experience.',
    defaultActions: [
      { action: 'dim', value: 20, category: 'Lighting' },
      { action: 'on', category: 'TV' }
    ]
  },
  {
    name: 'Work from Home',
    icon: 'Monitor',
    description: 'Focused white lighting and a cool environment for maximum productivity.',
    defaultActions: [
      { action: 'on', value: 100, category: 'Desk Lamp' },
      { action: 'set_temp', value: 72, category: 'Thermostat' }
    ]
  },
  {
    name: 'Zen Mode',
    icon: 'Sparkles',
    description: 'Soft blue ambient light and a comfortable temperature for relaxation.',
    defaultActions: [
      { action: 'dim', value: 30, category: 'Mood Light' },
      { action: 'set_temp', value: 74, category: 'Thermostat' }
    ]
  },
  {
    name: 'Gaming Mode',
    icon: 'Gamepad',
    description: 'Vibrant purple and cyan lighting to enhance your gaming setup.',
    defaultActions: [
      { action: 'on', value: 80, category: 'LED Strip' },
      { action: 'off', category: 'Ceiling Light' }
    ]
  },
  {
    name: 'Eco Saver',
    icon: 'Leaf',
    description: 'Minimal power usage. Turn off non-essentials and set thermostat to eco.',
    defaultActions: [
      { action: 'off', category: 'Lighting' },
      { action: 'set_temp', value: 65, category: 'Thermostat' }
    ]
  }
];

export const getIconByName = (name: string) => {
  const icons: Record<string, any> = {
    Sun, Moon, Film, Shield, Home, Lock, Thermometer, Lightbulb, Coffee, Wind, Monitor, Gamepad, Leaf, Sparkles
  };
  return icons[name] || Home;
};

export function useSceneManagement() {
  const { devices, scenes, saveScene, deleteScene, sceneLoading } = useDevices();
  const [isEditing, setIsEditing] = useState(false);
  const [isNewScene, setIsNewScene] = useState(false);
  const [currentScene, setCurrentScene] = useState<Partial<Scene> | null>(null);

  const startNewScene = useCallback((template?: typeof SCENE_TEMPLATES[0]) => {
    const actions: SceneAction[] = [];
    
    if (template) {
      // Auto-map template actions to user's devices based on category
      template.defaultActions.forEach(def => {
        const matchingDevice = devices.find(d => 
          d.type?.toLowerCase().includes(def.category.toLowerCase()) ||
          d.deviceName?.toLowerCase().includes(def.category.toLowerCase())
        );
        if (matchingDevice) {
          actions.push({
            deviceId: matchingDevice.id,
            deviceName: matchingDevice.deviceName,
            action: def.action,
            value: def.value
          });
        }
      });
    }

    setCurrentScene({
      name: template?.name || 'New Scene',
      icon: template?.icon || 'Home',
      description: template?.description || '',
      actions
    });
    setIsNewScene(true);
    setIsEditing(true);
  }, [devices]);

  const editScene = useCallback((scene: Scene) => {
    setCurrentScene(scene);
    setIsNewScene(false);
    setIsEditing(true);
  }, []);

  const addAction = useCallback((deviceId: string, deviceName: string) => {
    if (!currentScene) return;
    const newAction: SceneAction = {
      deviceId,
      deviceName,
      action: 'on'
    };
    setCurrentScene(prev => ({
      ...prev!,
      actions: [...(prev!.actions || []), newAction]
    }));
  }, [currentScene]);

  const updateAction = useCallback((index: number, update: Partial<SceneAction>) => {
    if (!currentScene) return;

    // Handle special scene-level updates (index = -1)
    if (index === -1) {
      if (update.deviceId === 'INTERNAL' && update.action === 'RENAME') {
        setCurrentScene(prev => ({ ...prev!, name: update.value }));
      } else if (update.deviceId === 'INTERNAL' && update.action === 'ICON') {
        setCurrentScene(prev => ({ ...prev!, icon: update.value }));
      }
      return;
    }

    // Handle regular action updates
    const newActions = [...(currentScene.actions || [])];
    newActions[index] = { ...newActions[index], ...update };
    setCurrentScene(prev => ({
      ...prev!,
      actions: newActions
    }));
  }, [currentScene]);

  const removeAction = useCallback((index: number) => {
    if (!currentScene) return;
    const newActions = (currentScene.actions || []).filter((_, i) => i !== index);
    setCurrentScene(prev => ({
      ...prev!,
      actions: newActions
    }));
  }, [currentScene]);

  const handleSave = useCallback(async () => {
    if (!currentScene) return;
    try {
      await saveScene(currentScene);
      setIsEditing(false);
      setCurrentScene(null);
    } catch (err) {
      console.error('Hook save error:', err);
      throw err;
    }
  }, [currentScene, saveScene]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setIsNewScene(false);
    setCurrentScene(null);
  }, []);

  return {
    scenes,
    isEditing,
    isNewScene,
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
    templates: SCENE_TEMPLATES,
    devices
  };
}
