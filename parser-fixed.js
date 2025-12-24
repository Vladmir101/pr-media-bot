const fs = require('fs');

console.log('=== ПАРСЕР БАЗЫ СМИ (ИСПРАВЛЕННЫЙ) ===');
console.log('Генерируем CSV файл для импорта...');

// Данные о СМИ (используем правильную кодировку)
const smiDatabase = [
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
        name: 'RBC',
        category: 'News',
        country: 'Russia',
        audience: '5M',
        audienceNumber: 5000000,
        price: 120000,
        contact: 'pr@rbc.ru',
        website: 'https://rbc.ru',
        description: 'Business media',
        backdated: false
    },
    {
        name: 'Kommersant',
        category: 'Business',
        country: 'Russia',
        audience: '1.2M',
        audienceNumber: 1200000,
        price: 90000,
        contact: 'info@kommersant.ru',
        website: 'https://kommersant.ru',
        description: 'Business news',
        backdated: true
    },
    {
        name: 'TASS',
        category: 'News',
        country: 'Russia',
        audience: '3M',
        audienceNumber: 3000000,
        price: 150000,
        contact: 'press@tass.ru',
        website: 'https://tass.ru',
        description: 'Federal news agency',
        backdated: false
    }
];

function saveToCSV(filename) {
    const headers = ['name', 'category', 'country', 'backdated', 'audience', 'audienceNumber', 'contact', 'price', 'description', 'website'];
    
    // Создаем CSV строку
    const rows = smiDatabase.map(item => {
        return [
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
        ].join(',');
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    // Сохраняем с BOM для корректного отображения в Excel
    const BOM = '\uFEFF';
    fs.writeFileSync(filename, BOM + csvContent, 'utf8');
    
    console.log('✅ Данные сохранены в ' + filename);
    console.log('📊 Всего записей: ' + smiDatabase.length);
    
    console.log('\n📋 Список СМИ:');
    smiDatabase.forEach((item, index) => {
        console.log(`${index + 1}. ${item.name} - ${item.category} - ${item.price} руб.`);
    });
}

// Запускаем
try {
    saveToCSV('smi-generated.csv');
    console.log('\n🎉 Парсер завершил работу!');
    console.log('Файл готов для импорта командой /csv_import');
} catch (error) {
    console.error('❌ Ошибка: ' + error.message);
}