// keyboards.js - Полный набор клавиатур для Telegram бота MediaPro

// ================================
// РЕПЛИ-КЛАВИАТУРЫ (ОСНОВНЫЕ МЕНЮ)
// ================================

// Главное меню
function getMainMenu(isAdmin = false) {
  const menu = {
    keyboard: [
      ['📰 ПОДОБРАТЬ СМИ'],
      ['🏆 ПРЕМИИ'],
      ['👨‍⚖️ ЖЮРИ', '🤝 АССОЦИАЦИИ'],
      ['⭐ ИЗБРАННОЕ', '👤 ЛИЧНЫЙ КАБИНЕТ'],
      ['📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ']
    ],
    resize_keyboard: true
  };
  
  if (isAdmin) {
    menu.keyboard.push(['⚙️ АДМИН-ПАНЕЛЬ']);
  }
  
  return menu;
}

// Категории СМИ
function getSMICategories() {
  return {
    keyboard: [
      ['📰 Бизнес', '💻 IT'],
      ['💰 Финансы', '📰 Новости'],
      ['🎭 Культура', '🏥 Здоровье'],
      ['🚀 Технологии', '🛒 Розница'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Страны
function getCountries() {
  return {
    keyboard: [
      ['🇷🇺 Россия', '🇺🇸 США'],
      ['🇬🇧 Великобритания', '🇩🇪 Германия'],
      ['🇫🇷 Франция', '🇨🇳 Китай'],
      ['🌍 Все страны', '🌏 Другая страна'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Опции backdated
function getBackdatedOptions() {
  return {
    keyboard: [
      ['✅ Да', '❌ Нет'],
      ['⚠️ Не важно'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Опции аудитории
function getAudienceOptions() {
  return {
    keyboard: [
      ['👥 До 100К', '👥 100К - 500К'],
      ['👥 500К - 1М', '👥 1М - 5М'],
      ['👥 5М+', '👥 Любая аудитория'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Меню профиля
function getProfileMenu() {
  return {
    keyboard: [
      ['📊 Статистика', '🕐 История запросов'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Категории премий
function getAwardCategories() {
  return {
    keyboard: [
      ['🎭 Культура', '🏥 Здоровье'],
      ['🚀 Технологии', '🛒 Розница'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Ценовые опции
function getPriceOptions() {
  return {
    keyboard: [
      ['💰 До 50K руб.', '💰 50K-100K руб.'],
      ['💰 100K-200K руб.', '💎 200K+ руб.'],
      ['💵 Любая цена', '💸 Дешевые'],
      ['💎 Дорогие', '⚡ ТОП по цене'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Меню быстрого поиска
function getQuickSearchMenu() {
  return {
    keyboard: [
      ['🔥 ТОП Business', '🔥 ТОП Technology'],
      ['🇷🇺 Российские СМИ', '🌍 Международные'],
      ['💰 Бюджетные СМИ', '👥 Крупная аудитория'],
      ['🔍 Расширенный поиск', '🎯 Рекомендации'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Тип поиска
function getSearchTypeMenu() {
  return {
    keyboard: [
      ['⚡ Быстрый поиск', '🔍 Расширенный поиск'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Меню после поиска
function getAfterSearchMenu() {
  return {
    keyboard: [
      ['🔄 Новый поиск'],
      ['🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// Админ-меню
function getAdminMenu() {
  return {
    keyboard: [
      ['📊 Статистика бота', '👥 Пользователи'],
      ['📰 Управление СМИ', '🏆 Управление премиями'],
      ['📥 Экспорт данных', '🗑️ Очистить кэш'],
      ['🌐 Веб-админка', '📢 Рассылка'],
      ['🔙 Назад в админку', '🏠 Главное меню']
    ],
    resize_keyboard: true
  };
}

// ================================
// INLINE-КЛАВИАТУРЫ (ПАГИНАЦИЯ)
// ================================

// Пагинация для результатов поиска
function getPagination(currentPage, totalPages, searchId, itemId = null) {
  const buttons = [];
  
  // Кнопки навигации
  if (currentPage > 1) {
    buttons.push({ 
      text: "◀️ Назад", 
      callback_data: `page_${searchId}_${currentPage - 1}` 
    });
  }
  
  buttons.push({ 
    text: `${currentPage}/${totalPages}`, 
    callback_data: 'page_info' 
  });
  
  if (currentPage < totalPages) {
    buttons.push({ 
      text: "Вперед ▶️", 
      callback_data: `page_${searchId}_${currentPage + 1}` 
    });
  }
  
  const inlineKeyboard = [];
  
  // Добавляем строку пагинации если есть кнопки
  if (buttons.length > 0) {
    inlineKeyboard.push(buttons);
  }
  
  // Кнопки действий для конкретного СМИ
  if (itemId) {
    inlineKeyboard.push([
      { 
        text: "⭐ В избранное", 
        callback_data: `fav_smi_${itemId}` 
      },
      { 
        text: "📞 Контакты", 
        callback_data: `contact_smi_${itemId}` 
      }
    ]);
  }
  
  // Общие кнопки действий
  inlineKeyboard.push([
    { 
      text: "📥 Экспорт в CSV", 
      callback_data: `export_${searchId}` 
    },
    { 
      text: "🔄 Новый поиск", 
      callback_data: 'new_search' 
    },
    { 
      text: "🏠 В меню", 
      callback_data: 'main_menu' 
    }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };
}

// Простая пагинация (без дополнительных кнопок)
function getSimplePagination(currentPage, totalPages, searchId) {
  const buttons = [];
  
  if (currentPage > 1) {
    buttons.push({ 
      text: "◀️ Назад", 
      callback_data: `page_${searchId}_${currentPage - 1}` 
    });
  }
  
  buttons.push({ 
    text: `${currentPage}/${totalPages}`, 
    callback_data: 'page_info' 
  });
  
  if (currentPage < totalPages) {
    buttons.push({ 
      text: "Вперед ▶️", 
      callback_data: `page_${searchId}_${currentPage + 1}` 
    });
  }
  
  return {
    reply_markup: {
      inline_keyboard: [buttons]
    }
  };
}

// Кнопка закрытия уведомления
function getCloseNotification() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ 
          text: "❌ Закрыть", 
          callback_data: 'close_notification' 
        }]
      ]
    }
  };
}

// Подтверждение действия
function getConfirmation(action, data) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { 
            text: "✅ Да", 
            callback_data: `${action}_confirm_${data}` 
          },
          { 
            text: "❌ Нет", 
            callback_data: `${action}_cancel` 
          }
        ]
      ]
    }
  };
}

// ================================
// СПЕЦИАЛЬНЫЕ КЛАВИАТУРЫ
// ================================

// Меню для PR-новостей
function getPRNewsMenu() {
  return {
    keyboard: [
      ['📈 PR Тренды', '🎯 PR Кейсы'],
      ['📊 PR Аналитика', '🔥 Кризисные PR'],
      ['🔍 Поиск PR-новостей', '📢 Все PR-новости'],
      ['⬅️ НАЗАД', '🏠 Главное меню']
    ],
    resize_keyboard: true
  };
}

// Меню после поиска PR-новостей
function getAfterPRSearchMenu() {
  return {
    keyboard: [
      ['🔍 Новый поиск PR', '📢 Все PR-новости'],
      ['⬅️ НАЗАД', '🏠 Главное меню']
    ],
    resize_keyboard: true
  };
}

// Меню сортировки
function getSortMenu() {
  return {
    keyboard: [
      ['📈 По популярности', '💰 По цене (дешевые)'],
      ['💎 По цене (дорогие)', '👥 По аудитории'],
      ['🆕 По новизне', '🔤 По названию'],
      ['⬅️ НАЗАД', '🏠 ГЛАВНОЕ МЕНЮ']
    ],
    resize_keyboard: true
  };
}

// ================================
// УТИЛИТЫ ДЛЯ ЭМОДЗИ
// ================================

// Получение эмодзи для категории
function getCategoryEmoji(category) {
  if (!category) return '📋';
  
  const emojiMap = {
    'business': '💼',
    'technology': '💻',
    'news': '📰',
    'financial': '💰',
    'finance': '💰',
    'music': '🎵',
    'movie': '🎬',
    'sport': '⚽',
    'sports': '⚽',
    'health': '🏥',
    'education': '🎓',
    'travel': '✈️',
    'food': '🍕',
    'fashion': '👗',
    'automotive': '🚗',
    'real estate': '🏠',
    'estate': '🏠',
    'entertainment': '🎭',
    'lifestyle': '🌟',
    'science': '🔬',
    'gaming': '🎮',
    'game': '🎮',
    'culture': '🎭',
    'retail': '🛒',
    'розница': '🛒',
    'it': '💻',
    'бизнес': '💼',
    'финансы': '💰',
    'новости': '📰',
    'культура': '🎭',
    'здоровье': '🏥',
    'технологии': '🚀'
  };
  
  const categoryLower = category.toLowerCase();
  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (categoryLower.includes(key)) {
      return emoji;
    }
  }
  
  return '📋';
}

// Получение флага для страны
function getCountryFlag(country) {
  if (!country) return '🌍';
  
  const flagMap = {
    'russia': '🇷🇺',
    'russian': '🇷🇺',
    'россия': '🇷🇺',
    'russland': '🇷🇺',
    'usa': '🇺🇸',
    'united states': '🇺🇸',
    'america': '🇺🇸',
    'сша': '🇺🇸',
    'germany': '🇩🇪',
    'german': '🇩🇪',
    'германия': '🇩🇪',
    'deutschland': '🇩🇪',
    'france': '🇫🇷',
    'french': '🇫🇷',
    'франция': '🇫🇷',
    'uk': '🇬🇧',
    'united kingdom': '🇬🇧',
    'britain': '🇬🇧',
    'великобритания': '🇬🇧',
    'china': '🇨🇳',
    'chinese': '🇨🇳',
    'китай': '🇨🇳',
    'japan': '🇯🇵',
    'japanese': '🇯🇵',
    'япония': '🇯🇵',
    'korea': '🇰🇷',
    'korean': '🇰🇷',
    'корея': '🇰🇷',
    'italy': '🇮🇹',
    'italian': '🇮🇹',
    'италия': '🇮🇹',
    'spain': '🇪🇸',
    'spanish': '🇪🇸',
    'испания': '🇪🇸',
    'india': '🇮🇳',
    'indian': '🇮🇳',
    'индия': '🇮🇳',
    'brazil': '🇧🇷',
    'brazilian': '🇧🇷',
    'бразилия': '🇧🇷',
    'canada': '🇨🇦',
    'canadian': '🇨🇦',
    'канада': '🇨🇦',
    'australia': '🇦🇺',
    'australian': '🇦🇺',
    'австралия': '🇦🇺'
  };
  
  const countryLower = country.toLowerCase();
  for (const [key, flag] of Object.entries(flagMap)) {
    if (countryLower.includes(key)) {
      return flag;
    }
  }
  
  return '🌍';
}

// Получение эмодзи для аудитории
function getAudienceEmoji(audienceNumber) {
  if (!audienceNumber) return '👥';
  
  if (audienceNumber >= 5000000) return '👑'; // 5M+
  if (audienceNumber >= 1000000) return '🌟'; // 1M-5M
  if (audienceNumber >= 500000) return '⭐';  // 500K-1M
  if (audienceNumber >= 100000) return '👥';  // 100K-500K
  
  return '👤'; // До 100K
}

// Получение эмодзи для цены
function getPriceEmoji(price) {
  if (!price) return '💸';
  
  if (price >= 200000) return '💎';     // 200K+
  if (price >= 100000) return '💰';     // 100K-200K
  if (price >= 50000) return '💵';      // 50K-100K
  
  return '💸'; // До 50K
}

// ================================
// ФОРМАТИРОВАНИЕ ДАННЫХ
// ================================

// Форматирование числа аудитории
function formatAudience(audienceNumber) {
  if (!audienceNumber) return 'н/д';
  
  if (audienceNumber >= 1000000) {
    return `${(audienceNumber / 1000000).toFixed(1)}M`;
  }
  if (audienceNumber >= 1000) {
    return `${Math.round(audienceNumber / 1000)}K`;
  }
  
  return audienceNumber.toLocaleString();
}

// Форматирование цены
function formatPrice(price) {
  if (!price) return 'цена по запросу';
  
  if (price >= 1000000) {
    return `${(price / 1000000).toFixed(1)}M руб.`;
  }
  if (price >= 1000) {
    return `${Math.round(price / 1000)}K руб.`;
  }
  
  return `${price.toLocaleString('ru-RU')} руб.`;
}

// Форматирование даты
function formatDate(dateString) {
  if (!dateString) return 'н/д';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    return 'н/д';
  }
}

// Форматирование времени
function formatTime(dateString) {
  if (!dateString) return 'н/д';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return 'н/д';
  }
}

// ================================
// ЭКСПОРТ ВСЕХ ФУНКЦИЙ
// ================================

module.exports = {
  // Репли-клавиатуры
  getMainMenu,
  getSMICategories,
  getCountries,
  getBackdatedOptions,
  getAudienceOptions,
  getProfileMenu,
  getAwardCategories,
  getPriceOptions,
  getQuickSearchMenu,
  getSearchTypeMenu,
  getAfterSearchMenu,
  getAdminMenu,
  getPRNewsMenu,
  getAfterPRSearchMenu,
  getSortMenu,
  
  // Inline-клавиатуры
  getPagination,
  getSimplePagination,
  getCloseNotification,
  getConfirmation,
  
  // Утилиты для эмодзи
  getCategoryEmoji,
  getCountryFlag,
  getAudienceEmoji,
  getPriceEmoji,
  
  // Форматирование данных
  formatAudience,
  formatPrice,
  formatDate,
  formatTime
};