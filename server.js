// server.js — Бот для OLM.vn с веб-интерфейсом
// Запуск: node server.js
// Зависимости: npm install express puppeteer-extra puppeteer-extra-plugin-stealth

const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname)); // отдаём index.html и style.css

// Основной обработчик запуска бота
app.post('/api/run-bot', async (req, res) => {
  const { username, password, url, answers } = req.body;
  if (!username || !password || !url || !answers) {
    return res.json({ success: false, error: 'Все поля обязательны.' });
  }

  try {
    const result = await runBot(username, password, url, answers);
    res.json({ success: true, ...result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Основная функция автоматизации
async function runBot(login, pass, assignmentUrl, answersText) {
  // Парсим базу ответов (вопрос|ответ)
  const answerMap = new Map();
  for (let line of answersText.split('\n')) {
    line = line.trim();
    if (!line) continue;
    const sepIndex = line.indexOf('|');
    if (sepIndex === -1) continue;
    const question = line.substring(0, sepIndex).trim().toLowerCase();
    const answer = line.substring(sepIndex + 1).trim();
    answerMap.set(question, answer);
  }

  // Запускаем браузер в headless-режиме
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Устанавливаем реалистичный User-Agent и viewport
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Шаг 1: Авторизация
    await page.goto('https://olm.vn/dang-nhap', { waitUntil: 'networkidle2' });
    // Согласие с куки (если появится)
    try {
      await page.waitForSelector('button:has-text("Đồng ý")', { timeout: 3000 });
      await page.click('button:has-text("Đồng ý")');
    } catch (_) {}

    await page.waitForSelector('input[name="username"]');
    await page.type('input[name="username"]', login);
    await page.type('input[name="password"]', pass);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // Проверка успешного входа (если редирект на страницу входа — ошибка)
    if (page.url().includes('dang-nhap')) {
      throw new Error('Неверный логин или пароль.');
    }

    // Шаг 2: Переход к заданию
    await page.goto(assignmentUrl, { waitUntil: 'networkidle2' });

    // Шаг 3: Извлечение вопросов и вариантов
    const questionsData = await page.evaluate(() => {
      const result = [];
      // Селекторы зависят от вёрстки OLM.vn (обновляются при необходимости)
      document.querySelectorAll('.question-item, .question-box, div[class*="question"]').forEach((block) => {
        const qEl = block.querySelector('.question-text, .qtext, p');
        if (!qEl) return;
        const question = qEl.innerText.trim();
        const options = [];
        block.querySelectorAll('.answer-item label, .option label, label').forEach((opt) => {
          const text = opt.innerText.trim();
          if (text && !options.includes(text)) options.push(text);
        });
        if (question && options.length > 0) {
          result.push({ question, options, elementClass: block.className }); // сохраняем привязку
        }
      });
      return result;
    });

    if (questionsData.length === 0) {
      throw new Error('Не удалось найти вопросы на странице.');
    }

    // Шаг 4: Сопоставление ответов и клик по правильным
    let answeredCount = 0;
    for (let qData of questionsData) {
      const qLower = qData.question.toLowerCase();
      let selectedAnswer = null;

      // Прямой поиск в мапе
      if (answerMap.has(qLower)) {
        selectedAnswer = answerMap.get(qLower);
      } else {
        // Частичное совпадение
        for (let [cachedQ, cachedA] of answerMap) {
          if (qLower.includes(cachedQ) || cachedQ.includes(qLower)) {
            selectedAnswer = cachedA;
            break;
          }
        }
      }

      if (!selectedAnswer) {
        // Резерв: выбираем первый вариант
        selectedAnswer = qData.options[0];
      }

      // Кликаем нужную метку внутри DOM
      const clicked = await page.evaluate(({ questionText, answerText }) => {
        // Ищем блок вопроса по тексту
        const blocks = [...document.querySelectorAll('.question-item, .question-box, div[class*="question"]')];
        for (let block of blocks) {
          const qEl = block.querySelector('.question-text, .qtext, p');
          if (qEl && qEl.innerText.trim() === questionText) {
            // В этом блоке ищем метку с текстом ответа
            const labels = block.querySelectorAll('label');
            for (let label of labels) {
              if (label.innerText.trim() === answerText) {
                label.click();
                return true;
              }
            }
          }
        }
        return false;
      }, { questionText: qData.question, answerText: selectedAnswer });

      if (clicked) answeredCount++;
      // Небольшая пауза, чтобы не вызвать подозрений
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
    }

    // Шаг 5: Отправка всех ответов (общая кнопка "Nộp bài")
    try {
      await page.waitForSelector('button:has-text("Nộp bài"), button:has-text("Gửi")', { timeout: 5000 });
      await page.click('button:has-text("Nộp bài"), button:has-text("Gửi")');
      await page.waitForTimeout(2000);
    } catch (_) {
      // Возможно, ответы отправляются автоматически после каждого клика
    }

    await browser.close();
    return {
      answered: answeredCount,
      total: questionsData.length
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`Бот-сервер OLM.vn запущен на http://localhost:${PORT}`);
});
