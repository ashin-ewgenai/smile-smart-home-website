import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smilesmarthome.app',
  appName: 'Smile Smart Home',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    hostname: 'smilesmarthomes.com'
  }
};

export default config;
