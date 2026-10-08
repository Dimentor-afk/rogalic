// Перевірка онлайн-версії гри у справжньому браузері (запускається в GitHub Actions).
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
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) problems.push(`${r.status()} ${r.url()}`);
});

const res = await page.goto(url, { waitUntil: 'load' });
console.log(`HTTP ${res?.status()}  ${res?.headers()['content-type']}`);
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(3000);
const font = await page.evaluate(() => document.fonts.check('8px Tiny5', 'Борг'));
await page.screenshot({ path: shot });
await browser.close();

console.log(`canvas: є, шрифт Tiny5: ${font ? 'завантажено' : 'НЕ завантажено'}`);
if (!font) problems.push('шрифт Tiny5 не завантажився');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Онлайн-версія працює ✔');
