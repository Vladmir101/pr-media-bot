require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { User, SMI, importSMIFromCSV, searchSMILikeCSV, initDatabase, Op, fixSMITable } = require('./database');
const stateManager = require('./states');
const keyboards = require('./keyboards');
const fs = require('fs');

class PRBot {
  constructor(useWebhook = false) {
    const options = {
      polling: !useWebhook,
      webHook: useWebhook ? {
        port: process.env.PORT || 3000
      } : false
    };

    this.bot = new TelegramBot(process.env.BOT_TOKEN, options);
    this.useWebhook = useWebhook;
    this.keyboards = keyboards;
    this.stateManager = stateManager;

    // Инициализация
    this.init();
  }

  init() {
    console.log('🤖 Бот инициализирован в режиме ' + (this.useWebhook ? 'вебхука' : 'поллинга'));
    
    // Обработчики команд
    this.bot.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        console.error('Ошибка обработки сообщения:', error.message);
      }
    });

    // Обработчики callback-запросов (inline кнопки)
    this.bot.on('callback_query', async (callbackQuery) => {
      try {
        await this.handleCallbackQuery(callbackQuery);
      } catch (error) {
        console.error('Ошибка обработки callback:', error.message);
      }
    });

    // Команда /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      console.log(`👋 Новый пользователь: ${chatId} - ${msg.from.first_name}`);

      // Регистрируем пользователя
      await this.registerUser(chatId, msg.from);

      // Отправляем главное меню
      const isAdmin = this.isAdmin(chatId);
      const mainMenuKeyboard = keyboards.getMainMenu(isAdmin);
      
      await this.bot.sendMessage(
        chatId,
        `👋 Добро пожаловать в MediaPro!\n\nЯ помогу вам найти подходящие СМИ из базы данных.\n\nВыберите нужный раздел:`,
        mainMenuKeyboard
      );
    });

    // Команда /help
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      this.bot.sendMessage(
        chatId,
        `📚 *Помощь по боту MediaPro*\n\n` +
        `Основные команды:\n` +
        `/start - Главное меню\n` +
        `/search - Поиск СМИ\n` +
        `/stats - Статистика\n` +
        `/check - Проверка системы\n\n` +
        `Админ-команды:\n` +
        `/import - Импорт CSV\n` +
        `/broadcast - Рассылка`,
        { parse_mode: 'Markdown' }
      );
    });

    // Команда /check
    this.bot.onText(/\/check/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showSystemCheck(chatId);
    });

    // Команда /import (только для админов)
    this.bot.onText(/\/import/, async (msg) => {
      const chatId = msg.chat.id;
      if (this.isAdmin(chatId)) {
        await this.startCSVImport(chatId);
      } else {
        this.bot.sendMessage(chatId, '⚠️ У вас нет прав администратора');
      }
    });

    // Команда /stats
    this.bot.onText(/\/stats/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showStats(chatId);
    });

    // Если используется вебхук
    if (this.useWebhook) {
      const express = require('express');
      const app = express();
      app.use(express.json());

      // Эндпоинт для вебхука
      app.post('/webhook', (req, res) => {
        this.bot.processUpdate(req.body);
        res.sendStatus(200);
      });

      // Health check
      app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
      });

      const port = process.env.PORT || 3000;
      app.listen(port, () => {
        console.log(`🚀 Сервер запущен на порту ${port}`);
        console.log(`🌐 Вебхук: /webhook`);
        console.log(`🏥 Health check: http://localhost:${port}/health`);
      });
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    console.log(`📝 Сообщение от ${chatId}: ${text}`);

    // Проверяем состояние пользователя
    const userState = this.stateManager.getState(chatId);

    if (userState.currentSection) {
      await this.handleSection(chatId, text, userState);
    } else {
      await this.handleMainMenu(chatId, text);
    }
  }

  async handleMainMenu(chatId, text) {
    const isAdmin = this.isAdmin(chatId);

    switch(text) {
      case '📰 ПОДОБРАТЬ СМИ':
        console.log('🔍 Пользователь выбрал ПОДОБРАТЬ СМИ');
        stateManager.updateState(chatId, {
          currentSection: 'search'
        });
        const categoriesKeyboard = keyboards.getSMICategories();
        return this.bot.sendMessage(chatId, '🔍 Выберите тип поиска СМИ:', categoriesKeyboard);

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
        stateManager.updateState(chatId, {
          currentSection: 'profile'
        });
        await this.bot.sendMessage(chatId, '👤 *ЛИЧНЫЙ КАБИНЕТ*\n\nВ разработке...', {
          parse_mode: 'Markdown',
          ...keyboards.getBackKeyboard()
        });
        break;

      case '📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ':
        await this.showContactManager(chatId);
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
          await this.showQuickSearch(chatId);
        } else if (text === '🔍 Расширенный поиск') {
          await this.bot.sendMessage(chatId, '🔍 *РАСШИРЕННЫЙ ПОИСК*\n\nФункционал в разработке', {
            parse_mode: 'Markdown',
            ...keyboards.getBackKeyboard()
          });
        } else if (text === '🏆 Премии и конкурсы') {
          await this.bot.sendMessage(chatId, '🏆 *ПРЕМИИ И КОНКУРСЫ*\n\nФункционал в разработке', {
            parse_mode: 'Markdown',
            ...keyboards.getBackKeyboard()
          });
        } else if (text === '🔙 Назад') {
          stateManager.clearState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', keyboards.getMainMenu(isAdmin));
        }
        break;

      case 'quick_search':
        if (text === '🔥 ТОП Business') {
          await this.searchByCategory(chatId, 'Business', 1);
        } else if (text === '📱 ТОП Tech & Startups') {
          await this.searchByCategory(chatId, 'Tech', 1);
        } else if (text === '💰 ТОП Finance') {
          await this.searchByCategory(chatId, 'Finance', 1);
        } else if (text === '🌿 ТОП Lifestyle & Eco') {
          await this.searchByCategory(chatId, 'Lifestyle', 1);
        } else if (text === '🔙 Назад') {
          stateManager.updateState(chatId, { currentSection: 'search' });
          await this.bot.sendMessage(chatId, '🔍 Выберите тип поиска СМИ:', keyboards.getSMICategories());
        }
        break;

      case 'profile':
        if (text === '🔙 Назад') {
          stateManager.clearState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', keyboards.getMainMenu(isAdmin));
        }
        break;

      case 'admin':
        if (text === '📊 Статистика') {
          await this.showAdminStats(chatId);
        } else if (text === '📁 Импорт CSV') {
          await this.startCSVImport(chatId);
        } else if (text === '📢 Рассылка') {
          await this.startBroadcast(chatId);
        } else if (text === '🔙 На главную') {
          stateManager.clearState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', keyboards.getMainMenu(isAdmin));
        }
        break;

      default:
        stateManager.clearState(chatId);
        await this.bot.sendMessage(chatId, 'Главное меню:', keyboards.getMainMenu(isAdmin));
    }
  }

  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    console.log(`🔘 Callback от ${chatId}: ${data}`);

    if (data.startsWith('page_')) {
      const parts = data.split('_');
      const page = parseInt(parts[1]);
      const queryId = parts[2] || '';
      await this.handlePagination(chatId, page, queryId);
    } else if (data.startsWith('toggle_fav_')) {
      const smiId = data.split('_')[2];
      await this.toggleFavorite(chatId, smiId, callbackQuery.message.message_id);
    } else if (data.startsWith('contacts_')) {
      const smiId = data.split('_')[1];
      await this.showContacts(chatId, smiId);
    } else if (data.startsWith('website_')) {
      const smiId = data.split('_')[1];
      await this.showWebsite(chatId, smiId);
    }

    // Подтверждаем обработку callback
    this.bot.answerCallbackQuery(callbackQuery.id);
  }

  async showQuickSearch(chatId) {
    stateManager.updateState(chatId, {
      currentSection: 'quick_search'
    });

    await this.bot.sendMessage(
      chatId,
      '⚡ *БЫСТРЫЙ ПОИСК*\n\nВыберите топовую категорию для поиска СМИ:',
      {
        parse_mode: 'Markdown',
        ...keyboards.getQuickSearchCategories()
      }
    );
  }

  async searchByCategory(chatId, category, page = 1) {
    try {
      const limit = 5;
      const offset = (page - 1) * limit;

      // Ищем СМИ по категории
      const smiList = await SMI.findAll({
        where: {
          category: {
            [Op.like]: `%${category}%`
          }
        },
        limit: limit + 1, // +1 чтобы узнать есть ли следующая страница
        offset: offset,
        order: [['rating', 'DESC']]
      });

      const hasNextPage = smiList.length > limit;
      const currentItems = hasNextPage ? smiList.slice(0, limit) : smiList;
      const totalPages = Math.ceil((await SMI.count({
        where: { category: { [Op.like]: `%${category}%` } }
      })) / limit);

      if (currentItems.length === 0) {
        return this.bot.sendMessage(
          chatId,
          `😔 По категории "${category}" ничего не найдено.\nПопробуйте другую категорию.`,
          keyboards.getBackKeyboard()
        );
      }

      // Отправляем первый результат с пагинацией
      const smi = currentItems[0];
      const message = this.formatSMIMessage(smi, page, totalPages);
      const paginationKeyboard = keyboards.getPaginationKeyboard(page, totalPages, category);
      const actionsKeyboard = keyboards.getSMIActionsKeyboard(smi.id, false);

      // Комбинируем клавиатуры
      const combinedKeyboard = {
        reply_markup: {
          inline_keyboard: [
            ...paginationKeyboard.reply_markup.inline_keyboard,
            ...actionsKeyboard.reply_markup.inline_keyboard
          ]
        }
      };

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...combinedKeyboard
      });

    } catch (error) {
      console.error('Ошибка поиска по категории:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Ошибка при поиске СМИ. Попробуйте позже.',
        keyboards.getBackKeyboard()
      );
    }
  }

  async handlePagination(chatId, page, queryId) {
    await this.searchByCategory(chatId, queryId, page);
  }

  formatSMIMessage(smi, currentPage, totalPages) {
    return `📰 *${smi.name || 'Название не указано'}*\n\n` +
           `📊 *Рейтинг:* ${smi.rating || 'нет'}/10\n` +
           `🏷️ *Категория:* ${smi.category || 'не указана'}\n` +
           `📍 *Регион:* ${smi.region || 'не указан'}\n` +
           `👥 *Аудитория:* ${smi.audience || 'нет данных'}\n` +
           `💬 *Язык:* ${smi.language || 'не указан'}\n` +
           `💰 *Стоимость:* ${smi.price || 'не указана'}\n` +
           `📞 *Контакты:* ${smi.contacts ? 'есть' : 'нет'}\n` +
           `🌐 *Сайт:* ${smi.website ? 'есть' : 'нет'}\n\n` +
           `📄 *Описание:*\n${smi.description || 'Описание отсутствует'}\n\n` +
           `📑 *Страница ${currentPage} из ${totalPages}*`;
  }

  async toggleFavorite(chatId, smiId, messageId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      const smi = await SMI.findByPk(smiId);

      if (!user || !smi) {
        return;
      }

      // Проверяем, есть ли уже в избранном
      const favorites = JSON.parse(user.favorites || '[]');
      const index = favorites.indexOf(smiId);

      if (index === -1) {
        // Добавляем в избранное
        favorites.push(smiId);
        await user.update({ favorites: JSON.stringify(favorites) });
        
        // Обновляем inline кнопку
        const updatedKeyboard = keyboards.getSMIActionsKeyboard(smiId, true);
        this.bot.editMessageReplyMarkup(updatedKeyboard.reply_markup, {
          chat_id: chatId,
          message_id: messageId
        });
        
        this.bot.sendMessage(chatId, '✅ Добавлено в избранное!');
      } else {
        // Удаляем из избранного
        favorites.splice(index, 1);
        await user.update({ favorites: JSON.stringify(favorites) });
        
        // Обновляем inline кнопку
        const updatedKeyboard = keyboards.getSMIActionsKeyboard(smiId, false);
        this.bot.editMessageReplyMarkup(updatedKeyboard.reply_markup, {
          chat_id: chatId,
          message_id: messageId
        });
        
        this.bot.sendMessage(chatId, '❌ Удалено из избранного');
      }
    } catch (error) {
      console.error('Ошибка обновления избранного:', error);
    }
  }

  async showContacts(chatId, smiId) {
    try {
      const smi = await SMI.findByPk(smiId);
      if (smi && smi.contacts) {
        await this.bot.sendMessage(
          chatId,
          `📞 *Контакты ${smi.name}:*\n\n${smi.contacts}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await this.bot.sendMessage(chatId, '❌ Контакты не указаны');
      }
    } catch (error) {
      console.error('Ошибка получения контактов:', error);
      await this.bot.sendMessage(chatId, '❌ Ошибка получения контактов');
    }
  }

  async showWebsite(chatId, smiId) {
    try {
      const smi = await SMI.findByPk(smiId);
      if (smi && smi.website) {
        await this.bot.sendMessage(
          chatId,
          `🌐 *Сайт ${smi.name}:*\n\n${smi.website}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await this.bot.sendMessage(chatId, '❌ Сайт не указан');
      }
    } catch (error) {
      console.error('Ошибка получения сайта:', error);
      await this.bot.sendMessage(chatId, '❌ Ошибка получения сайта');
    }
  }

  async showFavorites(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (!user) {
        return this.bot.sendMessage(chatId, '❌ Пользователь не найден');
      }

      const favorites = JSON.parse(user.favorites || '[]');
      
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

      // Получаем информацию о первых 5 избранных СМИ
      const smiList = await SMI.findAll({
        where: { id: favorites.slice(0, 5) }
      });

      let message = '⭐ *ВАШЕ ИЗБРАННОЕ*\n\n';
      smiList.forEach((smi, index) => {
        message += `${index + 1}. *${smi.name}*\n`;
        message += `   Категория: ${smi.category || 'не указана'}\n`;
        message += `   Рейтинг: ${smi.rating || 'нет'}/10\n\n`;
      });

      if (favorites.length > 5) {
        message += `\n...и еще ${favorites.length - 5} СМИ`;
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getBackKeyboard()
      });

    } catch (error) {
      console.error('Ошибка показа избранного:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Ошибка загрузки избранного',
        keyboards.getBackKeyboard()
      );
    }
  }

  async showContactManager(chatId) {
    await this.bot.sendMessage(
      chatId,
      '📞 *СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ*\n\n' +
      'Для получения консультации или сотрудничества:\n\n' +
      '👤 *Менеджер:* @ваш_менеджер\n' +
      '📧 *Email:* manager@mediapro.com\n' +
      '☎️ *Телефон:* +7 (XXX) XXX-XX-XX\n\n' +
      '_Мы ответим вам в течение рабочего дня_',
      {
        parse_mode: 'Markdown',
        ...keyboards.getBackKeyboard()
      }
    );
  }

  async showAdminMenu(chatId) {
    stateManager.updateState(chatId, {
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

  async showAdminStats(chatId) {
    try {
      const userCount = await User.count();
      const smiCount = await SMI.count();
      const activeToday = await User.count({
        where: {
          lastActivity: {
            [Op.gte]: new Date(new Date() - 24 * 60 * 60 * 1000)
          }
        }
      });

      await this.bot.sendMessage(
        chatId,
        `📊 *СТАТИСТИКА СИСТЕМЫ*\n\n` +
        `👥 Пользователей: ${userCount}\n` +
        `📰 Записей СМИ: ${smiCount}\n` +
        `🔄 Активных за 24ч: ${activeToday}\n` +
        `⏰ Сервер: ${new Date().toLocaleString('ru-RU')}`,
        {
          parse_mode: 'Markdown',
          ...keyboards.getBackKeyboard()
        }
      );
    } catch (error) {
      console.error('Ошибка статистики:', error);
      await this.bot.sendMessage(chatId, '❌ Ошибка получения статистики');
    }
  }

  async startCSVImport(chatId) {
    try {
      await this.bot.sendMessage(
        chatId,
        '📁 *ИМПОРТ CSV*\n\n' +
        'Начинаю импорт данных из CSV файла...\n' +
        'Это может занять несколько минут.',
        { parse_mode: 'Markdown' }
      );

      const result = await importSMIFromCSV('smi-import-fixed.csv');
      
      await this.bot.sendMessage(
        chatId,
        `✅ *ИМПОРТ ЗАВЕРШЕН*\n\n` +
        `📊 Результаты:\n` +
        `• Обработано: ${result.processed} записей\n` +
        `• Добавлено: ${result.added} новых\n` +
        `• Обновлено: ${result.updated} существующих\n` +
        `• Ошибок: ${result.errors}\n\n` +
        `⏰ Время: ${result.duration} сек.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Ошибка импорта:', error);
      await this.bot.sendMessage(
        chatId,
        `❌ *ОШИБКА ИМПОРТА*\n\n${error.message}`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async startBroadcast(chatId) {
    await this.bot.sendMessage(
      chatId,
      '📢 *РАССЫЛКА*\n\n' +
      'Функционал рассылки в разработке.\n' +
      'Скоро здесь можно будет отправлять сообщения всем пользователей.',
      {
        parse_mode: 'Markdown',
        ...keyboards.getBackKeyboard()
      }
    );
  }

  async showSystemCheck(chatId) {
    try {
      const userCount = await User.count();
      const smiCount = await SMI.count();
      const csvExists = fs.existsSync('smi-import-fixed.csv');
      const csvSize = csvExists ? Math.round(fs.statSync('smi-import-fixed.csv').size / 1024 / 1024 * 100) / 100 : 0;

      await this.bot.sendMessage(
        chatId,
        `✅ *СИСТЕМА РАБОТАЕТ НОРМАЛЬНО*\n\n` +
        `🗄️ База данных: ✅ Подключена\n` +
        `📰 Записей СМИ: ${smiCount}\n` +
        `👥 Пользователей: ${userCount}\n` +
        `📁 CSV файл: ${csvExists ? '✅ Найден' : '❌ Отсутствует'}\n` +
        `📊 Размер CSV: ${csvSize} MB\n\n` +
        `🎯 Доступные команды:\n` +
        `/search - Поиск СМИ\n` +
        `/stats - Статистика\n` +
        `/import - Импорт CSV (админ)\n` +
        `/check - Проверка системы`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Ошибка проверки системы:', error);
      await this.bot.sendMessage(
        chatId,
        `❌ *ОШИБКА ПРОВЕРКИ СИСТЕМЫ*\n\n${error.message}`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async showStats(chatId) {
    try {
      const userCount = await User.count();
      const smiCount = await SMI.count();

      await this.bot.sendMessage(
        chatId,
        `📊 *СТАТИСТИКА БОТА*\n\n` +
        `📰 Всего СМИ в базе: ${smiCount}\n` +
        `👥 Зарегистрировано пользователей: ${userCount}\n` +
        `⏰ Обновлено: ${new Date().toLocaleString('ru-RU')}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Ошибка статистики:', error);
      await this.bot.sendMessage(chatId, '❌ Ошибка получения статистики');
    }
  }

  async registerUser(chatId, userInfo) {
    try {
      const [user, created] = await User.findOrCreate({
        where: { telegramId: chatId },
        defaults: {
          firstName: userInfo.first_name,
          lastName: userInfo.last_name,
          username: userInfo.username,
          languageCode: userInfo.language_code,
          lastActivity: new Date()
        }
      });

      if (!created) {
        await user.update({
          lastActivity: new Date(),
          firstName: userInfo.first_name,
          lastName: userInfo.last_name,
          username: userInfo.username
        });
      }

      console.log(`👤 Пользователь ${created ? 'зарегистрирован' : 'обновлен'}: ${chatId}`);
    } catch (error) {
      console.error('Ошибка регистрации пользователя:', error);
    }
  }

  isAdmin(chatId) {
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    return adminIds.includes(chatId.toString());
  }

  startWebhook(webhookPath, port) {
    const webhookUrl = process.env.RENDER_EXTERNAL_URL || 
                      process.env.RAILWAY_STATIC_URL || 
                      process.env.REPLIT_URL || 
                      `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;

    const fullWebhookUrl = `${webhookUrl}${webhookPath}`;
    
    console.log(`🔗 Устанавливаю вебхук: ${fullWebhookUrl}`);
    
    this.bot.setWebHook(fullWebhookUrl)
      .then(() => {
        console.log('✅ Вебхук установлен:', fullWebhookUrl);
        console.log('✅ Бот запущен в режиме вебхука!');
      })
      .catch(err => {
        console.error('❌ Ошибка установки вебхука:', err.message);
      });
  }
}

module.exports = PRBot;
