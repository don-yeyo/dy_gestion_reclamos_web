import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    expect: {
        timeout: 7000
    },
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
    use: {
        baseURL: 'http://localhost:5174',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npx vite --mode test --port 5174',
        url: 'http://localhost:5174',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
    },
});
