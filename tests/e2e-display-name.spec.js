const { test, expect } = require('@playwright/test');

test.setTimeout(120000);

test('user A sets display name "Ali", user B sees "Ali" in chat list and bubble header', async ({ browser }) => {
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';

  // ---------- User A: register and set display name ----------
  const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await contextA.newPage();
  await pageA.goto(serverUrl, { waitUntil: 'networkidle' });

  // Switch to register tab, then create account
  await pageA.click('#register-tab');
  await pageA.fill('input[name="username"]', 'ali_e2e_sender');
  await pageA.fill('input[name="password"]', 'password-123');
  await pageA.click('button#auth-submit');
  await pageA.waitForLoadState('networkidle');

  // Open settings drawer via bottom nav
  await pageA.click('#nav-settings');
  await pageA.fill('#profile-display-name', 'Ali');
  await pageA.click('button:has-text("حفظ الملف")');
  await pageA.waitForLoadState('networkidle');
  await pageA.click('#nav-chats');
  await pageA.waitForLoadState('networkidle');

  // ---------- User B: register ----------
  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageB = await contextB.newPage();
  await pageB.goto(serverUrl, { waitUntil: 'networkidle' });

  await pageB.click('#register-tab');
  await pageB.fill('input[name="username"]', 'bob_e2e_receiver');
  await pageB.fill('input[name="password"]', 'password-123');
  await pageB.click('button#auth-submit');
  await pageB.waitForLoadState('networkidle');

  // ---------- User B searches for user A and sees "Ali" ----------
  await pageB.click('#compose-fab');
  await pageB.fill('#people-query', 'ali_e2e_sender');
  await pageB.waitForLoadState('networkidle');

  const searchName = await pageB.textContent('.search-person-info strong');
  expect(searchName).toContain('Ali');
  expect(searchName).not.toContain('مستخدم');

  // ---------- User B adds user A as contact ----------
  await pageB.click('button:has-text("إضافة")');
  await pageB.waitForLoadState('networkidle');

  // ---------- User B opens chat with user A ----------
  await pageB.click('#nav-chats');
  await pageB.waitForLoadState('networkidle');

  // Chat list should show "Ali"
  const chatListName = await pageB.textContent('.chat-row-name');
  expect(chatListName).toContain('Ali');
  expect(chatListName).not.toContain('مستخدم');

  // Open the chat - header should show "Ali"
  await pageB.click('.chat-row');
  await pageB.waitForLoadState('networkidle');

  const headerName = await pageB.textContent('#chat-username');
  expect(headerName).toContain('Ali');
  expect(headerName).not.toContain('مستخدم');

  await contextA.close();
  await contextB.close();
});
