// database.js - ОБНОВЛЕННЫЙ
const { Pool } = require('pg');
require('dotenv').config();

// Конфигурация пула
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

console.log('✅ Подключение к PostgreSQL настроено');

// Проверка подключения
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Ошибка подключения:', err.message);
  } else {
    console.log('✅ Подключение успешно');
  }
});

// Обработчики событий пула
pool.on('error', (err) => {
  console.error('❌ Ошибка PostgreSQL pool:', err);
});

// ========== ФУНКЦИИ ==========

// Форматирование чисел
function formatNumber(num) {
  if (!num) return 'нет данных';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + ' млн';
  if (num >= 1000) return (num / 1000).toFixed(1) + ' тыс';
  return num.toString();
}

// Тест базы - показывает первые СМИ
async function testSMI() {
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.country,
        c.name as category,
        s.visits_per_month,
        s.can_backdate,
        s.website,
        s.description,
        s.lead_time_hours,
        s.is_active
      FROM smi s
      JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true
      ORDER BY s.id
      LIMIT 10
    `);
    
    console.log(`✅ Тест базы: найдено ${result.rows.length} СМИ`);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка теста базы:', error);
    return [];
  }
}

// Отладочный поиск
async function searchSMIDebug(country, category) {
  try {
    console.log(`🔍 Отладочный поиск: ${country} - ${category}`);
    
    // Пробуем разные варианты поиска
    const result = await pool.query(`
      SELECT 
        s.name,
        s.country,
        c.name as category,
        s.visits_per_month,
        s.can_backdate
      FROM smi s
      JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true
      AND (
        s.country ILIKE $1 OR 
        s.country ILIKE $2 OR
        c.name ILIKE $3 OR
        c.name ILIKE $4
      )
      LIMIT 10
    `, [
      `%${country}%`,
      `%${translateCountry(country)}%`,
      `%${category}%`,
      `%${translateCategory(category)}%`
    ]);
    
    console.log(`✅ Отладочный поиск: ${result.rows.length} результатов`);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка отладочного поиска:', error);
    return [];
  }
}

// Перевод стран
function translateCountry(country) {
  const map = {
    'США': 'United States',
    'Великобритания': 'United Kingdom',
    'Германия': 'Germany',
    'Франция': 'France',
    'Италия': 'Italy',
    'Испания': 'Spain',
    'ОАЭ': 'United Arab Emirates',
    'Казахстан': 'Kazakhstan',
    'Россия': 'Russia',
    'Китай': 'China',
    'Япония': 'Japan',
    'Индия': 'India'
  };
  return map[country] || country;
}

// Перевод категорий
function translateCategory(category) {
  const map = {
    'IT': 'IT',
    'Бизнес': 'Business',
    'Стартапы': 'Startups',
    'Технологии': 'Technology',
    'Финансы': 'Finance',
    'Крипто': 'Crypto',
    'Маркетинг': 'Marketing',
    'PR': 'PR',
    'Медицина': 'Medicine',
    'Красота': 'Beauty',
    'Мода': 'Fashion',
    'Культура': 'Culture',
    'Искусство': 'Art',
    'Музыка': 'Music',
    'Кино': 'Cinema',
    'Спорт': 'Sports',
    'Образование': 'Education',
    'Наука': 'Science',
    'Недвижимость': 'Real Estate',
    'Lifestyle': 'Lifestyle'
  };
  return map[category] || category;
}

// Получение категорий
async function getCategories() {
  try {
    const result = await pool.query(`
      SELECT id, name
      FROM categories
      ORDER BY name
    `);
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка получения категорий:', error);
    return [];
  }
}

// Получение стран
async function getCountries(limit = 20) {
  try {
    const result = await pool.query(`
      SELECT DISTINCT country
      FROM smi
      WHERE is_active = true AND country IS NOT NULL AND country != ''
      ORDER BY country
      LIMIT $1
    `, [limit]);
    
    return result.rows.map(row => row.country);
  } catch (error) {
    console.error('❌ Ошибка получения стран:', error);
    return [];
  }
}

// Поиск по фильтрам (основная функция)
async function getSMIByFilters(filters = {}) {
  try {
    console.log('🔍 Поиск СМИ с фильтрами:', filters);
    
    const {
      country = null,
      category = null,
      minVisits = null,
      maxVisits = null,
      canBackdate = null,
      limit = 20
    } = filters;
    
    let query = `
      SELECT 
        s.id,
        s.name,
        s.country,
        c.name as category,
        s.visits_per_month,
        s.can_backdate,
        s.website,
        s.description,
        s.lead_time_hours
      FROM smi s
      JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Поиск по стране
    if (country) {
      // Ищем по русскому и английскому названию
      const countryVariants = [
        `%${country}%`,
        `%${translateCountry(country)}%`
      ];
      
      // Убираем дубликаты
      const uniqueVariants = [...new Set(countryVariants.filter(v => v !== '%%'))];
      
      if (uniqueVariants.length > 0) {
        const conditions = uniqueVariants.map((v, i) => 
          `s.country ILIKE $${paramIndex + i}`
        ).join(' OR ');
        
        query += ` AND (${conditions})`;
        params.push(...uniqueVariants);
        paramIndex += uniqueVariants.length;
      }
    }
    
    // Поиск по категории
    if (category) {
      const categoryVariants = [
        `%${category}%`,
        `%${translateCategory(category)}%`
      ];
      
      const uniqueVariants = [...new Set(categoryVariants.filter(v => v !== '%%'))];
      
      if (uniqueVariants.length > 0) {
        const conditions = uniqueVariants.map((v, i) => 
          `c.name ILIKE $${paramIndex + i}`
        ).join(' OR ');
        
        query += ` AND (${conditions})`;
        params.push(...uniqueVariants);
        paramIndex += uniqueVariants.length;
      }
    }
    
    // Фильтр по заднему числу
    if (canBackdate !== null) {
      query += ` AND s.can_backdate = $${paramIndex}`;
      params.push(canBackdate);
      paramIndex++;
    }
    
    // Фильтр по посещаемости
    if (minVisits !== null) {
      query += ` AND s.visits_per_month >= $${paramIndex}`;
      params.push(minVisits);
      paramIndex++;
    }
    
    if (maxVisits !== null) {
      query += ` AND s.visits_per_month <= $${paramIndex}`;
      params.push(maxVisits);
      paramIndex++;
    }
    
    // Сортировка и лимит
    query += `
      ORDER BY 
        CASE 
          WHEN s.visits_per_month IS NOT NULL THEN s.visits_per_month 
          ELSE 0 
        END DESC,
        s.name
      LIMIT $${paramIndex}
    `;
    
    params.push(limit);
    
    console.log('📝 SQL запрос:', query.substring(0, 200) + '...');
    console.log('🔢 Параметры:', params);
    
    const result = await pool.query(query, params);
    
    console.log(`✅ Найдено результатов: ${result.rows.length}`);
    if (result.rows.length > 0) {
      console.log('📋 Пример:', {
        name: result.rows[0].name,
        country: result.rows[0].country,
        category: result.rows[0].category,
        visits: result.rows[0].visits_per_month
      });
    }
    
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка поиска СМИ:', error);
    return [];
  }
}

// Статистика базы
async function getDatabaseStats() {
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM smi WHERE is_active = true) as total_smi,
        (SELECT COUNT(DISTINCT country) FROM smi WHERE is_active = true) as countries_count,
        (SELECT COUNT(*) FROM categories) as categories_count,
        (SELECT COUNT(*) FROM smi WHERE can_backdate = true AND is_active = true) as backdate_count
    `);
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Ошибка статистики:', error);
    return null;
  }
}

// Поиск по названию
async function searchSMIByName(searchTerm, limit = 10) {
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.country,
        c.name as category,
        s.visits_per_month,
        s.can_backdate,
        s.website,
        s.description
      FROM smi s
      JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true AND s.name ILIKE $1
      ORDER BY s.name
      LIMIT $2
    `, [`%${searchTerm}%`, limit]);
    
    return result.rows;
  } catch (error) {
    console.error('❌ Ошибка поиска по названию:', error);
    return [];
  }
}

module.exports = {
  pool,
  formatNumber,
  getCategories,
  getCountries,
  searchSMIByName,
  getSMIByFilters,
  getDatabaseStats,
  testSMI,
  searchSMIDebug
};