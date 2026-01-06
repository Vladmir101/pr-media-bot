require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { User, SMI, Award, Jury, Association, SearchQuery, findSMI, importSMIFromCSV, searchSMILikeCSV, initDatabase, Op, fixSMITable } = require('./database');
const keyboards = require('./keyboards');
const stateManager = require('./states');
const utils = require('./utils');
const fs = require('fs');
const path = require('path');

class PRBot {
  constructor(useWebhook = false) {
    // Опции для бота
    const options = {
      request: {
        timeout: 60000
      }
    };
    
    // Если нужен вебхук (для Replit/Railway/Render)
    if (useWebhook) {
      // Без polling, будем обрабатывать вебхуки
      this.bot = new TelegramBot(process.env.BOT_TOKEN, options);
      console.log('🤖 Бот инициализирован в режиме вебхука');
    } else {
      // Для локального запуска оставляем polling
      options.polling = true;
      this.bot = new TelegramBot(process.env.BOT_TOKEN, options);
      console.log('🤖 Бот инициализирован в режиме polling');
    }
    
    // СПИСОК АДМИНИСТРАТОРОВ - ЗАМЕНИТЕ НА ВАШ TELEGRAM ID!
    this.ADMIN_IDS = process.env.ADMIN_IDS ? 
      process.env.ADMIN_IDS.split(',') : 
      ['5970834739'];
    
    // Инициализируем парсер PR-новостей
    this.prParser = new (require('./pr-news-parser'))();
    
    this.initHandlers();
    this.initCSVCommands(); // Добавляем CSV команды
    this.initQuickSearch(); // Добавляем быстрый поиск
  }
  
  // Метод для запуска через вебхук
  startWebhook(webhookPath, port = process.env.PORT || 3000) {
    // Устанавливаем вебхук
    const webhookUrl = process.env.WEBHOOK_URL || `${process.env.REPLIT_URL || process.env.RAILWAY_URL || process.env.RENDER_URL || ''}${webhookPath}`;
    
    console.log(`🔗 Устанавливаю вебхук: ${webhookUrl}`);
    
    this.bot.setWebHook(webhookUrl)
      .then(() => {
        console.log(`✅ Вебхук установлен: ${webhookUrl}`);
      })
      .catch(err => {
        console.error('❌ Ошибка установки вебхука:', err);
      });
    
    // Создаем endpoint для вебхука
    const express = require('express');
    const app = express();
    app.use(express.json());
    
    // Health check endpoint для Render
    app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });
    
    // Обработчик вебхука от Telegram
    app.post(webhookPath, (req, res) => {
      this.bot.processUpdate(req.body);
      res.sendStatus(200);
    });
    
    // Стартуем сервер
    app.listen(port, () => {
      console.log(`🚀 Сервер запущен на порту ${port}`);
      console.log(`🌐 Вебхук: ${webhookPath}`);
      console.log(`🏥 Health check: http://localhost:${port}/health`);
    });
    
    return app;
  }
  
  // Проверка является ли пользователь администратором
  isAdmin(chatId) {
    return this.ADMIN_IDS.includes(chatId.toString());
  }
  
  // Инициализация обработчиков
  initHandlers() {
    // Команда /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      await this.registerUser(msg);
      stateManager.resetState(chatId);
      
      const welcomeMessage = `👋 *Добро пожаловать в PR-агентство MediaPro!*\n\n` +
        `Я помогу вам подобрать СМИ, премии, экспертов для жюри и профессиональные ассоциации.\n\n` +
        `Выберите нужный раздел:`;
      
      // Проверяем, админ ли этот пользователь
      const isAdmin = this.isAdmin(chatId);
      
      await this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        ...keyboards.getMainMenu(isAdmin)
      });
    });
    
    // Команда /admin
    this.bot.onText(/\/admin/, async (msg) => {
      const chatId = msg.chat.id;
      
      if (this.isAdmin(chatId)) {
        await this.showAdminMenu(chatId);
      } else {
        await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
      }
    });
    
    // Команда /quick
    this.bot.onText(/\/quick/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showQuickSearchMenu(chatId);
    });
    
    // Команда /price
    this.bot.onText(/\/price/, async (msg) => {
      const chatId = msg.chat.id;
      
      stateManager.updateState(chatId, {
        currentSection: 'smi',
        step: 'price_menu'
      });
      
      await this.bot.sendMessage(chatId, '💵 *ФИЛЬТРАЦИЯ ПО ЦЕНЕ*\n\nВыберите ценовой диапазон:', {
        parse_mode: 'Markdown',
        ...keyboards.getPriceOptions ? keyboards.getPriceOptions() : {
          reply_markup: {
            keyboard: [
              ['💰 До 50K руб.', '💰 50K-100K руб.'],
              ['💰 100K-200K руб.', '💎 200K+ руб.'],
              ['⬅️ НАЗАД', '🏠 Главное меню']
            ],
            resize_keyboard: true
          }
        }
      });
    });
    
    // Обработка текстовых сообщений
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      
      if (text.startsWith('/')) return; // Пропускаем команды
      
      const userState = stateManager.getState(chatId);
      
      // Проверка на админ-команды (ДАЖЕ ЕСЛИ ЕСТЬ currentSection!)
      if (this.isAdmin(chatId)) {
        const adminCommands = [
          '📊 Статистика бота', '👥 Пользователи',
          '📰 Управление СМИ', '🏆 Управление премиями',
          '📥 Экспорт данных', '🗑️ Очистить кэш',
          '🌐 Веб-админка', '📢 Рассылка',
          '⚙️ АДМИН-ПАНЕЛЬ', '🏠 Главное меню',
          '🔙 Назад в админку'
        ];
        
        if (adminCommands.includes(text)) {
          await this.handleAdminCommand(chatId, text);
          return;
        }
      }
      
      // Если пользователь в разделе PR-новостей
      if (userState.currentSection === 'pr_news') {
        await this.handlePRNews(chatId, text, userState);
        return;
      }
      
      // Главное меню
      if (!userState.currentSection) {
        await this.handleMainMenu(chatId, text);
      } 
      // Раздел СМИ
      else if (userState.currentSection === 'smi') {
        await this.handleSMIFlow(chatId, text, userState);
      }
      // Раздел премий
      else if (userState.currentSection === 'awards') {
        await this.bot.sendMessage(chatId, '🏆 *РАЗДЕЛ ПРЕМИЙ*\n\nФункционал в разработке. Скоро будет доступен!', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        stateManager.resetState(chatId);
      }
      // Раздел личного кабинета
      else if (userState.currentSection === 'profile') {
        await this.handleProfile(chatId, text, userState);
      }
      // Быстрый поиск
      else if (userState.currentSection === 'quick_search') {
        await this.handleQuickSearch(chatId, text, userState);
      }
    });
    
    // Обработка инлайн-кнопок
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;
      
      // Пагинация
      if (data.startsWith('page_')) {
        const [_, searchId, page] = data.split('_');
        await this.showResultsPage(chatId, searchId, parseInt(page));
      }
      
      // Добавление в избранное
      else if (data.startsWith('fav_')) {
        const [_, type, itemId] = data.split('_');
        await this.addToFavorites(chatId, type, parseInt(itemId));
        await this.bot.answerCallbackQuery(query.id, { text: '✅ Добавлено в избранное' });
      }
      
      // Запрос контактов
      else if (data.startsWith('contact_')) {
        await this.showContactInfo(chatId, data);
      }
      
      // Экспорт
      else if (data.startsWith('export_')) {
        const searchId = data.split('_')[1];
        await this.exportToCSV(chatId, searchId);
      }
      
      // Новый поиск
      else if (data === 'new_search') {
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Выберите раздел:', keyboards.getMainMenu());
      }
      
      // В меню
      else if (data === 'main_menu') {
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Главное меню:', keyboards.getMainMenu());
      }
      
      // Закрыть уведомление
      await this.bot.answerCallbackQuery(query.id);
    });
  }
  
  // Инициализация CSV команд
  initCSVCommands() {
    // Команда /csv_import
    this.bot.onText(/\/csv_import/, async (msg) => {
      const chatId = msg.chat.id;
      
      // Проверка прав администратора
      if (!this.isAdmin(chatId)) {
        await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        return;
      }
      
      try {
        await this.bot.sendMessage(chatId, '🔄 Начинаю импорт данных из CSV...');
        
        const result = await importSMIFromCSV('./smi-import-fixed.csv');
        
        let response = `✅ *Импорт завершен!*\n\n`;
        response += `📊 *Результаты:*\n`;
        response += `• Прочитано записей: ${result.total}\n`;
        response += `• Добавлено новых: ${result.imported}\n`;
        response += `• Обновлено: ${result.updated}\n\n`;
        response += `Всего в базе: ${await SMI.count()} записей`;
        
        await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        
      } catch (error) {
        console.error('Ошибка импорта CSV:', error);
        await this.bot.sendMessage(chatId, `❌ Ошибка импорта: ${error.message}`);
      }
    });

    // Команда /fixtable - пересоздание таблицы с TEXT типами
    this.bot.onText(/\/fixtable/, async (msg) => {
      const chatId = msg.chat.id;
      
      if (!this.isAdmin(chatId)) {
        await this.bot.sendMessage(chatId, '⛔ Только для администраторов');
        return;
      }
      
      try {
        await this.bot.sendMessage(chatId, '🔄 Пересоздаю таблицу smis с типами TEXT...');
        
        // Используем функцию fixSMITable из database.js
        const result = await fixSMITable();
        
        if (result.success) {
          await this.bot.sendMessage(chatId, 
            '🎉 *ТАБЛИЦА ПЕРЕСОЗДАНА!*\n\n' +
            'Теперь импортируйте данные:\n' +
            '`/csv_import` - загрузит 103,000 СМИ из CSV\n\n' +
            'Ошибка "value too long" будет исправлена!',
            { parse_mode: 'Markdown' }
          );
        } else {
          await this.bot.sendMessage(chatId, `❌ Ошибка: ${result.message}`);
        }
        
      } catch (error) {
        console.error('Ошибка пересоздания таблицы:', error);
        await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
    });
    
    // Команда /generate_smi
    this.bot.onText(/\/generate_smi/, async (msg) => {
      const chatId = msg.chat.id;
      
      if (!this.isAdmin(chatId)) {
        await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        return;
      }
      
      try {
        await this.bot.sendMessage(chatId, '🔄 Генерирую тестовые данные СМИ...');
        
        const testSMI = [
          {
            name: 'Forbes Russia',
            category: 'Business',
            country: 'Russia',
            audience: '2.1M',
            audienceNumber: 2100000,
            price: 100000,
            contact: 'contact@forbes.ru',
            website: 'https://forbes.ru',
            description: 'TOP business media in Russia',
            backdated: false
          },
          {
            name: 'VC.ru',
            category: 'Technology',
            country: 'Russia',
            audience: '850K',
            audienceNumber: 850000,
            price: 75000,
            contact: 'pr@vc.ru',
            website: 'https://vc.ru',
            description: 'Tech audience',
            backdated: true
          },
          {
            name: 'Новое СМИ 1',
            category: 'News',
            country: 'Russia',
            audience: '1.5M',
            audienceNumber: 1500000,
            price: 80000,
            contact: 'info@new.ru',
            website: 'https://new-media.ru',
            description: 'New media platform',
            backdated: false
          },
          {
            name: 'Новое СМИ 2',
            category: 'Business',
            country: 'USA',
            audience: '3M',
            audienceNumber: 3000000,
            price: 150000,
            contact: 'media@usa.com',
            website: 'https://usamedia.com',
            description: 'International media',
            backdated: true
          }
        ];
        
        const headers = ['name', 'category', 'country', 'backdated', 'audience', 'audienceNumber', 'contact', 'price', 'description', 'website'];
        let csvContent = headers.join(',') + '\n';
        
        testSMI.forEach(item => {
          const row = [
            '"' + item.name.replace(/"/g, '""') + '"',
            '"' + item.category + '"',
            '"' + item.country + '"',
            item.backdated ? 'true' : 'false',
            '"' + item.audience + '"',
            item.audienceNumber,
            '"' + item.contact + '"',
            item.price,
            '"' + item.description.replace(/"/g, '""') + '"',
            '"' + item.website + '"'
          ];
          csvContent += row.join(',') + '\n';
        });
        
        const filename = 'bot-generated-smi.csv';
        fs.writeFileSync(filename, csvContent, 'utf8');
        
        let response = '✅ *Сгенерированы тестовые данные:*\n\n';
        testSMI.forEach((item, index) => {
          response += `${index + 1}. *${item.name}*\n`;
          response += `   Категория: ${item.category}\n`;
          response += `   Страна: ${item.country}\n`;
          response += `   Цена: ${item.price.toLocaleString('ru-RU')} руб.\n\n`;
        });
        
        response += `Файл: \`${filename}\`\n`;
        response += 'Используйте `/csv_import` для импорта';
        
        await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        
      } catch (error) {
        console.error('Ошибка генерации:', error);
        await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
    });
    
    // Команда /csv_search
    this.bot.onText(/\/csv_search/, async (msg) => {
      const chatId = msg.chat.id;
      
      const keyboard = {
        reply_markup: {
          keyboard: [
            ['🔍 Бизнес-СМИ', '💻 IT-СМИ', '📰 Новостные'],
            ['🇷🇺 Российские', '🌍 Международные'],
            ['💰 До 100к', '💰 До 200к'],
            ['📊 Все СМИ', '🔙 Назад']
          ],
          resize_keyboard: true
        }
      };
      
      await this.bot.sendMessage(chatId, '🔍 *Выберите фильтр для поиска СМИ:*', {
        parse_mode: 'Markdown',
        ...keyboard
      });
    });
    
    // Обработка выбора фильтра CSV
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      
      // Пропускаем если это команда или пользователь в другом разделе
      if (text.startsWith('/') || stateManager.getState(chatId).currentSection) {
        return;
      }
      
      if (text && text !== '🔙 Назад') {
        let filters = {};
        let filterName = '';
        
        switch(text) {
          case '🔍 Бизнес-СМИ':
            filters.category = 'Business';
            filterName = 'бизнес-СМИ';
            break;
          case '💻 IT-СМИ':
            filters.category = 'Technology';
            filterName = 'IT-СМИ';
            break;
          case '📰 Новостные':
            filters.category = 'News';
            filterName = 'новостные СМИ';
            break;
          case '🇷🇺 Российские':
            filters.country = 'Russia';
            filterName = 'российские СМИ';
            break;
          case '🌍 Международные':
            filters.country = 'USA';
            filterName = 'международные СМИ';
            break;
          case '💰 До 100к':
            filters.maxPrice = 100000;
            filterName = 'до 100,000 руб.';
            break;
          case '💰 До 200к':
            filters.maxPrice = 200000;
            filterName = 'до 200,000 руб.';
            break;
          case '📊 Все СМИ':
            filterName = 'все СМИ';
            break;
        }
        
        if (filterName) {
          try {
            const results = await searchSMILikeCSV(filters);
            
            if (results.length === 0) {
              await this.bot.sendMessage(chatId, `По запросу "${filterName}" ничего не найдено.`);
              return;
            }
            
            let response = `🔍 *Найдено ${results.length} ${filterName}:*\n\n`;
            
            results.slice(0, 5).forEach((smi, index) => {
              response += `${index + 1}. *${smi.name}*\n`;
              response += `   Категория: ${smi.category}\n`;
              response += `   Страна: ${smi.country}\n`;
              response += `   Цена: ${smi.price?.toLocaleString()} руб.\n`;
              
              if (smi.audience) {
                response += `   Аудитория: ${smi.audience}\n`;
              }
              
              response += '\n';
            });
            
            if (results.length > 5) {
              response += `... и еще ${results.length - 5} СМИ`;
            }
            
            await this.bot.sendMessage(chatId, response, {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['🔙 Назад']],
                resize_keyboard: true
              }
            });
            
          } catch (error) {
            console.error('Ошибка поиска CSV:', error);
            await this.bot.sendMessage(chatId, `❌ Ошибка поиска: ${error.message}`);
          }
        }
      }
      
      // Кнопка "Назад"
      if (text === '🔙 Назад') {
        await this.bot.sendMessage(chatId, 'Главное меню', {
          reply_markup: {
            remove_keyboard: true
          }
        });
      }
    });
    
    // Команда /initdb для создания таблиц в базе данных
    this.bot.onText(/\/initdb/, async (msg) => {
      const chatId = msg.chat.id;
      
      if (!this.isAdmin(chatId)) {
        await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        return;
      }
      
      try {
        await this.bot.sendMessage(chatId, '🔄 Создаю таблицы в базе данных...');
        await initDatabase();
        await this.bot.sendMessage(chatId, '✅ Таблицы успешно созданы! Теперь используйте /csv_import для загрузки данных.');
      } catch (error) {
        await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
    });
    
    // Команда /checkall для полной проверки системы
    this.bot.onText(/\/checkall/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        // 1. Проверяем подключение к базе данных
        await require('./database').sequelize.authenticate();
        
        let report = `📊 *ПОЛНЫЙ ОТЧЕТ О СИСТЕМЕ:*\n\n`;
        
        // 2. Проверяем таблицы в базе данных
        const [tables] = await require('./database').sequelize.query(`
          SELECT table_name, 
                 (SELECT COUNT(*) FROM information_schema.columns 
                  WHERE table_schema = 'public' AND table_name = t.table_name) as columns_count
          FROM information_schema.tables t
          WHERE table_schema = 'public'
          ORDER BY table_name
        `);
        
        report += `🗄️ *БАЗА ДАННЫХ:*\n`;
        report += `• Статус: ✅ Подключена\n`;
        report += `• Таблиц: ${tables.length}\n\n`;
        
        if (tables.length > 0) {
          report += `📋 *Таблицы:*\n`;
          tables.forEach((table, i) => {
            report += `${i+1}. ${table.table_name} (${table.columns_count} колонок)\n`;
          });
        } else {
          report += `❌ *Таблицы не найдены!*\n`;
          report += `Используйте /initdb для создания таблиц\n\n`;
        }
        
        // 3. Проверяем таблицу smis
        const smisTable = tables.find(t => t.table_name === 'smis');
        if (smisTable) {
          const [countResult] = await require('./database').sequelize.query('SELECT COUNT(*) as total FROM smis');
          const count = countResult[0].total;
          
          report += `\n📈 *Таблица smis:*\n`;
          report += `• Записей: ${count}\n`;
          
          if (count > 0) {
            // Показываем статистику по категориям
            const [categories] = await require('./database').sequelize.query(`
              SELECT category, COUNT(*) as count 
              FROM smis 
              WHERE category IS NOT NULL 
              GROUP BY category 
              ORDER BY count DESC 
              LIMIT 5
            `);
            
            if (categories.length > 0) {
              report += `• Топ-5 категорий:\n`;
              categories.forEach((cat, i) => {
                report += `  ${i+1}. ${cat.category || 'без категории'}: ${cat.count}\n`;
              });
            }
          } else {
            report += `• Статус: ⭕ Пустая\n`;
            report += `  Используйте /csv_import для загрузки данных из CSV файла\n`;
          }
        }
        
        // 4. Проверяем CSV файл на сервере
        const fs = require('fs');
        const csvPath = './smi-import-fixed.csv';
        const csvExists = fs.existsSync(csvPath);
        
        report += `\n📁 *CSV ФАЙЛ:*\n`;
        report += `• Наличие: ${csvExists ? '✅ Найден' : '❌ Не найден'}\n`;
        
        if (csvExists) {
          const stats = fs.statSync(csvPath);
          const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
          report += `• Размер: ${fileSizeMB} MB\n`;
          report += `• Обновлен: ${stats.mtime.toLocaleDateString()}\n`;
          
          // Читаем первую строку для проверки
          const data = fs.readFileSync(csvPath, 'utf8');
          const lines = data.split('\n').length;
          report += `• Строк: ~${lines}\n`;
        }
        
        // 5. Проверяем переменные окружения
        report += `\n⚙️ *ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ:*\n`;
        report += `• DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Настроен' : '❌ Не настроен'}\n`;
        report += `• BOT_TOKEN: ${process.env.BOT_TOKEN ? '✅ Настроен' : '❌ Не настроен'}\n`;
        
        report += `\n⏰ *Последняя проверка:* ${new Date().toLocaleString()}`;
        
        await this.bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
        
      } catch (error) {
        await this.bot.sendMessage(chatId, 
          `❌ *ОШИБКА ПРОВЕРКИ СИСТЕМЫ:*\n\n` +
          `*Сообщение ошибки:* ${error.message}\n\n` +
          `*DATABASE_URL:* ${process.env.DATABASE_URL ? '✅ Настроен' : '❌ Не настроен'}\n\n` +
          `*Возможные причины:*\n` +
          `1. DATABASE_URL не настроен в Render Environment\n` +
          `2. База данных недоступна или перезагружается\n` +
          `3. Проблемы с сетевым подключением\n\n` +
          `*Что делать:*\n` +
          `1. Проверьте статус базы данных на Render\n` +
          `2. Убедитесь что DATABASE_URL правильный\n` +
          `3. Попробуйте команду /initdb для создания таблиц`,
          { parse_mode: 'Markdown' }
        );
      }
    });
  }
  
  // Инициализация быстрого поиска
  initQuickSearch() {
    // Обработка кнопок быстрого поиска
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      
      if (text.startsWith('/')) return;
      
      const userState = stateManager.getState(chatId);
      
      // Обработка кнопок быстрого поиска
      const quickSearchButtons = [
        '🔥 ТОП Business', '🔥 ТОП Technology',
        '🇷🇺 Российские СМИ', '🌍 Международные',
        '💰 Бюджетные СМИ', '👥 Крупная аудитория',
        '🔍 Расширенный поиск', '🎯 Рекомендации'
      ];
      
      if (quickSearchButtons.includes(text) && userState.currentSection === 'smi') {
        await this.handleQuickSearch(chatId, text, userState);
      }
    });
  }
  
  // Регистрация пользователя
  async registerUser(msg) {
    const { id, username, first_name, last_name } = msg.from;
    
    try {
      await User.findOrCreate({
        where: { telegramId: id },
        defaults: {
          username,
          firstName: first_name,
          lastName: last_name
        }
      });
    } catch (error) {
      console.error('Ошибка регистрации пользователя:', error);
    }
  }
  
  // Главное меню
  async handleMainMenu(chatId, text) {
    switch(text) {
      case '⚙️ АДМИН-ПАНЕЛЬ':
        if (this.isAdmin(chatId)) {
          await this.showAdminMenu(chatId);
        } else {
          await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        }
        break;
        
      case '📢 PR НОВОСТИ':
        stateManager.updateState(chatId, {
          currentSection: 'pr_news',
          step: 'main'
        });
        
        await this.bot.sendMessage(chatId, 
          '📢 *PR & КОММУНИКАЦИИ*\n\n' +
          'Актуальные новости и тренды для PR-специалистов:\n\n' +
          '• PR-стратегии и кампании\n' +
          '• Кризисные коммуникации\n' +
          '• Медиапланирование\n' +
          '• SMM и контент\n' +
          '• Бренд-коммуникации\n\n' +
          'Выберите категорию:',
          {
            parse_mode: 'Markdown',
            ...keyboards.getPRNewsMenu()
          }
        );
        break;
        
      case '📰 ПОДОБРАТЬ СМИ':
        // Новый вариант: предлагаем выбор между быстрым и расширенным поиском
        stateManager.updateState(chatId, {
          currentSection: 'smi',
          step: 'search_type'
        });
        
        await this.bot.sendMessage(chatId, 
          '📰 *ПОДБОР СМИ*\n\n' +
          'Выберите тип поиска:\n\n' +
          '⚡ *Быстрый поиск* - популярные фильтры\n' +
          '🔍 *Расширенный поиск* - точная настройка',
          {
            parse_mode: 'Markdown',
            ...this.getSearchTypeMenu()
          }
        );
        break;
        
      case '🏆 ПРЕМИИ':
        stateManager.updateState(chatId, {
          currentSection: 'awards',
          step: 'category'
        });
        await this.bot.sendMessage(chatId, '🏆 *ПОДБОР ПРЕМИЙ*\n\nВыберите направление премии:', {
          parse_mode: 'Markdown',
          ...keyboards.getAwardCategories()
        });
        break;
        
      case '👨‍⚖️ ЖЮРИ':
        await this.bot.sendMessage(chatId, '👨‍⚖️ *РАЗДЕЛ ЖЮРИ*\n\nВ разработке...', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        break;
        
      case '🤝 АССОЦИАЦИИ':
        await this.bot.sendMessage(chatId, '🤝 *РАЗДЕЛ АССОЦИАЦИЙ*\n\nВ разработке...', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        break;
        
      case '⭐ ИЗБРАННОЕ':
        await this.showFavorites(chatId);
        break;
        
      case '👤 ЛИЧНЫЙ КАБИНЕТ':
        stateManager.updateState(chatId, {
          currentSection: 'profile'
        });
        await this.showProfile(chatId);
        break;
        
      case '📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ':
        await this.showContactManager(chatId);
        break;
        
      default:
        await this.bot.sendMessage(chatId, 'Пожалуйста, выберите раздел из меню:', 
          keyboards.getMainMenu(this.isAdmin(chatId)));
    }
  }
  
  // Меню выбора типа поиска
  getSearchTypeMenu() {
    return {
      reply_markup: {
        keyboard: [
          ['⚡ Быстрый поиск', '🔍 Расширенный поиск'],
          ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
        ],
        resize_keyboard: true
      }
    };
  }
  
  // Обработка потока СМИ
  async handleSMIFlow(chatId, text, state) {
    switch(state.step) {
      case 'search_type':
        if (text === '⬅️ НАЗАД' || text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        if (text === '⚡ Быстрый поиск') {
          stateManager.updateState(chatId, { step: 'quick_menu' });
          await this.showQuickSearchMenu(chatId);
          return;
        }
        
        if (text === '🔍 Расширенный поиск') {
          stateManager.updateState(chatId, { step: 'category' });
          await this.bot.sendMessage(chatId, '📌 *ВЫБЕРИТЕ НАПРАВЛЕНИЕ ДЕЯТЕЛЬНОСТИ:*', {
            parse_mode: 'Markdown',
            ...keyboards.getSMICategories()
          });
          return;
        }
        break;
        
      case 'quick_menu':
        await this.handleQuickSearch(chatId, text, state);
        break;
        
      case 'category':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'search_type' });
          await this.bot.sendMessage(chatId, 'Выберите тип поиска:', this.getSearchTypeMenu());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        // Обработка кнопок "Все категории" и "Популярные"
        if (text === '🔍 Все категории') {
          await this.bot.sendMessage(chatId, 
            '📝 Введите название категории для поиска:\n(например: Business, Technology, News)',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['⬅️ НАЗАД']],
                resize_keyboard: true
              }
            }
          );
          stateManager.updateState(chatId, { step: 'custom_category' });
          return;
        }
        
        if (text === '⭐ Популярные') {
          // Показываем популярные категории
          await this.showPopularCategories(chatId);
          return;
        }
        
        // Убираем эмодзи из текста категории
        const category = text.replace(/^[^\w\s]+\s/, '');
        stateManager.setFilter(chatId, 'category', category);
        stateManager.updateState(chatId, { step: 'country' });
        
        await this.bot.sendMessage(chatId, '🌍 *ВЫБЕРИТЕ СТРАНУ:*\n\nИли введите название страны вручную:', {
          parse_mode: 'Markdown',
          ...keyboards.getCountries()
        });
        break;
        
      case 'custom_category':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'category' });
          await this.bot.sendMessage(chatId, 'Выберите категорию:', keyboards.getSMICategories());
          return;
        }
        
        stateManager.setFilter(chatId, 'category', text);
        stateManager.updateState(chatId, { step: 'country' });
        
        await this.bot.sendMessage(chatId, '🌍 *ВЫБЕРИТЕ СТРАНУ:*', {
          parse_mode: 'Markdown',
          ...keyboards.getCountries()
        });
        break;
        
      case 'country':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'category' });
          await this.bot.sendMessage(chatId, 'Выберите категорию:', keyboards.getSMICategories());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        // Обработка кнопок "Все страны" и "Другая страна"
        if (text === '🌍 Все страны' || text === '🌎 Не важно') {
          stateManager.setFilter(chatId, 'country', '');
          stateManager.updateState(chatId, { step: 'backdated' });
          await this.bot.sendMessage(chatId, '📅 *ЗАДНИЕ ЧИСЛА (BACKDATED)*\n\nНужны ли публикации задним числом?', {
            parse_mode: 'Markdown',
            ...keyboards.getBackdatedOptions()
          });
          return;
        }
        
        if (text === '🌏 Другая страна') {
          await this.bot.sendMessage(chatId, 
            '🌍 Введите название страны:\n(например: Germany, France, Japan)',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['⬅️ НАЗАД']],
                resize_keyboard: true
              }
            }
          );
          stateManager.updateState(chatId, { step: 'custom_country' });
          return;
        }
        
        let country = text;
        // Убираем флаг эмодзи
        if (text.includes(' ')) {
          country = text.split(' ').slice(1).join(' ');
        }
        
        stateManager.setFilter(chatId, 'country', country);
        stateManager.updateState(chatId, { step: 'backdated' });
        
        await this.bot.sendMessage(chatId, '📅 *ЗАДНИЕ ЧИСЛА (BACKDATED)*\n\nНужны ли публикации задним числом?', {
          parse_mode: 'Markdown',
          ...keyboards.getBackdatedOptions()
        });
        break;
        
      case 'custom_country':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'country' });
          await this.bot.sendMessage(chatId, 'Выберите страну:', keyboards.getCountries());
          return;
        }
        
        stateManager.setFilter(chatId, 'country', text);
        stateManager.updateState(chatId, { step: 'backdated' });
        
        await this.bot.sendMessage(chatId, '📅 *ЗАДНИЕ ЧИСЛА (BACKDATED)*\n\nНужны ли публикации задним числом?', {
          parse_mode: 'Markdown',
          ...keyboards.getBackdatedOptions()
        });
        break;
        
      case 'backdated':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'country' });
          await this.bot.sendMessage(chatId, 'Выберите страну:', keyboards.getCountries());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        let backdatedValue = null;
        if (text.includes('Да')) backdatedValue = true;
        else if (text.includes('Нет')) backdatedValue = false;
        else if (text.includes('Не важно')) backdatedValue = null;
        
        stateManager.setFilter(chatId, 'backdated', backdatedValue);
        stateManager.updateState(chatId, { step: 'audience' });
        
        await this.bot.sendMessage(chatId, '📊 *ВЫБЕРИТЕ ОХВАТ АУДИТОРИИ:*', {
          parse_mode: 'Markdown',
          ...keyboards.getAudienceOptions()
        });
        break;
        
      case 'audience':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'backdated' });
          await this.bot.sendMessage(chatId, 'Выберите опцию backdated:', keyboards.getBackdatedOptions());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        // Обработка улучшенных опций аудитории
        let audienceFilter = {};
        
        if (text.includes('Малая')) audienceFilter = { min: 0, max: 100000 };
        else if (text.includes('Средняя')) audienceFilter = { min: 100000, max: 500000 };
        else if (text.includes('Крупная')) audienceFilter = { min: 500000, max: 1000000 };
        else if (text.includes('Очень крупная')) audienceFilter = { min: 1000000, max: 5000000 };
        else if (text.includes('Премиум')) audienceFilter = { min: 5000000, max: null };
        else if (text.includes('Любая')) audienceFilter = { min: 0, max: null };
        else if (text.includes('ТОП')) {
          // ТОП по аудитории - покажем самые популярные СМИ
          await this.showTopByAudience(chatId);
          return;
        }
        else if (text.includes('Эконом')) {
          // Эконом-сегмент - малая аудитория
          audienceFilter = { min: 0, max: 100000 };
        }
        
        stateManager.setFilter(chatId, 'audience', audienceFilter);
        
        // Теперь спросим про цену
        stateManager.updateState(chatId, { step: 'price' });
        
        // Используем улучшенное меню цены, если оно есть
        const priceMenu = keyboards.getPriceOptions ? keyboards.getPriceOptions() : {
          reply_markup: {
            keyboard: [
              ['💰 До 50K руб.', '💰 50K-100K руб.'],
              ['💰 100K-200K руб.', '💎 200K+ руб.'],
              ['💵 Любая цена', '⬅️ НАЗАД']
            ],
            resize_keyboard: true
          }
        };
        
        await this.bot.sendMessage(chatId, '💵 *ВЫБЕРИТЕ ЦЕНОВОЙ ДИАПАЗОН:*', {
          parse_mode: 'Markdown',
          ...priceMenu
        });
        break;
        
      case 'price':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'audience' });
          await this.bot.sendMessage(chatId, 'Выберите охват аудитории:', keyboards.getAudienceOptions());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        // Обработка ценовых фильтров
        let priceFilter = {};
        
        if (text.includes('До 50K')) priceFilter = { max: 50000 };
        else if (text.includes('50K-100K')) priceFilter = { min: 50000, max: 100000 };
        else if (text.includes('100K-200K')) priceFilter = { min: 100000, max: 200000 };
        else if (text.includes('200K+')) priceFilter = { min: 200000, max: null };
        else if (text.includes('Любая')) priceFilter = { min: 0, max: null };
        else if (text.includes('дешевые')) {
          // Сортировка по цене (возрастание)
          stateManager.setFilter(chatId, 'sortBy', 'price_asc');
        } else if (text.includes('дорогие')) {
          // Сортировка по цене (убывание)
          stateManager.setFilter(chatId, 'sortBy', 'price_desc');
        }
        
        if (Object.keys(priceFilter).length > 0) {
          stateManager.setFilter(chatId, 'price', priceFilter);
        }
        
        await this.performSMISearch(chatId);
        break;
        
      case 'price_menu':
        // Отдельное меню для фильтрации по цене
        if (text === '⬅️ НАЗАД') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        let priceFilter2 = {};
        
        if (text.includes('До 50K')) priceFilter2 = { max: 50000 };
        else if (text.includes('50K-100K')) priceFilter2 = { min: 50000, max: 100000 };
        else if (text.includes('100K-200K')) priceFilter2 = { min: 100000, max: 200000 };
        else if (text.includes('200K+')) priceFilter2 = { min: 200000, max: null };
        else if (text.includes('Любая')) priceFilter2 = { min: 0, max: null };
        
        if (Object.keys(priceFilter2).length > 0) {
          stateManager.setFilter(chatId, 'price', priceFilter2);
          await this.performPriceSearch(chatId, priceFilter2);
        }
        break;
    }
  }
  
  // Показать меню быстрого поиска
  async showQuickSearchMenu(chatId) {
    const quickMenu = keyboards.getQuickSearchMenu ? keyboards.getQuickSearchMenu() : {
      reply_markup: {
        keyboard: [
          ['🔥 ТОП Business', '🔥 ТОП Technology'],
          ['🇷🇺 Российские СМИ', '🌍 Международные'],
          ['💰 Бюджетные СМИ', '👥 Крупная аудитория'],
          ['🔍 Расширенный поиск', '🎯 Рекомендации'],
          ['⬅️ НАЗАД', '🏠 Главное меню']
        ],
        resize_keyboard: true
      }
    };
    
    await this.bot.sendMessage(chatId, 
      '⚡ *БЫСТРЫЙ ПОИСК СМИ*\n\n' +
      'Выберите популярный фильтр:',
      {
        parse_mode: 'Markdown',
        ...quickMenu
      }
    );
  }
  
  // Обработка быстрого поиска
  async handleQuickSearch(chatId, text, state) {
    if (text === '⬅️ НАЗАД') {
      stateManager.updateState(chatId, { step: 'search_type' });
      await this.bot.sendMessage(chatId, 'Выберите тип поиска:', this.getSearchTypeMenu());
      return;
    }
    
    if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
      stateManager.resetState(chatId);
      await this.bot.sendMessage(chatId, 'Главное меню:', 
        keyboards.getMainMenu(this.isAdmin(chatId)));
      return;
    }
    
    if (text === '🔍 Расширенный поиск') {
      stateManager.updateState(chatId, { step: 'category' });
      await this.bot.sendMessage(chatId, '📌 Выберите категорию:', keyboards.getSMICategories());
      return;
    }
    
    if (text === '🎯 Рекомендации') {
      await this.showRecommendations(chatId);
      return;
    }
    
    const loadingMsg = await this.bot.sendMessage(chatId, '⚡ Ищу по быстрому фильтру...', {
      parse_mode: 'Markdown'
    });
    
    try {
      let filters = {};
      let searchTitle = '';
      
      // Определяем фильтры по выбранной кнопке
      switch(text) {
        case '🔥 ТОП Business':
          filters = { category: 'Business', sortBy: 'audience_desc' };
          searchTitle = 'ТОП Business СМИ';
          break;
        case '🔥 ТОП Technology':
          filters = { category: 'Technology', sortBy: 'audience_desc' };
          searchTitle = 'ТОП Technology СМИ';
          break;
        case '🇷🇺 Российские СМИ':
          filters = { country: 'Russia', sortBy: 'audience_desc' };
          searchTitle = 'Российские СМИ';
          break;
        case '🌍 Международные':
          filters = { country: 'United States', sortBy: 'audience_desc' };
          searchTitle = 'Международные СМИ';
          break;
        case '💰 Бюджетные СМИ':
          filters = { maxPrice: 50000, sortBy: 'price_asc' };
          searchTitle = 'Бюджетные СМИ (до 50K руб.)';
          break;
        case '👥 Крупная аудитория':
          filters = { minAudience: 1000000, sortBy: 'audience_desc' };
          searchTitle = 'СМИ с крупной аудиторией (1M+)';
          break;
      }
      
      if (Object.keys(filters).length > 0) {
        const results = await this.findSMIByFilters(filters);
        
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
        
        if (results.length === 0) {
          await this.bot.sendMessage(chatId, 
            `😔 *По фильтру "${text}" ничего не найдено.*\n\n` +
            'Попробуйте другой фильтр или расширенный поиск.',
            {
              parse_mode: 'Markdown',
              ...this.getQuickSearchMenu()
            }
          );
          return;
        }
        
        const searchId = stateManager.saveSearchResults(chatId, results);
        await this.showQuickResults(chatId, searchId, 1, searchTitle);
      }
      
    } catch (error) {
      console.error('Ошибка быстрого поиска:', error);
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка поиска. Попробуйте позже.');
    }
  }
  
  // Улучшенный метод поиска СМИ с фильтрами
  async findSMIByFilters(filters) {
    try {
      let where = {};
      
      // Категория
      if (filters.category) {
        where.category = { [Op.like]: `%${filters.category}%` };
      }
      
      // Страна
      if (filters.country) {
        where.country = { [Op.like]: `%${filters.country}%` };
      }
      
      // Цена
      if (filters.maxPrice) {
        where.price = { [Op.lte]: filters.maxPrice };
      }
      if (filters.minPrice) {
        where.price = { ...where.price, [Op.gte]: filters.minPrice };
      }
      
      // Аудитория
      if (filters.minAudience) {
        where.audienceNumber = { [Op.gte]: filters.minAudience };
      }
      if (filters.maxAudience) {
        where.audienceNumber = { ...where.audienceNumber, [Op.lte]: filters.maxAudience };
      }
      
      // Backdated
      if (filters.backdated !== undefined && filters.backdated !== null) {
        where.backdated = filters.backdated;
      }
      
      // Сортировка
      let order = [['audienceNumber', 'DESC']];
      if (filters.sortBy === 'price_asc') {
        order = [['price', 'ASC']];
      } else if (filters.sortBy === 'price_desc') {
        order = [['price', 'DESC']];
      } else if (filters.sortBy === 'name') {
        order = [['name', 'ASC']];
      }
      
      const results = await SMI.findAll({
        where: where,
        order: order,
        limit: 50
      });
      
      return results;
      
    } catch (error) {
      console.error('Ошибка поиска с фильтрами:', error);
      return [];
    }
  }
  
  // Поиск СМИ по цене
  async performPriceSearch(chatId, priceFilter) {
    try {
      const searchMsg = await this.bot.sendMessage(chatId, '💰 Ищу СМИ по цене...', {
        parse_mode: 'Markdown'
      });
      
      let where = {};
      
      if (priceFilter.max) {
        where.price = { [Op.lte]: priceFilter.max };
      }
      if (priceFilter.min) {
        where.price = { ...where.price, [Op.gte]: priceFilter.min };
      }
      
      const results = await SMI.findAll({
        where: where,
        order: [['audienceNumber', 'DESC']],
        limit: 50
      });
      
      await this.bot.deleteMessage(chatId, searchMsg.message_id);
      
      if (results.length === 0) {
        const priceRange = priceFilter.max ? 
          `до ${priceFilter.max.toLocaleString()} руб.` : 
          `от ${priceFilter.min?.toLocaleString()} руб.`;
        
        await this.bot.sendMessage(chatId, 
          `😔 *СМИ в диапазоне ${priceRange} не найдены.*\n\n` +
          'Попробуйте изменить ценовой диапазон.',
          {
            parse_mode: 'Markdown',
            ...keyboards.getMainMenu(this.isAdmin(chatId))
          }
        );
        stateManager.resetState(chatId);
        return;
      }
      
      const searchId = stateManager.saveSearchResults(chatId, results);
      const priceRange = priceFilter.max ? 
        `до ${priceFilter.max.toLocaleString()} руб.` : 
        `от ${priceFilter.min?.toLocaleString()} руб.`;
      
      await this.showQuickResults(chatId, searchId, 1, `СМИ ${priceRange}`);
      
    } catch (error) {
      console.error('Ошибка поиска по цене:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка поиска. Попробуйте позже.');
    }
  }
  
  // Показать популярные категории
  async showPopularCategories(chatId) {
    try {
      const Sequelize = require('sequelize');
      const categories = await SMI.findAll({
        attributes: ['category'],
        group: ['category'],
        order: [[Sequelize.fn('COUNT', Sequelize.col('category')), 'DESC']],
        limit: 10
      });
      
      let message = '⭐ *ПОПУЛЯРНЫЕ КАТЕГОРИИ:*\n\n';
      
      categories.forEach((cat, index) => {
        const emoji = keyboards.getCategoryEmoji ? keyboards.getCategoryEmoji(cat.category) : '📋';
        message += `${index + 1}. ${emoji} ${cat.category}\n`;
      });
      
      message += '\nВыберите категорию из списка или введите свою:';
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['⬅️ НАЗАД'],
            ...categories.slice(0, 4).map(cat => [{
              text: `${keyboards.getCategoryEmoji ? keyboards.getCategoryEmoji(cat.category) : '📋'} ${cat.category}`
            }])
          ],
          resize_keyboard: true
        }
      });
      
    } catch (error) {
      console.error('Ошибка показа популярных категорий:', error);
      await this.bot.sendMessage(chatId, '⚠️ Не удалось загрузить популярные категории.');
    }
  }
  
  // Показать ТОП по аудитории
  async showTopByAudience(chatId) {
    try {
      const searchMsg = await this.bot.sendMessage(chatId, '👑 Ищу СМИ с самой большой аудиторией...', {
        parse_mode: 'Markdown'
      });
      
      const results = await SMI.findAll({
        order: [['audienceNumber', 'DESC']],
        limit: 20
      });
      
      await this.bot.deleteMessage(chatId, searchMsg.message_id);
      
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, '😔 *Не найдено СМИ с информацией об аудитории.*', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        stateManager.resetState(chatId);
        return;
      }
      
      const searchId = stateManager.saveSearchResults(chatId, results);
      await this.showQuickResults(chatId, searchId, 1, 'ТОП СМИ по аудитории');
      
    } catch (error) {
      console.error('Ошибка поиска ТОП по аудитории:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка поиска. Попробуйте позже.');
    }
  }
  
  // Показать рекомендации
  async showRecommendations(chatId) {
    try {
      const searchMsg = await this.bot.sendMessage(chatId, '🎯 Подбираю рекомендации...', {
        parse_mode: 'Markdown'
      });
      
      // Получаем несколько вариантов для рекомендаций
      const recommendations = [];
      
      // 1. Популярные бизнес-СМИ
      const businessSMI = await SMI.findAll({
        where: { category: { [Op.like]: '%Business%' } },
        order: [['audienceNumber', 'DESC']],
        limit: 5
      });
      
      // 2. Бюджетные варианты
      const budgetSMI = await SMI.findAll({
        where: { price: { [Op.lte]: 50000 } },
        order: [['audienceNumber', 'DESC']],
        limit: 5
      });
      
      // 3. Российские СМИ
      const russianSMI = await SMI.findAll({
        where: { country: { [Op.like]: '%Russia%' } },
        order: [['audienceNumber', 'DESC']],
        limit: 5
      });
      
      // Объединяем результаты, избегая дубликатов
      const allSMI = [...businessSMI, ...budgetSMI, ...russianSMI];
      const uniqueSMI = [];
      const seenIds = new Set();
      
      for (const smi of allSMI) {
        if (!seenIds.has(smi.id)) {
          seenIds.add(smi.id);
          uniqueSMI.push(smi);
        }
      }
      
      await this.bot.deleteMessage(chatId, searchMsg.message_id);
      
      if (uniqueSMI.length === 0) {
        await this.bot.sendMessage(chatId, 
          '😔 *Не удалось сформировать рекомендации.*\n\n' +
          'Попробуйте использовать расширенный поиск.',
          {
            parse_mode: 'Markdown',
            ...this.getQuickSearchMenu()
          }
        );
        return;
      }
      
      const searchId = stateManager.saveSearchResults(chatId, uniqueSMI);
      await this.showQuickResults(chatId, searchId, 1, 'Рекомендованные СМИ');
      
    } catch (error) {
      console.error('Ошибка рекомендаций:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка формирования рекомендаций.');
    }
  }
  
  // Показать улучшенные результаты
  async showQuickResults(chatId, searchId, page, title) {
    const pageData = stateManager.getPageResults(searchId, page);
    
    let message = `✅ *${title}*\n`;
    message += `📊 Найдено: ${pageData.totalItems} СМИ\n\n`;
    
    pageData.items.forEach((item, index) => {
      const globalIndex = (page - 1) * 5 + index + 1;
      
      const categoryEmoji = keyboards.getCategoryEmoji ? keyboards.getCategoryEmoji(item.category) : '📋';
      const countryFlag = utils.getCountryFlag(item.country);
      
      // Форматирование цены
      const priceFormatted = item.price ? 
        `${Math.round(item.price / 1000)}K руб.` : 
        'цена по запросу';
      
      // Форматирование аудитории
      const audienceFormatted = item.audienceNumber ? 
        (item.audienceNumber >= 1000000 ? 
          `${(item.audienceNumber / 1000000).toFixed(1)}M` : 
          `${Math.round(item.audienceNumber / 1000)}K`) : 
        'н/д';
      
      message += `*${globalIndex}. ${item.name}*\n`;
      message += `${categoryEmoji} ${item.category || 'Без категории'} | ${countryFlag} ${item.country || 'Не указана'}\n`;
      message += `👥 ${audienceFormatted} | 💰 ${priceFormatted}\n\n`;
    });
    
    // Получаем ID первого элемента для кнопок
    const firstItemId = pageData.items[0]?.id;
    
    // Используем улучшенную пагинацию
    const pagination = keyboards.getPagination ? 
      keyboards.getPagination(page, pageData.totalPages, searchId, firstItemId) :
      this.getDefaultPagination(page, pageData.totalPages, searchId, firstItemId);
    
    if (page === 1) {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...pagination
      });
    } else {
      try {
        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: pageData.messageId || undefined,
          parse_mode: 'Markdown',
          ...pagination
        });
      } catch (error) {
        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          ...pagination
        });
      }
    }
  }
  
  // Дефолтная пагинация (если keyboards.getPagination не существует)
  getDefaultPagination(currentPage, totalPages, searchId, itemId = null) {
    const buttons = [];
    
    if (currentPage > 1) {
      buttons.push({ text: "◀️ Назад", callback_data: `page_${searchId}_${currentPage - 1}` });
    }
    
    buttons.push({ text: `${currentPage}/${totalPages}`, callback_data: 'current' });
    
    if (currentPage < totalPages) {
      buttons.push({ text: "Вперед ▶️", callback_data: `page_${searchId}_${currentPage + 1}` });
    }
    
    const inlineKeyboard = [buttons];
    
    if (itemId) {
      inlineKeyboard.push([
        { text: "⭐ В избранное", callback_data: `fav_smi_${itemId}` },
        { text: "📞 Контакты", callback_data: `contact_smi_${itemId}` }
      ]);
    }
    
    inlineKeyboard.push([
      { text: "📥 Экспорт в CSV", callback_data: `export_${searchId}` },
      { text: "🔄 Новый поиск", callback_data: 'new_search' },
      { text: "🏠 В меню", callback_data: 'main_menu' }
    ]);
    
    return {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    };
  }
  
  // Поиск СМИ
  async performSMISearch(chatId) {
    const state = stateManager.getState(chatId);
    const filters = state.filters;
    
    try {
      const searchMsg = await this.bot.sendMessage(chatId, '🔍 *Ищу подходящие СМИ...*', {
        parse_mode: 'Markdown'
      });
      
      const results = await findSMI(filters);
      
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (user) {
        const searchHistory = user.searchHistory || [];
        
        let historyArray = [];
        try {
          if (typeof searchHistory === 'string') {
            historyArray = JSON.parse(searchHistory);
          } else if (Array.isArray(searchHistory)) {
            historyArray = searchHistory;
          }
        } catch (e) {
          historyArray = [];
        }
        
        historyArray.push({
          date: new Date().toISOString(),
          type: 'smi',
          filters,
          resultsCount: results.length
        });
        
        user.searchHistory = JSON.stringify(historyArray);
        await user.save();
      }
      
      const searchId = stateManager.saveSearchResults(chatId, results);
      
      await this.bot.deleteMessage(chatId, searchMsg.message_id);
      
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, '😔 *По вашему запросу ничего не найдено.*\n\nПопробуйте изменить критерии поиска.', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        stateManager.resetState(chatId);
        return;
      }
      
      await this.showResultsPage(chatId, searchId, 1);
      
    } catch (error) {
      console.error('Ошибка поиска:', error);
      await this.bot.sendMessage(chatId, '⚠️ Произошла ошибка при поиске. Пожалуйста, попробуйте позже.');
    }
  }
  
  // Показать страницу результатов
  async showResultsPage(chatId, searchId, page) {
    const pageData = stateManager.getPageResults(searchId, page);
    
    let message = `✅ *НАЙДЕНО ${pageData.totalItems} СМИ*\n\n`;
    
    pageData.items.forEach((item, index) => {
      const globalIndex = (page - 1) * 5 + index + 1;
      
      const categoryEmoji = utils.getCategoryEmoji(item.category);
      const countryFlag = utils.getCountryFlag(item.country);
      const backdatedEmoji = item.backdated ? '✅' : '❌';
      const audienceEmoji = utils.getAudienceEmoji(item.audienceNumber);
      const audienceFormatted = utils.formatNumber(item.audienceNumber);
      
      message += `*${globalIndex}. ${item.name}*\n`;
      message += `${categoryEmoji} ${item.category} | ${countryFlag} ${item.country}\n`;
      message += `Задние числа: ${backdatedEmoji} | Охват: ${audienceEmoji} ${audienceFormatted}\n`;
      message += `Контакт: ${item.contact || 'запросить у менеджера'}\n\n`;
    });
    
    if (page === 1) {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getPagination(page, pageData.totalPages, searchId)
      });
    } else {
      try {
        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: pageData.messageId || undefined,
          parse_mode: 'Markdown',
          ...keyboards.getPagination(page, pageData.totalPages, searchId)
        });
      } catch (error) {
        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          ...keyboards.getPagination(page, pageData.totalPages, searchId)
        });
      }
    }
  }
  
  // Добавление в избранное
  async addToFavorites(chatId, type, itemId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (!user) return;
      
      let favorites = {};
      if (user.favorites) {
        try {
          if (typeof user.favorites === 'string') {
            favorites = JSON.parse(user.favorites);
          } else {
            favorites = user.favorites;
          }
        } catch (e) {
          favorites = { smi: [], awards: [], jury: [], associations: [] };
        }
      } else {
        favorites = { smi: [], awards: [], jury: [], associations: [] };
      }
      
      if (!favorites[type]) {
        favorites[type] = [];
      }
      
      if (!favorites[type].includes(itemId)) {
        favorites[type].push(itemId);
        user.favorites = JSON.stringify(favorites);
        await user.save();
      }
    } catch (error) {
      console.error('Ошибка добавления в избранное:', error);
    }
  }
  
  // Показать профиль
  async showProfile(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (!user) return;
      
      let history = [];
      if (user.searchHistory) {
        try {
          if (typeof user.searchHistory === 'string') {
            history = JSON.parse(user.searchHistory);
          } else if (Array.isArray(user.searchHistory)) {
            history = user.searchHistory;
          }
        } catch (e) {
          history = [];
        }
      }
      
      let favorites = {};
      if (user.favorites) {
        try {
          if (typeof user.favorites === 'string') {
            favorites = JSON.parse(user.favorites);
          } else {
            favorites = user.favorites;
          }
        } catch (e) {
          favorites = { smi: [], awards: [], jury: [], associations: [] };
        }
      }
      
      const totalFavorites = Object.values(favorites).reduce((sum, arr) => sum + arr.length, 0);
      
      const message = `👤 *ЛИЧНЫЙ КАБИНЕТ*\n\n` +
        `📊 *Статистика:*\n` +
        `• Всего запросов: ${history.length}\n` +
        `• В избранном: ${totalFavorites} позиций\n` +
        `• Последний запрос: ${history.length > 0 ? utils.formatDate(history[history.length-1].date) : 'нет'}\n\n` +
        `Выберите действие:`;
    
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getProfileMenu()
      });
    } catch (error) {
      console.error('Ошибка показа профиля:', error);
    }
  }
  
  // Обработка личного кабинета
  async handleProfile(chatId, text, state) {
    switch(text) {
      case '📊 Статистика':
        await this.showStatistics(chatId);
        break;
        
      case '🕐 История запросов':
        await this.showSearchHistory(chatId);
        break;
        
      case '⬅️ НАЗАД':
      case '🏠 ГЛАВНОЕ МЕНЮ':
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Главное меню:', 
          keyboards.getMainMenu(this.isAdmin(chatId)));
        break;
    }
  }
  
  // Показать статистику
  async showStatistics(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      
      let history = [];
      if (user && user.searchHistory) {
        try {
          if (typeof user.searchHistory === 'string') {
            history = JSON.parse(user.searchHistory);
          } else if (Array.isArray(user.searchHistory)) {
            history = user.searchHistory;
          }
        } catch (e) {
          history = [];
        }
      }
      
      let message = `📊 *ВАША СТАТИСТИКА*\n\n`;
      
      if (history.length === 0) {
        message += `У вас пока нет истории запросов.\nНачните поиск в разделе "📰 ПОДОБРАТЬ СМИ"`;
      } else {
        message += `Всего запросов: ${history.length}\n\n`;
        message += `Последние 5 запросов:\n`;
        
        history.slice(-5).reverse().forEach((item, index) => {
          message += `${index + 1}. ${utils.formatDate(item.date)} - ${item.type.toUpperCase()}\n`;
          if (item.filters && item.filters.category) {
            message += `   Категория: ${item.filters.category}\n`;
          }
          if (item.filters && item.filters.country) {
            message += `   Страна: ${item.filters.country}\n`;
          }
          message += `   Найдено: ${item.resultsCount || 0} позиций\n\n`;
        });
      }
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getProfileMenu()
      });
    } catch (error) {
      console.error('Ошибка показа статистики:', error);
    }
  }
  
  // Показать историю поиска
  async showSearchHistory(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      
      let history = [];
      if (user && user.searchHistory) {
        try {
          if (typeof user.searchHistory === 'string') {
            history = JSON.parse(user.searchHistory);
          } else if (Array.isArray(user.searchHistory)) {
            history = user.searchHistory;
          }
        } catch (e) {
          history = [];
        }
      }
      
      let message = `📋 *ИСТОРИЯ ЗАПРОСОВ*\n\n`;
      
      if (history.length === 0) {
        message += `У вас пока нет истории запросов.`;
      } else {
        history.reverse().forEach((item, index) => {
          if (index < 10) {
            message += `${index + 1}. ${utils.formatDate(item.date)} - ${item.type.toUpperCase()}\n`;
            if (item.filters && item.filters.category) {
              message += `   Категория: ${item.filters.category}\n`;
            }
            if (item.resultsCount !== undefined) {
              message += `   Найдено: ${item.resultsCount} позиций\n`;
            }
            message += `\n`;
          }
        });
        
        if (history.length > 10) {
          message += `... и еще ${history.length - 10} запросов`;
        }
      }
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getProfileMenu()
      });
    } catch (error) {
      console.error('Ошибка показа истории:', error);
      await this.bot.sendMessage(chatId, '📋 *ИСТОРИЯ ЗАПРОСОВ*\n\nВ разработке...', {
        parse_mode: 'Markdown',
        ...keyboards.getProfileMenu()
      });
    }
  }
  
  // Показать избранное
  async showFavorites(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (!user) return;
      
      let favorites = {};
      if (user.favorites) {
        try {
          if (typeof user.favorites === 'string') {
            favorites = JSON.parse(user.favorites);
          } else {
            favorites = user.favorites;
          }
        } catch (e) {
          favorites = { smi: [], awards: [], jury: [], associations: [] };
        }
      }
      
      const smiFavorites = favorites.smi || [];
      
      if (smiFavorites.length === 0) {
        await this.bot.sendMessage(chatId, '⭐ *ИЗБРАННОЕ*\n\nУ вас пока нет избранных позиций.\nДобавляйте их из результатов поиска кнопкой "⭐ В избранное"', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        return;
      }
      
      const smiItems = await SMI.findAll({
        where: { id: smiFavorites }
      });
      
      let message = `⭐ *ВАШЕ ИЗБРАННОЕ*\n\n`;
      message += `📰 СМИ (${smiItems.length}):\n\n`;
      
      smiItems.forEach((item, index) => {
        const categoryEmoji = utils.getCategoryEmoji(item.category);
        const countryFlag = utils.getCountryFlag(item.country);
        
        message += `${index + 1}. *${item.name}*\n`;
        message += `${categoryEmoji} ${item.category} | ${countryFlag} ${item.country}\n\n`;
      });
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getMainMenu(this.isAdmin(chatId))
      });
    } catch (error) {
      console.error('Ошибка показа избранного:', error);
    }
  }
  
  // Показать контакты менеджера
  async showContactManager(chatId) {
    const message = `📞 *СВЯЗЬ С МЕНЕДЖЕРОМ*\n\n` +
      `👤 Ваш персональный менеджер: *Анна Петрова*\n` +
      `📱 +7 (XXX) XXX-XX-XX\n` +
      `✉️ anna@agency.ru\n` +
      `🕐 Пн-Пт 10:00-19:00\n\n` +
      `*Чем могу помочь:*\n` +
      `• Консультация по СМИ\n` +
      `• Уточнение стоимости\n` +
      `• Запрос медиа-кита\n` +
      `• Обновление базы данных\n` +
      `• Заказ аналитики\n\n` +
      `⬅️ *Просто напишите ваш вопрос в чат*`;
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });
  }
  
  // Показать контактную информацию
  async showContactInfo(chatId, data) {
    const [_, type, itemId] = data.split('_');
    
    try {
      let item;
      switch(type) {
        case 'smi':
          item = await SMI.findByPk(parseInt(itemId));
          break;
        case 'award':
          item = await Award.findByPk(parseInt(itemId));
          break;
        default:
          item = null;
      }
      
      if (!item) {
        await this.bot.sendMessage(chatId, 'Контактная информация не найдена');
        return;
      }
      
      const message = `📞 *КОНТАКТНАЯ ИНФОРМАЦИЯ*\n\n` +
        `Название: *${item.name}*\n` +
        `Контакт: ${item.contact || 'запросить у менеджера'}\n` +
        `Сайт: ${item.website || 'не указан'}\n\n` +
        `Для получения подробной информации свяжитесь с менеджером.`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Ошибка показа контактов:', error);
    }
  }
  
  // Экспорт в CSV
  async exportToCSV(chatId, searchId) {
    const results = stateManager.getSearchResults(searchId);
    
    if (results.length === 0) {
      await this.bot.sendMessage(chatId, 'Нет данных для экспорта');
      return;
    }
    
    try {
      const csvContent = utils.convertToCSV(results);
      const fileName = `export_${chatId}_${Date.now()}.csv`;
      const filePath = `./temp_${fileName}`;
      
      fs.writeFileSync(filePath, csvContent);
      
      await this.bot.sendDocument(chatId, filePath, {}, {
        filename: fileName
      });
      
      fs.unlinkSync(filePath);
      
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      await this.bot.sendMessage(chatId, '⚠️ Произошла ошибка при экспорте');
    }
  }
  
  // ========== PR НОВОСТИ ==========
  
  // Обработка PR-новостей
  async handlePRNews(chatId, text, state) {
    const loadingMsg = await this.bot.sendMessage(chatId, '⏳ *Ищу PR-материалы...*', {
      parse_mode: 'Markdown'
    });

    try {
      let news = [];
      let title = '';

      switch(text) {
        case '📈 PR Тренды':
          news = await this.prParser.getNewsByCategory('тренд');
          title = '📈 *АКТУАЛЬНЫЕ PR-ТРЕНДЫ*';
          break;
          
        case '🎯 PR Кейсы':
          news = await this.prParser.searchPRNews('кейс');
          title = '🎯 *PR-КЕЙСЫ И ПРАКТИКИ*';
          break;
          
        case '📊 PR Аналитика':
          news = await this.prParser.searchPRNews('аналитик');
          title = '📊 *PR-АНАЛИТИКА И МЕТРИКИ*';
          break;
          
        case '🔥 Кризисные PR':
          news = await this.prParser.getNewsByCategory('кризис');
          title = '🔥 *КРИЗИСНЫЕ КОММУНИКАЦИИ*';
          break;
          
        case '🔍 Поиск PR-новостей':
          stateManager.updateState(chatId, { step: 'search' });
          await this.bot.deleteMessage(chatId, loadingMsg.message_id);
          await this.bot.sendMessage(chatId,
            '🔍 *ПОИСК PR-МАТЕРИАЛОВ*\n\n' +
            'Введите ключевые слова для поиска:\n' +
            '(например: PR, коммуникации, медиа, бренд, SMM)',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['🏠 Главное меню']],
                resize_keyboard: true
              }
            }
          );
          return;
          
        case '📢 Все PR-новости':
          news = await this.prParser.parsePRNews();
          title = '📢 *ВСЕ PR-НОВОСТИ*';
          break;
          
        case '⬅️ НАЗАД':
        case '🏠 Главное меню':
          stateManager.resetState(chatId);
          await this.bot.deleteMessage(chatId, loadingMsg.message_id);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
          
        default:
          if (state.step === 'search') {
            news = await this.prParser.searchPRNews(text);
            title = `🔍 *РЕЗУЛЬТАТЫ ПОИСКА: "${text}"*`;
            
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            
            if (news.length === 0) {
              await this.bot.sendMessage(chatId,
                `😔 *По запросу "${text}" ничего не найдено.*\n\n` +
                `*Попробуйте:*\n` +
                `• Другие ключевые слова\n` +
                `• Более общий запрос\n` +
                `• Посмотреть все новости`,
                {
                  parse_mode: 'Markdown',
                  ...keyboards.getAfterPRSearchMenu()
                }
              );
              stateManager.updateState(chatId, { step: 'main' });
              return;
            }
            
            let message = `${title}\n*Найдено: ${news.length} материалов*\n\n`;
            
            news.slice(0, 10).forEach((item, index) => {
              message += `${index + 1}. *${item.title}*\n`;
              message += `   📍 ${item.source} | 🏷 ${item.category}\n`;
              if (item.excerpt) {
                message += `   ${item.excerpt}\n`;
              }
              message += `   ⏰ ${item.time}\n\n`;
            });
            
            if (news.length > 10) {
              message += `*... и еще ${news.length - 10} материалов*`;
            }
            
            await this.bot.sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
              ...keyboards.getAfterPRSearchMenu()
            });
            
            stateManager.updateState(chatId, { step: 'main' });
            return;
          }
      }

      await this.bot.deleteMessage(chatId, loadingMsg.message_id);

      if (news.length === 0) {
        await this.bot.sendMessage(chatId, 
          `😔 *По категории "${text}" пока нет материалов.*\n` +
          `*Попробуйте другие категории или используйте поиск.*`,
          {
            parse_mode: 'Markdown',
            ...keyboards.getPRNewsMenu()
          }
        );
        return;
      }

      let message = `${title}\n*Найдено: ${news.length} материалов*\n\n`;
      
      news.slice(0, 8).forEach((item, index) => {
        message += `${index + 1}. *${item.title}*\n`;
        message += `   📍 ${item.source} | 🏷 ${item.category}\n`;
        if (item.excerpt) {
          message += `   ${item.excerpt}\n`;
        }
        message += `   ⏰ ${item.time}\n\n`;
      });

      if (news.length > 8) {
        message += `*... и еще ${news.length - 8} материалов*`;
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...keyboards.getPRNewsMenu()
      });

    } catch (error) {
      console.error('Ошибка PR-новостей:', error);
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(chatId,
        '❌ *Не удалось загрузить PR-новости.*\n' +
        '*Возможные причины:*\n' +
        '• Проблемы с интернет-соединением\n' +
        '• Сайт временно недоступен\n' +
        '• Превышено время ожидания\n\n' +
        '*Попробуйте:*\n' +
        '• Проверить подключение\n' +
        '• Подождать 5 минут\n' +
        '• Выбрать другую категорию',
        {
          parse_mode: 'Markdown',
          ...keyboards.getPRNewsMenu()
        }
      );
    }
  }

  // ========== АДМИНИСТРАТОРСКИЕ МЕТОДЫ ==========
  
  // Показать админ-меню
  async showAdminMenu(chatId) {
    try {
      const userCount = await User.count();
      const smiCount = await SMI.count();
      
      const message = `⚙️ *АДМИНИСТРАТОРСКАЯ ПАНЕЛЬ*\n\n` +
        `📊 Статистика:\n` +
        `• Пользователей: ${userCount}\n` +
        `• СМИ в базе: ${smiCount}\n\n` +
        `Выберите действие:`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getAdminMenu()
      });
    } catch (error) {
      console.error('Ошибка показа админ-меню:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка загрузки админ-панели');
    }
  }
  
  // Обработка админ-команд
  async handleAdminCommand(chatId, text) {
    switch(text) {
      case '📊 Статистика бота':
        await this.showBotStats(chatId);
        break;
        
      case '👥 Пользователи':
        await this.showUsersList(chatId);
        break;
        
      case '📰 Управление СМИ':
        await this.bot.sendMessage(chatId, '📰 *УПРАВЛЕНИЕ СМИ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown'
        });
        break;
        
      case '🏆 Управление премиями':
        await this.bot.sendMessage(chatId, '🏆 *УПРАВЛЕНИЕ ПРЕМИЯМИ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown'
        });
        break;
        
      case '📥 Экспорт данных':
        await this.handleExportData(chatId);
        break;
        
      case '🗑️ Очистить кэш':
        await this.bot.sendMessage(chatId, '🗑️ *ОЧИСТКА КЭША*\n\nФункционал в разработке', {
          parse_mode: 'Markdown'
        });
        break;
        
      case '🌐 Веб-админка':
        await this.showWebAdminInfo(chatId);
        break;
        
      case '📢 Рассылка':
        await this.bot.sendMessage(chatId, '📢 *РАССЫЛКА*\n\nФункционал в разработке', {
          parse_mode: 'Markdown'
        });
        break;
        
      case '⚙️ АДМИН-ПАНЕЛЬ':
        await this.showAdminMenu(chatId);
        break;
        
      case '🏠 Главное меню':
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Главное меню:', 
          keyboards.getMainMenu(this.isAdmin(chatId)));
        break;
        
      case '🔙 Назад в админку':
        await this.showAdminMenu(chatId);
        break;
        
      default:
        await this.bot.sendMessage(chatId, `🔧 Команда "${text}" пока не реализована.`);
    }
  }
  
  // Показать статистику бота
  async showBotStats(chatId) {
    try {
      const userCount = await User.count();
      const smiCount = await SMI.count();
      const awardCount = await Award.count();
      const juryCount = await Jury.count();
      const associationCount = await Association.count();
      
      const message = `📊 *СТАТИСТИКА БОТА*\n\n` +
        `👥 Пользователей: ${userCount}\n` +
        `📰 СМИ в базе: ${smiCount}\n` +
        `🏆 Премий: ${awardCount}\n` +
        `👨‍⚖️ Экспертов: ${juryCount}\n` +
        `🤝 Ассоциаций: ${associationCount}\n\n` +
        `🕒 Время сервера: ${new Date().toLocaleString()}`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Ошибка статистики:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка получения статистики');
    }
  }
  
  // Показать список пользователей
  async showUsersList(chatId) {
    try {
      console.log('🔄 Получаем список пользователей...');
      
      // Получаем пользователей
      const users = await User.findAll({
        order: [['createdAt', 'DESC']],
        limit: 10
      });
      
      console.log(`✅ Найдено пользователей: ${users.length}`);
      
      // Получаем общее количество
      const totalUsers = await User.count();
      
      let message = `👥 ПОСЛЕДНИЕ ПОЛЬЗОВАТЕЛИ (10 из ${totalUsers})\n\n`;
      
      if (users.length === 0) {
        message += `Нет зарегистрированных пользователей`;
      } else {
        users.forEach((user, index) => {
          // Дата регистрации
          const date = user.createdAt ? 
            new Date(user.createdAt).toLocaleDateString('ru-RU') : 'неизвестно';
          
          // Безопасное получение количества запросов
          let searches = 0;
          if (user.searchHistory) {
            try {
              if (typeof user.searchHistory === 'string') {
                const parsed = JSON.parse(user.searchHistory);
                searches = Array.isArray(parsed) ? parsed.length : 0;
              } else if (Array.isArray(user.searchHistory)) {
                searches = user.searchHistory.length;
              } else if (typeof user.searchHistory === 'number') {
                searches = user.searchHistory;
              }
            } catch (e) {
              searches = 0;
            }
          }
          
          // Экранируем специальные символы Markdown
          let name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
          if (!name) name = 'Без имени';
          
          // Экранируем символы Markdown
          name = name.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
          
          let username = user.username ? `@${user.username}` : 'нет username';
          username = username.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
          
          message += `${index + 1}. ${name}\n`;
          message += `   ${username}\n`;
          message += `   ID: ${user.telegramId}\n`;
          message += `   Запросов: ${searches}\n`;
          message += `   Регистрация: ${date}\n\n`;
        });
      }
      
      // Отправляем БЕЗ parse_mode: 'Markdown'
      await this.bot.sendMessage(chatId, message);
      
      console.log('✅ Список пользователей отправлен');
      
    } catch (error) {
      console.error('❌ Ошибка списка пользователей:');
      console.error('Сообщение:', error.message);
      console.error('Stack:', error.stack);
      
      // Отправляем простой текст без Markdown
      await this.bot.sendMessage(chatId, 
        `⚠️ Ошибка получения списка пользователей.\n\n` +
        `Ошибка: ${error.message}\n\n` +
        `Проверьте логи бота.`
      );
    }
  }
  
  // Показать информацию о веб-админке
  async showWebAdminInfo(chatId) {
    const message = `🌐 *ВЕБ-АДМИНИСТРАТОРСКАЯ ПАНЕЛЬ*\n\n` +
      `🔗 *Локальный доступ:*\n` +
      `\`http://localhost:3000/admin\`\n\n` +
      `🔐 *Пароль:* \`admin123\`\n\n` +
      `📋 *Возможности:*\n` +
      `• Загрузка CSV файлов\n` +
      `• Массовое добавление данных\n` +
      `• Просмотр полной статистики\n` +
      `• Управление всей базой данных\n\n` +
      `🌍 *Для внешнего доступа:*\n` +
      `1. Установите ngrok: \`npm install -g ngrok\`\n` +
      `2. Запустите: \`ngrok http 3000\`\n` +
      `3. Получите ссылку вида https://abcd1234.ngrok.io\n` +
      `4. Отправьте заказчику ссылку и пароль`;
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });
  }
  
  // Экспорт данных
  async handleExportData(chatId) {
    try {
      console.log('📥 Запрос на экспорт данных от', chatId);
      
      // Показываем сообщение о начале экспорта
      const loadingMsg = await this.bot.sendMessage(chatId, 
        '🔄 *Подготавливаю данные для экспорта...*\n\n' +
        'Пожалуйста, подождите...',
        { parse_mode: 'Markdown' }
      );
      
      // Получаем все СМИ из базы
      const smiList = await SMI.findAll({
        attributes: ['name', 'category', 'country', 'audience', 'audienceNumber', 'price', 'contact', 'website', 'description', 'backdated'],
        order: [['name', 'ASC']]
      });
      
      console.log(`📊 Найдено СМИ для экспорта: ${smiList.length}`);
      
      if (smiList.length === 0) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
        await this.bot.sendMessage(chatId, 
          '📭 *В базе нет данных для экспорта*\n\n' +
          'Добавьте СМИ через админ-панель или импорт CSV.',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // Создаем CSV контент
      const headers = [
        'Название', 'Категория', 'Страна', 'Аудитория', 
        'Число аудитории', 'Цена (руб)', 'Контакты', 'Сайт', 
        'Описание', 'Backdated'
      ];
      
      let csvContent = headers.join(';') + '\n';
      
      smiList.forEach(smi => {
        const row = [
          `"${(smi.name || '').replace(/"/g, '""')}"`,
          `"${smi.category || ''}"`,
          `"${smi.country || ''}"`,
          `"${smi.audience || ''}"`,
          smi.audienceNumber || 0,
          smi.price || 0,
          `"${smi.contact || ''}"`,
          `"${smi.website || ''}"`,
          `"${(smi.description || '').replace(/"/g, '""')}"`,
          smi.backdated ? 'Да' : 'Нет'
        ];
        csvContent += row.join(';') + '\n';
      });
      
      // Создаем временный файл
      const fileName = `smi_export_${new Date().toISOString().split('T')[0]}_${Date.now()}.csv`;
      const filePath = `./temp_${fileName}`;
      
      fs.writeFileSync(filePath, '\uFEFF' + csvContent, 'utf8'); // BOM для корректного отображения кириллицы
      
      // Удаляем сообщение о загрузке
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      
      // Отправляем файл
      await this.bot.sendDocument(
        chatId,
        filePath,
        {},
        {
          filename: fileName,
          caption: `📥 *ЭКСПОРТ ДАННЫХ СМИ*\n\n` +
                   `✅ Успешно экспортировано: *${smiList.length}* записей\n` +
                   `📅 Дата экспорта: ${new Date().toLocaleDateString('ru-RU')}\n` +
                   `📊 Формат: CSV (разделитель - точка с запятой)\n\n` +
                   `*Столбцы файла:*\n` +
                   `• Название, Категория, Страна\n` +
                   `• Аудитория, Число аудитории\n` +
                   `• Цена, Контакты, Сайт\n` +
                   `• Описание, Backdated`,
          parse_mode: 'Markdown'
        }
      );
      
      console.log(`✅ Файл экспортирован: ${fileName}, ${smiList.length} записей`);
      
      // Удаляем временный файл
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Временный файл удален: ${filePath}`);
        }
      }, 5000);
      
    } catch (error) {
      console.error('❌ Ошибка экспорта данных:', error);
      
      // Пытаемся отправить сообщение об ошибке
      try {
        await this.bot.sendMessage(chatId,
          '❌ *ОШИБКА ЭКСПОРТА ДАННЫХ*\n\n' +
          'Не удалось подготовить файл экспорта.\n\n' +
          'Возможные причины:\n' +
          '• Проблемы с доступом к базе данных\n' +
          '• Ошибка при формировании CSV\n' +
          '• Недостаточно памяти\n\n' +
          'Проверьте логи бота для подробностей.',
          { parse_mode: 'Markdown' }
        );
      } catch (sendError) {
        console.error('Не удалось отправить сообщение об ошибке:', sendError);
      }
    }
  }
}

// Создаем и запускаем бота
if (require.main === module) {
  const useWebhook = process.env.USE_WEBHOOK === 'true' || 
                     process.env.REPLIT_URL || 
                     process.env.RAILWAY_URL || 
                     false;
  
  console.log(`🔄 Режим запуска: ${useWebhook ? 'Вебхук' : 'Polling'}`);
  console.log(`🌐 PORT: ${process.env.PORT || 3000}`);
  console.log(`⚙️ USE_WEBHOOK: ${process.env.USE_WEBHOOK || 'false'}`);
  
  // === ДОБАВЛЕНО: ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ===
  initDatabase().then(() => {
    console.log('✅ База данных готова к работе');
    
    const prBot = new PRBot(useWebhook);
    
    if (useWebhook) {
      console.log("🚀 Запуск бота в режиме вебхука...");
      prBot.startWebhook('/webhook', process.env.PORT || 3000);
      console.log("✅ Бот запущен в режиме вебхука!");
    } else {
      console.log("✅ Бот успешно запущен локально (polling)!");
      
      console.log("🔄 Запуск админ-панели...");
      try {
        const admin = require('./admin.js');
        admin.start();
        console.log("✅ Админ-панель запущена!");
      } catch (error) {
        console.log("❌ Не удалось запустить админ-панель:");
        console.log("   Ошибка:", error.message);
      }
    }
  }).catch(err => {
    console.error('❌ Ошибка инициализации БД:', err.message);
    console.log('⚠️ Бот запускается без базы данных...');
    
    const prBot = new PRBot(useWebhook);
    
    if (useWebhook) {
      console.log("🚀 Запуск бота в режиме вебхука...");
      prBot.startWebhook('/webhook', process.env.PORT || 3000);
      console.log("✅ Бот запущен в режиме вебхука!");
    } else {
      console.log("✅ Бот успешно запущен локально (polling)!");
    }
  });
  // ===========================================
} else {
  module.exports = PRBot;
}