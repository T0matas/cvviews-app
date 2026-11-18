import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.cvviews.app',
  appName: 'CVviews',
  webDir: 'public',
  // The Next.js app uses server routes, so iOS loads the published site in its native WebView.
  server: {
    url: 'https://cvviews.me',
    cleartext: false,
  },
};

export default config;
