const fs = require('fs');
const path = require('path');

// Попробуем загрузить реальные данные из CSV файла
let realCategories = ['Бизнес', 'IT', 'Финансы', 'Новости', 'Культура', 'Здоровье', 'Технологии', 'Розница'];
let realCountries = ['Россия', 'США', 'Великобритания', 'Германия', 'Франция', 'Китай', 'Украина', 'Канада'];

// Функция для анализа реальных категорий (запускается один раз)
function analyzeRealData() {
    try {
        const csvPath = path.join(__dirname, '../smi-import-fixed.csv');
        if (fs.existsSync(csvPath)) {
            const data = fs.readFileSync(csvPath, 'utf8');
            const lines = data.split('\n').slice(1, 100); // Анализируем первые 100 строк
            
            const categoriesSet = new Set();
            const countriesSet = new Set();
            
            lines.forEach(line => {
                if (!line.trim()) return;
                
                // Простой парсинг CSV
                const fields = line.match(/(?:"[^"]*"|[^,]+)/g);
                if (fields && fields.length >= 3) {
                    const category = fields[1] ? fields[1].replace(/"/g, '').trim() : '';
                    const country = fields[2] ? fields[2].replace(/"/g, '').split(',')[0].trim() : '';
                    
                    if (category && category !== 'Category') categoriesSet.add(category);
                    if (country && country !== 'Country') countriesSet.add(country);
                }
            });
            
            if (categoriesSet.size > 0) {
                realCategories = Array.from(categoriesSet).slice(0, 8);
            }
            
            if (countriesSet.size > 0) {
                realCountries = Array.from(countriesSet).slice(0, 8);
            }
            
            console.log('✅ Загружены реальные категории:', realCategories);
        }
    } catch (error) {
        console.log('⚠️ Не удалось загрузить реальные данные, используем стандартные');
    }
}

// Запускаем анализ при импорте модуля
analyzeRealData();

// Главное меню (с возможностью добавления админ-кнопки)
function getMainMenu(isAdmin = false) {
  const keyboard = [
    [{ text: "📰 ПОДОБРАТЬ СМИ" }, { text: "📢 PR НОВОСТИ" }],
    [{ text: "🏆 ПРЕМИИ" }],
    [{ text: "👨‍⚖️ ЖЮРИ" }, { text: "🤝 АССОЦИАЦИИ" }],
    [{ text: "⭐ ИЗБРАННОЕ" }, { text: "👤 ЛИЧНЫЙ КАБИНЕТ" }],
    [{ text: "📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ" }]
  ];
  
  // Добавляем админ-кнопку ТОЛЬКО для администраторов
  if (isAdmin) {
    keyboard.unshift([{ text: "⚙️ АДМИН-ПАНЕЛЬ" }]);
  }
  
  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true
    }
  };
}

// Админ-меню
function getAdminMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📊 Статистика бота" }, { text: "👥 Пользователи" }],
        [{ text: "📰 Управление СМИ" }, { text: "🏆 Управление премиями" }],
        [{ text: "📥 Экспорт данных" }, { text: "🗑️ Очистить кэш" }],
        [{ text: "🌐 Веб-админка" }, { text: "📢 Рассылка" }],
        [{ text: "🏠 Главное меню" }]
      ],
      resize_keyboard: true
    }
  };
}

// УЛУЧШЕННЫЕ КАТЕГОРИИ СМИ (на основе реальных данных)
function getSMICategories() {
  // Используем реальные категории или стандартные
  const categories = realCategories;
  
  // Создаем клавиатуру из реальных категорий
  const keyboard = [];
  for (let i = 0; i < categories.length; i += 2) {
    const row = [];
    if (categories[i]) {
      // Добавляем эмодзи в зависимости от категории
      const emoji = getCategoryEmoji(categories[i]);
      row.push({ text: `${emoji} ${categories[i]}` });
    }
    if (categories[i + 1]) {
      const emoji = getCategoryEmoji(categories[i + 1]);
      row.push({ text: `${emoji} ${categories[i + 1]}` });
    }
    if (row.length > 0) keyboard.push(row);
  }
  
  // Добавляем дополнительные опции
  keyboard.push(
    [{ text: "🔍 Все категории" }, { text: "⭐ Популярные" }],
    [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
  );
  
  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true
    }
  };
}

// УЛУЧШЕННЫЕ СТРАНЫ (на основе реальных данных)
function getCountries() {
  // Используем реальные страны или стандартные
  const countries = realCountries;
  
  const keyboard = [
    [getCountryButton(countries[0] || 'Россия'), getCountryButton(countries[1] || 'США')],
    [getCountryButton(countries[2] || 'Великобритания'), getCountryButton(countries[3] || 'Германия')],
    [getCountryButton(countries[4] || 'Франция'), getCountryButton(countries[5] || 'Китай')],
    [{ text: "🌍 Все страны" }, { text: "🌏 Другая страна" }],
    [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
  ];
  
  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true
    }
  };
}

// УЛУЧШЕННЫЕ ОПЦИИ АУДИТОРИИ С РЕАЛЬНЫМИ ДИАПАЗОНАМИ
function getAudienceOptions() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "👤 Малая (до 100K)" }, { text: "👥 Средняя (100K-500K)" }],
        [{ text: "👥👥 Крупная (500K-1M)" }, { text: "👥👥👥 Очень крупная (1M-5M)" }],
        [{ text: "👑 Премиум (5M+)" }, { text: "📊 Любая аудитория" }],
        [{ text: "⭐ ТОП по аудитории" }, { text: "💰 Эконом-сегмент" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// ДОПОЛНИТЕЛЬНО: МЕНЮ ЦЕНЫ
function getPriceOptions() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "💰 До 50,000 руб." }, { text: "💰💰 50,000-100,000 руб." }],
        [{ text: "💰💰💰 100,000-200,000 руб." }, { text: "💎 200,000+ руб." }],
        [{ text: "💵 Любая цена" }, { text: "📉 Сначала дешевые" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// БЫСТРЫЙ ПОИСК (популярные фильтры)
function getQuickSearchMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🔥 ТОП Business" }, { text: "🔥 ТОП Technology" }],
        [{ text: "🇷🇺 Российские СМИ" }, { text: "🌍 Международные" }],
        [{ text: "💰 Бюджетные СМИ" }, { text: "👥 Крупная аудитория" }],
        [{ text: "🔍 Расширенный поиск" }, { text: "🎯 Рекомендации" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Опции backdated (оставляем как есть)
function getBackdatedOptions() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "✅ Да" }, { text: "❌ Нет" }],
        [{ text: "⚠️ Не важно" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Меню профиля
function getProfileMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📊 Статистика" }, { text: "🕐 История запросов" }],
        [{ text: "⭐ Избранное" }, { text: "📋 Мои запросы" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Категории премий
function getAwardCategories() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🎭 Культура" }, { text: "🏥 Здоровье" }],
        [{ text: "🚀 Технологии" }, { text: "🛒 Розница" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// УЛУЧШЕННАЯ ПАГИНАЦИЯ
function getPagination(currentPage, totalPages, searchId, itemId = null) {
  const buttons = [];
  
  if (currentPage > 1) {
    buttons.push({ text: "◀️ Назад", callback_data: `page_${searchId}_${currentPage - 1}` });
  }
  
  buttons.push({ text: `Страница ${currentPage}/${totalPages}`, callback_data: 'current' });
  
  if (currentPage < totalPages) {
    buttons.push({ text: "Вперед ▶️", callback_data: `page_${searchId}_${currentPage + 1}` });
  }
  
  const inlineKeyboard = [buttons];
  
  // Добавляем кнопки действий, если есть itemId
  if (itemId) {
    inlineKeyboard.push([
      { text: "⭐ В избранное", callback_data: `fav_smi_${itemId}` },
      { text: "📞 Контакты", callback_data: `contact_smi_${itemId}` }
    ]);
  }
  
  inlineKeyboard.push([
    { text: "📥 Экспорт в CSV", callback_data: `export_${searchId}` },
    { text: "🔍 Новый поиск", callback_data: 'new_search' },
    { text: "🏠 В меню", callback_data: 'main_menu' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };
}

// Уведомление о закрытии
function getCloseNotification() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "❌ Закрыть", callback_data: 'close_notification' }]
      ]
    }
  };
}

// ПР Новости - меню раздела
function getPRNewsMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📈 PR Тренды" }, { text: "🎯 PR Кейсы" }],
        [{ text: "📊 PR Аналитика" }, { text: "🔥 Кризисные PR" }],
        [{ text: "🔍 Поиск PR-новостей" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// ПР Новости - после поиска
function getAfterPRSearchMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🔍 Новый поиск" }, { text: "📈 PR Тренды" }],
        [{ text: "📢 Все PR-новости" }, { text: "🏠 Главное меню" }]
      ],
      resize_keyboard: true
    }
  };
}

// Вспомогательные функции

function getCategoryEmoji(category) {
  const emojiMap = {
    'Business': '💼',
    'Technology': '💻',
    'Finance': '💰',
    'News': '📰',
    'Culture': '🎭',
    'Health': '🏥',
    'Sports': '⚽',
    'Travel': '✈️',
    'Food': '🍽️',
    'Automotive': '🚗',
    'Education': '🎓',
    'Real Estate': '🏠',
    'Fashion': '👗',
    'Entertainment': '🎬',
    'General News': '📰',
    'Lifestyle': '🌟',
    'Local News': '📍',
    'Architecture & Construction': '🏗️'
  };
  
  // Поиск по частичному совпадению
  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (category.toLowerCase().includes(key.toLowerCase())) {
      return emoji;
    }
  }
  
  return '📋'; // Эмодзи по умолчанию
}

function getCountryButton(country) {
  const flagMap = {
    'Россия': '🇷🇺',
    'Russia': '🇷🇺',
    'США': '🇺🇸',
    'United States': '🇺🇸',
    'USA': '🇺🇸',
    'Великобритания': '🇬🇧',
    'United Kingdom': '🇬🇧',
    'UK': '🇬🇧',
    'Германия': '🇩🇪',
    'Germany': '🇩🇪',
    'Франция': '🇫🇷',
    'France': '🇫🇷',
    'Китай': '🇨🇳',
    'China': '🇨🇳',
    'Украина': '🇺🇦',
    'Ukraine': '🇺🇦',
    'Канада': '🇨🇦',
    'Canada': '🇨🇦',
    'Австралия': '🇦🇺',
    'Australia': '🇦🇺',
    'Япония': '🇯🇵',
    'Japan': '🇯🇵',
    'Корея': '🇰🇷',
    'Korea': '🇰🇷',
    'Индия': '🇮🇳',
    'India': '🇮🇳'
  };
  
  const flag = flagMap[country] || '🌍';
  return { text: `${flag} ${country}` };
}

module.exports = {
  getMainMenu,
  getAdminMenu,
  getSMICategories,
  getCountries,
  getBackdatedOptions,
  getAudienceOptions,
  getPriceOptions,           // НОВОЕ: меню цены
  getQuickSearchMenu,        // НОВОЕ: быстрый поиск
  getProfileMenu,
  getAwardCategories,
  getPagination,
  getCloseNotification,
  getPRNewsMenu,
  getAfterPRSearchMenu,
  
  // Экспортируем вспомогательные функции для использования в bot.js
  getCategoryEmoji,
  getCountryButton
};