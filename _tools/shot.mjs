// Скриншот + проверка консоли для одного проекта.
// Запуск только через обёртку ./shot (она ставит очередь flock: одновременно работает один браузер).
//
//   _tools/shot <папка-проекта> [--wait 2500] [--tag name] [--no-mobile] [--mobile-dpr 2]
//                [--actions '[{"click":[720,450]},{"wait":800},{"key":"Space"},{"move":[300,200]},
//                             {"drag":[[100,100],[600,400]]},{"type":"привет"},{"scroll":800},{"eval":"js"}]']
//
// Пишет: _shots/<папка>[-tag]-desktop.png, _shots/<папка>[-tag]-mobile.png,
//        <папка>/preview.jpg (только без --tag и без --actions — это обложка для галереи).
// Код выхода 1, если были ошибки страницы/консоли или упавшие запросы.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const target = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--no-mobile'].includes(args[i - 1])));
if (!target) {
  console.error('Укажи папку проекта: _tools/shot 001-name');
  process.exit(2);
}
const projectDir = resolve(ROOT, target);
const name = basename(projectDir);
const html = join(projectDir, 'index.html');
if (!existsSync(html)) {
  console.error(`Нет файла ${html}`);
  process.exit(2);
}

const wait = Number(opt('wait', 2500));
const tag = opt('tag', '');
const actions = JSON.parse(opt('actions', '[]'));
const shotsDir = join(ROOT, '_shots');
mkdirSync(shotsDir, { recursive: true });
const stem = join(shotsDir, `${name}${tag ? '-' + tag : ''}`);

const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-watchdog', // медленный программный рендер не должен убивать GPU-процесс
  ],
});

const problems = [];
const notes = [];

async function run(label, contextOptions) {
  const context = await browser.newContext(contextOptions);
  // Флаг съёмки: проект может рендерить в полном качестве, не снижая разрешение из-за медленного SwiftShader.
  await context.addInitScript(() => { window.__SHOT__ = true; });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error') problems.push(`[${label}] console.error: ${m.text()}`);
    else if (t === 'warning') notes.push(`[${label}] console.warn: ${m.text()}`);
  });
  page.on('requestfailed', (r) => problems.push(`[${label}] request failed: ${r.url()} — ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`[${label}] HTTP ${r.status()}: ${r.url()}`);
  });

  const t0 = Date.now();
  await page.goto('file://' + html, { waitUntil: 'load', timeout: 30000 }).catch((e) => problems.push(`[${label}] goto: ${e.message}`));
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(wait);

  for (const a of actions) {
    try {
      if (a.click) await page.mouse.click(a.click[0], a.click[1]);
      else if (a.move) await page.mouse.move(a.move[0], a.move[1], { steps: 8 });
      else if (a.drag) {
        const [[x1, y1], [x2, y2]] = a.drag;
        await page.mouse.move(x1, y1);
        await page.mouse.down();
        await page.mouse.move(x2, y2, { steps: 20 });
        await page.mouse.up();
      } else if (a.key) await page.keyboard.press(a.key);
      else if (a.down) await page.keyboard.down(a.down);
      else if (a.up) await page.keyboard.up(a.up);
      else if (a.type) await page.keyboard.type(a.type, { delay: 20 });
      else if (a.scroll) await page.mouse.wheel(0, a.scroll);
      else if (a.wait) await page.waitForTimeout(a.wait);
      else if (a.eval) notes.push(`[${label}] eval → ${JSON.stringify(await page.evaluate(a.eval))}`);
      else if (a.selector) await page.click(a.selector, { timeout: 3000 });
    } catch (e) {
      problems.push(`[${label}] action ${JSON.stringify(a)}: ${e.message}`);
    }
  }
  if (actions.length) await page.waitForTimeout(600);

  // В мобильной эмуляции окно растягивается вместе с содержимым, поэтому сравниваем с заданной шириной экрана
  const vw = contextOptions.viewport.width;
  const overflow = await page
    .evaluate((w) => Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, window.innerWidth) - w, vw)
    .catch(() => 0);
  if (overflow > 2) problems.push(`[${label}] горизонтальный скролл страницы: +${overflow}px`);

  const file = `${stem}-${label}.png`;
  await page.screenshot({ path: file });
  if (label === 'desktop' && !tag && !actions.length) {
    await page.screenshot({ path: join(projectDir, 'preview.jpg'), type: 'jpeg', quality: 82 });
  }
  notes.push(`[${label}] ${Date.now() - t0} мс → ${file}`);
  await context.close();
}

try {
  await run('desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  if (!flag('no-mobile')) {
    // DPR 1 по умолчанию: вдвое дешевле для очереди; для проверки чёткости мелкого текста — --mobile-dpr 2
    await run('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(opt('mobile-dpr', 1)), isMobile: true, hasTouch: true });
  }
} finally {
  await browser.close();
}

for (const n of notes) console.log(n);
if (problems.length) {
  console.log(`\nПРОБЛЕМЫ (${problems.length}):`);
  for (const p of [...new Set(problems)].slice(0, 40)) console.log('  ' + p);
  process.exit(1);
}
console.log('\nОК: ошибок консоли и страницы нет.');
