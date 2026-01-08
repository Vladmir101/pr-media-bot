// database.js - Поддержка DATABASE_URL из Render
const { Pool } = require('pg');
require('dotenv').config();

let poolConfig;

// Проверяем есть ли DATABASE_URL (формат Render)
if (process.env.DATABASE_URL) {
  console.log('🔗 Использую DATABASE_URL из Render');
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else {
  // Используем отдельные переменные (для локальной разработки)
  console.log('🔗 Использую отдельные переменные подключения');
  poolConfig = {
    host: process.env.DB_HOST || "dpg-d56ghore5dus73copac0-a.frankfurt-postgres.render.com",
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || "pr_media_bot",
    user: process.env.DB_USER || "pr_media_user",
    password: process.env.DB_PASSWORD || "9YBZx4NoNs9vpKD53Y5VqRgDL9IMXhzy",
    ssl: {
      rejectUnauthorized: false
    }
  };
}

// Настройки пула соединений
const pool = new Pool({
  ...poolConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

console.log('✅ Подключение к PostgreSQL настроено');

// Проверка подключения
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
  } else {
    console.log('✅ Подключение к PostgreSQL успешно');
  }
});

// Функция форматирования чисел
function formatNumber(num) {
  if (!num) return 'нет данных';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/**
 * Получить все категории
 */
async function getCategories() {
  try {
    const result = await pool.query(`
      SELECT id, name, COUNT(smi.id) as count
      FROM categories c
      LEFT JOIN smi ON c.id = smi.category_id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `);
    return result.rows;
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    return [];
  }
}

/**
 * Поиск СМИ по названию
 */
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
        s.description,
        s.lead_time_hours,
        s.is_active
      FROM smi s
      JOIN categories c ON s.category_id = c.id
      WHERE s.name ILIKE $1 AND s.is_active = true
      ORDER BY 
        CASE 
          WHEN s.visits_per_month IS NOT NULL THEN s.visits_per_month 
          ELSE 0 
        END DESC
      LIMIT $2
    `, [`%${searchTerm}%`, limit]);
    
    return result.rows;
  } catch (error) {
    console.error('Ошибка поиска СМИ:', error);
    return [];
  }
}

/**
 * Поиск СМИ по фильтрам
 */
async function getSMIByFilters(filters = {}) {
  try {
    const {
      country = null,
      category_id = null,
      min_visits = null,
      max_visits = null,
      can_backdate = null,
      limit = 50,
      offset = 0
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
    
    if (country) {
      query += ` AND s.country ILIKE $${paramIndex}`;
      params.push(`%${country}%`);
      paramIndex++;
    }
    
    if (category_id) {
      query += ` AND s.category_id = $${paramIndex}`;
      params.push(category_id);
      paramIndex++;
    }
    
    if (can_backdate !== null) {
      query += ` AND s.can_backdate = $${paramIndex}`;
      params.push(can_backdate);
      paramIndex++;
    }
    
    if (min_visits !== null) {
      query += ` AND s.visits_per_month >= $${paramIndex}`;
      params.push(min_visits);
      paramIndex++;
    }
    
    if (max_visits !== null) {
      query += ` AND s.visits_per_month <= $${paramIndex}`;
      params.push(max_visits);
      paramIndex++;
    }
    
    query += `
      ORDER BY 
        CASE 
          WHEN s.visits_per_month IS NOT NULL THEN s.visits_per_month 
          ELSE 0 
        END DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Ошибка фильтрации СМИ:', error);
    return [];
  }
}

/**
 * Получить статистику по странам
 */
async function getCountryStats(limit = 20) {
  try {
    const result = await pool.query(`
      SELECT 
        country,
        COUNT(*) as count,
        AVG(visits_per_month) as avg_visits,
        SUM(CASE WHEN can_backdate THEN 1 ELSE 0 END) as backdate_count
      FROM smi
      WHERE is_active = true AND country IS NOT NULL AND country != ''
      GROUP BY country
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  } catch (error) {
    console.error('Ошибка получения статистики стран:', error);
    return [];
  }
}

/**
 * Получить топ СМИ по посещаемости
 */
async function getTopSMIByVisits(limit = 20) {
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.country,
        c.name as category,
        s.visits_per_month,
        s.can_backdate,
        s.website
      FROM smi s
      JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true AND s.visits_per_month IS NOT NULL
      ORDER BY s.visits_per_month DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  } catch (error) {
    console.error('Ошибка получения топ СМИ:', error);
    return [];
  }
}

/**
 * Получить количество СМИ по категориям
 */
async function getCategoryStats() {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        COUNT(s.id) as count,
        AVG(s.visits_per_month) as avg_visits
      FROM categories c
      LEFT JOIN smi s ON c.id = s.category_id AND s.is_active = true
      GROUP BY c.id, c.name
      ORDER BY count DESC
    `);
    
    return result.rows;
  } catch (error) {
    console.error('Ошибка получения статистики категорий:', error);
    return [];
  }
}

/**
 * Получить список уникальных стран
 */
async function getCountries(limit = 100) {
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
    console.error('Ошибка получения стран:', error);
    return [];
  }
}

/**
 * Получить информацию о конкретном СМИ
 */
async function getSMIById(id) {
  try {
    const result = await pool.query(`
      SELECT 
        s.*,
        c.name as category_name
      FROM smi s
      JOIN categories c ON s.category_id = c.id
      WHERE s.id = $1
    `, [id]);
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Ошибка получения СМИ по ID:', error);
    return null;
  }
}

/**
 * Общая статистика базы
 */
async function getDatabaseStats() {
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM smi WHERE is_active = true) as total_smi,
        (SELECT COUNT(DISTINCT country) FROM smi WHERE is_active = true) as countries_count,
        (SELECT COUNT(*) FROM categories) as categories_count,
        (SELECT AVG(visits_per_month) FROM smi WHERE visits_per_month IS NOT NULL) as avg_visits,
        (SELECT COUNT(*) FROM smi WHERE can_backdate = true) as backdate_count
    `);
    
    return result.rows[0];
  } catch (error) {
    console.error('Ошибка получения статистики базы:', error);
    return null;
  }
}

module.exports = {
  pool,
  formatNumber,
  getCategories,
  searchSMIByName,
  getSMIByFilters,
  getCountryStats,
  getTopSMIByVisits,
  getCategoryStats,
  getCountries,
  getSMIById,
  getDatabaseStats
};