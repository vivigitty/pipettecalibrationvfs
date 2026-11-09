import { defineConfig,devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',use: { baseURL: 'http://127.0.0.1:3100',trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --port 3100',url: 'http://127.0.0.1:3100/api/v1/health',env: { APP_MODE: 'preview',AUTH_URL: 'http://127.0.0.1:3100' },reuseExistingServer: false },
  projects: [{ name: 'desktop',use: { ...devices['Desktop Chrome'] } },{ name: 'mobile',use: { ...devices['iPhone 13'],defaultBrowserType: 'chromium' } }],
});