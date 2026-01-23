/**
 * DataService - Handles data fetching and caching
 */
const DATA_URL = '/data/data.json';

class DataService {
    constructor() {
        this.data = null;
    }

    async load() {
        try {
            const response = await fetch(DATA_URL);
            if (!response.ok) throw new Error('Data load failure');
            this.data = await response.json();
            return this.data;
        } catch (error) {
            console.error('DataService Error:', error);
            return null;
        }
    }

    getData() {
        return this.data;
    }
}

export const dataService = new DataService();
