const fs = require('fs');

console.log('=== ПАРСЕР БАЗЫ СМИ ===');
console.log('Генерируем CSV файл с данными о СМИ...');

// Данные о СМИ
const smiDatabase = [
    {
        name: 'Forbes Россия',
        category: 'Бизнес',
        country: 'Россия',
        audience: '2.1M',
        audienceNumber: 2100000,
        price: 100000,
        contact: 'contact@forbes.ru',
        website: 'https://forbes.ru',
        description: 'ТОП-деловое СМИ России',
        backdated: false
    },
    {
        name: 'VC.ru',
        category: 'Технологии',
        country: 'Россия',
        audience: '850K',
        audienceNumber: 850000,
        price: 75000,
        contact: 'pr@vc.ru',
        website: 'https://vc.ru',
        description: 'Tech-аудитория',
        backdated: true
    },
    {
        name: 'РБК',
        category: 'Новости',
        country: 'Россия',
        audience: '5M',
        audienceNumber: 5000000,
        price: 120000,
        contact: 'pr@rbc.ru',
        website: 'https://rbc.ru',
        description: 'Деловые медиа',
        backdated: false
    },
    {
        name: 'Коммерсантъ',
        category: 'Бизнес',
        country: 'Россия',
        audience: '1.2M',
        audienceNumber: 1200000,
        price: 90000,
        contact: 'info@kommersant.ru',
        website: 'https://kommersant.ru',
        description: 'Деловые новости',
        backdated: true
    },
    {
        name: 'ТАСС',
        category: 'Новости',
        country: 'Россия',
        audience: '3M',
        audienceNumber: 3000000,
        price: 150000,
        contact: 'press@tass.ru',
        website: 'https://tass.ru',
        description: 'Федеральное информационное агентство',
        backdated: false
    },
    {
        name: 'Bloomberg',
        category: 'Финансы',
        country: 'США',
        audience: '8M',
        audienceNumber: 8000000,
        price: 180000,
        contact: 'media@bloomberg.com',
        website: 'https://bloomberg.com',
        description: 'Международное финансовое СМИ',
        backdated: false
    },
    {
        name: 'BBC News',
        category: 'Новости',
        country: 'Великобритания',
        audience: '5M',
        audienceNumber: 5000000,
        price: 150000,
        contact: 'news@bbc.co.uk',
        website: 'https://bbc.com',
        description: 'Международные новости',
        backdated: false
    },
    {
        name: 'TechCrunch',
        category: 'Технологии',
        country: 'США',
        audience: '12M',
        audienceNumber: 12000000,
        price: 200000,
        contact: 'tips@techcrunch.com',
        website: 'https://techcrunch.com',
        description: 'Технологические новости',
        backdated: false
    }
];

// Функция сохранения в CSV
function saveToCSV(filename) {
    const headers = ['name', 'category', 'country', 'backdated', 'audience', 'audienceNumber', 'contact', 'price', 'description', 'website'];
    let csvContent = headers.join(',') + '\n';
    
    smiDatabase.forEach(item => {
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
    
    fs.writeFileSync(filename, csvContent, 'utf8');
    console.log('✅ Данные сохранены в ' + filename);
    console.log('📊 Всего записей: ' + smiDatabase.length);
    
    console.log('\n📋 Список СМИ:');
    smiDatabase.forEach((item, index) => {
        console.log((index + 1) + '. ' + item.name + ' - ' + item.category + ' - ' + item.price + ' руб.');
    });
}

// Запускаем
try {
    saveToCSV('smi-parsed.csv');
    console.log('\n🎉 Парсер завершил работу!');
    console.log('Используйте команду /csv_import в боте для импорта данных.');
} catch (error) {
    console.error('❌ Ошибка: ' + error.message);
}
