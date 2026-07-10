import puppeteer from 'puppeteer';

const APP_URL = "http://localhost:3000";

async function runTest() {
  console.log("🚀 Starting Auth E2E Test...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  try {
    // 1. Test Registration
    console.log("📝 Testing Registration...");
    await page.goto(`${APP_URL}/register`);
    
    // Fill out the registration form
    const randomEmail = `test_${Date.now()}@example.com`;
    await page.type('input[type="text"]', 'Test Company');
    await page.type('input[type="email"]', randomEmail);
    await page.type('input[type="password"]', 'Password123!');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForNavigation({ url: `${APP_URL}/dashboard/api-keys` });
    console.log("✅ Registration & Auto-Login successful! Reached dashboard.");

    // 2. Test Logout
    console.log("🚪 Testing Logout...");
    // Find and click the logout button in the sidebar
    // The logout button has the text "Sign Out"
    const [logoutButton] = await page.$x("//button[contains(., 'Sign Out')]");
    if (logoutButton) {
      await logoutButton.click();
      await page.waitForNavigation({ url: `${APP_URL}/login` });
      console.log("✅ Logout successful! Reached login page.");
    } else {
      throw new Error("Logout button not found.");
    }

    // 3. Test Login
    console.log("🔑 Testing Login...");
    await page.type('input[type="email"]', randomEmail);
    await page.type('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForNavigation({ url: `${APP_URL}/dashboard/api-keys` });
    console.log("✅ Login successful! Reached dashboard.");

    console.log("🎉 All Auth tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await browser.close();
  }
}

runTest();
