class StateManager {
  constructor() {
    this.states = new Map();
    this.searches = new Map();
  }

  getState(chatId) {
    if (!this.states.has(chatId)) {
      this.states.set(chatId, {
        currentSection: null,
        step: null,
        filters: {},
        currentSearchId: null,
        currentPage: 1
      });
    }
    return this.states.get(chatId);
  }

  updateState(chatId, updates) {
    const currentState = this.getState(chatId);
    this.states.set(chatId, { ...currentState, ...updates });
  }

  setFilter(chatId, key, value) {
    const state = this.getState(chatId);
    if (!state.filters) {
      state.filters = {};
    }
    state.filters[key] = value;
    this.states.set(chatId, state);
  }

  resetState(chatId) {
    this.states.set(chatId, {
      currentSection: null,
      step: null,
      filters: {},
      currentSearchId: null,
      currentPage: 1
    });
  }

  saveSearchResults(chatId, results) {
    const searchId = Date.now().toString();
    this.searches.set(`${chatId}_${searchId}`, results);
    return searchId;
  }

  getSearchResults(searchId, chatId = null) {
    if (chatId) {
      return this.searches.get(`${chatId}_${searchId}`);
    }
    
    // Ищем по всем чатам
    for (const [key, results] of this.searches.entries()) {
      if (key.endsWith(`_${searchId}`)) {
        return results;
      }
    }
    return null;
  }

  getPageResults(searchId, page, itemsPerPage = 5) {
    const results = this.getSearchResults(searchId);
    if (!results) {
      return { items: [], totalItems: 0, totalPages: 0 };
    }

    const totalItems = results.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (page < 1 || page > totalPages) {
      page = 1;
    }

    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const items = results.slice(startIndex, endIndex);

    return {
      items,
      totalItems,
      totalPages,
      currentPage: page
    };
  }

  clearOldSearches(hours = 1) {
    const now = Date.now();
    const maxAge = hours * 60 * 60 * 1000;
    
    for (const [key, data] of this.searches.entries()) {
      if (data.timestamp && now - data.timestamp > maxAge) {
        this.searches.delete(key);
      }
    }
  }
}

module.exports = new StateManager();