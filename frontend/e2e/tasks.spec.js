import { expect, test } from '@playwright/test'

async function signupAndLogin(page, identity) {
  await page.goto('/signup')
  await page.getByLabel('Display name').fill('Ordering Tester')
  await page.getByLabel('Email').fill(identity.email)
  await page.getByLabel('Password').fill(identity.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  await page.getByLabel('Email').fill(identity.email)
  await page.getByLabel('Password').fill(identity.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Active tasks' })).toBeVisible()
}

async function createTask(page, title) {
  await page.getByRole('button', { name: 'New task' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Description').fill(`${title} browser journey details`)
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function taskTitles(page) {
  return page.getByRole('article').getByRole('heading').allTextContents()
}

function relativeLuminance([red, green, blue]) {
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function rgbChannels(value) {
  return value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number)
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

async function dragTask(page, sourceName, targetName) {
  const source = page.locator('.priority-item').filter({ has: page.getByRole('article', { name: sourceName }) }).locator('.drag-handle')
  const target = page.locator('.priority-item').filter({ has: page.getByRole('article', { name: targetName }) }).locator('.drag-handle')
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(180)
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
  await page.waitForTimeout(180)
  await page.mouse.up()
}

test('full task ordering journey persists and remains usable without page overflow', async ({ page }, testInfo) => {
  const identity = {
    email: `ordering-${testInfo.project.name}-${Date.now()}@example.com`,
    password: 'correct horse battery staple',
  }
  await signupAndLogin(page, identity)
  await createTask(page, 'zulu')
  await createTask(page, 'Alpha')
  await createTask(page, 'bravo')

  await expect(page.getByRole('tab', { name: 'Active (3)' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Sort Active tasks by')).toHaveValue('priority')
  await expect(page.getByLabel('Active sort direction')).toHaveValue('asc')
  const grips = page.locator('.drag-handle')
  await expect(grips).toHaveCount(3)
  const firstGrip = grips.first()
  await expect(firstGrip).toBeVisible()
  const box = await firstGrip.boundingBox()
  expect(box.width).toBeGreaterThanOrEqual(24)
  expect(box.height).toBeGreaterThanOrEqual(24)
  await expect(firstGrip).toHaveCSS('cursor', 'grab')
  await expect(page.getByRole('article').first()).not.toHaveAttribute('draggable', 'true')
  const gripColors = await firstGrip.evaluate((grip) => {
    const icon = grip.querySelector('.drag-handle-icon')
    return {
      foreground: getComputedStyle(icon).color,
      background: getComputedStyle(grip).backgroundColor,
    }
  })
  const ratio = contrastRatio(rgbChannels(gripColors.foreground), rgbChannels(gripColors.background))
  expect(ratio).toBeGreaterThanOrEqual(3)
  await testInfo.attach('drag-grip-metrics', {
    body: JSON.stringify({
      viewport: testInfo.project.use.viewport,
      width: box.width,
      height: box.height,
      foreground: gripColors.foreground,
      background: gripColors.background,
      contrastRatio: Number(ratio.toFixed(4)),
    }),
    contentType: 'application/json',
  })
  await expect.poll(() => taskTitles(page)).toEqual(['bravo', 'Alpha', 'zulu'])

  await page.getByLabel('Sort Active tasks by').selectOption('title')
  await page.getByLabel('Active sort direction').selectOption('asc')
  await expect.poll(() => taskTitles(page)).toEqual(['Alpha', 'bravo', 'zulu'])
  await page.getByLabel('Active sort direction').selectOption('desc')
  await expect.poll(() => taskTitles(page)).toEqual(['zulu', 'bravo', 'Alpha'])

  await page.getByLabel('Sort Active tasks by').selectOption('createdAt')
  await page.getByLabel('Active sort direction').selectOption('asc')
  await expect.poll(() => taskTitles(page)).toEqual(['zulu', 'Alpha', 'bravo'])
  await page.getByLabel('Active sort direction').selectOption('desc')
  await expect.poll(() => taskTitles(page)).toEqual(['bravo', 'Alpha', 'zulu'])

  await page.getByLabel('Sort Active tasks by').selectOption('priority')
  await expect(page.getByText(/Drag tasks to change priority/)).toHaveCount(0)
  await expect.poll(() => taskTitles(page)).toEqual(['zulu', 'Alpha', 'bravo'])
  await page.getByLabel('Active sort direction').selectOption('asc')
  await expect(page.getByText(/Drag tasks to change priority/)).toBeVisible()

  await expect.poll(() => taskTitles(page)).toEqual(['bravo', 'Alpha', 'zulu'])
  let savedOrder = await taskTitles(page)
  if (testInfo.project.name === 'desktop-chromium') {
    await expect.poll(() => taskTitles(page)).toEqual(['bravo', 'Alpha', 'zulu'])
    await dragTask(page, 'bravo', 'Alpha')
    await expect(page.getByRole('status', { name: 'Reorder status' })).toContainText('Priority order saved')
    savedOrder = await taskTitles(page)
    expect(savedOrder).toEqual(['Alpha', 'bravo', 'zulu'])
  }

  await page.reload()
  await expect(page.getByLabel('Sort Active tasks by')).toHaveValue('priority')
  await expect(page.getByLabel('Active sort direction')).toHaveValue('asc')
  await expect.poll(() => taskTitles(page)).toEqual(savedOrder)

  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByLabel('Email').fill(identity.email)
  await page.getByLabel('Password').fill(identity.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByLabel('Sort Active tasks by')).toHaveValue('priority')
  await expect(page.getByLabel('Active sort direction')).toHaveValue('asc')
  await expect.poll(() => taskTitles(page)).toEqual(savedOrder)

  await page.getByRole('checkbox', { name: 'Complete bravo' }).press('Space')
  await expect(page.getByRole('tab', { name: 'Active (2)' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Complete Alpha' }).press('Space')
  await expect(page.getByRole('tab', { name: 'Active (1)' })).toBeVisible()
  await page.getByRole('tab', { name: 'Completed (2)' }).press('Enter')
  await expect(page.getByLabel('Sort Completed tasks by')).toHaveValue('completedAt')
  await expect(page.getByLabel('Completed sort direction')).toHaveValue('desc')
  await expect.poll(() => taskTitles(page)).toEqual(['Alpha', 'bravo'])
  await page.getByLabel('Completed sort direction').selectOption('asc')
  await expect.poll(() => taskTitles(page)).toEqual(['bravo', 'Alpha'])
  await page.getByLabel('Sort Completed tasks by').selectOption('createdAt')
  await page.getByLabel('Completed sort direction').selectOption('asc')
  await expect.poll(() => taskTitles(page)).toEqual(['Alpha', 'bravo'])
  await page.getByLabel('Completed sort direction').selectOption('desc')
  await expect.poll(() => taskTitles(page)).toEqual(['bravo', 'Alpha'])
  await page.getByLabel('Sort Completed tasks by').selectOption('title')
  await page.getByLabel('Completed sort direction').selectOption('asc')
  await expect.poll(() => taskTitles(page)).toEqual(['Alpha', 'bravo'])
  await page.getByLabel('Completed sort direction').selectOption('desc')
  await expect.poll(() => taskTitles(page)).toEqual(['bravo', 'Alpha'])
  const completedCard = page.getByRole('article', { name: 'bravo' })
  await expect(completedCard.getByRole('button', { name: 'Reactivate' })).toBeVisible()
  await expect(completedCard.getByRole('button', { name: /Edit|Delete/ })).toHaveCount(0)
  await expect(completedCard).toHaveCSS('color', 'rgb(77, 88, 83)')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  const reactivate = completedCard.getByRole('button', { name: 'Reactivate' })
  await reactivate.focus()
  await expect(reactivate).toBeFocused()
  await expect(reactivate).toHaveCSS('outline-style', 'solid')
  await reactivate.press('Enter')
  await expect(page.getByRole('tab', { name: 'Completed (1)' })).toBeFocused()
  await page.getByRole('tab', { name: 'Active (2)' }).press('Enter')
  await expect(page.getByLabel('Sort Active tasks by')).toHaveValue('priority')
  await expect(page.getByLabel('Active sort direction')).toHaveValue('asc')
})

test('rejected reorder visibly restores the authoritative order', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Touch reorder is outside the approved scope.')
  const identity = {
    email: `rollback-${testInfo.project.name}-${Date.now()}@example.com`,
    password: 'correct horse battery staple',
  }
  await signupAndLogin(page, identity)
  await createTask(page, 'First')
  await createTask(page, 'Second')
  await expect(page.getByLabel('Sort Active tasks by')).toHaveValue('priority')
  await expect(page.getByLabel('Active sort direction')).toHaveValue('asc')
  await expect.poll(() => taskTitles(page)).toEqual(['Second', 'First'])
  const authoritative = await taskTitles(page)

  await page.route('**/api/tasks/reorder', async (route) => {
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Task order is stale' }) })
  })
  await dragTask(page, authoritative[0], authoritative[1])

  await expect(page.getByRole('alert')).toContainText('Priority order could not be saved. The latest order was restored.')
  await expect.poll(() => taskTitles(page)).toEqual(authoritative)
})
