// database.js - ПОЛНЫЙ КОД С АНАЛИЗОМ БАЗЫ
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

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========

// Форматирование чисел
function formatNumber(num) {
  if (!num && num !== 0) return 'нет данных';
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
        s.is_active,
        s.price_usd
      FROM smi s
      LEFT JOIN categories c ON s.category_id = c.id
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
    
    const result = await pool.query(`
      SELECT 
        s.name,
        s.country,
        c.name as category,
        s.visits_per_month,
        s.can_backdate,
        s.price_usd
      FROM smi s
      LEFT JOIN categories c ON s.category_id = c.id
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

// Получение категорий с количеством
async function getCategories() {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        COUNT(s.id) as count
      FROM categories c
      LEFT JOIN smi s ON c.id = s.category_id AND s.is_active = true
      GROUP BY c.id, c.name
      ORDER BY count DESC, c.name
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
        s.lead_time_hours,
        s.price_usd
      FROM smi s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Поиск по стране
    if (country) {
      const countryVariants = [
        `%${country}%`,
        `%${translateCountry(country)}%`
      ];
      
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
        visits: result.rows[0].visits_per_month,
        price: result.rows[0].price_usd
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
        (SELECT COUNT(*) FROM smi WHERE can_backdate = true AND is_active = true) as backdate_count,
        (SELECT COUNT(*) FROM smi WHERE price_usd IS NOT NULL AND is_active = true) as with_prices_count,
        (SELECT COUNT(*) FROM smi WHERE visits_per_month IS NOT NULL AND is_active = true) as with_visits_count
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
        s.description,
        s.price_usd
      FROM smi s
      LEFT JOIN categories c ON s.category_id = c.id
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

// ========== ФУНКЦИИ АНАЛИЗА БАЗЫ ==========

// Получить структуру таблиц
async function getTableStructure() {
  try {
    console.log('🔍 Получаю структуру таблиц...');
    
    // 1. Получаем список всех таблиц
    const tablesResult = await pool.query(`
      SELECT 
        table_name,
        obj_description(('"' || table_schema || '"."' || table_name || '"')::regclass) as comment
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const tables = [];
    
    // 2. Для каждой таблицы получаем детали
    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      
      // Количество записей
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      const rowCount = parseInt(countResult.rows[0].count);
      
      // Столбцы
      const columnsResult = await pool.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      tables.push({
        table_name: tableName,
        comment: table.comment,
        row_count: rowCount,
        columns: columnsResult.rows
      });
    }
    
    return { tables };
  } catch (error) {
    console.error('❌ Ошибка получения структуры:', error);
    return { error: error.message };
  }
}

// Получить примеры данных из таблицы
async function getSampleData(tableName, limit = 3) {
  try {
    console.log(`🔍 Получаю примеры из таблицы ${tableName}...`);
    
    // Проверяем существует ли таблица
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
    
    if (!tableExists.rows[0].exists) {
      return { error: `Таблица "${tableName}" не существует` };
    }
    
    // Получаем общее количество
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const total = parseInt(countResult.rows[0].count);
    
    if (total === 0) {
      return { error: `Таблица "${tableName}" пуста`, total: 0, rows: [] };
    }
    
    // Получаем названия колонок
    const columnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    
    const columns = columnsResult.rows.map(row => row.column_name);
    
    // Получаем примеры данных
    const sampleResult = await pool.query(`
      SELECT * FROM "${tableName}" 
      ORDER BY id 
      LIMIT $1
    `, [limit]);
    
    return {
      total,
      columns,
      rows: sampleResult.rows
    };
  } catch (error) {
    console.error(`❌ Ошибка получения данных из ${tableName}:`, error);
    return { error: error.message };
  }
}

// Полный анализ базы данных
async function analyzeDatabase() {
  try {
    console.log('🔍 Полный анализ базы данных...');
    
    const analysis = {
      tables: [],
      smi_analysis: null,
      categories_analysis: null,
      total_records: 0,
      database_size: '',
      issues: []
    };
    
    // 1. Получаем размер базы данных
    const sizeResult = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
    `);
    analysis.database_size = sizeResult.rows[0].db_size;
    
    // 2. Получаем структуру таблиц
    const structure = await getTableStructure();
    if (structure.error) {
      analysis.error = structure.error;
      return analysis;
    }
    
    analysis.tables = structure.tables;
    analysis.total_records = structure.tables.reduce((sum, table) => sum + table.row_count, 0);
    
    // 3. Анализ таблицы smi
    const smiAnalysis = await analyzeSMITable();
    analysis.smi_analysis = smiAnalysis;
    
    // 4. Анализ таблицы categories
    const categoriesAnalysis = await analyzeCategoriesTable();
    analysis.categories_analysis = categoriesAnalysis;
    
    // 5. Выявляем проблемы
    analysis.issues = await findDataIssues(smiAnalysis, categoriesAnalysis);
    
    return analysis;
  } catch (error) {
    console.error('❌ Ошибка анализа базы:', error);
    return { error: error.message };
  }
}

// Анализ таблицы smi
async function analyzeSMITable() {
  try {
    const analysis = {};
    
    // Общая статистика
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE price_usd IS NOT NULL) as with_prices,
        COUNT(*) FILTER (WHERE visits_per_month IS NOT NULL) as with_visits,
        COUNT(*) FILTER (WHERE can_backdate = true) as with_backdate,
        COUNT(*) FILTER (WHERE category_id IS NULL) as without_category,
        COUNT(*) FILTER (WHERE country IS NULL OR country = '') as without_country
      FROM smi
    `);
    
    const row = stats.rows[0];
    analysis.total = parseInt(row.total);
    analysis.active = parseInt(row.active);
    analysis.with_prices = parseInt(row.with_prices);
    analysis.with_visits = parseInt(row.with_visits);
    analysis.with_backdate = parseInt(row.with_backdate);
    analysis.without_category = parseInt(row.without_category);
    analysis.without_country = parseInt(row.without_country);
    
    // Проценты
    analysis.active_percent = analysis.total > 0 ? ((analysis.active / analysis.total) * 100).toFixed(1) : 0;
    analysis.with_prices_percent = analysis.active > 0 ? ((analysis.with_prices / analysis.active) * 100).toFixed(1) : 0;
    analysis.with_visits_percent = analysis.active > 0 ? ((analysis.with_visits / analysis.active) * 100).toFixed(1) : 0;
    analysis.with_backdate_percent = analysis.active > 0 ? ((analysis.with_backdate / analysis.active) * 100).toFixed(1) : 0;
    
    // Распределение по категориям
    const categoriesResult = await pool.query(`
      SELECT 
        c.name as category,
        COUNT(s.id) as count
      FROM smi s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true
      GROUP BY c.id, c.name
      ORDER BY count DESC
      LIMIT 20
    `);
    
    analysis.categories = categoriesResult.rows.map(row => ({
      category: row.category || 'Без категории',
      count: parseInt(row.count),
      percent: analysis.active > 0 ? ((parseInt(row.count) / analysis.active) * 100).toFixed(1) : 0
    }));
    
    // Топ стран
    const countriesResult = await pool.query(`
      SELECT 
        country,
        COUNT(*) as count
      FROM smi
      WHERE is_active = true AND country IS NOT NULL AND country != ''
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `);
    
    analysis.countries = countriesResult.rows.map(row => ({
      country: row.country,
      count: parseInt(row.count)
    }));
    
    // Статистика цен
    const priceStats = await pool.query(`
      SELECT 
        MIN(price_usd) as min,
        MAX(price_usd) as max,
        AVG(price_usd) as avg,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_usd) as median
      FROM smi
      WHERE is_active = true AND price_usd IS NOT NULL
    `);
    
    if (priceStats.rows[0].avg) {
      analysis.price_stats = {
        min: parseFloat(priceStats.rows[0].min).toFixed(2),
        max: parseFloat(priceStats.rows[0].max).toFixed(2),
        avg: parseFloat(priceStats.rows[0].avg).toFixed(2),
        median: parseFloat(priceStats.rows[0].median).toFixed(2)
      };
    }
    
    // Статистика посещаемости
    const visitsStats = await pool.query(`
      SELECT 
        MIN(visits_per_month) as min,
        MAX(visits_per_month) as max,
        AVG(visits_per_month) as avg,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY visits_per_month) as median
      FROM smi
      WHERE is_active = true AND visits_per_month IS NOT NULL
    `);
    
    if (visitsStats.rows[0].avg) {
      analysis.visits_stats = {
        min: parseInt(visitsStats.rows[0].min),
        max: parseInt(visitsStats.rows[0].max),
        avg: parseInt(visitsStats.rows[0].avg),
        median: parseInt(visitsStats.rows[0].median)
      };
    }
    
    return analysis;
  } catch (error) {
    console.error('❌ Ошибка анализа таблицы smi:', error);
    return { error: error.message };
  }
}

// Анализ таблицы categories
async function analyzeCategoriesTable() {
  try {
    const analysis = {};
    
    // Получаем все категории
    const categories = await pool.query(`
      SELECT 
        id,
        name,
        (SELECT COUNT(*) FROM smi WHERE category_id = categories.id AND is_active = true) as smi_count
      FROM categories
      ORDER BY name
    `);
    
    analysis.categories = categories.rows.map(row => ({
      id: row.id,
      name: row.name,
      smi_count: parseInt(row.smi_count)
    }));
    
    analysis.total = categories.rows.length;
    
    // Категории без СМИ
    analysis.empty_categories = categories.rows.filter(cat => cat.smi_count === 0);
    
    // Популярные категории
    analysis.popular_categories = [...categories.rows]
      .sort((a, b) => b.smi_count - a.smi_count)
      .slice(0, 10);
    
    return analysis;
  } catch (error) {
    console.error('❌ Ошибка анализа таблицы categories:', error);
    return { error: error.message };
  }
}

// Поиск проблем с данными
async function findDataIssues(smiAnalysis, categoriesAnalysis) {
  const issues = [];
  
  if (!smiAnalysis || smiAnalysis.error) {
    issues.push('Не удалось проанализировать таблицу smi');
    return issues;
  }
  
  // Проверяем проблемы с таблицей smi
  if (smiAnalysis.without_category > 0) {
    issues.push(`${smiAnalysis.without_category} СМИ без категории`);
  }
  
  if (smiAnalysis.without_country > 0) {
    issues.push(`${smiAnalysis.without_country} СМИ без страны`);
  }
  
  if (smiAnalysis.with_prices_percent < 10) {
    issues.push(`Мало СМИ с ценами: ${smiAnalysis.with_prices_percent}%`);
  }
  
  if (smiAnalysis.with_visits_percent < 10) {
    issues.push(`Мало СМИ с посещаемостью: ${smiAnalysis.with_visits_percent}%`);
  }
  
  if (smiAnalysis.with_backdate_percent < 1) {
    issues.push(`Почти нет СМИ с задним числом: ${smiAnalysis.with_backdate_percent}%`);
  }
  
  // Проверяем проблемы с категориями
  if (categoriesAnalysis && !categoriesAnalysis.error) {
    if (categoriesAnalysis.empty_categories.length > 0) {
      issues.push(`${categoriesAnalysis.empty_categories.length} пустых категорий`);
    }
    
    // Проверяем соответствие категорий из ТЗ
    const expectedCategories = [
      'IT', 'Бизнес', 'Стартапы', 'Технологии', 'Финансы',
      'Крипто', 'Маркетинг', 'PR', 'Медицина', 'Красота',
      'Мода', 'Культура', 'Искусство', 'Музыка', 'Кино',
      'Спорт', 'Образование', 'Наука', 'Недвижимость', 'Lifestyle'
    ];
    
    const existingCategories = categoriesAnalysis.categories.map(c => c.name);
    const missingCategories = expectedCategories.filter(cat => 
      !existingCategories.some(existing => 
        existing.toLowerCase().includes(cat.toLowerCase()) || 
        cat.toLowerCase().includes(existing.toLowerCase())
      )
    );
    
    if (missingCategories.length > 0) {
      issues.push(`Отсутствуют категории из ТЗ: ${missingCategories.slice(0, 5).join(', ')}${missingCategories.length > 5 ? '...' : ''}`);
    }
  }
  
  return issues;
}

// Проверка качества данных
async function checkDataQuality() {
  try {
    const analysis = await analyzeDatabase();
    
    if (analysis.error) {
      return { error: analysis.error };
    }
    
    const quality = {
      quality_score: 0,
      smi_quality: {},
      issues: analysis.issues || [],
      recommendations: []
    };
    
    const smi = analysis.smi_analysis;
    if (!smi || smi.error) {
      return quality;
    }
    
    // Рассчитываем баллы качества
    let totalScore = 0;
    let maxScore = 0;
    
    // 1. Активность СМИ (макс 20 баллов)
    const activeScore = Math.min(20, (smi.active_percent / 100) * 20);
    quality.smi_quality.active = {
      label: 'Активные СМИ',
      value: `${smi.active_percent}%`,
      score: activeScore
    };
    totalScore += activeScore;
    maxScore += 20;
    
    // 2. Заполненность цен (макс 20 баллов)
    const priceScore = Math.min(20, (smi.with_prices_percent / 100) * 20);
    quality.smi_quality.prices = {
      label: 'СМИ с ценами',
      value: `${smi.with_prices_percent}%`,
      score: priceScore
    };
    totalScore += priceScore;
    maxScore += 20;
    
    // 3. Заполненность посещаемости (макс 15 баллов)
    const visitsScore = Math.min(15, (smi.with_visits_percent / 100) * 15);
    quality.smi_quality.visits = {
      label: 'СМИ с посещаемостью',
      value: `${smi.with_visits_percent}%`,
      score: visitsScore
    };
    totalScore += visitsScore;
    maxScore += 15;
    
    // 4. Наличие заднего числа (макс 10 баллов)
    const backdateScore = Math.min(10, (smi.with_backdate_percent / 5) * 10); // 5% = 10 баллов
    quality.smi_quality.backdate = {
      label: 'СМИ с задним числом',
      value: `${smi.with_backdate_percent}%`,
      score: backdateScore
    };
    totalScore += backdateScore;
    maxScore += 10;
    
    // 5. Категоризация (макс 15 баллов)
    const withoutCategoryPercent = smi.without_category > 0 ? (smi.without_category / smi.total) * 100 : 0;
    const categoryScore = Math.max(0, 15 - (withoutCategoryPercent * 0.15));
    quality.smi_quality.categories = {
      label: 'СМИ с категориями',
      value: `${(100 - withoutCategoryPercent).toFixed(1)}%`,
      score: categoryScore
    };
    totalScore += categoryScore;
    maxScore += 15;
    
    // 6. Страны (макс 10 баллов)
    const withoutCountryPercent = smi.without_country > 0 ? (smi.without_country / smi.total) * 100 : 0;
    const countryScore = Math.max(0, 10 - (withoutCountryPercent * 0.1));
    quality.smi_quality.countries = {
      label: 'СМИ со странами',
      value: `${(100 - withoutCountryPercent).toFixed(1)}%`,
      score: countryScore
    };
    totalScore += countryScore;
    maxScore += 10;
    
    // 7. Разнообразие категорий (макс 10 баллов)
    const uniqueCategories = smi.categories ? smi.categories.length : 0;
    const categoriesScore = Math.min(10, (uniqueCategories / 20) * 10); // 20 категорий = 10 баллов
    quality.smi_quality.category_variety = {
      label: 'Разнообразие категорий',
      value: `${uniqueCategories} уникальных`,
      score: categoriesScore
    };
    totalScore += categoriesScore;
    maxScore += 10;
    
    // Общий рейтинг
    quality.quality_score = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    
    // Рекомендации
    if (smi.with_prices_percent < 50) {
      quality.recommendations.push('Добавить цены для большего количества СМИ');
    }
    
    if (smi.with_visits_percent < 30) {
      quality.recommendations.push('Добавить данные о посещаемости СМИ');
    }
    
    if (smi.with_backdate_percent < 5) {
      quality.recommendations.push('Указать возможность публикации задним числом');
    }
    
    if (smi.without_category > 0) {
      quality.recommendations.push('Назначить категории для всех СМИ');
    }
    
    if (uniqueCategories < 10) {
      quality.recommendations.push('Добавить больше категорий для разнообразия');
    }
    
    return quality;
  } catch (error) {
    console.error('❌ Ошибка проверки качества:', error);
    return { error: error.message };
  }
}

// Исправить проблемы с категориями
async function fixCategoryIssues() {
  try {
    const result = {
      fixed_records: 0,
      new_categories: [],
      total_categories: 0,
      remaining_issues: []
    };
    
    // 1. Получаем текущие категории
    const currentCategories = await pool.query('SELECT id, name FROM categories');
    result.total_categories = currentCategories.rows.length;
    
    const categoryMap = {};
    currentCategories.rows.forEach(cat => {
      categoryMap[cat.name.toLowerCase()] = cat.id;
    });
    
    // 2. Категории из ТЗ
    const tzCategories = [
      'IT', 'Бизнес', 'Стартапы', 'Технологии', 'Финансы',
      'Крипто', 'Маркетинг', 'PR', 'Медицина', 'Красота',
      'Мода', 'Культура', 'Искусство', 'Музыка', 'Кино',
      'Спорт', 'Образование', 'Наука', 'Недвижимость', 'Lifestyle'
    ];
    
    // 3. Добавляем отсутствующие категории
    for (const tzCat of tzCategories) {
      const lowerCat = tzCat.toLowerCase();
      
      if (!categoryMap[lowerCat]) {
        // Проверяем похожие названия
        const similar = Object.keys(categoryMap).find(existing => 
          existing.includes(lowerCat) || lowerCat.includes(existing)
        );
        
        if (!similar) {
          // Добавляем новую категорию
          try {
            const insertResult = await pool.query(
              'INSERT INTO categories (name) VALUES ($1) RETURNING id',
              [tzCat]
            );
            
            categoryMap[lowerCat] = insertResult.rows[0].id;
            result.new_categories.push(tzCat);
            console.log(`✅ Добавлена категория: ${tzCat}`);
          } catch (error) {
            console.error(`❌ Ошибка добавления категории ${tzCat}:`, error.message);
          }
        }
      }
    }
    
    // 4. Находим СМИ без категорий
    const smiWithoutCategory = await pool.query(`
      SELECT id, name FROM smi 
      WHERE category_id IS NULL AND is_active = true
      LIMIT 100
    `);
    
    if (smiWithoutCategory.rows.length > 0) {
      result.remaining_issues.push(`${smiWithoutCategory.rows.length} СМИ без категории требуют ручного назначения`);
    }
    
    // 5. Создаем маппинг для автоматического назначения категорий
    const autoCategoryMapping = {
      'tech': 'IT',
      'technology': 'Технологии',
      'business': 'Бизнес',
      'finance': 'Финансы',
      'crypto': 'Крипто',
      'marketing': 'Маркетинг',
      'pr': 'PR',
      'medical': 'Медицина',
      'health': 'Медицина',
      'beauty': 'Красота',
      'fashion': 'Мода',
      'culture': 'Культура',
      'art': 'Искусство',
      'music': 'Музыка',
      'movie': 'Кино',
      'film': 'Кино',
      'sport': 'Спорт',
      'education': 'Образование',
      'science': 'Наука',
      'real estate': 'Недвижимость',
      'lifestyle': 'Lifestyle',
      'startup': 'Стартапы'
    };
    
    // 6. Пытаемся автоматически назначить категории
    for (const smi of smiWithoutCategory.rows.slice(0, 50)) {
      const nameLower = smi.name.toLowerCase();
      let assigned = false;
      
      for (const [keyword, category] of Object.entries(autoCategoryMapping)) {
        if (nameLower.includes(keyword)) {
          const categoryId = categoryMap[category.toLowerCase()];
          if (categoryId) {
            try {
              await pool.query(
                'UPDATE smi SET category_id = $1 WHERE id = $2',
                [categoryId, smi.id]
              );
              result.fixed_records++;
              assigned = true;
              console.log(`✅ Назначена категория "${category}" для "${smi.name}"`);
              break;
            } catch (error) {
              console.error(`❌ Ошибка назначения категории для ${smi.name}:`, error.message);
            }
          }
        }
      }
      
      if (!assigned) {
        // Назначаем категорию "IT" по умолчанию
        const defaultCategoryId = categoryMap['it'];
        if (defaultCategoryId) {
          try {
            await pool.query(
              'UPDATE smi SET category_id = $1 WHERE id = $2',
              [defaultCategoryId, smi.id]
            );
            result.fixed_records++;
            console.log(`✅ Назначена категория по умолчанию "IT" для "${smi.name}"`);
          } catch (error) {
            console.error(`❌ Ошибка назначения категории по умолчанию для ${smi.name}:`, error.message);
          }
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('❌ Ошибка исправления категорий:', error);
    return { error: error.message };
  }
}

// ========== ЭКСПОРТ ФУНКЦИЙ ==========

module.exports = {
  pool,
  formatNumber,
  getCategories,
  getCountries,
  searchSMIByName,
  getSMIByFilters,
  getDatabaseStats,
  testSMI,
  searchSMIDebug,
  analyzeDatabase,
  getTableStructure,
  getSampleData,
  checkDataQuality,
  fixCategoryIssues
};