/**
 * Auth Service - Handles Google Sheets Login
 */

const SHEET_ID = '1EXs3P9bXE65CusfNX3L3MVx27_nuMYJMqQkJ5BtU9SM';
const API_KEY = 'AIzaSyAjfENYV79rTjcMUeTfqgev0a80OsuRKLA'; // VITE_GOOGLE_SHEETS_API_KEY
const RANGE = 'Users!A:D'; // Assuming columns: id | name | correo | key

export const authService = {
    // Store session in localStorage
    setSession(user) {
        localStorage.setItem('disor_user', JSON.stringify(user));
    },

    getSession() {
        const user = localStorage.getItem('disor_user');
        return user ? JSON.parse(user) : null;
    },

    isAuthenticated() {
        return !!localStorage.getItem('disor_user');
    },

    logout() {
        localStorage.removeItem('disor_user');
        window.location.reload();
    },

    // Main login function
    async login(email, password) {
        try {
            const users = await this.fetchUsers();

            // Clean inputs
            const safeEmail = email.trim().toLowerCase();
            const safeKey = password.trim();

            // Find user
            const user = users.find(u =>
                u.correo.toLowerCase() === safeEmail &&
                u.key === safeKey
            );

            if (user) {
                this.setSession(user);
                return { success: true, user };
            } else {
                return { success: false, message: 'Credenciales incorrectas' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, message: 'Error de conexión con Google Sheets' };
        }
    },

    // Fetch users from Google Sheets
    async fetchUsers() {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google Sheets API Error: ${response.statusText}`);
        }

        const result = await response.json();
        const rows = result.values;

        if (!rows || rows.length === 0) return [];

        // Assuming row 0 is header: id, name, correo, key
        // We map rows to objects starting from index 1 if headers exist
        // Let's assume headers are present based on user description
        const headers = rows[0].map(h => h.toLowerCase());
        const data = rows.slice(1).map(row => {
            let user = {};
            headers.forEach((header, index) => {
                // Safe access to row[index]
                user[header] = row[index] || '';
            });
            return user;
        });

        return data;
    }
};
