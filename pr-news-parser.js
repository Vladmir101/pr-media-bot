const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

class PRNewsParser {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 1800 }); // Кэш 30 минут
    }

    // Парсим PR-новости с VC.ru
    async parsePRNews() {
        const cacheKey = 'pr_news';
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            console.log('🔍 Загружаю PR-новости...');
            const { data } = await axios.get('https://vc.ru/marketing', {
                timeout: 8000,
                headers: {
                    'User-Agent': 'PR-Agent-Bot/1.0'
                }
            });
            
            const $ = cheerio.load(data);
            const articles = [];
            
            // Ищем PR-статьи
            $('.content-container, .feed__item').slice(0, 15).each((i, el) => {
                const title = $(el).find('.content-title, .entry__title').text().trim();
                const link = $(el).find('a').attr('href');
                const excerpt = $(el).find('.content-excerpt, .entry__text').text().trim();
                
                if (title && link && this.isPRRelated(title)) {
                    const fullLink = link.startsWith('http') ? link : `https://vc.ru${link}`;
                    
                    articles.push({
                        source: 'VC.ru',
                        title: title.length > 70 ? title.substring(0, 70) + '...' : title,
                        url: fullLink,
                        excerpt: excerpt ? (excerpt.length > 100 ? excerpt.substring(0, 100) + '...' : excerpt) : '',
                        category: this.detectPRCategory(title),
                        time: 'Сегодня',
                        relevance: 8
                    });
                }
            });
            
            // Добавляем демо-данные если ничего не нашли
            if (articles.length === 0) {
                articles.push(...this.getDemoPRNews());
            }
            
            this.cache.set(cacheKey, articles);
            console.log(`✅ Найдено ${articles.length} PR-новостей`);
            return articles;
            
        } catch (error) {
            console.error('Ошибка парсинга PR-новостей:', error.message);
            return this.getDemoPRNews();
        }
    }

    // Проверяем релевантность для PR
    isPRRelated(title) {
        const lower = title.toLowerCase();
        const prKeywords = [
            'pr', 'пиар', 'маркетинг', 'коммуникации', 'медиа',
            'бренд', 'репутация', 'кризис', 'smm', 'контент',
            'стратегия', 'кампания', 'инфлюенсер', 'лидогенерация'
        ];
        
        return prKeywords.some(keyword => lower.includes(keyword));
    }

    // Определяем категорию PR-новости
    detectPRCategory(title) {
        const lower = title.toLowerCase();
        
        if (lower.includes('кризис') || lower.includes('репутаци')) return 'Кризисные коммуникации';
        if (lower.includes('smm') || lower.includes('соцсет')) return 'Digital & SMM';
        if (lower.includes('медиа') || lower.includes('пресс')) return 'Медиа-отношения';
        if (lower.includes('бренд') || lower.includes('brand')) return 'Брендинг';
        if (lower.includes('инфлюенсер') || lower.includes('блогер')) return 'Influencer Marketing';
        if (lower.includes('стратеги') || lower.includes('кампани')) return 'PR-стратегии';
        
        return 'PR & Маркетинг';
    }

    // Демо-данные для PR
    getDemoPRNews() {
        return [
            {
                source: 'PR Журнал',
                title: 'Тренды PR-коммуникаций 2024: персонализация и data-driven подходы',
                url: '#',
                excerpt: 'Эксперты делятся прогнозами на следующий год',
                category: 'PR Тренды',
                time: 'Сегодня',
                relevance: 9
            },
            {
                source: 'MediaPro',
                title: 'Кризисные коммуникации: кейс успешного управления репутацией компании',
                url: '#',
                excerpt: 'Как компания X вышла из кризиса с усиленной репутацией',
                category: 'Кризисные коммуникации',
                time: 'Вчера',
                relevance: 10
            },
            {
                source: 'Marketing News',
                title: 'Как измерять ROI PR-кампаний: новые метрики и инструменты',
                url: '#',
                excerpt: 'Обзор современных методов оценки эффективности PR',
                category: 'PR Аналитика',
                time: '2 дня назад',
                relevance: 8
            },
            {
                source: 'SMM Today',
                title: 'Influencer marketing в 2024: новые форматы и лучшие практики',
                url: '#',
                excerpt: 'Как работать с блогерами в условиях новых алгоритмов',
                category: 'Influencer Marketing',
                time: '3 дня назад',
                relevance: 7
            }
        ];
    }

    // Поиск PR-новостей
    async searchPRNews(query) {
        const allNews = await this.parsePRNews();
        const lowerQuery = query.toLowerCase();
        
        return allNews.filter(item => 
            item.title.toLowerCase().includes(lowerQuery) ||
            item.category.toLowerCase().includes(lowerQuery) ||
            (item.excerpt && item.excerpt.toLowerCase().includes(lowerQuery))
        );
    }

    // Фильтр по категории
    async getNewsByCategory(category) {
        const allNews = await this.parsePRNews();
        return allNews.filter(item => 
            item.category.toLowerCase().includes(category.toLowerCase())
        );
    }
}

module.exports = PRNewsParser;