require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { User, SMI, importSMIFromCSV, initDatabase, Op } = require('./database');
const stateManager = require('./states');
const keyboards = require('./keyboards');
const fs = require('fs');

class PRBot {
  constructor(useWebhook = false) {
    const options = {
      polling: !useWebhook,
      webHook: useWebhook ? {
        port: process.env.PORT || 3600  // <-- 3600 вместо 3000
      } : false
    };

    this.bot = new TelegramBot(process.env.BOT_TOKEN, options);
    this.useWebhook = useWebhook;
    this.keyboards = keyboards;
    this.stateManager = stateManager;
    
    this.init();
  }

  init() {
    console.log('🤖 Бот инициализирован в режиме ' + (this.useWebhook ? 'вебхука' : 'поллинга'));
    
    // Команда /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      console.log(`👋 Новый пользователь: ${chatId} - ${msg.from.first_name}`);

      // Регистрируем пользователя
      await this.registerUser(chatId, msg.from);

      // Отправляем главное меню
      const isAdmin = this.isAdmin(chatId);
      
      await this.bot.sendMessage(
        chatId,
        `👋 Добро пожаловать в MediaPro!\n\nЯ помогу вам найти подходящие СМИ из базы данных.\n\nВыберите нужный раздел:`,
        keyboards.getMainMenu(isAdmin)
      );
    });

    // Обработка сообщений
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      if (!text || text.startsWith('/')) return;

      console.log(`📝 Сообщение от ${chatId}: ${text}`);

      const userState = this.stateManager.getState(chatId);

      if (userState.currentSection) {
        await this.handleSection(chatId, text, userState);
      } else {
        await this.handleMainMenu(chatId, text);
      }
    });

    // Если используется вебхук
    if (this.useWebhook) {
      const express = require('express');
      const app = express();
      app.use(express.json());

      app.post('/webhook', (req, res) => {
        this.bot.processUpdate(req.body);
        res.sendStatus(200);
      });

      app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
      });

      const port = process.env.PORT || 3600;  // <-- 3600 вместо 3000
      app.listen(port, () => {
        console.log(`🚀 Сервер запущен на порту ${port}`);
        console.log(`🌐 Вебхук: /webhook`);
        console.log(`🏥 Health check: http://localhost:${port}/health`);
      });
    }
  }

  async handleMainMenu(chatId, text) {
    const isAdmin = this.isAdmin(chatId);

    switch(text) {
      case '📰 ПОДОБРАТЬ СМИ':
        console.log('🔍 Пользователь выбрал ПОДОБРАТЬ СМИ');
        this.stateManager.updateState(chatId, {
          currentSection: 'search'
        });
        return this.bot.sendMessage(chatId, '🔍 Выберите тип поиска СМИ:', keyboards.getSMICategories());

      case '🏆 ПРЕМИИ':
        await this.bot.sendMessage(chatId, '🏆 *РАЗДЕЛ ПРЕМИЙ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(isAdmin)
        });
        break;

      case '👨‍⚖️ ЖЮРИ':
        await this.bot.sendMessage(chatId, '👨‍⚖️ *РАЗДЕЛ ЖЮРИ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(isAdmin)
        });
        break;

      case '🤝 АССОЦИАЦИИ':
        await this.bot.sendMessage(chatId, '🤝 *РАЗДЕЛ АССОЦИАЦИЙ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(isAdmin)
        });
        break;

      case '⭐ ИЗБРАННОЕ':
        await this.showFavorites(chatId);
        break;

      case '👤 ЛИЧНЫЙ КАБИНЕТ':
        this.stateManager.updateState(chatId, {
          currentSection: 'profile'
        });
        await this.bot.sendMessage(chatId, '👤 *ЛИЧНЫЙ КАБИНЕТ*\n\nВ разработке...', {
          parse_mode: 'Markdown',
          ...keyboards.getBackKeyboard()
        });
        break;

      case '📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ':
        await this.bot.sendMessage(
          chatId,
          '📞 *СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ*\n\n' +
          'Для получения консультации:\n\n' +
          '👤 Менеджер: @менеджер\n' +
          '📧 Email: manager@mediapro.com\n',
          {
            parse_mode: 'Markdown',
            ...keyboards.getBackKeyboard()
          }
        );
        break;

      case '⚙️ АДМИН-ПАНЕЛЬ':
        if (isAdmin) {
          await this.showAdminMenu(chatId);
        } else {
          await this.bot.sendMessage(chatId, '⚠️ У вас нет прав администратора');
        }
        break;

      default:
        await this.bot.sendMessage(chatId, 'Пожалуйста, выберите раздел из меню:', 
          keyboards.getMainMenu(isAdmin));
    }
  }

  async handleSection(chatId, text, state) {
    const isAdmin = this.isAdmin(chatId);

    switch(state.currentSection) {
      case 'search':
        if (text === '⚡ Быстрый поиск') {
          this.stateManager.updateState(chatId, {
            currentSection: 'quick_search'
          });
          await this.bot.sendMessage(
            chatId,
            '⚡ *БЫСТРЫЙ ПОИСК*\n\nВыберите топовую категорию:',
            {
              parse_mode: 'Markdown',
              ...keyboards.getQuickSearchCategories()
            }
          );
        } else if (text === '🔙 Назад') {
          this.stateManager.clearState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', keyboards.getMainMenu(isAdmin));
        }
        break;

      case 'quick_search':
        if (text === '🔥 ТОП Business') {
          await this.searchByCategory(chatId, 'Business', 1);
        } else if (text === '🔙 Назад') {
          this.stateManager.updateState(chatId, { currentSection: 'search' });
          await this.bot.sendMessage(chatId, '🔍 Выберите тип поиска СМИ:', keyboards.getSMICategories());
        }
        break;

      case 'profile':
        if (text === '🔙 Назад') {
          this.stateManager.clearState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', keyboards.getMainMenu(isAdmin));
        }
        break;
    }
  }

  async searchByCategory(chatId, category, page = 1) {
    try {
      const smiList = await SMI.findAll({
        where: {
          category: {
            [Op.like]: `%${category}%`
          }
        },
        limit: 5,
        offset: (page - 1) * 5,
        order: [['rating', 'DESC']]
      });

      if (smiList.length === 0) {
        return this.bot.sendMessage(
          chatId,
          `😔 По категории "${category}" ничего не найдено.`,
          keyboards.getBackKeyboard()
        );
      }

      const smi = smiList[0];
      const message = `📰 *${smi.name || 'Название не указано'}*\n\n` +
                     `🏷️ *Категория:* ${smi.category || 'не указана'}\n` +
                     `📊 *Рейтинг:* ${smi.rating || 'нет'}/10\n` +
                     `📍 *Регион:* ${smi.region || 'не указан'}\n`;

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getSMIActionsKeyboard(smi.id, false)
      });

    } catch (error) {
      console.error('Ошибка поиска:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Ошибка при поиске СМИ.',
        keyboards.getBackKeyboard()
      );
    }
  }

  async showFavorites(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      const favorites = JSON.parse(user?.favorites || '[]');
      
      if (favorites.length === 0) {
        return this.bot.sendMessage(
          chatId,
          '⭐ *ВАШЕ ИЗБРАННОЕ*\n\nВы пока ничего не добавили в избранное.',
          {
            parse_mode: 'Markdown',
            ...keyboards.getBackKeyboard()
          }
        );
      }

      const smiList = await SMI.findAll({
        where: { id: favorites.slice(0, 5) }
      });

      let message = '⭐ *ВАШЕ ИЗБРАННОЕ*\n\n';
      smiList.forEach((smi, index) => {
        message += `${index + 1}. *${smi.name}*\n`;
        message += `   Категория: ${smi.category || 'не указана'}\n\n`;
      });

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getBackKeyboard()
      });

    } catch (error) {
      console.error('Ошибка показа избранного:', error);
    }
  }

  async showAdminMenu(chatId) {
    this.stateManager.updateState(chatId, {
      currentSection: 'admin'
    });

    await this.bot.sendMessage(
      chatId,
      '⚙️ *АДМИН-ПАНЕЛЬ*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        ...keyboards.getAdminPanel()
      }
    );
  }

  async registerUser(chatId, userInfo) {
    try {
      const [user, created] = await User.findOrCreate({
        where: { telegramId: chatId },
        defaults: {
          firstName: userInfo.first_name,
          lastName: userInfo.last_name,
          username: userInfo.username,
          lastActivity: new Date()
        }
      });

      console.log(`👤 Пользователь ${created ? 'зарегистрирован' : 'обновлен'}: ${chatId}`);
    } catch (error) {
      console.error('Ошибка регистрации:', error);
    }
  }

  isAdmin(chatId) {
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    return adminIds.includes(chatId.toString());
  }
}

// Создаем и запускаем бота
if (require.main === module) {
  const useWebhook = process.env.USE_WEBHOOK === 'true';
  
  console.log(`🔄 Режим запуска: ${useWebhook ? 'Вебхук' : 'Polling'}`);
  console.log(`🌐 PORT: ${process.env.PORT || 3600}`);  // <-- 3600 вместо 3000

  initDatabase().then(() => {
    console.log('✅ База данных готова к работе');
    
    const prBot = new PRBot(useWebhook);
    
    if (useWebhook) {
      console.log("🚀 Запуск бота в режиме вебхука...");
      console.log("✅ Бот запущен в режиме вебхука!");
    } else {
      console.log("✅ Бот успешно запущен локально (polling)!");
    }
  }).catch(err => {
    console.error('❌ Ошибка инициализации БД:', err.message);
    
    const prBot = new PRBot(useWebhook);
    
    if (useWebhook) {
      console.log("🚀 Запуск бота в режиме вебхука...");
      console.log("✅ Бот запущен в режиме вебхука!");
    } else {
      console.log("✅ Бот успешно запущен локально (polling)!");
    }
  });
} else {
  module.exports = PRBot;
}
