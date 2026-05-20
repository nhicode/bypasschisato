// Файл: oln_bot.js – запускать через Node.js (npm install puppeteer)
// Комментарии на русском, технические.

const puppeteer = require('puppeteer');

// Конфигурация
const CONFIG = {
    loginUrl: 'https://oln.vn/login',      // Заменить на реальный URL входа
    exerciseUrl: 'https://oln.vn/bai-tap', // Заменить на URL страницы с заданиями
    headless: false,                       // true для фонового режима
    timeout: 30000
};

/**
 * Основная функция бота
 * @param {string} username - логин
 * @param {string} password - пароль
 */
async function runBot(username, password) {
    const browser = await puppeteer.launch({ headless: CONFIG.headless });
    const page = await browser.newPage();
    
    // 1. Авторизация
    await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2' });
    await page.type('input[name="username"]', username);   // селектор может отличаться
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ timeout: CONFIG.timeout });
    
    // 2. Переход на страницу заданий
    await page.goto(CONFIG.exerciseUrl, { waitUntil: 'networkidle2' });
    
    // 3. Поиск всех активных упражнений
    const exercises = await page.$$eval('.exercise-item', items => 
        items.map(el => ({
            id: el.getAttribute('data-id'),
            text: el.innerText
        }))
    );
    
    for (const ex of exercises) {
        console.log(`Обработка задания: ${ex.text}`);
        
        // 4. Открыть задание
        await page.click(`.exercise-item[data-id="${ex.id}"] button.start`);
        await page.waitForSelector('.question-block', { timeout: 5000 });
        
        // 5. Получить вопрос и варианты ответов
        const questionText = await page.$eval('.question-text', el => el.innerText);
        const options = await page.$$eval('.answer-option', opts => 
            opts.map(opt => ({ text: opt.innerText, value: opt.getAttribute('data-value') }))
        );
        
        // 6. Эвристический алгоритм выбора ответа (пример: выбираем первый вариант)
        //    В реальности нужно анализировать вопрос и сопоставлять с базой.
        let selectedValue = null;
        if (options.length > 0) {
            selectedValue = options[0].value;
            console.log(`Выбран ответ: ${options[0].text}`);
        }
        
        // 7. Отправить ответ
        if (selectedValue) {
            await page.click(`.answer-option[data-value="${selectedValue}"]`);
            await page.click('button.submit-answer');
            await page.waitForSelector('.result-message', { timeout: 5000 });
            const result = await page.$eval('.result-message', el => el.innerText);
            console.log(`Результат: ${result}`);
        }
        
        // 8. Переход к следующему заданию
        await page.click('button.next-exercise');
        await page.waitForTimeout(1000);
    }
    
    console.log('Все задания обработаны.');
    await browser.close();
}

// Точка входа
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Использование: node oln_bot.js <логин> <пароль>');
    process.exit(1);
}
runBot(args[0], args[1]).catch(console.error);
