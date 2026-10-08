// Перевірка опублікованої гри у справжньому браузері (запускається в GitHub Actions після деплою на Pages).
// Відкриває сторінку, чекає на canvas Phaser, перевіряє шрифт, помилки сторінки і що всі файли завантажились.
// Використання: node tools/smoke-online.mjs <url> <скріншот.png>
// (CHROME_PATH=… — свій Chromium замість того, що ставить Playwright)
import { chromium } from 'playwright';

const [url, shot = 'online.png'] = process.argv.slice(2);
if (!url) {
  console.error('Потрібна адреса сторінки');
  process.exit(2);
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`помилка сторінки: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`консоль: ${m.text()}`);
});
page.on('requestfailed', (r) => problems.push(`не завантажилось: ${r.url()} (${r.failure()?.errorText})`));
page.on('response', (r) => {
  const type = r.headers()['content-type'] ?? '';
  console.log(`  ${r.status()} ${type.padEnd(28)} ${r.url().split('/').slice(-2).join('/')}`);
  if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) problems.push(`${r.status()} ${r.url()}`);
});

await page.goto(url, { waitUntil: 'load' });
let canvas = true;
try {
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(3000);
} catch {
  canvas = false;
  problems.push('canvas гри не з’явився за 30 с');
}
const font = await page.evaluate(() => document.fonts.check('8px Tiny5', 'Борг'));
await page.screenshot({ path: shot });
await browser.close();

console.log(`canvas: ${canvas ? 'є' : 'НЕМАЄ'}, шрифт Tiny5: ${font ? 'завантажено' : 'НЕ завантажено'}`);
if (!font) problems.push('шрифт Tiny5 не завантажився');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Онлайн-версія працює ✔');
