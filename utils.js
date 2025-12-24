const fs = require('fs');
const path = require('path');

// Форматирование числа с разделителями
function formatNumber(num) {
  if (!num) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Получение эмодзи для категории
function getCategoryEmoji(category) {
  const emojiMap = {
    'Бизнес': '💼',
    'ИИ/Технологии': '🤖',
    'Финансы': '💰',
    'Здравоохранение': '🏥',
    'Мода/Fashion': '👗',
    'Культура': '🎨',
    'Авто': '🚗',
    'Недвижимость': '🏠',
    'Рестораны': '🍽️',
    'Путешествия': '✈️',
    'Гейминг': '🎮',
    'Экология': '🌱',
    'Право': '⚖️',
    'Образование': '🎓',
    'IT': '📱',
    'Наука': '🔬',
    'Промышленность': '🏭',
    'Бизнес-центры': '🏢'
  };
  return emojiMap[category] || '📌';
}

// Получение флага страны
function getCountryFlag(country) {
  const flagMap = {
    'Россия': '🇷🇺',
    'США': '🇺🇸',
    'Великобритания': '🇬🇧',
    'Германия': '🇩🇪',
    'Франция': '🇫🇷',
    'Китай': '🇨🇳',
    'Япония': '🇯🇵',
    'Южная Корея': '🇰🇷',
    'Сингапур': '🇸🇬'
  };
  return flagMap[country] || '🌍';
}

// Получение эмодзи для аудитории
function getAudienceEmoji(audienceNumber) {
  if (!audienceNumber) return '👥';
  if (audienceNumber <= 100000) return '👥';
  if (audienceNumber <= 1000000) return '👥👥';
  return '👥👥👥';
}

// Форматирование даты
function formatDate(dateString) {
  if (!dateString) return 'не указано';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU');
}

// Конвертация в CSV
function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(obj => 
    Object.values(obj).map(value => 
      typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
    ).join(',')
  );
  
  return [headers, ...rows].join('\n');
}

module.exports = {
  formatNumber,
  getCategoryEmoji,
  getCountryFlag,
  getAudienceEmoji,
  formatDate,
  convertToCSV
};
