class UserStateManager {
  constructor() {
    this.states = new Map();
    this.searchResults = new Map();
  }
  
  // Инициализация состояния пользователя
  initState(userId) {
    const initialState = {
      currentSection: null,
      step: null,
      filters: {
        category: null,
        country: null,
        backdated: null,
        audience: null,
        type: null
      },
      currentPage: 1,
      searchId: null
    };
    
    this.states.set(userId, initialState);
    return initialState;
  }
  
  // Получение состояния
  getState(userId) {
    if (!this.states.has(userId)) {
      return this.initState(userId);
    }
    return this.states.get(userId);
  }
  
  // Обновление состояния
  updateState(userId, updates) {
    const state = this.getState(userId);
    Object.assign(state, updates);
    this.states.set(userId, state);
    return state;
  }
  
  // Сброс состояния
  resetState(userId) {
    this.states.delete(userId);
  }
  
  // Сохранение фильтра
  setFilter(userId, filterName, value) {
    const state = this.getState(userId);
    state.filters[filterName] = value;
    this.states.set(userId, state);
  }
  
  // Сохранение результатов поиска
  saveSearchResults(userId, results) {
    const searchId = Date.now().toString();
    this.searchResults.set(searchId, results);
    
    const state = this.getState(userId);
    state.searchId = searchId;
    this.states.set(userId, state);
    
    return searchId;
  }
  
  // Получение результатов поиска
  getSearchResults(searchId) {
    return this.searchResults.get(searchId) || [];
  }
  
  // Получение страницы результатов
  getPageResults(searchId, page, pageSize = 5) {
    const results = this.getSearchResults(searchId);
    const totalPages = Math.ceil(results.length / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    return {
      items: results.slice(startIndex, endIndex),
      page,
      totalPages,
      totalItems: results.length
    };
  }
}

module.exports = new UserStateManager();