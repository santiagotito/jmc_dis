/**
 * DataService - Handles data fetching and caching
 * Supports dynamic loading of year-specific detail files
 */
const DATA_URL = '/data/data.json';

class DataService {
    constructor() {
        this.data = null;
        this.yearDataCache = {
            cxc: {},
            cxp: {}
        };
        this.loadingYears = new Set();
    }

    async load() {
        try {
            console.log('Loading main data...');
            const response = await fetch(DATA_URL);
            if (!response.ok) throw new Error('Data load failure');
            this.data = await response.json();
            console.log('Main data loaded successfully');
            return this.data;
        } catch (error) {
            console.error('DataService Error:', error);
            return null;
        }
    }

    /**
     * Load year-specific CXC detail data
     */
    async loadCXCYear(year) {
        if (this.yearDataCache.cxc[year]) {
            return this.yearDataCache.cxc[year];
        }

        const cacheKey = `cxc_${year}`;
        if (this.loadingYears.has(cacheKey)) {
            // Already loading, wait for it
            while (this.loadingYears.has(cacheKey)) {
                await new Promise(r => setTimeout(r, 100));
            }
            return this.yearDataCache.cxc[year] || [];
        }

        this.loadingYears.add(cacheKey);
        try {
            console.log(`Loading CXC detail for ${year}...`);
            const response = await fetch(`/data/cxc_${year}.json`);
            if (!response.ok) {
                console.warn(`CXC data for ${year} not found`);
                this.yearDataCache.cxc[year] = [];
                return [];
            }
            const data = await response.json();
            this.yearDataCache.cxc[year] = data;
            console.log(`CXC ${year}: ${data.length} transactions loaded`);
            return data;
        } catch (error) {
            console.error(`Error loading CXC ${year}:`, error);
            this.yearDataCache.cxc[year] = [];
            return [];
        } finally {
            this.loadingYears.delete(cacheKey);
        }
    }

    /**
     * Load year-specific CXP detail data
     */
    async loadCXPYear(year) {
        if (this.yearDataCache.cxp[year]) {
            return this.yearDataCache.cxp[year];
        }

        const cacheKey = `cxp_${year}`;
        if (this.loadingYears.has(cacheKey)) {
            while (this.loadingYears.has(cacheKey)) {
                await new Promise(r => setTimeout(r, 100));
            }
            return this.yearDataCache.cxp[year] || [];
        }

        this.loadingYears.add(cacheKey);
        try {
            console.log(`Loading CXP detail for ${year}...`);
            const response = await fetch(`/data/cxp_${year}.json`);
            if (!response.ok) {
                console.warn(`CXP data for ${year} not found`);
                this.yearDataCache.cxp[year] = [];
                return [];
            }
            const data = await response.json();
            this.yearDataCache.cxp[year] = data;
            console.log(`CXP ${year}: ${data.length} transactions loaded`);
            return data;
        } catch (error) {
            console.error(`Error loading CXP ${year}:`, error);
            this.yearDataCache.cxp[year] = [];
            return [];
        } finally {
            this.loadingYears.delete(cacheKey);
        }
    }

    /**
     * Load CXC detail for multiple years
     */
    async loadCXCYears(years) {
        const results = await Promise.all(years.map(y => this.loadCXCYear(y)));
        return results.flat();
    }

    /**
     * Load CXP detail for multiple years
     */
    async loadCXPYears(years) {
        const results = await Promise.all(years.map(y => this.loadCXPYear(y)));
        return results.flat();
    }

    getData() {
        return this.data;
    }

    /**
     * Get cached CXC data for years
     */
    getCachedCXC(years) {
        let result = [];
        for (const year of years) {
            if (this.yearDataCache.cxc[year]) {
                result = result.concat(this.yearDataCache.cxc[year]);
            }
        }
        return result;
    }

    /**
     * Get cached CXP data for years
     */
    getCachedCXP(years) {
        let result = [];
        for (const year of years) {
            if (this.yearDataCache.cxp[year]) {
                result = result.concat(this.yearDataCache.cxp[year]);
            }
        }
        return result;
    }

    /**
     * Check if years are loaded
     */
    areCXCYearsLoaded(years) {
        return years.every(y => this.yearDataCache.cxc[y] !== undefined);
    }

    areCXPYearsLoaded(years) {
        return years.every(y => this.yearDataCache.cxp[y] !== undefined);
    }
}

export const dataService = new DataService();
