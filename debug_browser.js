import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', error => console.error('BROWSER_ERROR:', error.message));
  
  // Inject Capacitor mock for debugging mobile behavior in browser
  await page.evaluateOnNewDocument(() => {
    window.Capacitor = {
      isNativePlatform: () => false, // Set to true to simulate native
      getPlatform: () => 'web',
      Plugins: {
        Preferences: {
          get: async ({ key }) => ({ value: localStorage.getItem(key) }),
          set: async ({ key, value }) => localStorage.setItem(key, value),
          remove: async ({ key }) => localStorage.removeItem(key)
        }
      }
    };
    console.log('Capacitor mock injected for debugging.');
  });
  
  try {
    await page.goto('http://localhost:4321/dashboard/admin', { waitUntil: 'networkidle2', timeout: 10000 });
    // Wait a bit for async errors
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.error('PUPPETEER_CATCH:', e.message);
  } finally {
    await browser.close();
  }
})();
