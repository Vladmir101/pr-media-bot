const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { SMI, Award, Jury, Association } = require('./database');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Простейшая авторизация
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Middleware для проверки пароля
function checkAuth(req, res, next) {
  const password = req.query.password || req.body.password;
  if (password === ADMIN_PASSWORD) {
    return next();
  }
  res.status(401).send('Неверный пароль');
}

// Главная страница админ-панели
app.get('/admin', checkAuth, (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Админ-панель PR Bot</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      .container { max-width: 800px; margin: 0 auto; }
      .form-group { margin: 20px 0; }
      label { display: block; margin: 10px 0 5px; }
      input, select, textarea { width: 100%; padding: 8px; margin: 5px 0; }
      button { background: #007bff; color: white; padding: 10px 20px; border: none; cursor: pointer; }
      .nav { margin: 20px 0; }
      .nav a { margin-right: 15px; color: #007bff; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>📊 Админ-панель PR Media Bot</h1>
      
      <div class="nav">
        <a href="/admin?password=${req.query.password}">Главная</a>
        <a href="/admin/upload?password=${req.query.password}">Загрузка CSV</a>
        <a href="/admin/stats?password=${req.query.password}">Статистика</a>
      </div>
      
      <h2>Добро пожаловать в админ-панель</h2>
      <p>Используйте меню для навигации по разделам.</p>
      
      <h3>Быстрые действия:</h3>
      <ul>
        <li><a href="/admin/upload?password=${req.query.password}">Загрузить CSV файл</a></li>
        <li><a href="/admin/stats?password=${req.query.password}">Посмотреть статистику</a></li>
        <li><a href="/admin/manual?password=${req.query.password}">Добавить запись вручную</a></li>
      </ul>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

// Страница загрузки CSV
app.get('/admin/upload', checkAuth, (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Загрузка CSV</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      .container { max-width: 600px; margin: 0 auto; }
      .form-group { margin: 20px 0; }
      label { display: block; margin: 10px 0 5px; }
      input, select { width: 100%; padding: 8px; margin: 5px 0; }
      button { background: #28a745; color: white; padding: 10px 20px; border: none; cursor: pointer; }
      .back { margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>📤 Загрузка CSV файла</h1>
      
      <form action="/admin/upload" method="post" enctype="multipart/form-data">
        <input type="hidden" name="password" value="${req.query.password}">
        
        <div class="form-group">
          <label for="type">Тип данных:</label>
          <select name="type" id="type" required>
            <option value="smi">СМИ</option>
            <option value="award">Премии</option>
            <option value="jury">Жюри</option>
            <option value="association">Ассоциации</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="file">CSV файл:</label>
          <input type="file" name="file" accept=".csv" required>
          <small>Формат CSV: name,category,country,backdated,audience,contact,price,description,website</small>
        </div>
        
        <div class="form-group">
          <label>
            <input type="checkbox" name="clearExisting" value="true">
            Очистить существующие записи этого типа
          </label>
        </div>
        
        <button type="submit">Загрузить</button>
      </form>
      
      <div class="back">
        <a href="/admin?password=${req.query.password}">← Назад</a>
      </div>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

// Обработка загрузки CSV
app.post('/admin/upload', upload.single('file'), async (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).send('Неверный пароль');
  }

  const type = req.body.type;
  const filePath = req.file.path;
  const clearExisting = req.body.clearExisting === 'true';

  const results = [];

  try {
    // Чтение CSV файла
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          const item = {};
          
          switch(type) {
            case 'smi':
              item.name = data.name || data.Название;
              item.category = data.category || data.Категория;
              item.country = data.country || data.Страна;
              item.backdated = data.backdated === 'true' || data.backdated === 'да';
              item.audience = data.audience || data.Охват;
              item.audienceNumber = parseInt(data.audienceNumber || data.ОхватЧисло || '0');
              item.contact = data.contact || data.Контакт;
              item.price = parseInt(data.price || data.Стоимость || '0');
              item.description = data.description || data.Описание;
              item.website = data.website || data.Сайт;
              break;
              
            case 'award':
              item.name = data.name || data.Название;
              item.category = data.category || data.Категория;
              item.location = data.location || data.Местоположение;
              item.deadline = data.deadline || data.Дедлайн;
              item.fee = parseInt(data.fee || data.Взнос || '0');
              item.prize = data.prize || data.Приз;
              item.description = data.description || data.Описание;
              item.website = data.website || data.Сайт;
              item.contact = data.contact || data.Контакт;
              break;
              
            // Аналогично для jury и association
            case 'jury':
              item.name = data.name || data.Название;
              item.category = data.category || data.Категория;
              item.expertise = data.expertise || data.Экспертиза;
              item.location = data.location || data.Местоположение;
              item.fee = parseInt(data.fee || data.Гонорар || '0');
              item.description = data.description || data.Описание;
              item.contact = data.contact || data.Контакт;
              item.website = data.website || data.Сайт;
              break;
              
            case 'association':
              item.name = data.name || data.Название;
              item.category = data.category || data.Категория;
              item.members = parseInt(data.members || data.Членов || '0');
              item.location = data.location || data.Местоположение;
              item.fee = parseInt(data.fee || data.Взнос || '0');
              item.benefits = data.benefits || data.Преимущества;
              item.contact = data.contact || data.Контакт;
              item.website = data.website || data.Сайт;
              break;
          }
          
          if (item.name) {
            results.push(item);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Определяем модель
    let Model;
    switch(type) {
      case 'smi':
        Model = SMI;
        break;
      case 'award':
        Model = Award;
        break;
      case 'jury':
        Model = Jury;
        break;
      case 'association':
        Model = Association;
        break;
      default:
        throw new Error('Неизвестный тип данных');
    }

    // Очищаем существующие записи, если нужно
    if (clearExisting) {
      await Model.destroy({ where: {} });
      console.log(`Очищены существующие записи типа: ${type}`);
    }

    // Загружаем новые записи
    let loadedCount = 0;
    for (const item of results) {
      try {
        await Model.create(item);
        loadedCount++;
      } catch (error) {
        console.error(`Ошибка при загрузке записи: ${error.message}`);
      }
    }

    // Удаляем временный файл
    fs.unlinkSync(filePath);

    const successHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Успешная загрузка</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; text-align: center; }
        .success { color: #28a745; font-size: 24px; }
        .back { margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="success">✅ Успешно загружено!</div>
      <p>Загружено ${loadedCount} записей типа "${type}"</p>
      <div class="back">
        <a href="/admin/upload?password=${req.body.password}">Загрузить еще</a> | 
        <a href="/admin?password=${req.body.password}">В админ-панель</a>
      </div>
    </body>
    </html>
    `;
    
    res.send(successHtml);

  } catch (error) {
    console.error('Ошибка загрузки:', error);
    
    // Удаляем временный файл, если существует
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.status(500).send(`
      <h2>❌ Ошибка загрузки</h2>
      <p>${error.message}</p>
      <a href="/admin/upload?password=${req.body.password}">← Назад</a>
    `);
  }
});

// Статистика
app.get('/admin/stats', checkAuth, async (req, res) => {
  try {
    const smiCount = await SMI.count();
    const awardCount = await Award.count();
    const juryCount = await Jury.count();
    const associationCount = await Association.count();
    const userCount = await (require('./database').User).count();
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Статистика</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 32px; font-weight: bold; color: #007bff; }
        .stat-label { color: #6c757d; }
        .back { margin-top: 20px; }
      </style>
    </head>
    <body>
      <h1>📊 Статистика базы данных</h1>
      
      <div class="stats">
        <div class="stat-card">
          <div class="stat-number">${smiCount}</div>
          <div class="stat-label">СМИ</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${awardCount}</div>
          <div class="stat-label">Премий</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${juryCount}</div>
          <div class="stat-label">Экспертов</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${associationCount}</div>
          <div class="stat-label">Ассоциаций</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${userCount}</div>
          <div class="stat-label">Пользователей</div>
        </div>
      </div>
      
      <div class="back">
        <a href="/admin?password=${req.query.password}">← Назад</a>
      </div>
    </body>
    </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`Ошибка: ${error.message}`);
  }
});

// Запуск сервера админ-панели
function start() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`⚙️ Админ-панель доступна по адресу: http://localhost:${PORT}/admin`);
    console.log(`🔐 Пароль: ${ADMIN_PASSWORD}`);
  });
}

module.exports = { start };
// Запускаем сервер если файл выполняется напрямую
if (require.main === module) {
  start();
}