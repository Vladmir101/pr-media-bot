require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initDatabase } = require('./database');

// Инициализация базы данных
initDatabase().then(() => {
  console.log('✅ База данных готова к работе');
}).catch(err => {
  console.error('❌ Ошибка БД:', err.message);
});

// Создаем Express приложение
const app = express();
app.use(express.json());

// Создаем бота (без polling для вебхука)
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: false,
  request: {
    timeout: 60000
  }
});

// ========== НАСТРОЙКА ВЕБХУКА ==========
if (process.env.RENDER_EXTERNAL_HOSTNAME) {
  const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;
  console.log(`🔗 Устанавливаю вебхук: ${webhookUrl}`);
  
  bot.setWebHook(webhookUrl)
    .then(() => console.log('✅ Вебхук установлен!'))
    .catch(err => console.error('❌ Ошибка вебхука:', err));
}

// ========== ОБРАБОТЧИКИ БОТА ==========

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`👋 Новый пользователь: ${chatId} - ${msg.from.first_name}`);
  
  await bot.sendMessage(
    chatId,
    `👋 *Добро пожаловать в MediaPro!*\n\nЯ помогу вам найти подходящие СМИ из базы данных.\n\nВыберите нужный раздел:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '📰 ПОДОБРАТЬ СМИ' }],
          [{ text: '🏆 ПРЕМИИ' }],
          [
            { text: '👨‍⚖️ ЖЮРИ' },
            { text: '🤝 АССОЦИАЦИИ' }
          ],
          [
            { text: '⭐ ИЗБРАННОЕ' },
            { text: '👤 ЛИЧНЫЙ КАБИНЕТ' }
          ],
          [{ text: '📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ' }]
        ],
        resize_keyboard: true
      }
    }
  );
});

// Обработка кнопки "ПОДОБРАТЬ СМИ"
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  console.log(`📝 Сообщение от ${chatId}: ${text}`);
  
  if (text === '📰 ПОДОБРАТЬ СМИ') {
    await bot.sendMessage(
      chatId,
      '🔍 *Выберите тип поиска СМИ:*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '⚡ Быстрый поиск' }],
            [{ text: '🔍 Расширенный поиск' }],
            [{ text: '🏆 Премии и конкурсы' }],
            [{ text: '🔙 Назад' }]
          ],
          resize_keyboard: true
        }
      }
    );
  } else if (text === '🔙 Назад') {
    await bot.sendMessage(
      chatId,
      'Главное меню:',
      {
        reply_markup: {
          keyboard: [
            [{ text: '📰 ПОДОБРАТЬ СМИ' }],
            [{ text: '🏆 ПРЕМИИ' }],
            [
              { text: '👨‍⚖️ ЖЮРИ' },
              { text: '🤝 АССОЦИАЦИИ' }
            ],
            [
              { text: '⭐ ИЗБРАННОЕ' },
              { text: '👤 ЛИЧНЫЙ КАБИНЕТ' }
            ],
            [{ text: '📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ' }]
          ],
          resize_keyboard: true
        }
      }
    );
  } else if (text === '⭐ ИЗБРАННОЕ') {
    await bot.sendMessage(
      chatId,
      '⭐ *ИЗБРАННОЕ*\n\nФункционал в разработке',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [[{ text: '🔙 Назад' }]],
          resize_keyboard: true
        }
      }
    );
  }
});

// ========== ЭНДПОИНТЫ ДЛЯ RENDER ==========

// Вебхук от Telegram
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Health check для Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    bot: 'running',
    timestamp: new Date().toISOString() 
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>MediaPro Bot</title></head>
      <body>
        <h1>🤖 MediaPro Bot работает!</h1>
        <p>Бот для подбора СМИ и PR-услуг</p>
        <p><a href="/health">Проверить статус</a></p>
      </body>
    </html>
  `);
});

// ========== ВАЖНО: НЕ ЗАПУСКАЕМ СЕРВЕР ВРУЧНУЮ! ==========
// Render сам запустит приложение на нужном порту

// Экспортируем app для Render
module.exports = app;

// Если запускаем локально (для тестов)
if (require.main === module) {
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`🚀 Сервер запущен локально на порту ${port}`);
  });
}
