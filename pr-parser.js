const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

class PRNewsParser {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 3600 });
        this.sources = {
            'VC.ru Marketing': 'https://vc.ru/marketing',
            'SOSTAV.RU': 'https://www.sostav.ru/news/',
            'AdIndex': 'https://adindex.ru/news/'
        };
    }

    async parsePRNews() {
        const cacheKey = 'pr_news';
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            const [vcNews, sostavNews, adindexNews] = await Promise.allSettled([
                this.parseSource('VC.ru Marketing', 'marketing'),
                this.parseSource('SOSTAV.RU', 'sostav'),
                this.parseSource('AdIndex', 'adindex')
            ]);

            let allNews = [];
            
            if (vcNews.status === 'fulfilled') allNews = allNews.concat(vcNews.value);
            if (sostavNews.status === 'fulfilled') allNews = allNews.concat(sostavNews.value);
            if (adindexNews.status === 'fulfilled') allNews = allNews.concat(adindexNews.value);

            // Если ничего не нашли, возвращаем демо-данные
            if (allNews.length === 0) {
                allNews = this.getDemoPRNews();
            }

            this.cache.set(cacheKey, allNews);
            return allNews.slice(0, 15); // Ограничиваем 15 новостями

        } catch (error) {
            console.error('Ошибка парсинга PR-новостей:', error.message);
            return this.getDemoPRNews();
        }
    }

    async parseSource(sourceName, type) {
        try {
            const url = this.sources[sourceName];
            const { data } = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': 'PR-Agent-Bot/1.0' }
            });

            const $ = cheerio.load(data);
            const news = [];

            switch(type) {
                case 'marketing':
                    $('.content-container').slice(0, 8).each((i, el) => {
                        const title = $(el).find('.content-title').text().trim();
                        const link = $(el).find('a').attr('href');
                        if (title && link) {
                            news.push({
                                source: sourceName,
                                title: title.length > 80 ? title.substring(0, 80) + '...' : title,
                                url: link.startsWith('http') ? link : `https://vc.ru${link}`,
                                category: 'Маркетинг/PR',
                                time: 'Сегодня'
                            });
                        }
                    });
                    break;

                case 'sostav':
                    $('.news-item, article').slice(0, 6).each((i, el) => {
                        const title = $(el).find('h2, .title').text().trim();
                        const link = $(el).find('a').attr('href');
                        if (title && link) {
                            news.push({
                                source: sourceName,
                                title: title.length > 80 ? title.substring(0, 80) + '...' : title,
                                url: link.startsWith('http') ? link : `https://www.sostav.ru${link}`,
                                category: 'Реклама/PR',
                                time: 'Сегодня'
                            });
                        }
                    });
                    break;
            }

            return news;
        } catch (error) {
            console.log(`Ошибка парсинга ${sourceName}:`, error.message);
            return [];
        }
    }

    getDemoPRNews() {
        return [
            {
                source: 'PR Journal',
                title: 'Тренды PR-коммуникаций 2024: персонализация и data-driven',
                url: '#',
                category: 'PR Тренды',
                time: 'Сегодня'
            },
            {
                source: 'MediaPro',
                title: 'Кризисные коммуникации: кейс успешного управления репутацией',
                url: '#',
                category: 'Кризисные кейсы',
                time: 'Вчера'
            },
            {
                source: 'Marketing RU',
                title: 'Как измерять эффективность PR-кампаний: новые метрики',
                url: '#',
                category: 'PR Аналитика',
                time: '2 дня назад'
            },
            {
                source: 'SMM Today',
                title: 'Influencer marketing в 2024: тренды и лучшие практики',
                url: '#',
                category: 'Digital PR',
                time: '3 дня назад'
            }
        ];
    }

    async searchPRNews(query) {
        const allNews = await this.parsePRNews();
        const lowerQuery = query.toLowerCase();
        return allNews.filter(item => 
            item.title.toLowerCase().includes(lowerQuery) ||
            item.category.toLowerCase().includes(lowerQuery)
        );
    }
}

module.exports = PRNewsParser;