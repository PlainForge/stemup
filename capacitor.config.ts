import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Change this before running `npx cap add ios` — it becomes your app's permanent
  // bundle identifier once submitted to App Store Connect. Reverse-DNS format.
  appId: 'com.stempower.stemup',
  appName: 'StemUP',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      providers: ['google.com'],
      skipNativeAuth: false,
    },
  },
};

export default config;
