import { test, expect, type APIRequestContext } from '@playwright/test';

const getFirstMp = async (request: APIRequestContext) => {
  const response = await request.get('/api/mp/search?q=&limit=1');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.results?.length).toBeGreaterThan(0);
  return data.results[0] as { slug: string; fullName: string };
};

test('find MP by location flow', async ({ page, context, request }) => {
  const mp = await getFirstMp(request);

  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 45.4215, longitude: -75.6972 });

  await page.route('**/api/geolocation**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mp: { slug: mp.slug },
        riding: { id: 1, ridingName: 'Test Riding', province: 'ON' },
      }),
    });
  });

  await page.goto('/');
  await page
    .getByRole('button', { name: 'Use my location to find my MP' })
    .click();

  await page.waitForURL(`**/mp/${mp.slug}`);
  await expect(page.getByRole('heading', { name: mp.fullName })).toBeVisible();
});

test('view MP profile and tabs flow', async ({ page, request }) => {
  const mp = await getFirstMp(request);

  await page.goto(`/mp/${mp.slug}`);
  await expect(page.getByRole('heading', { name: mp.fullName })).toBeVisible();

  const overviewTab = page.getByRole('tab', { name: 'Overview' });
  const votingTab = page.getByRole('tab', { name: 'Voting Record' });
  const expensesTab = page.getByRole('tab', { name: 'Expenses' });
  const analyticsTab = page.getByRole('tab', { name: 'Analytics' });

  await expect(overviewTab).toHaveAttribute('data-state', 'active');
  await votingTab.click();
  await expect(votingTab).toHaveAttribute('data-state', 'active');
  await expensesTab.click();
  await expect(expensesTab).toHaveAttribute('data-state', 'active');
  await analyticsTab.click();
  await expect(analyticsTab).toHaveAttribute('data-state', 'active');
});

test('subscribe to premium flow redirects to login', async ({ page }) => {
  await page.goto('/subscribe');
  await page.waitForURL('**/login?redirect=/subscribe');
  await expect(
    page.getByRole('heading', { name: 'Sign in to your account' })
  ).toBeVisible();
});
