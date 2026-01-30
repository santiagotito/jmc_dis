import { dataService } from './services/dataService';
import { authService } from './services/authService';

/**
 * App Module - Core logic and state management
 */
const App = {
  state: {
    data: null,
    currentPage: 'resumen',
    selectedYears: [],
    selectedAccount: null,
    selectedCPType: null, // Filter by CP Type from Donut
    metricFilter: null, // 'debe' or 'haber' filter from KPIs
    selectedTiposDoc: [], // Filter by document types (multiple)
    searchDocumento: '', // Search by document number (factura, NC, etc)
    selectedCliente: '', // Filter by client name
    // Sorting state for hierarchical table
    tableSortField: 'fecha', // fecha, debe, haber, cuenta
    tableSortDir: 'desc', // asc, desc
    isLoading: false,
    // Track which details are open (to preserve state on re-render)
    openDetails: new Set(),
    // CXC specific state
    cxcSelectedCliente: null, // Selected client from Top 10 chart
    cxcSelectedAntiguedad: null, // Selected aging range ('0-30', '31-60', etc)
    resumenView: 'monthly', // 'monthly' or 'yearly'
    resumenVisibleSeries: ['cxc', 'cxp', 'promo'], // Visible datasets in evolution chart
    cxcSearchCuenta: '', // Search by account code
    cxcSearchCliente: '', // Search by client name
    cxcSearchFactura: '', // Search by invoice number
    cxcSearchTipoDoc: '', // Filter by document type
    cxcSortField: 'saldo', // saldo, debe, haber, nombre, dias_sin_cobro
    cxcSortDir: 'desc', // asc, desc
    cxcOpenClientes: new Set(), // Track which client groups are open
    cxcOpenFacturas: new Set(), // Track which invoice groups are open
    cxcCurrentPage: 1, // Pagination current page
    cxcItemsPerPage: 50, // Items per page
    // CXP specific state
    cxpSelectedProveedor: null, // Selected provider from Top 10 chart
    cxpSelectedAntiguedad: null, // Selected aging range
    cxpSearchCuenta: '', // Search by account code
    cxpSearchProveedor: '', // Search by provider name
    cxpSearchFactura: '', // Search by invoice number
    cxpSearchAsiento: '', // Search by accounting entry
    cxpSearchTipoDoc: '', // Filter by document type
    cxpSortField: 'saldo', // saldo, compras, pagos, nombre, dias_sin_pago
    cxpSortDir: 'desc', // asc, desc
    cxpOpenProveedores: new Set(), // Track which provider groups are open
    cxpOpenFacturas: new Set(), // Track which invoice groups are open
    cxpCurrentPage: 1, // Pagination current page
    cxpItemsPerPage: 50 // Items per page
  },

  // Internal flag for tracking heavy table rendering
  _pendingTableRender: false,

  // Show global loading overlay
  showLoading() {
    this.state.isLoading = true;
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
          <div class="loading-spinner" style="width: 50px; height: 50px; border: 4px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <div style="color: var(--text-heading); font-weight: 500;">Cargando datos...</div>
        </div>
      `;
      overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; z-index: 9999;';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  },

  // Hide global loading overlay
  hideLoading() {
    this.state.isLoading = false;
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  // Render with loading - waits for heavy table DOM to become interactive
  renderWithLoading() {
    this.showLoading();
    this._pendingTableRender = true;

    setTimeout(() => {
      this.render();
      // The hierarchical table renders async, wait for it to signal completion
      this._checkTableRenderComplete();
    }, 50);
  },

  // Check if table render is complete, then hide loading
  _checkTableRenderComplete() {
    if (this._pendingTableRender) {
      // Wait a bit more and check again
      setTimeout(() => this._checkTableRenderComplete(), 100);
    } else {
      // Table render complete, hide global loading (table has its own overlay now)
      setTimeout(() => this.hideLoading(), 500);
    }
  },

  async init() {
    console.log('🚀 Initializing DISOR Analytics 2.0');

    // Auth Check
    if (!authService.isAuthenticated()) {
      document.getElementById('login-view').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';
      this.bindLoginEvents();
      return;
    }

    // Authenticated
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    this.renderLogoutButton();

    this.state.data = await dataService.load();
    if (!this.state.data) return;

    // Default to latest year
    const availableYears = this.state.data.metadata.available_years;
    this.state.selectedYears = [availableYears[availableYears.length - 1]];

    this.bindEvents();
    this.renderFilters();
    this.render();
  },

  bindLoginEvents() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const key = document.getElementById('login-key').value;
      const btn = document.getElementById('btn-login-submit');
      const spinner = btn.querySelector('.spinner');
      const errorDiv = document.getElementById('login-error');

      // UI Loading
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Verificando...';
      spinner.style.display = 'block';
      errorDiv.textContent = '';

      // Auth Call
      const result = await authService.login(email, key);

      if (result.success) {
        // Reload to init app
        window.location.reload();
      } else {
        // Reset UI
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Ingresar';
        spinner.style.display = 'none';
        errorDiv.textContent = result.message;
      }
    };
  },

  renderLogoutButton() {
    const sidebar = document.querySelector('aside.sidebar');
    if (!sidebar) return;

    // Remove existing if any
    const existing = sidebar.querySelector('.logout-container');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'logout-container';
    div.innerHTML = `
      <button class="btn-logout" onclick="App.handleLogout()">
        <i class="ri-logout-box-line"></i>
        <span>Cerrar Sesión</span>
      </button>
    `;
    sidebar.appendChild(div);
  },

  handleLogout() {
    if (confirm('¿Estás seguro de cerrar sesión?')) {
      authService.logout();
    }
  },

  bindEvents() {
    // Page switching
    document.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.navigate(page);
      });
    });
  },

  navigate(pageId) {
    this.state.currentPage = pageId;

    // UI Updates
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.menu-item[data-page="${pageId}"]`).classList.add('active');

    const titles = { resumen: 'Resumen General', promocion: 'Promoción & Publicidad', cxc: 'Cuentas por Cobrar' };
    document.getElementById('page-title').innerText = titles[pageId] || 'Panel';

    this.render();
  },

  renderFilters() {
    const container = document.getElementById('filter-bar');
    const availableYears = this.state.data.metadata.available_years;
    const { selectedAccount: filterAcc, selectedCPType: filterCP, metricFilter } = this.state;

    container.innerHTML = `
      <div id="year-filters" style="display: flex; gap: 8px;">
        ${availableYears.map(year => `
          <div class="chip ${this.state.selectedYears.includes(year) ? 'active' : ''}" data-year="${year}">
            ${year}
          </div>
        `).join('')}
      </div>
      
      ${(filterAcc || filterCP || metricFilter) ? `
        <div class="active-filters-global" style="margin-left: 20px; display: flex; align-items: center; gap: 10px; padding-left: 20px; border-left: 1px solid var(--border-color);">
          <span class="badge bg-label-primary">
            ${filterAcc ? `Cuenta: ${filterAcc}` : ''}
            ${filterCP ? `${filterAcc ? ' | ' : ''}Tipo: ${filterCP}` : ''}
            ${metricFilter ? `${(filterAcc || filterCP) ? ' | ' : ''}Metr: ${metricFilter.toUpperCase()}` : ''}
          </span>
          <button id="btn-clear-all" class="btn-clear" style="font-size: 0.75rem; padding: 4px 8px;"><i class="ri-close-line"></i> Limpiar</button>
        </div>
      ` : ''}
    `;

    container.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const year = chip.dataset.year;
        const index = this.state.selectedYears.indexOf(year);
        if (index > -1) {
          if (this.state.selectedYears.length > 1) this.state.selectedYears.splice(index, 1);
        } else {
          this.state.selectedYears.push(year);
        }
        this.renderFilters();
        this.renderWithLoading();
      });
    });

    if (document.getElementById('btn-clear-all')) {
      document.getElementById('btn-clear-all').onclick = () => {
        this.state.selectedAccount = null;
        this.state.selectedCPType = null;
        this.state.metricFilter = null;
        this.renderFilters();
        this.renderWithLoading();
      };
    }
  },

  render() {
    switch (this.state.currentPage) {
      case 'resumen':
        this._pendingTableRender = false; // No heavy table on this page
        this.renderResumen();
        break;
      case 'promocion':
        this.renderPromocion();
        break;
      case 'cxc':
        this._pendingTableRender = false;
        this.renderCXC();
        break;
      case 'cxp':
        this._pendingTableRender = false;
        this.renderCXP();
        break;
    }
  },

  renderResumen() {
    const data = this.state.data.resumen;
    const years = this.state.selectedYears;

    // Aggregation
    const summary = years.reduce((acc, y) => {
      if (data.anual && data.anual[y]) {
        acc.registros += data.anual[y].registros;
        acc.debe += data.anual[y].debe;
        acc.haber += data.anual[y].haber;
        acc.cxc += data.anual[y].cxc || 0;
        acc.cxp += data.anual[y].cxp || 0;
        acc.promo += data.anual[y].promo || 0;
      }
      return acc;
    }, { registros: 0, debe: 0, haber: 0, cxc: 0, cxp: 0, promo: 0 });

    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="kpi-grid">
        <div class="card kpi-card">
        <div class="kpi-header">
          <div class="kpi-icon icon-primary"><i class="ri-user-received-line"></i></div>
        </div>
        <div class="kpi-label">Ventas (CXC)</div>
        <div class="kpi-value">$${summary.cxc.toLocaleString()}</div>
        <div class="kpi-subtitle" style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Generación de cartera</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-header">
          <div class="kpi-icon icon-warning"><i class="ri-user-shared-line"></i></div>
        </div>
        <div class="kpi-label">Compras (CXP)</div>
        <div class="kpi-value">$${summary.cxp.toLocaleString()}</div>
        <div class="kpi-subtitle" style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Deuda proveedores</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-header">
          <div class="kpi-icon icon-danger"><i class="ri-advertisement-line"></i></div>
        </div>
        <div class="kpi-label">Promociones</div>
        <div class="kpi-value">$${summary.promo.toLocaleString()}</div>
        <div class="kpi-subtitle" style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Marketing y Pub.</div>
      </div>
      </div>

      <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h5 style="color: var(--text-heading); margin: 0;"><i class="ri-line-chart-line"></i> Tendencia de Cuentas Principales</h5>
        <div style="font-size: 0.75rem; color: var(--text-muted);">Evolución mensual histórica</div>
      </div>
      </div>
      <div style="height: 400px; position: relative;">
        <div style="position: absolute; top: -50px; right: 0; z-index: 10; display: flex; gap: 12px; align-items: center;">
          <!-- Series Filter -->
          <div class="toggle-group" style="display: flex; gap: 4px;">
            <button class="toggle-series active" data-series="cxc" onclick="App.toggleResumenSeries('cxc')" style="padding: 4px 10px; border: 1px solid #696cff; background: #696cff; color: white; border-radius: 20px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">Ventas</button>
            <button class="toggle-series active" data-series="cxp" onclick="App.toggleResumenSeries('cxp')" style="padding: 4px 10px; border: 1px solid #ffab00; background: #ffab00; color: white; border-radius: 20px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">Compras</button>
            <button class="toggle-series active" data-series="promo" onclick="App.toggleResumenSeries('promo')" style="padding: 4px 10px; border: 1px solid #ff3e1d; background: #ff3e1d; color: white; border-radius: 20px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">Promo</button>
          </div>
          <!-- View Toggle -->
          <div class="toggle-group" style="display: flex; background: #f5f5f9; padding: 4px; border-radius: 8px;">
            <button class="toggle-btn active" data-view="monthly" onclick="App.toggleResumenView('monthly')" style="padding: 4px 12px; border: none; background: white; border-radius: 6px; font-size: 0.75rem; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.05); font-weight: 600;">Mensual</button>
            <button class="toggle-btn" data-view="yearly" onclick="App.toggleResumenView('yearly')" style="padding: 4px 12px; border: none; background: transparent; border-radius: 6px; font-size: 0.75rem; cursor: pointer; color: var(--text-muted);">Anual</button>
          </div>
        </div>
        <canvas id="evolutionChart"></canvas>
      </div>
    </div>
    `;

    this.renderResumenChart();
  },

  toggleResumenView(view) {
    this.state.resumenView = view;
    // Update active class for View Toggle
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.style.background = btn.dataset.view === view ? 'white' : 'transparent';
      btn.style.boxShadow = btn.dataset.view === view ? '0 2px 4px rgba(0,0,0,0.05)' : 'none';
      btn.style.fontWeight = btn.dataset.view === view ? '600' : 'normal';
      btn.style.color = btn.dataset.view === view ? 'var(--text-body)' : 'var(--text-muted)';
    });
    this.renderResumenChart();
  },

  toggleResumenSeries(series) {
    const current = this.state.resumenVisibleSeries || ['cxc', 'cxp', 'promo'];
    const idx = current.indexOf(series);
    if (idx > -1) {
      if (current.length > 1) current.splice(idx, 1); // Prevent hiding all
    } else {
      current.push(series);
    }
    this.state.resumenVisibleSeries = current;

    // Update UI
    const colors = { cxc: '#696cff', cxp: '#ffab00', promo: '#ff3e1d' };
    document.querySelectorAll('.toggle-series').forEach(btn => {
      const s = btn.dataset.series;
      const isActive = current.includes(s);
      const color = colors[s];

      btn.style.background = isActive ? color : 'transparent';
      btn.style.color = isActive ? 'white' : color;
      btn.classList.toggle('active', isActive);
    });

    this.renderResumenChart();
  },

  renderResumenChart() {
    const ctx = document.getElementById('evolutionChart').getContext('2d');
    const resumen = this.state.data.resumen;
    const view = this.state.resumenView || 'monthly';
    const years = this.state.selectedYears;
    const visibleSeries = this.state.resumenVisibleSeries || ['cxc', 'cxp', 'promo'];

    // Destroy previous chart if exists
    if (this._evolutionChart) {
      this._evolutionChart.destroy();
    }

    let labels, cxcData, cxpData, promoData;

    if (view === 'yearly') {
      // Agrupación Anual (usando data.anual)
      // Ordenar años para que salgan cronológicos
      const sortedYears = [...years].sort();
      labels = sortedYears;
      cxcData = sortedYears.map(y => resumen.anual[y]?.cxc || 0);
      cxpData = sortedYears.map(y => resumen.anual[y]?.cxp || 0);
      promoData = sortedYears.map(y => resumen.anual[y]?.promo || 0);

    } else {
      // Agrupación Mensual (existente)
      const hasMonthly = resumen.mensual && resumen.mensual.length > 0;
      if (hasMonthly) {
        const filteredMonthly = resumen.mensual.filter(m => {
          const year = m.label.split('/')[1];
          return years.includes(year);
        });

        labels = filteredMonthly.map(m => m.label);
        cxcData = filteredMonthly.map(m => m.cxc);
        cxpData = filteredMonthly.map(m => m.cxp);
        promoData = filteredMonthly.map(m => m.promo);
      } else {
        // Fallback si no hay mensual
        labels = years;
        cxcData = years.map(y => resumen.anual[y]?.cxc || 0);
        cxpData = years.map(y => resumen.anual[y]?.cxp || 0);
        promoData = years.map(y => resumen.anual[y]?.promo || 0);
      }
    }

    this._evolutionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Ventas (CXC)',
            data: cxcData,
            borderColor: '#696cff',
            backgroundColor: 'rgba(105, 108, 255, 0.1)',
            tension: 0.3,
            fill: true,
            hidden: !visibleSeries.includes('cxc')
          },
          {
            label: 'Compras (CXP)',
            data: cxpData,
            borderColor: '#ffab00',
            backgroundColor: 'rgba(255, 171, 0, 0.1)',
            tension: 0.3,
            fill: true,
            hidden: !visibleSeries.includes('cxp')
          },
          {
            label: 'Promociones',
            data: promoData,
            borderColor: '#ff3e1d',
            backgroundColor: 'rgba(255, 62, 29, 0.1)',
            tension: 0.3,
            fill: true,
            hidden: !visibleSeries.includes('promo')
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { usePointStyle: true, boxWidth: 6, font: { size: 11 } }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function (context) {
                return context.dataset.label + ': $' + context.raw.toLocaleString();
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { callback: value => '$' + (value / 1000) + 'K' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  },

  renderPromocion() {
    const data = this.state.data.promocion;
    const years = this.state.selectedYears;
    const filterAcc = this.state.selectedAccount;
    const filterCP = this.state.selectedCPType;
    const filterMetric = this.state.metricFilter;
    const tiposFilter = this.state.selectedTiposDoc || [];
    const searchTerm = (this.state.searchDocumento || '').toLowerCase().trim();
    const filterCliente = (this.state.selectedCliente || '').toLowerCase().trim();

    // 1. Filtrado Base (Afecta a todo: KPIs, Gráficos y Tabla)
    const baseFiltered = data.detalle.filter(d => {
      // Filtro de Año
      if (!years.includes(d.anio)) return false;
      // Filtro de Cuenta
      if (filterAcc && d.cuenta !== filterAcc) return false;
      // Filtro de Cliente (usa nombre_cuenta_linea - la columna Cuenta)
      if (filterCliente) {
        const cuentaNombre = (d.nombre_cuenta_linea || '').toLowerCase();
        if (!cuentaNombre.includes(filterCliente)) return false;
      }
      // Filtro de Tipo de Documento
      if (tiposFilter.length > 0) {
        const tipoDocStr = d.tipo_doc || '';
        if (!tiposFilter.some(t => tipoDocStr.includes(t))) return false;
      }
      // Filtro de Búsqueda de Documento
      if (searchTerm && !(d.documentos && d.documentos.toLowerCase().includes(searchTerm))) return false;
      // Filtro de Métrica (Debe/Haber) desde KPIs
      if (filterMetric && !(filterMetric === 'debe' ? d.debe > 0 : filterMetric === 'haber' ? d.haber > 0 : true)) return false;
      return true;
    });

    // 2. Agregaciones para Donut (Cruce de Cuentas)
    // Mostrar el desglose por tipo_cp de TODAS las líneas (para que coincida con la tabla)
    // Esto permite ver los totales por tipo de contrapartida que cuadran con los asientos
    const cpAggGeneral = {};
    baseFiltered.forEach(d => {
      const type = d.tipo_cp || 'OTROS';
      if (!cpAggGeneral[type]) cpAggGeneral[type] = { debe: 0, haber: 0 };
      cpAggGeneral[type].debe += d.debe;
      cpAggGeneral[type].haber += d.haber;
    });

    // 3. Filtrado Final para KPIs y Ranking (Aplica también el filtro del Donut)
    const finalFiltered = baseFiltered.filter(d => !filterCP || d.tipo_cp === filterCP);

    // Para KPIs: Mostrar TODAS las líneas filtradas (para que cuadre con la tabla)
    let totalDebe = 0;
    let totalHaber = 0;
    const accountAgg = {};
    const accountsSet = new Set();

    finalFiltered.forEach(d => {
      totalDebe += d.debe;
      totalHaber += d.haber;
      // Solo sumar al ranking de cuentas si es línea de promoción (para mostrar inversión real)
      if (d.es_linea_promo) {
        accountAgg[d.cuenta] = (accountAgg[d.cuenta] || 0) + d.debe;
      }
      accountsSet.add(d.cuenta);
    });

    const netValue = totalDebe - totalHaber;

    // Calcular totales para explicación de diferencias
    const totalInversionPromo = Object.values(accountAgg).reduce((s, v) => s + v, 0); // Solo líneas de promoción
    const totalAsientoCompleto = totalDebe; // Todas las líneas
    const diferenciaRankingTabla = totalAsientoCompleto - totalInversionPromo;

    const sortedAccounts = Object.entries(accountAgg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // ============================================
    // ANÁLISIS DE ANOMALÍAS Y MALAS PRÁCTICAS
    // ============================================

    // Solo analizar líneas de promoción (es_linea_promo=true)
    const promoLines = finalFiltered.filter(d => d.es_linea_promo);

    // Agrupar por tipo_cp para análisis
    const analisisPorTipo = {};
    promoLines.forEach(d => {
      const tipo = d.tipo_cp || 'OTROS';
      if (!analisisPorTipo[tipo]) {
        analisisPorTipo[tipo] = { debe: 0, haber: 0, count: 0, asientos: new Set() };
      }
      analisisPorTipo[tipo].debe += d.debe;
      analisisPorTipo[tipo].haber += d.haber;
      analisisPorTipo[tipo].count++;
      analisisPorTipo[tipo].asientos.add(d.asiento);
    });

    // Calcular porcentajes
    const totalPromoAnalisis = promoLines.reduce((s, d) => s + d.debe, 0);
    const pctInterno = analisisPorTipo['INTERNO'] ? (analisisPorTipo['INTERNO'].debe / totalPromoAnalisis * 100) : 0;
    const pctCliente = analisisPorTipo['CLIENTE'] ? (analisisPorTipo['CLIENTE'].debe / totalPromoAnalisis * 100) : 0;
    const pctProveedor = analisisPorTipo['PROVEEDOR'] ? (analisisPorTipo['PROVEEDOR'].debe / totalPromoAnalisis * 100) : 0;
    const pctOtros = analisisPorTipo['OTROS'] ? (analisisPorTipo['OTROS'].debe / totalPromoAnalisis * 100) : 0;
    const pctBanco = analisisPorTipo['BANCO'] ? (analisisPorTipo['BANCO'].debe / totalPromoAnalisis * 100) : 0;

    // Generar alertas dinámicas
    const alertas = [];

    // Alerta 1: Alto % interno (esperado: promoción debería ir mayormente a clientes)
    if (pctInterno > 50) {
      alertas.push({
        tipo: 'danger',
        icono: 'ri-alarm-warning-line',
        titulo: `${pctInterno.toFixed(1)}% de promoción es INTERNO`,
        mensaje: `$${(analisisPorTipo['INTERNO']?.debe || 0).toLocaleString()} en ${analisisPorTipo['INTERNO']?.asientos.size || 0} asientos se registran como uso interno. La promoción debería beneficiar principalmente a clientes externos.`,
        recomendacion: 'Revisar si estos gastos son realmente promoción o deberían clasificarse como gastos operativos.'
      });
    } else if (pctInterno > 30) {
      alertas.push({
        tipo: 'warning',
        icono: 'ri-error-warning-line',
        titulo: `${pctInterno.toFixed(1)}% de promoción es INTERNO`,
        mensaje: `$${(analisisPorTipo['INTERNO']?.debe || 0).toLocaleString()} se destinan a uso interno.`,
        recomendacion: 'Considerar si este porcentaje es adecuado para la estrategia comercial.'
      });
    }

    // Alerta 2: Bajo % a clientes
    if (pctCliente < 20 && totalPromoAnalisis > 0) {
      alertas.push({
        tipo: 'warning',
        icono: 'ri-user-unfollow-line',
        titulo: `Solo ${pctCliente.toFixed(1)}% llega a CLIENTES`,
        mensaje: `De $${totalPromoAnalisis.toLocaleString()} en promoción, solo $${(analisisPorTipo['CLIENTE']?.debe || 0).toLocaleString()} benefician directamente a clientes.`,
        recomendacion: 'La promoción comercial debería tener mayor impacto directo en clientes.'
      });
    }

    // Alerta 3: Promoción a proveedores (inusual)
    if (pctProveedor > 5) {
      alertas.push({
        tipo: 'info',
        icono: 'ri-truck-line',
        titulo: `${pctProveedor.toFixed(1)}% va a PROVEEDORES`,
        mensaje: `$${(analisisPorTipo['PROVEEDOR']?.debe || 0).toLocaleString()} en promoción registrados contra proveedores.`,
        recomendacion: 'Verificar si son bonificaciones comerciales legítimas o errores de clasificación.'
      });
    }

    // Alerta 4: Promoción sin clasificar (OTROS)
    if (pctOtros > 10) {
      alertas.push({
        tipo: 'warning',
        icono: 'ri-question-line',
        titulo: `${pctOtros.toFixed(1)}% sin clasificar (OTROS)`,
        mensaje: `$${(analisisPorTipo['OTROS']?.debe || 0).toLocaleString()} no tienen contrapartida identificada.`,
        recomendacion: 'Mejorar la clasificación de contrapartidas para mejor trazabilidad.'
      });
    }

    // Si todo está bien
    if (alertas.length === 0 && totalPromoAnalisis > 0) {
      alertas.push({
        tipo: 'success',
        icono: 'ri-checkbox-circle-line',
        titulo: 'Distribución saludable',
        mensaje: `${pctCliente.toFixed(1)}% a clientes, ${pctInterno.toFixed(1)}% interno. La distribución parece adecuada.`,
        recomendacion: ''
      });
    }

    // Análisis por cuenta de promoción
    const analisisPorCuenta = {};
    promoLines.forEach(d => {
      const cuenta = d.cuenta;
      if (!analisisPorCuenta[cuenta]) {
        analisisPorCuenta[cuenta] = { total: 0, porTipo: {} };
      }
      analisisPorCuenta[cuenta].total += d.debe;
      const tipo = d.tipo_cp || 'OTROS';
      analisisPorCuenta[cuenta].porTipo[tipo] = (analisisPorCuenta[cuenta].porTipo[tipo] || 0) + d.debe;
    });

    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="kpi-grid">
        <div class="card kpi-card metric-card ${filterMetric === 'debe' ? 'active' : ''}" data-metric="debe" style="cursor: pointer;">
          <div class="kpi-header">
            <div class="kpi-icon icon-primary"><i class="ri-megaphone-line"></i></div>
            <div class="kpi-info-icon" data-tooltip="Inversión real en cuentas de promoción (502xxx)">i</div>
          </div>
          <div class="kpi-label">Inversión Promoción</div>
          <div class="kpi-value">$${totalInversionPromo.toLocaleString()}</div>
          <div class="kpi-subtitle" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Solo cuentas 502xxx</div>
        </div>
        <div class="card kpi-card metric-card ${filterMetric === 'haber' ? 'active' : ''}" data-metric="haber" style="cursor: pointer;">
          <div class="kpi-header">
            <div class="kpi-icon icon-info"><i class="ri-file-list-3-line"></i></div>
            <div class="kpi-info-icon" data-tooltip="Total de líneas en asientos completos (para cuadre contable)">i</div>
          </div>
          <div class="kpi-label">Cuadre Contable</div>
          <div class="kpi-value" style="font-size: 1.1rem;">
            <span style="color: var(--primary);">D: $${totalDebe.toLocaleString()}</span>
          </div>
          <div class="kpi-value" style="font-size: 1.1rem; margin-top: 2px;">
            <span style="color: var(--danger);">H: $${totalHaber.toLocaleString()}</span>
          </div>
        </div>
        <div class="card kpi-card metric-card ${filterMetric === 'neto' ? 'active' : ''}" data-metric="neto" style="cursor: pointer;">
          <div class="kpi-header">
            <div class="kpi-icon icon-success"><i class="ri-shield-check-line"></i></div>
            <div class="kpi-info-icon" data-tooltip="Cero Neto indica auditoría perfecta.">i</div>
          </div>
          <div class="kpi-label">Estado Auditoría</div>
          <div class="kpi-value" style="font-size: 1.3rem; color: ${netValue === 0 ? 'var(--success)' : 'var(--warning)'};">
            Neto: $${netValue.toLocaleString()}
          </div>
          <div class="kpi-subtitle" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${netValue === 0 ? '✓ Asientos cuadrados' : '⚠ Revisar diferencia'}</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon icon-warning"><i class="ri-bank-line"></i></div>
          </div>
          <div class="kpi-label">Cuentas Publicidad</div>
          <div class="kpi-value">${accountsSet.size} Unidades</div>
          <div class="kpi-subtitle" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${Object.keys(accountAgg).length} con movimiento</div>
        </div>
      </div>

      <div class="row" style="display: flex; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div class="card" style="flex: 2; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
            <h5 style="color: var(--text-heading); margin: 0;">Ranking de Inversión por Cuenta</h5>
            ${filterAcc ? `<button class="btn-clear-account" style="font-size: 0.75rem; padding: 4px 10px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="ri-close-line"></i> ${filterAcc}</button>` : ''}
          </div>
          <div id="account-filter-chips" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1rem;">
            ${sortedAccounts.map(([acc, val]) => `
              <button class="chip-account ${filterAcc === acc ? 'active' : ''}" data-account="${acc}"
                style="padding: 4px 10px; font-size: 0.7rem; border: 1px solid ${filterAcc === acc ? 'var(--primary)' : 'var(--border-color)'};
                background: ${filterAcc === acc ? 'var(--primary)' : 'white'}; color: ${filterAcc === acc ? 'white' : 'var(--text-muted)'};
                border-radius: 20px; cursor: pointer; transition: all 0.2s;">
                ${acc.length > 25 ? acc.substring(0, 22) + '...' : acc} <span style="font-weight: 600;">${this.formatAbreviated(val)}</span>
              </button>
            `).join('')}
          </div>
          <div style="height: 320px;">
            <canvas id="rankingChart"></canvas>
          </div>
        </div>
        <div class="card" style="flex: 1.5; display: flex; flex-direction: column;">
          <h5 style="color: var(--text-heading); margin-bottom: 1.5rem;">Cruce de Cuentas (CXP/CP)</h5>
          <div style="display: flex; gap: 1rem; align-items: center; flex: 1;">
            <div style="flex: 1; height: 300px;">
              <canvas id="cpBreakdownChart"></canvas>
            </div>
            <div id="cp-breakdown-list" style="flex: 1; display: flex; flex-direction: column; gap: 8px;"></div>
          </div>
        </div>
      </div>

      ${diferenciaRankingTabla > 0 ? `
      <div class="card" style="background: linear-gradient(135deg, #f8f9ff 0%, #fff8f0 100%); border-left: 4px solid var(--primary); margin-bottom: 1.5rem;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="background: var(--primary); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i class="ri-information-line"></i>
          </div>
          <div style="flex: 1;">
            <h6 style="margin: 0 0 8px 0; color: var(--text-heading); font-size: 0.95rem;">
              <i class="ri-bar-chart-grouped-line"></i> Diferencia entre Ranking y Tabla/Donut
            </h6>
            <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.6;">
              El <strong>Ranking</strong> muestra <strong style="color: var(--primary);">$${totalInversionPromo.toLocaleString()}</strong> (inversión en cuentas de promoción 502xxx),
              mientras que la <strong>Tabla y Donut</strong> muestran <strong style="color: var(--primary);">$${totalAsientoCompleto.toLocaleString()}</strong> (total de asientos completos).
            </p>
            <p style="margin: 8px 0 0 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.6;">
              <strong style="color: var(--warning);">Diferencia: $${diferenciaRankingTabla.toLocaleString()}</strong> —
              Corresponde a otras líneas contables dentro de los mismos asientos (bancos, proveedores, retenciones, etc.) que no son cuentas de promoción pero forman parte del registro contable completo.
              <em>Esto es normal y esperado: cada asiento debe cuadrar (Debe = Haber).</em>
            </p>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- ANÁLISIS DE ANOMALÍAS Y DISTRIBUCIÓN -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h5 style="color: var(--text-heading); margin: 0;">
            <i class="ri-search-eye-line"></i> Análisis de Distribución de Promoción
          </h5>
          <span style="font-size: 0.75rem; color: var(--text-muted);">
            Total analizado: $${totalPromoAnalisis.toLocaleString()}
          </span>
        </div>

        <!-- Barras de distribución por tipo -->
        <div style="margin-bottom: 1.5rem;">
          <div style="display: flex; gap: 4px; height: 24px; border-radius: 6px; overflow: hidden; margin-bottom: 8px;">
            ${pctInterno > 0 ? `<div style="width: ${pctInterno}%; background: #ff6b6b; display: flex; align-items: center; justify-content: center;" title="INTERNO: ${pctInterno.toFixed(1)}%">
              <span style="color: white; font-size: 0.65rem; font-weight: 600;">${pctInterno > 8 ? pctInterno.toFixed(0) + '%' : ''}</span>
            </div>` : ''}
            ${pctCliente > 0 ? `<div style="width: ${pctCliente}%; background: #51cf66; display: flex; align-items: center; justify-content: center;" title="CLIENTE: ${pctCliente.toFixed(1)}%">
              <span style="color: white; font-size: 0.65rem; font-weight: 600;">${pctCliente > 8 ? pctCliente.toFixed(0) + '%' : ''}</span>
            </div>` : ''}
            ${pctProveedor > 0 ? `<div style="width: ${pctProveedor}%; background: #fcc419; display: flex; align-items: center; justify-content: center;" title="PROVEEDOR: ${pctProveedor.toFixed(1)}%">
              <span style="color: #333; font-size: 0.65rem; font-weight: 600;">${pctProveedor > 8 ? pctProveedor.toFixed(0) + '%' : ''}</span>
            </div>` : ''}
            ${pctBanco > 0 ? `<div style="width: ${pctBanco}%; background: #339af0; display: flex; align-items: center; justify-content: center;" title="BANCO: ${pctBanco.toFixed(1)}%">
              <span style="color: white; font-size: 0.65rem; font-weight: 600;">${pctBanco > 8 ? pctBanco.toFixed(0) + '%' : ''}</span>
            </div>` : ''}
            ${pctOtros > 0 ? `<div style="width: ${pctOtros}%; background: #868e96; display: flex; align-items: center; justify-content: center;" title="OTROS: ${pctOtros.toFixed(1)}%">
              <span style="color: white; font-size: 0.65rem; font-weight: 600;">${pctOtros > 8 ? pctOtros.toFixed(0) + '%' : ''}</span>
            </div>` : ''}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.75rem;">
            <span><span style="display: inline-block; width: 10px; height: 10px; background: #ff6b6b; border-radius: 2px; margin-right: 4px;"></span>INTERNO ${pctInterno.toFixed(1)}%</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: #51cf66; border-radius: 2px; margin-right: 4px;"></span>CLIENTE ${pctCliente.toFixed(1)}%</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: #fcc419; border-radius: 2px; margin-right: 4px;"></span>PROVEEDOR ${pctProveedor.toFixed(1)}%</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: #339af0; border-radius: 2px; margin-right: 4px;"></span>BANCO ${pctBanco.toFixed(1)}%</span>
            <span><span style="display: inline-block; width: 10px; height: 10px; background: #868e96; border-radius: 2px; margin-right: 4px;"></span>OTROS ${pctOtros.toFixed(1)}%</span>
          </div>
        </div>

        <!-- Alertas y hallazgos -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px;">
          ${alertas.map(a => `
            <div style="padding: 12px; border-radius: 8px; background: ${a.tipo === 'danger' ? '#fff5f5' : a.tipo === 'warning' ? '#fff9db' : a.tipo === 'success' ? '#ebfbee' : '#e7f5ff'}; border-left: 3px solid ${a.tipo === 'danger' ? '#ff6b6b' : a.tipo === 'warning' ? '#fcc419' : a.tipo === 'success' ? '#51cf66' : '#339af0'};">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <i class="${a.icono}" style="color: ${a.tipo === 'danger' ? '#ff6b6b' : a.tipo === 'warning' ? '#f59f00' : a.tipo === 'success' ? '#51cf66' : '#339af0'}; font-size: 1.1rem;"></i>
                <strong style="font-size: 0.85rem; color: var(--text-heading);">${a.titulo}</strong>
              </div>
              <p style="margin: 0 0 6px 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">${a.mensaje}</p>
              ${a.recomendacion ? `<p style="margin: 0; font-size: 0.75rem; color: ${a.tipo === 'danger' ? '#c92a2a' : a.tipo === 'warning' ? '#e67700' : '#2b8a3e'}; font-style: italic;"><i class="ri-lightbulb-line"></i> ${a.recomendacion}</p>` : ''}
            </div>
          `).join('')}
        </div>

        <!-- Detalle por cuenta -->
        <details style="margin-top: 1rem;">
          <summary style="cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--text-heading); padding: 8px 0;">
            <i class="ri-pie-chart-line"></i> Ver distribución por cuenta de promoción
          </summary>
          <div style="margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px;">
            ${Object.entries(analisisPorCuenta).sort((a, b) => b[1].total - a[1].total).map(([cuenta, data]) => {
      const pctInternoC = data.porTipo['INTERNO'] ? (data.porTipo['INTERNO'] / data.total * 100) : 0;
      const pctClienteC = data.porTipo['CLIENTE'] ? (data.porTipo['CLIENTE'] / data.total * 100) : 0;
      return `
              <div style="padding: 10px; background: var(--bg-light); border-radius: 6px;">
                <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-heading); margin-bottom: 6px;">${cuenta}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Total: $${data.total.toLocaleString()}</div>
                <div style="display: flex; gap: 2px; height: 8px; border-radius: 4px; overflow: hidden;">
                  ${Object.entries(data.porTipo).map(([tipo, val]) => {
        const pct = val / data.total * 100;
        const color = tipo === 'INTERNO' ? '#ff6b6b' : tipo === 'CLIENTE' ? '#51cf66' : tipo === 'PROVEEDOR' ? '#fcc419' : tipo === 'BANCO' ? '#339af0' : '#868e96';
        return `<div style="width: ${pct}%; background: ${color};" title="${tipo}: ${pct.toFixed(1)}%"></div>`;
      }).join('')}
                </div>
                <div style="display: flex; gap: 8px; margin-top: 4px; font-size: 0.7rem; color: var(--text-muted);">
                  ${pctInternoC > 0 ? `<span style="color: #ff6b6b;">INT ${pctInternoC.toFixed(0)}%</span>` : ''}
                  ${pctClienteC > 0 ? `<span style="color: #51cf66;">CLI ${pctClienteC.toFixed(0)}%</span>` : ''}
                </div>
              </div>
            `;
    }).join('')}
          </div>
        </details>
      </div>

      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <h5 style="color: var(--text-heading); margin: 0;">Auditoría Jerárquica (Cuenta > Asiento)</h5>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <div id="filter-tipos-doc" style="display: flex; gap: 8px; flex-wrap: wrap;"></div>
            <div style="position: relative;">
              <input type="text" id="filter-cliente" list="clientes-list" placeholder="Buscar cuenta..."
                style="padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 6px; width: 200px; font-size: 0.85rem;">
              <datalist id="clientes-list"></datalist>
            </div>
            <input type="text" id="filter-documento" placeholder="Buscar documento (ej: 2047)"
              style="padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 6px; width: 180px; font-size: 0.85rem;">
            <button id="btn-clear-doc-filters" style="padding: 6px 12px; background: var(--border-color); border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
              <i class="ri-close-line"></i> Limpiar
            </button>
            <button id="btn-export-all" style="padding: 6px 12px; background: var(--success); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
              <i class="ri-file-excel-2-line"></i> Descargar Excel
            </button>
          </div>
        </div>
        <div id="promo-hierarchical-table" class="hierarchical-table"></div>
      </div>
    `;

    this.renderRankingChart(sortedAccounts);
    this.renderCPChart(cpAggGeneral);
    this.populateDocFilters();
    this.createHierarchicalTable();

    // Bind export all button
    const exportBtn = document.getElementById('btn-export-all');
    if (exportBtn) {
      exportBtn.onclick = () => this.exportAllFiltered();
    }

    // Bind Events
    document.querySelectorAll('.metric-card').forEach(card => {
      card.onclick = () => {
        const m = card.dataset.metric;
        this.state.metricFilter = (this.state.metricFilter === m) ? null : m;
        this.renderFilters();
        this.renderWithLoading();
      };
    });

    // Bind account filter chips
    document.querySelectorAll('.chip-account').forEach(chip => {
      chip.onclick = () => {
        const acc = chip.dataset.account;
        this.state.selectedAccount = (this.state.selectedAccount === acc) ? null : acc;
        this.renderFilters();
        this.renderWithLoading();
      };
    });

    // Bind clear account button
    const clearAccBtn = document.querySelector('.btn-clear-account');
    if (clearAccBtn) {
      clearAccBtn.onclick = () => {
        this.state.selectedAccount = null;
        this.renderFilters();
        this.renderWithLoading();
      };
    }
  },

  // ============================================
  // CUENTAS POR COBRAR (CXC)
  // ============================================
  async renderCXC() {
    const cxcData = this.state.data.cxc;
    if (!cxcData || !cxcData.clientes) {
      document.getElementById('app').innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <i class="ri-error-warning-line" style="font-size: 3rem; color: var(--warning);"></i>
          <h5 style="margin-top: 1rem;">Sin datos de CXC</h5>
          <p style="color: var(--text-muted);">No se encontraron datos de cuentas por cobrar. Ejecuta el export_data.py.</p>
        </div>
      `;
      return;
    }

    const years = this.state.selectedYears;
    const clientes = cxcData.clientes;
    const resumenAnual = cxcData.resumen_anual;

    // Cargar detalle del año seleccionado dinámicamente
    if (!dataService.areCXCYearsLoaded(years)) {
      this.showLoading();
    }
    const detalle = await dataService.loadCXCYears(years);
    this.hideLoading();

    // Filtrar clientes por años seleccionados (que tengan movimiento en esos años)
    let clientesFiltrados = clientes.filter(c => {
      if (!c.anios_activos) return true;
      return c.anios_activos.some(a => years.includes(String(a)));
    });

    // Calcular totales de los años seleccionados
    let totalDebe = 0, totalHaber = 0;
    years.forEach(y => {
      if (resumenAnual[y]) {
        totalDebe += resumenAnual[y].total_debe;
        totalHaber += resumenAnual[y].total_haber;
      }
    });

    // Fecha de corte basada en el año máximo seleccionado
    const maxYear = Math.max(...years);
    const fechaCorte = new Date(maxYear, 11, 31);

    // Recalcular saldos de clientes para los años seleccionados
    let clientesConSaldo = clientesFiltrados.map(c => {
      let debe = 0, haber = 0;
      years.forEach(y => {
        if (c.por_anio && c.por_anio[y]) {
          debe += c.por_anio[y].debe;
          haber += c.por_anio[y].haber;
        }
      });
      return { ...c, saldo_filtrado: debe - haber, debe_filtrado: debe, haber_filtrado: haber };
    }).filter(c => c.debe_filtrado > 0 || c.haber_filtrado > 0 || c.saldo_filtrado !== 0);

    // Análisis de antigüedad inicial (para filtros de selección)
    let antiguedadData = { '0-30': [], '31-60': [], '61-90': [], '>90': [] };
    let antiguedadTotals = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    clientesConSaldo.forEach(c => {
      if (c.saldo_filtrado > 0 && c.dias_sin_cobro !== null) {
        if (c.dias_sin_cobro <= 30) { antiguedadData['0-30'].push(c); antiguedadTotals['0-30'] += c.saldo_filtrado; }
        else if (c.dias_sin_cobro <= 60) { antiguedadData['31-60'].push(c); antiguedadTotals['31-60'] += c.saldo_filtrado; }
        else if (c.dias_sin_cobro <= 90) { antiguedadData['61-90'].push(c); antiguedadTotals['61-90'] += c.saldo_filtrado; }
        else { antiguedadData['>90'].push(c); antiguedadTotals['>90'] += c.saldo_filtrado; }
      }
    });

    // ========== APLICAR FILTROS ==========
    const { cxcSelectedCliente, cxcSelectedAntiguedad, cxcSearchCuenta, cxcSearchCliente, cxcSearchFactura, cxcSearchTipoDoc } = this.state;

    // Filtrar por cliente seleccionado (del gráfico Top 10)
    if (cxcSelectedCliente) {
      clientesConSaldo = clientesConSaldo.filter(c => c.codigo === cxcSelectedCliente);
    }

    // Filtrar por antigüedad seleccionada
    if (cxcSelectedAntiguedad && antiguedadData[cxcSelectedAntiguedad]) {
      const codigosAntiguedad = antiguedadData[cxcSelectedAntiguedad].map(c => c.codigo);
      clientesConSaldo = clientesConSaldo.filter(c => codigosAntiguedad.includes(c.codigo));
    }

    // Filtrar detalle por años
    let detalleFiltrado = detalle.filter(d => years.includes(d.anio));

    // Filtrar por búsquedas
    if (cxcSearchCuenta) {
      const searchLower = cxcSearchCuenta.toLowerCase();
      // Primero filtrar detalle por código de cuenta
      detalleFiltrado = detalleFiltrado.filter(d => d.cliente_codigo.toLowerCase().includes(searchLower));
      // Obtener códigos de clientes que tienen transacciones
      const clientesEnDetalle = new Set(detalleFiltrado.map(d => d.cliente_codigo));
      // Filtrar clientesConSaldo a solo los que tienen transacciones
      clientesConSaldo = clientesConSaldo.filter(c => clientesEnDetalle.has(c.codigo));
      // Si hay clientes en detalle que no están en clientesConSaldo, agregarlos
      clientesEnDetalle.forEach(codigo => {
        if (!clientesConSaldo.find(c => c.codigo === codigo)) {
          const transacciones = detalleFiltrado.filter(d => d.cliente_codigo === codigo);
          if (transacciones.length > 0) {
            const nombre = transacciones[0].cliente_nombre;
            const debe = transacciones.reduce((s, t) => s + (t.debe || 0), 0);
            const haber = transacciones.reduce((s, t) => s + (t.haber || 0), 0);
            const fechas = transacciones.filter(t => t.debe > 0).map(t => t.fecha).sort();
            const ultimaVenta = fechas.length > 0 ? fechas[fechas.length - 1] : null;
            const cobros = transacciones.filter(t => t.haber > 0).map(t => t.fecha).sort();
            const ultimoCobro = cobros.length > 0 ? cobros[cobros.length - 1] : null;
            const diasSinCobro = ultimaVenta && !ultimoCobro ? Math.floor((fechaCorte - new Date(ultimaVenta)) / (1000 * 60 * 60 * 24)) :
              ultimaVenta && ultimoCobro ? Math.floor((new Date(ultimoCobro) - new Date(ultimaVenta)) / (1000 * 60 * 60 * 24)) : null;
            clientesConSaldo.push({
              codigo,
              nombre,
              debe_filtrado: debe,
              haber_filtrado: haber,
              saldo_filtrado: debe - haber,
              ultima_venta: ultimaVenta,
              ultimo_cobro: ultimoCobro,
              dias_sin_cobro: diasSinCobro
            });
          }
        }
      });
    }
    if (cxcSearchCliente) {
      const searchLower = cxcSearchCliente.toLowerCase();
      // Primero filtrar detalle por nombre de cliente
      detalleFiltrado = detalleFiltrado.filter(d => d.cliente_nombre.toLowerCase().includes(searchLower));
      // Obtener códigos de clientes que tienen transacciones con ese nombre
      const clientesEnDetalle = new Set(detalleFiltrado.map(d => d.cliente_codigo));
      // Filtrar clientesConSaldo a solo los que tienen transacciones
      clientesConSaldo = clientesConSaldo.filter(c => clientesEnDetalle.has(c.codigo));
      // Si hay clientes en detalle que no están en clientesConSaldo, agregarlos
      clientesEnDetalle.forEach(codigo => {
        if (!clientesConSaldo.find(c => c.codigo === codigo)) {
          const transacciones = detalleFiltrado.filter(d => d.cliente_codigo === codigo);
          if (transacciones.length > 0) {
            const nombre = transacciones[0].cliente_nombre;
            const debe = transacciones.reduce((s, t) => s + (t.debe || 0), 0);
            const haber = transacciones.reduce((s, t) => s + (t.haber || 0), 0);
            const fechas = transacciones.filter(t => t.debe > 0).map(t => t.fecha).sort();
            const ultimaVenta = fechas.length > 0 ? fechas[fechas.length - 1] : null;
            const cobros = transacciones.filter(t => t.haber > 0).map(t => t.fecha).sort();
            const ultimoCobro = cobros.length > 0 ? cobros[cobros.length - 1] : null;
            const diasSinCobro = ultimaVenta && !ultimoCobro ? Math.floor((fechaCorte - new Date(ultimaVenta)) / (1000 * 60 * 60 * 24)) :
              ultimaVenta && ultimoCobro ? Math.floor((new Date(ultimoCobro) - new Date(ultimaVenta)) / (1000 * 60 * 60 * 24)) : null;
            clientesConSaldo.push({
              codigo,
              nombre,
              debe_filtrado: debe,
              haber_filtrado: haber,
              saldo_filtrado: debe - haber,
              ultima_venta: ultimaVenta,
              ultimo_cobro: ultimoCobro,
              dias_sin_cobro: diasSinCobro
            });
          }
        }
      });
    }
    if (cxcSearchFactura) {
      const searchLower = cxcSearchFactura.toLowerCase().trim();
      // Búsqueda EXACTA de factura (no parcial)
      detalleFiltrado = detalleFiltrado.filter(d =>
        (d.factura && d.factura.toLowerCase() === searchLower)
      );
      // Filtrar clientes que tengan esas facturas
      const clientesConFactura = new Set(detalleFiltrado.map(d => d.cliente_codigo));
      clientesConSaldo = clientesConSaldo.filter(c => clientesConFactura.has(c.codigo));
    }
    if (cxcSearchTipoDoc) {
      const searchLower = cxcSearchTipoDoc.toLowerCase();
      detalleFiltrado = detalleFiltrado.filter(d => d.tipo_doc && d.tipo_doc.toLowerCase().includes(searchLower));
      const clientesConTipo = new Set(detalleFiltrado.map(d => d.cliente_codigo));
      clientesConSaldo = clientesConSaldo.filter(c => clientesConTipo.has(c.codigo));
    }

    // Recalcular totales de clientes basado en detalle filtrado (para que los totales de la fila gris coincidan con lo filtrado)
    if (cxcSearchCuenta || cxcSearchCliente || cxcSearchFactura || cxcSearchTipoDoc || cxcSelectedCliente || cxcSelectedAntiguedad) {
      // Recalcular totales de cada cliente basado SOLO en el detalle filtrado y solo en cuentas CXC
      clientesConSaldo = clientesConSaldo.map(c => {
        const clienteDetalle = detalleFiltrado.filter(d => d.cliente_codigo === c.codigo);
        const itemsCxc = clienteDetalle.filter(d => d.es_cxc);
        const debe = itemsCxc.reduce((s, d) => s + (d.debe || 0), 0);
        const haber = itemsCxc.reduce((s, d) => s + (d.haber || 0), 0);
        return { ...c, debe_filtrado: debe, haber_filtrado: haber, saldo_filtrado: debe - haber };
      }).filter(c => c.debe_filtrado !== 0 || c.haber_filtrado !== 0);
    }

    // Recalcular KPIs después de filtros
    let kpiDebe = 0, kpiHaber = 0;
    if (cxcSelectedCliente || cxcSelectedAntiguedad || cxcSearchCuenta || cxcSearchCliente || cxcSearchFactura || cxcSearchTipoDoc) {
      clientesConSaldo.forEach(c => { kpiDebe += c.debe_filtrado; kpiHaber += c.haber_filtrado; });
    } else {
      kpiDebe = totalDebe; kpiHaber = totalHaber;
    }
    const saldoTotal = kpiDebe - kpiHaber;

    // Recalcular antigüedad y rankings desde datos FILTRADOS
    antiguedadData = { '0-30': [], '31-60': [], '61-90': [], '>90': [] };
    antiguedadTotals = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    clientesConSaldo.forEach(c => {
      if (c.saldo_filtrado > 0 && c.dias_sin_cobro !== null) {
        if (c.dias_sin_cobro <= 30) { antiguedadData['0-30'].push(c); antiguedadTotals['0-30'] += c.saldo_filtrado; }
        else if (c.dias_sin_cobro <= 60) { antiguedadData['31-60'].push(c); antiguedadTotals['31-60'] += c.saldo_filtrado; }
        else if (c.dias_sin_cobro <= 90) { antiguedadData['61-90'].push(c); antiguedadTotals['61-90'] += c.saldo_filtrado; }
        else { antiguedadData['>90'].push(c); antiguedadTotals['>90'] += c.saldo_filtrado; }
      }
    });

    // Top 10 Ventas desde datos filtrados
    const topVentas = [...clientesConSaldo].sort((a, b) => b.debe_filtrado - a.debe_filtrado).slice(0, 10);

    // Ordenar clientes
    const { cxcSortField, cxcSortDir } = this.state;
    clientesConSaldo.sort((a, b) => {
      let va = a[cxcSortField] || 0;
      let vb = b[cxcSortField] || 0;
      if (cxcSortField === 'nombre') { va = a.nombre || ''; vb = b.nombre || ''; }
      if (cxcSortField === 'saldo') { va = a.saldo_filtrado; vb = b.saldo_filtrado; }
      if (cxcSortField === 'debe') { va = a.debe_filtrado; vb = b.debe_filtrado; }
      if (cxcSortField === 'haber') { va = a.haber_filtrado; vb = b.haber_filtrado; }
      if (cxcSortField === 'fecha') { va = a.ultima_venta || ''; vb = b.ultima_venta || ''; }
      if (cxcSortField === 'tipo') { va = a.tipo || ''; vb = b.tipo || ''; }
      if (typeof va === 'string') return cxcSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return cxcSortDir === 'asc' ? va - vb : vb - va;
    });

    // Top morosos
    const topMorosos = [...clientesConSaldo].filter(c => c.dias_sin_cobro && c.saldo_filtrado > 0)
      .sort((a, b) => (b.dias_sin_cobro || 0) - (a.dias_sin_cobro || 0)).slice(0, 10);

    // Agrupar detalle por cliente y luego por factura
    const detalleByCliente = {};
    detalleFiltrado.forEach(d => {
      if (!detalleByCliente[d.cliente_codigo]) {
        detalleByCliente[d.cliente_codigo] = { nombre: d.cliente_nombre, facturas: {} };
      }
      const facKey = d.factura || d.asiento || 'SIN_DOC';
      if (!detalleByCliente[d.cliente_codigo].facturas[facKey]) {
        detalleByCliente[d.cliente_codigo].facturas[facKey] = [];
      }
      detalleByCliente[d.cliente_codigo].facturas[facKey].push(d);
    });

    // Indicador de filtros activos
    const hasFilters = cxcSelectedCliente || cxcSelectedAntiguedad || cxcSearchCuenta || cxcSearchCliente || cxcSearchFactura || cxcSearchTipoDoc;
    const filterIndicator = hasFilters ? `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 1rem; padding: 8px 12px; background: #e7f5ff; border-radius: 6px; flex-wrap: wrap;">
        <span style="font-size: 0.8rem; color: #1971c2;"><i class="ri-filter-3-line"></i> Filtros activos:</span>
        ${cxcSelectedCliente ? `<span class="filter-chip" data-clear="cxcSelectedCliente">Cliente: ${clientesConSaldo[0]?.nombre || cxcSelectedCliente} <i class="ri-close-line"></i></span>` : ''}
        ${cxcSelectedAntiguedad ? `<span class="filter-chip" data-clear="cxcSelectedAntiguedad">Antigüedad: ${cxcSelectedAntiguedad} días <i class="ri-close-line"></i></span>` : ''}
        ${cxcSearchCuenta ? `<span class="filter-chip" data-clear="cxcSearchCuenta">Cuenta: ${cxcSearchCuenta} <i class="ri-close-line"></i></span>` : ''}
        ${cxcSearchCliente ? `<span class="filter-chip" data-clear="cxcSearchCliente">Cliente: ${cxcSearchCliente} <i class="ri-close-line"></i></span>` : ''}
        ${cxcSearchFactura ? `<span class="filter-chip" data-clear="cxcSearchFactura">Factura: ${cxcSearchFactura} <i class="ri-close-line"></i></span>` : ''}
        ${cxcSearchTipoDoc ? `<span class="filter-chip" data-clear="cxcSearchTipoDoc">Tipo: ${cxcSearchTipoDoc} <i class="ri-close-line"></i></span>` : ''}
        <button id="clearAllCxcFilters" style="margin-left: auto; padding: 4px 10px; background: #1971c2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">Limpiar todo</button>
      </div>
    ` : '';

    // Obtener tipos de documento únicos
    const tiposDocSet = new Set();
    detalle.forEach(d => { if (d.tipo_doc && d.tipo_doc !== 'None') tiposDocSet.add(d.tipo_doc); });
    const tiposDoc = Array.from(tiposDocSet).sort();

    const container = document.getElementById('app');
    container.innerHTML = `
      ${filterIndicator}

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon icon-primary"><i class="ri-shopping-cart-line"></i></div>
          </div>
          <div class="kpi-label">Ventas (Debe)</div>
          <div class="kpi-value">$${kpiDebe.toLocaleString()}</div>
          <div class="kpi-subtitle" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Cargos a clientes</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon icon-success"><i class="ri-hand-coin-line"></i></div>
          </div>
          <div class="kpi-label">Cobros (Haber)</div>
          <div class="kpi-value">$${kpiHaber.toLocaleString()}</div>
          <div class="kpi-subtitle" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Pagos recibidos</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon ${saldoTotal > 0 ? 'icon-warning' : 'icon-success'}"><i class="ri-wallet-3-line"></i></div>
          </div>
          <div class="kpi-label">Saldo por Cobrar</div>
          <div class="kpi-value" style="color: ${saldoTotal > 0 ? 'var(--warning)' : 'var(--success)'};">$${saldoTotal.toLocaleString()}</div>
          <div class="kpi-subtitle" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${saldoTotal > 0 ? 'Pendiente de cobro' : 'Sin saldo pendiente'}</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon icon-info"><i class="ri-group-line"></i></div>
          </div>
          <div class="kpi-label">Clientes ${hasFilters ? 'Filtrados' : 'Activos'}</div>
          <div class="kpi-value">${clientesConSaldo.length.toLocaleString()}</div>
          <div class="kpi-subtitle" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Con movimiento en período</div>
        </div>
      </div>

      <!-- Rankings y Análisis -->
      <div class="row" style="display: flex; gap: 1.5rem; margin-bottom: 1.5rem;">
        <!-- Top Ventas -->
        <div class="card" style="flex: 1;">
          <h5 style="color: var(--text-heading); margin-bottom: 0.5rem;"><i class="ri-bar-chart-horizontal-line"></i> Top 10 - Mayores Ventas</h5>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;">Haz clic en una barra para filtrar</p>
          <div style="height: 300px;">
            <canvas id="chartTopVentas"></canvas>
          </div>
        </div>

        <!-- Antigüedad de Cartera -->
        <div class="card" style="flex: 1;">
          <h5 style="color: var(--text-heading); margin-bottom: 0.5rem;"><i class="ri-pie-chart-line"></i> Antigüedad de Cartera</h5>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;">Haz clic en una sección para filtrar</p>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="flex: 1; height: 250px;">
              <canvas id="chartAntiguedad"></canvas>
            </div>
            <div style="flex: 1;">
              ${['0-30', '31-60', '61-90', '>90'].map(range => {
      const colors = { '0-30': ['#ebfbee', '#2b8a3e'], '31-60': ['#fff9db', '#e67700'], '61-90': ['#ffe8cc', '#d9480f'], '>90': ['#fff5f5', '#c92a2a'] };
      const isActive = cxcSelectedAntiguedad === range;
      return `
                <div class="antiguedad-chip" data-range="${range}" style="margin-bottom: 8px; padding: 8px; background: ${colors[range][0]}; border-radius: 6px; cursor: pointer; border: 2px solid ${isActive ? colors[range][1] : 'transparent'}; transition: all 0.2s;">
                  <div style="font-size: 0.75rem; color: ${colors[range][1]};">${range} días</div>
                  <div style="font-weight: 600;">$${antiguedadTotals[range].toLocaleString()}</div>
                  <div style="font-size: 0.7rem; color: var(--text-muted);">${antiguedadData[range].length} clientes</div>
                </div>`;
    }).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Info: Cómo se calculan los días -->
      <div style="background: #e7f5ff; border-radius: 8px; padding: 12px 16px; margin-bottom: 1rem; display: flex; align-items: flex-start; gap: 12px;">
        <i class="ri-information-line" style="color: #1971c2; font-size: 1.2rem; margin-top: 2px;"></i>
        <div style="font-size: 0.8rem; color: #1864ab;">
          <strong>¿Cómo se calculan los días?</strong><br>
          <span style="color: #495057;">
            • <strong>Con cobro:</strong> Días entre fecha de factura y fecha del último cobro<br>
            • <strong>Sin cobro:</strong> Días entre fecha de factura y 31-dic-2023 (fecha de corte de datos)
          </span>
        </div>
      </div>

      <!-- Filtros de búsqueda -->
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Cuenta</label>
            <div style="position: relative;">
              <input type="text" id="cxcSearchCuenta" placeholder="Código cuenta... (Enter)" value="${cxcSearchCuenta}" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
              ${cxcSearchCuenta ? `<button class="clear-filter-btn" data-clear="cxcSearchCuenta" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Cliente</label>
            <div style="position: relative;">
              <input type="text" id="cxcSearchCliente" list="clientesList" placeholder="Nombre cliente... (Enter)" value="${cxcSearchCliente}" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
              ${cxcSearchCliente ? `<button class="clear-filter-btn" data-clear="cxcSearchCliente" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
            <datalist id="clientesList">
              ${[...new Set(clientes.map(c => c.nombre))].map(n => `<option value="${n}">`).join('')}
            </datalist>
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Factura/Doc</label>
            <div style="position: relative;">
              <input type="text" id="cxcSearchFactura" placeholder="Número factura... (Enter)" value="${cxcSearchFactura}" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
              ${cxcSearchFactura ? `<button class="clear-filter-btn" data-clear="cxcSearchFactura" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Tipo Documento</label>
            <div style="position: relative;">
              <select id="cxcSearchTipoDoc" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
                <option value="">Todos</option>
                ${tiposDoc.map(t => `<option value="${t}" ${cxcSearchTipoDoc === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
              ${cxcSearchTipoDoc ? `<button class="clear-filter-btn" data-clear="cxcSearchTipoDoc" style="position: absolute; right: 24px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Tabla Jerárquica de Clientes -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h5 style="color: var(--text-heading); margin: 0;"><i class="ri-file-list-3-line"></i> Detalle por Cliente y Factura</h5>
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            Mostrando ${clientesConSaldo.length} clientes
          </div>
        </div>
        <div style="overflow-x: auto;">
          <table id="cxcTable" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="background: var(--bg-light); text-align: left;">
                <th style="padding: 10px; border-bottom: 2px solid var(--border-color); width: 30px;"></th>
                <th class="sortable-th" data-sort="nombre" style="padding: 10px; border-bottom: 2px solid var(--border-color); cursor: pointer;">
                  Documento ${cxcSortField === 'nombre' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="tipo" style="padding: 10px; border-bottom: 2px solid var(--border-color); cursor: pointer;">
                  Tipo ${cxcSortField === 'tipo' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="fecha" style="padding: 10px; border-bottom: 2px solid var(--border-color); cursor: pointer;">
                  Fecha ${cxcSortField === 'fecha' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style="padding: 10px; border-bottom: 2px solid var(--border-color);">Detalle</th>
                <th class="sortable-th" data-sort="debe" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Ventas ${cxcSortField === 'debe' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="haber" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Cobros ${cxcSortField === 'haber' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="saldo" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Saldo ${cxcSortField === 'saldo' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="dias_sin_cobro" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: center; cursor: pointer;" title="Días desde la factura hasta el cobro (o hasta 31-dic-2023 si no hay cobro)">
                  Días <i class="ri-question-line" style="font-size: 0.7rem; color: var(--text-muted);"></i> ${cxcSortField === 'dias_sin_cobro' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody id="cxcTableBody">
              ${clientesConSaldo.slice((this.state.cxcCurrentPage - 1) * this.state.cxcItemsPerPage, this.state.cxcCurrentPage * this.state.cxcItemsPerPage).map(c => {
      const isOpen = this.state.cxcOpenClientes.has(c.codigo);
      const clienteDetalle = detalleByCliente[c.codigo];
      const facturas = clienteDetalle ? Object.entries(clienteDetalle.facturas) : [];

      // Calcular fecha más reciente de las transacciones filtradas
      const allItems = facturas.flatMap(([_, items]) => items);
      const ultimaFechaFiltrada = allItems.length > 0
        ? allItems.map(i => i.fecha).sort().reverse()[0]
        : null;

      // Calcular promedio de días de cobro desde las facturas
      const diasPorFactura = facturas.map(([_, items]) => {
        const ventaItem = items.find(i => i.debe > 0) || items[0];
        const fechaVenta = ventaItem ? new Date(ventaItem.fecha) : null;
        const ultimoCobro = items.filter(i => i.haber > 0).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const fechaRef = ultimoCobro ? new Date(ultimoCobro.fecha) : fechaCorte;
        return fechaVenta ? Math.floor((fechaRef - fechaVenta) / (1000 * 60 * 60 * 24)) : null;
      }).filter(d => d !== null);

      const diasPromedio = diasPorFactura.length > 0
        ? Math.round(diasPorFactura.reduce((a, b) => a + b, 0) / diasPorFactura.length)
        : null;

      return `
                <tr class="cliente-row" data-codigo="${c.codigo}" style="border-bottom: 1px solid var(--border-color); cursor: pointer; background: ${isOpen ? '#e7f5ff' : 'white'}; font-weight: 500;">
                  <td style="padding: 10px; text-align: center;">
                    <i class="ri-arrow-${isOpen ? 'down' : 'right'}-s-line" style="color: var(--primary);"></i>
                  </td>
                  <td style="padding: 10px;" colspan="2">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <i class="ri-user-line" style="color: var(--primary);"></i>
                      <div>
                        <div>${c.nombre}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: normal;">${c.codigo} • ${facturas.length} facturas</div>
                      </div>
                    </div>
                  </td>
                  <td style="padding: 10px; font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">
                    ${ultimaFechaFiltrada || '-'}
                  </td>
                  <td style="padding: 10px; font-size: 0.75rem; color: var(--text-muted); font-weight: normal;"></td>
                  <td style="padding: 10px; text-align: right; color: var(--primary);">$${c.debe_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: right; color: var(--success);">$${c.haber_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: right; color: ${c.saldo_filtrado > 0 ? 'var(--warning)' : 'var(--success)'};">$${c.saldo_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: center;">
                    ${diasPromedio !== null ? `
                      <span style="padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; background: ${diasPromedio > 90 ? '#fff5f5' : diasPromedio > 60 ? '#ffe8cc' : diasPromedio > 30 ? '#fff9db' : '#ebfbee'}; color: ${diasPromedio > 90 ? '#c92a2a' : diasPromedio > 60 ? '#d9480f' : diasPromedio > 30 ? '#e67700' : '#2b8a3e'};">
                        ${diasPromedio}d
                      </span>
                    ` : '-'}
                  </td>
                </tr>
                ${isOpen ? facturas.map(([facKey, items]) => {
        const itemsCxc = items.filter(i => i.es_cxc);
        const facDebe = itemsCxc.reduce((s, i) => s + i.debe, 0);
        const facHaber = itemsCxc.reduce((s, i) => s + i.haber, 0);
        const facSaldo = facDebe - facHaber;
        const isFacOpen = this.state.cxcOpenFacturas.has(`${c.codigo}_${facKey}`);
        // Encontrar el tipo de documento principal (la venta original)
        const ventaItem = itemsCxc.find(i => i.debe > 0) || itemsCxc[0] || items[0];
        const tipoDoc = ventaItem ? ventaItem.tipo_doc : 'N/A';
        const detalleCorto = ventaItem ? ventaItem.detalle.substring(0, 50) + (ventaItem.detalle.length > 50 ? '...' : '') : '';
        // Calcular días desde la fecha de la factura hasta fin de año o último cobro
        const fechaVenta = ventaItem ? new Date(ventaItem.fecha) : null;
        const ultimoCobro = itemsCxc.filter(i => i.haber > 0).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const fechaRef = ultimoCobro ? new Date(ultimoCobro.fecha) : fechaCorte;
        const diasFac = fechaVenta ? Math.floor((fechaRef - fechaVenta) / (1000 * 60 * 60 * 24)) : null;
        return `
                  <tr class="factura-row" data-cliente="${c.codigo}" data-factura="${facKey}" style="background: #f8f9fa; cursor: pointer; border-left: 3px solid ${facSaldo > 0 ? 'var(--warning)' : 'var(--success)'};">
                    <td style="padding: 8px 10px; text-align: center;">
                      <i class="ri-arrow-${isFacOpen ? 'down' : 'right'}-s-line" style="color: var(--text-muted);"></i>
                    </td>
                    <td style="padding: 8px 10px;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <i class="ri-file-text-line" style="color: ${facSaldo > 0 ? 'var(--warning)' : 'var(--success)'};"></i>
                        <span style="font-weight: 500;">${facKey}</span>
                      </div>
                    </td>
                    <td style="padding: 8px 10px;">
                      <span style="background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">${tipoDoc}</span>
                    </td>
                    <td style="padding: 8px 10px; font-size: 0.8rem; color: var(--text-muted);">
                      ${ventaItem ? ventaItem.fecha : '-'}
                    </td>
                    <td style="padding: 8px 10px; font-size: 0.8rem; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ventaItem ? ventaItem.detalle : ''}">
                      ${detalleCorto}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; color: var(--primary);">$${facDebe.toLocaleString()}</td>
                    <td style="padding: 8px 10px; text-align: right; color: var(--success);">$${facHaber.toLocaleString()}</td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: ${facSaldo > 0 ? 'var(--warning)' : 'var(--success)'};">$${facSaldo.toLocaleString()}</td>
                    <td style="padding: 8px 10px; text-align: center;">
                      ${diasFac !== null && facSaldo > 0 ? `
                        <span style="padding: 2px 6px; border-radius: 8px; font-size: 0.7rem; background: ${diasFac > 90 ? '#fff5f5' : diasFac > 60 ? '#ffe8cc' : diasFac > 30 ? '#fff9db' : '#ebfbee'}; color: ${diasFac > 90 ? '#c92a2a' : diasFac > 60 ? '#d9480f' : diasFac > 30 ? '#e67700' : '#2b8a3e'};">
                          ${diasFac}d
                        </span>
                      ` : (facSaldo <= 0 ? '<span style="color: var(--success); font-size: 0.75rem;">✓</span>' : '-')}
                    </td>
                  </tr>
                  ${isFacOpen ? items.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).map(item => `
                  <tr class="detalle-row" style="background: #f1f3f5; font-size: 0.8rem;">
                    <td style="padding: 6px 10px;"></td>
                    <td style="padding: 6px 10px;">
                      ${item.documento && item.documento !== item.factura ? `<span style="font-size: 0.7rem; color: #868e96;">Doc: ${item.documento}</span>` : ''}
                    </td>
                    <td style="padding: 6px 10px;">
                      <span style="background: ${item.debe > 0 ? '#dbe4ff' : '#d3f9d8'}; color: ${item.debe > 0 ? '#364fc7' : '#2b8a3e'}; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">${item.tipo_doc}</span>
                    </td>
                    <td style="padding: 6px 10px; font-size: 0.75rem; color: var(--text-muted);">${item.fecha}</td>
                    <td style="padding: 6px 10px; color: var(--text-muted); font-size: 0.75rem; max-width: 400px; word-wrap: break-word; white-space: normal;">
                      ${item.detalle}
                      ${!item.es_cxc && item.cuenta_nombre ? `<br><span style="color: var(--primary); font-weight: 500;">Contrapartida: ${item.cuenta_nombre}</span>` : ''}
                    </td>
                    <td style="padding: 6px 10px; text-align: right; color: ${item.debe > 0 ? 'var(--primary)' : 'var(--text-muted)'};">${item.debe > 0 ? '$' + item.debe.toLocaleString() : '-'}</td>
                    <td style="padding: 6px 10px; text-align: right; color: ${item.haber > 0 ? 'var(--success)' : 'var(--text-muted)'};">${item.haber > 0 ? '$' + item.haber.toLocaleString() : '-'}</td>
                    <td style="padding: 6px 10px;"></td>
                    <td style="padding: 6px 10px;"></td>
                  </tr>
                  `).join('') : ''}
                  `;
      }).join('') : ''}
                `;
    }).join('')}
            </tbody>
          </table>
          ${(() => {
        const totalPages = Math.ceil(clientesConSaldo.length / this.state.cxcItemsPerPage);
        const currentPage = this.state.cxcCurrentPage;
        const startItem = (currentPage - 1) * this.state.cxcItemsPerPage + 1;
        const endItem = Math.min(currentPage * this.state.cxcItemsPerPage, clientesConSaldo.length);
        if (totalPages <= 1) return '';
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-top: 1px solid var(--border-color); background: var(--bg-light);">
              <span style="font-size: 0.85rem; color: var(--text-muted);">
                Mostrando ${startItem}-${endItem} de ${clientesConSaldo.length} clientes
              </span>
              <div style="display: flex; gap: 4px; align-items: center;">
                <button class="pagination-btn-cxc" data-page="1" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid var(--border-color); background: white; border-radius: 4px; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'}; opacity: ${currentPage === 1 ? '0.5' : '1'};">
                  <i class="ri-skip-back-line"></i>
                </button>
                <button class="pagination-btn-cxc" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid var(--border-color); background: white; border-radius: 4px; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'}; opacity: ${currentPage === 1 ? '0.5' : '1'};">
                  <i class="ri-arrow-left-s-line"></i>
                </button>
                <span style="padding: 6px 12px; font-size: 0.85rem;">Página ${currentPage} de ${totalPages}</span>
                <button class="pagination-btn-cxc" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid var(--border-color); background: white; border-radius: 4px; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'}; opacity: ${currentPage === totalPages ? '0.5' : '1'};">
                  <i class="ri-arrow-right-s-line"></i>
                </button>
                <button class="pagination-btn-cxc" data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid var(--border-color); background: white; border-radius: 4px; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'}; opacity: ${currentPage === totalPages ? '0.5' : '1'};">
                  <i class="ri-skip-forward-line"></i>
                </button>
              </div>
            </div>
            `;
      })()}
        </div>
      </div>

      <!-- Clientes Morosos -->
      ${topMorosos.length > 0 && !hasFilters ? `
      <div class="card" style="border-left: 4px solid var(--danger);">
        <h5 style="color: var(--text-heading); margin-bottom: 1rem;"><i class="ri-alarm-warning-line" style="color: var(--danger);"></i> Alertas: Clientes con Mayor Demora</h5>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px;">
          ${topMorosos.slice(0, 6).map(c => `
            <div class="moroso-card" data-codigo="${c.codigo}" style="padding: 12px; background: #fff5f5; border-radius: 8px; border-left: 3px solid #ff6b6b; cursor: pointer; transition: transform 0.2s;">
              <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px;">${c.nombre}</div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
                <span>Saldo: <strong style="color: var(--danger);">$${c.saldo_filtrado.toLocaleString()}</strong></span>
                <span><strong style="color: #c92a2a;">${c.dias_sin_cobro} días</strong> sin cobro</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                Último cobro: ${c.ultimo_cobro || 'Sin registro'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    `;

    // Bind events
    this.bindCXCEvents(topVentas, antiguedadTotals);
  },

  bindCXCEvents(topVentas, antiguedadTotals) {
    const self = this;

    // Search inputs - trigger on Enter key only
    ['cxcSearchCuenta', 'cxcSearchCliente', 'cxcSearchFactura'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            self.state[id] = e.target.value;
            self.renderCXC();
          }
        };
        // Also trigger when selecting from datalist (for cliente autocomplete)
        input.onchange = (e) => {
          if (id === 'cxcSearchCliente' && e.target.value) {
            self.state[id] = e.target.value;
            self.renderCXC();
          }
        };
      }
    });

    // Tipo doc select
    const tipoDocSelect = document.getElementById('cxcSearchTipoDoc');
    if (tipoDocSelect) {
      tipoDocSelect.onchange = (e) => {
        self.state.cxcSearchTipoDoc = e.target.value;
        self.renderCXC();
      };
    }

    // Clear filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.onclick = () => {
        const clearKey = chip.dataset.clear;
        if (clearKey) {
          self.state[clearKey] = clearKey.includes('Search') ? '' : null;
          self.renderCXC();
        }
      };
    });

    // Clear filter buttons (X buttons on inputs)
    document.querySelectorAll('.clear-filter-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const clearKey = btn.dataset.clear;
        if (clearKey) {
          self.state[clearKey] = '';
          self.renderCXC();
        }
      };
    });

    // Clear all filters button
    const clearAllBtn = document.getElementById('clearAllCxcFilters');
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        self.state.cxcSelectedCliente = null;
        self.state.cxcSelectedAntiguedad = null;
        self.state.cxcSearchCuenta = '';
        self.state.cxcSearchCliente = '';
        self.state.cxcSearchFactura = '';
        self.state.cxcSearchTipoDoc = '';
        self.state.cxcCurrentPage = 1; // Reset paginación
        self.renderCXC();
      };
    }

    // Sortable columns
    document.querySelectorAll('.sortable-th').forEach(th => {
      th.onclick = () => {
        const field = th.dataset.sort;
        if (self.state.cxcSortField === field) {
          self.state.cxcSortDir = self.state.cxcSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          self.state.cxcSortField = field;
          self.state.cxcSortDir = 'desc';
        }
        self.renderCXC();
      };
    });

    // Antigüedad chips
    document.querySelectorAll('.antiguedad-chip').forEach(chip => {
      chip.onclick = () => {
        const range = chip.dataset.range;
        self.state.cxcSelectedAntiguedad = self.state.cxcSelectedAntiguedad === range ? null : range;
        self.renderCXC();
      };
    });

    // Cliente rows (expand/collapse)
    document.querySelectorAll('.cliente-row').forEach(row => {
      row.onclick = () => {
        const codigo = row.dataset.codigo;
        if (self.state.cxcOpenClientes.has(codigo)) {
          self.state.cxcOpenClientes.delete(codigo);
        } else {
          self.state.cxcOpenClientes.add(codigo);
        }
        self.renderCXC();
      };
    });

    // Factura rows (expand/collapse)
    document.querySelectorAll('.factura-row').forEach(row => {
      row.onclick = (e) => {
        e.stopPropagation();
        const cliente = row.dataset.cliente;
        const factura = row.dataset.factura;
        const key = `${cliente}_${factura}`;
        if (self.state.cxcOpenFacturas.has(key)) {
          self.state.cxcOpenFacturas.delete(key);
        } else {
          self.state.cxcOpenFacturas.add(key);
        }
        self.renderCXC();
      };
    });

    // Pagination buttons
    document.querySelectorAll('.pagination-btn-cxc').forEach(btn => {
      btn.onclick = () => {
        if (btn.disabled) return;
        const page = parseInt(btn.dataset.page);
        if (page && page !== self.state.cxcCurrentPage) {
          self.state.cxcCurrentPage = page;
          self.state.cxcOpenClientes.clear(); // Cerrar clientes expandidos al cambiar página
          self.state.cxcOpenFacturas.clear();
          self.renderCXC();
        }
      };
    });

    // Moroso cards click
    document.querySelectorAll('.moroso-card').forEach(card => {
      card.onclick = () => {
        self.state.cxcSelectedCliente = card.dataset.codigo;
        self.state.cxcOpenClientes.add(card.dataset.codigo);
        self.state.cxcCurrentPage = 1; // Reset a página 1 cuando se selecciona cliente
        self.renderCXC();
      };
    });

    // Render charts with click handlers
    this.renderCXCCharts(topVentas, antiguedadTotals);
  },

  renderCXCCharts(topVentas, antiguedadTotals) {
    const self = this;

    // Gráfico de Top Ventas
    const ctxVentas = document.getElementById('chartTopVentas');
    if (ctxVentas) {
      const chart = new Chart(ctxVentas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: topVentas.map(c => c.nombre.length > 20 ? c.nombre.substring(0, 18) + '...' : c.nombre),
          datasets: [{
            label: 'Ventas',
            data: topVentas.map(c => c.debe_filtrado),
            backgroundColor: topVentas.map(c => c.codigo === self.state.cxcSelectedCliente ? '#4338ca' : '#696cff'),
            borderRadius: 4,
            barThickness: 12
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const idx = elements[0].index;
              const cliente = topVentas[idx];
              self.state.cxcSelectedCliente = self.state.cxcSelectedCliente === cliente.codigo ? null : cliente.codigo;
              if (self.state.cxcSelectedCliente) self.state.cxcOpenClientes.add(cliente.codigo);
              self.renderCXC();
            }
          },
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'K' } },
            y: { grid: { display: false }, ticks: { font: { size: 10 } } }
          }
        }
      });
    }

    // Gráfico de Antigüedad
    const ctxAntiguedad = document.getElementById('chartAntiguedad');
    if (ctxAntiguedad) {
      const labels = ['0-30', '31-60', '61-90', '>90'];
      const colors = ['#51cf66', '#fcc419', '#ff922b', '#ff6b6b'];
      new Chart(ctxAntiguedad.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: labels.map(l => l + ' días'),
          datasets: [{
            data: labels.map(l => antiguedadTotals[l]),
            backgroundColor: colors,
            borderWidth: self.state.cxcSelectedAntiguedad ? labels.map((l, i) => l === self.state.cxcSelectedAntiguedad ? 4 : 0) : 0,
            borderColor: '#4338ca'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const idx = elements[0].index;
              const range = labels[idx];
              self.state.cxcSelectedAntiguedad = self.state.cxcSelectedAntiguedad === range ? null : range;
              self.renderCXC();
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  },

  // =============================================
  // CXP - CUENTAS POR PAGAR (Proveedores)
  // =============================================
  async renderCXP() {
    const cxpData = this.state.data.cxp;
    if (!cxpData || !cxpData.proveedores) {
      document.getElementById('app').innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <i class="ri-error-warning-line" style="font-size: 3rem; color: var(--warning);"></i>
          <h4 style="margin-top: 1rem;">No hay datos de Cuentas por Pagar</h4>
          <p style="color: var(--text-muted);">Verifique que el archivo de datos incluya información de CXP.</p>
        </div>
      `;
      return;
    }

    const years = this.state.selectedYears;
    const proveedores = cxpData.proveedores;
    const resumenAnual = cxpData.resumen_anual;

    // Cargar detalle del año seleccionado dinámicamente
    if (!dataService.areCXPYearsLoaded(years)) {
      this.showLoading();
    }
    const detalle = await dataService.loadCXPYears(years);
    this.hideLoading();

    // Filtrar proveedores por años seleccionados
    let proveedoresFiltrados = proveedores.filter(p => {
      if (!p.anios_activos) return true;
      return p.anios_activos.some(a => years.includes(String(a)));
    });

    // Calcular totales de los años seleccionados
    let totalCompras = 0, totalPagos = 0;
    years.forEach(y => {
      if (resumenAnual[y]) {
        totalCompras += resumenAnual[y].total_compras;
        totalPagos += resumenAnual[y].total_pagos;
      }
    });

    // Fecha de corte basada en el año máximo seleccionado
    const maxYear = Math.max(...years);
    const fechaCorte = new Date(maxYear, 11, 31);

    // Recalcular saldos de proveedores para los años seleccionados
    let proveedoresConSaldo = proveedoresFiltrados.map(p => {
      let compras = 0, pagos = 0;
      years.forEach(y => {
        if (p.por_anio && p.por_anio[y]) {
          compras += p.por_anio[y].compras;
          pagos += p.por_anio[y].pagos;
        }
      });
      return { ...p, saldo_filtrado: compras - pagos, compras_filtrado: compras, pagos_filtrado: pagos };
    }).filter(p => p.compras_filtrado > 0 || p.pagos_filtrado > 0 || p.saldo_filtrado !== 0);

    // Análisis de antigüedad inicial (para filtros de selección)
    let antiguedadData = { '0-30': [], '31-60': [], '61-90': [], '>90': [] };
    let antiguedadTotals = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    proveedoresConSaldo.forEach(p => {
      if (p.saldo_filtrado > 0 && p.dias_sin_pago !== null) {
        if (p.dias_sin_pago <= 30) { antiguedadData['0-30'].push(p); antiguedadTotals['0-30'] += p.saldo_filtrado; }
        else if (p.dias_sin_pago <= 60) { antiguedadData['31-60'].push(p); antiguedadTotals['31-60'] += p.saldo_filtrado; }
        else if (p.dias_sin_pago <= 90) { antiguedadData['61-90'].push(p); antiguedadTotals['61-90'] += p.saldo_filtrado; }
        else { antiguedadData['>90'].push(p); antiguedadTotals['>90'] += p.saldo_filtrado; }
      }
    });

    // ========== APLICAR FILTROS ==========
    const { cxpSelectedProveedor, cxpSelectedAntiguedad, cxpSearchCuenta, cxpSearchProveedor, cxpSearchFactura, cxpSearchAsiento, cxpSearchTipoDoc } = this.state;

    // Filtrar por proveedor seleccionado (del gráfico Top 10)
    if (cxpSelectedProveedor) {
      proveedoresConSaldo = proveedoresConSaldo.filter(p => p.codigo === cxpSelectedProveedor);
    }

    // Filtrar por antigüedad seleccionada
    if (cxpSelectedAntiguedad && antiguedadData[cxpSelectedAntiguedad]) {
      const codigosAntiguedad = antiguedadData[cxpSelectedAntiguedad].map(p => p.codigo);
      proveedoresConSaldo = proveedoresConSaldo.filter(p => codigosAntiguedad.includes(p.codigo));
    }

    // Filtrar detalle por años
    let detalleFiltrado = detalle.filter(d => years.includes(d.anio));

    // Filtrar por búsquedas
    if (cxpSearchCuenta) {
      const searchLower = cxpSearchCuenta.toLowerCase();
      detalleFiltrado = detalleFiltrado.filter(d => d.proveedor_codigo.toLowerCase().includes(searchLower));
      const proveedoresEnDetalle = new Set(detalleFiltrado.map(d => d.proveedor_codigo));
      proveedoresConSaldo = proveedoresConSaldo.filter(p => proveedoresEnDetalle.has(p.codigo));
    }
    if (cxpSearchProveedor) {
      const searchLower = cxpSearchProveedor.toLowerCase();
      detalleFiltrado = detalleFiltrado.filter(d => d.proveedor_nombre.toLowerCase().includes(searchLower));
      const proveedoresEnDetalle = new Set(detalleFiltrado.map(d => d.proveedor_codigo));
      proveedoresConSaldo = proveedoresConSaldo.filter(p => proveedoresEnDetalle.has(p.codigo));
      // Agregar proveedores de detalle que no estén en lista
      proveedoresEnDetalle.forEach(codigo => {
        if (!proveedoresConSaldo.find(p => p.codigo === codigo)) {
          const transacciones = detalleFiltrado.filter(d => d.proveedor_codigo === codigo);
          if (transacciones.length > 0) {
            const nombre = transacciones[0].proveedor_nombre;
            const compras = transacciones.reduce((s, t) => s + (t.compra || 0), 0);
            const pagos = transacciones.reduce((s, t) => s + (t.pago || 0), 0);
            const fechasCompra = transacciones.filter(t => t.compra > 0).map(t => t.fecha).sort();
            const ultimaCompra = fechasCompra.length > 0 ? fechasCompra[fechasCompra.length - 1] : null;
            const fechasPago = transacciones.filter(t => t.pago > 0).map(t => t.fecha).sort();
            const ultimoPago = fechasPago.length > 0 ? fechasPago[fechasPago.length - 1] : null;
            const diasSinPago = ultimaCompra && !ultimoPago ? Math.floor((fechaCorte - new Date(ultimaCompra)) / (1000 * 60 * 60 * 24)) :
              ultimaCompra && ultimoPago ? Math.floor((new Date(ultimoPago) - new Date(ultimaCompra)) / (1000 * 60 * 60 * 24)) : null;
            proveedoresConSaldo.push({
              codigo, nombre,
              compras_filtrado: compras, pagos_filtrado: pagos, saldo_filtrado: compras - pagos,
              ultima_compra: ultimaCompra, ultimo_pago: ultimoPago, dias_sin_pago: diasSinPago
            });
          }
        }
      });
    }
    if (cxpSearchFactura) {
      const searchLower = cxpSearchFactura.toLowerCase().trim();
      // Búsqueda EXACTA de factura (no parcial)
      detalleFiltrado = detalleFiltrado.filter(d =>
        (d.factura && d.factura.toLowerCase() === searchLower)
      );
      const proveedoresConFactura = new Set(detalleFiltrado.map(d => d.proveedor_codigo));
      proveedoresConSaldo = proveedoresConSaldo.filter(p => proveedoresConFactura.has(p.codigo));
    }
    if (cxpSearchAsiento) {
      const searchLower = cxpSearchAsiento.toLowerCase().trim();
      detalleFiltrado = detalleFiltrado.filter(d =>
        d.asiento && String(d.asiento).toLowerCase().includes(searchLower)
      );
      const proveedoresConAsiento = new Set(detalleFiltrado.map(d => d.proveedor_codigo));
      proveedoresConSaldo = proveedoresConSaldo.filter(p => proveedoresConAsiento.has(p.codigo));
    }
    if (cxpSearchTipoDoc) {
      const searchLower = cxpSearchTipoDoc.toLowerCase();
      detalleFiltrado = detalleFiltrado.filter(d => d.tipo_doc && d.tipo_doc.toLowerCase().includes(searchLower));
      const proveedoresConTipo = new Set(detalleFiltrado.map(d => d.proveedor_codigo));
      proveedoresConSaldo = proveedoresConSaldo.filter(p => proveedoresConTipo.has(p.codigo));
    }

    // Recalcular totales de proveedores basado en detalle filtrado (para que los totales de la fila naranja coincidan con lo filtrado)
    if (cxpSearchCuenta || cxpSearchProveedor || cxpSearchFactura || cxpSearchTipoDoc || cxpSearchAsiento || cxpSelectedProveedor || cxpSelectedAntiguedad) {
      // Recalcular totales de cada proveedor basado SOLO en el detalle filtrado y solo en cuentas CXP
      proveedoresConSaldo = proveedoresConSaldo.map(p => {
        const provDetalle = detalleFiltrado.filter(d => d.proveedor_codigo === p.codigo);
        const itemsCxp = provDetalle.filter(d => d.es_cxp);
        const compras = itemsCxp.reduce((s, d) => s + (d.compra || 0), 0);
        const pagos = itemsCxp.reduce((s, d) => s + (d.pago || 0), 0);
        return { ...p, compras_filtrado: compras, pagos_filtrado: pagos, saldo_filtrado: compras - pagos };
      }).filter(p => p.compras_filtrado !== 0 || p.pagos_filtrado !== 0);
    }

    // Recalcular KPIs después de filtros
    let kpiCompras = 0, kpiPagos = 0;
    if (cxpSelectedProveedor || cxpSelectedAntiguedad || cxpSearchCuenta || cxpSearchProveedor || cxpSearchFactura || cxpSearchAsiento || cxpSearchTipoDoc) {
      proveedoresConSaldo.forEach(p => { kpiCompras += p.compras_filtrado; kpiPagos += p.pagos_filtrado; });
    } else {
      kpiCompras = totalCompras; kpiPagos = totalPagos;
    }
    const saldoTotal = kpiCompras - kpiPagos;

    // Recalcular antigüedad y rankings desde datos FILTRADOS
    antiguedadData = { '0-30': [], '31-60': [], '61-90': [], '>90': [] };
    antiguedadTotals = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    proveedoresConSaldo.forEach(p => {
      if (p.saldo_filtrado > 0 && p.dias_sin_pago !== null) {
        if (p.dias_sin_pago <= 30) { antiguedadData['0-30'].push(p); antiguedadTotals['0-30'] += p.saldo_filtrado; }
        else if (p.dias_sin_pago <= 60) { antiguedadData['31-60'].push(p); antiguedadTotals['31-60'] += p.saldo_filtrado; }
        else if (p.dias_sin_pago <= 90) { antiguedadData['61-90'].push(p); antiguedadTotals['61-90'] += p.saldo_filtrado; }
        else { antiguedadData['>90'].push(p); antiguedadTotals['>90'] += p.saldo_filtrado; }
      }
    });

    // Top 10 Compras desde datos filtrados
    const topCompras = [...proveedoresConSaldo].sort((a, b) => b.compras_filtrado - a.compras_filtrado).slice(0, 10);

    // Ordenar proveedores
    const { cxpSortField, cxpSortDir } = this.state;
    proveedoresConSaldo.sort((a, b) => {
      let valA = a[cxpSortField] || a[cxpSortField + '_filtrado'] || 0;
      let valB = b[cxpSortField] || b[cxpSortField + '_filtrado'] || 0;
      if (cxpSortField === 'nombre') {
        valA = a.nombre.toLowerCase();
        valB = b.nombre.toLowerCase();
        return cxpSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (cxpSortField === 'fecha') {
        valA = a.ultima_compra || '';
        valB = b.ultima_compra || '';
        return cxpSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (cxpSortField === 'tipo') {
        valA = a.tipo || '';
        valB = b.tipo || '';
        return cxpSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return cxpSortDir === 'asc' ? valA - valB : valB - valA;
    });

    // Top morosos (proveedores con más días sin pago)
    const topMorosos = [...proveedoresConSaldo]
      .filter(p => p.saldo_filtrado > 0 && p.dias_sin_pago !== null)
      .sort((a, b) => (b.dias_sin_pago || 0) - (a.dias_sin_pago || 0)).slice(0, 10);

    // Top 5 proveedores con pago más rápido (menos días para pagar, ya pagados)
    const topPagoRapido = [...proveedoresConSaldo]
      .filter(p => p.dias_sin_pago !== null && p.dias_sin_pago >= 0 && p.pagos_filtrado > 0)
      .sort((a, b) => (a.dias_sin_pago || 999) - (b.dias_sin_pago || 999)).slice(0, 5);

    // Agrupar detalle por proveedor y luego por ASIENTO (no factura)
    const detalleByProveedor = {};
    detalleFiltrado.forEach(d => {
      if (!detalleByProveedor[d.proveedor_codigo]) {
        detalleByProveedor[d.proveedor_codigo] = { nombre: d.proveedor_nombre, asientos: {} };
      }
      const asientoKey = d.asiento || 'SIN_ASIENTO';
      if (!detalleByProveedor[d.proveedor_codigo].asientos[asientoKey]) {
        detalleByProveedor[d.proveedor_codigo].asientos[asientoKey] = [];
      }
      detalleByProveedor[d.proveedor_codigo].asientos[asientoKey].push(d);
    });

    // Indicador de filtros activos
    const hasFilters = cxpSelectedProveedor || cxpSelectedAntiguedad || cxpSearchCuenta || cxpSearchProveedor || cxpSearchFactura || cxpSearchAsiento || cxpSearchTipoDoc;
    const filterIndicator = hasFilters ? `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 1rem; padding: 8px 12px; background: #e7f5ff; border-radius: 6px; flex-wrap: wrap;">
        <span style="font-size: 0.8rem; color: #1971c2;"><i class="ri-filter-3-line"></i> Filtros activos:</span>
        ${cxpSelectedProveedor ? `<span class="filter-chip" data-clear="cxpSelectedProveedor">Proveedor: ${proveedoresConSaldo[0]?.nombre || cxpSelectedProveedor} <i class="ri-close-line"></i></span>` : ''}
        ${cxpSelectedAntiguedad ? `<span class="filter-chip" data-clear="cxpSelectedAntiguedad">Antigüedad: ${cxpSelectedAntiguedad} días <i class="ri-close-line"></i></span>` : ''}
        ${cxpSearchCuenta ? `<span class="filter-chip" data-clear="cxpSearchCuenta">Cuenta: ${cxpSearchCuenta} <i class="ri-close-line"></i></span>` : ''}
        ${cxpSearchProveedor ? `<span class="filter-chip" data-clear="cxpSearchProveedor">Proveedor: ${cxpSearchProveedor} <i class="ri-close-line"></i></span>` : ''}
        ${cxpSearchFactura ? `<span class="filter-chip" data-clear="cxpSearchFactura">Factura: ${cxpSearchFactura} <i class="ri-close-line"></i></span>` : ''}
        ${cxpSearchAsiento ? `<span class="filter-chip" data-clear="cxpSearchAsiento">Asiento: ${cxpSearchAsiento} <i class="ri-close-line"></i></span>` : ''}
        ${cxpSearchTipoDoc ? `<span class="filter-chip" data-clear="cxpSearchTipoDoc">Tipo: ${cxpSearchTipoDoc} <i class="ri-close-line"></i></span>` : ''}
        <button id="clearAllCxpFilters" style="margin-left: auto; padding: 4px 10px; background: #1971c2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">Limpiar todo</button>
      </div>
    ` : '';

    // Tipos de documento únicos
    const tiposDoc = [...new Set(detalleFiltrado.map(d => d.tipo_doc).filter(Boolean))].sort();

    document.getElementById('app').innerHTML = `
      ${filterIndicator}

      <!-- KPIs -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="card" style="text-align: center; border-left: 4px solid var(--primary);">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">Total Compras</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">$${kpiCompras.toLocaleString()}</div>
        </div>
        <div class="card" style="text-align: center; border-left: 4px solid var(--success);">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">Total Pagos</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--success);">$${kpiPagos.toLocaleString()}</div>
        </div>
        <div class="card" style="text-align: center; border-left: 4px solid ${saldoTotal > 0 ? 'var(--danger)' : 'var(--success)'};">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">Saldo Pendiente</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: ${saldoTotal > 0 ? 'var(--danger)' : 'var(--success)'};">$${saldoTotal.toLocaleString()}</div>
        </div>
        <div class="card" style="text-align: center; border-left: 4px solid var(--warning);">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">Proveedores Activos</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--warning);">${proveedoresConSaldo.length}</div>
        </div>
      </div>

      <!-- Gráficos -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="card">
          <h5 style="color: var(--text-heading); margin-bottom: 1rem;"><i class="ri-bar-chart-horizontal-line"></i> Top 10 Compras</h5>
          <div style="height: 300px;"><canvas id="chartTopCompras"></canvas></div>
        </div>
        <div class="card">
          <h5 style="color: var(--text-heading); margin-bottom: 1rem;"><i class="ri-pie-chart-line"></i> Antigüedad de Deuda</h5>
          <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
            ${['0-30', '31-60', '61-90', '>90'].map(range => `
              <div class="antiguedad-chip" data-range="${range}" style="flex: 1; min-width: 80px; padding: 8px; text-align: center; border-radius: 8px; cursor: pointer; background: ${this.state.cxpSelectedAntiguedad === range ? '#1971c2' : '#f1f3f5'}; color: ${this.state.cxpSelectedAntiguedad === range ? 'white' : 'var(--text-body)'}; transition: all 0.2s;">
                <div style="font-size: 0.7rem; opacity: 0.8;">${range} días</div>
                <div style="font-weight: 600;">$${(antiguedadTotals[range] / 1000).toFixed(0)}K</div>
              </div>
            `).join('')}
          </div>
          <div style="height: 200px;"><canvas id="chartAntiguedadCXP"></canvas></div>
        </div>
      </div>

      <!-- Info: Cómo se calculan los días -->
      <div style="background: #fff4e6; border-radius: 8px; padding: 12px 16px; margin-bottom: 1rem; display: flex; align-items: flex-start; gap: 12px;">
        <i class="ri-information-line" style="color: #e67700; font-size: 1.2rem; margin-top: 2px;"></i>
        <div style="font-size: 0.8rem; color: #d9480f;">
          <strong>¿Cómo se calculan los días?</strong><br>
          <span style="color: #495057;">
            • <strong>Con pago:</strong> Días entre fecha de compra/factura y fecha del último pago<br>
            • <strong>Sin pago:</strong> Días entre fecha de compra/factura y 31-dic-2023 (fecha de corte de datos)
          </span>
        </div>
      </div>

      <!-- Filtros de búsqueda -->
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Cuenta</label>
            <div style="position: relative;">
              <input type="text" id="cxpSearchCuenta" placeholder="Código cuenta... (Enter)" value="${cxpSearchCuenta}" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
              ${cxpSearchCuenta ? `<button class="clear-filter-btn-cxp" data-clear="cxpSearchCuenta" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Proveedor</label>
            <div style="position: relative;">
              <input type="text" id="cxpSearchProveedor" list="proveedoresList" placeholder="Nombre proveedor... (Enter)" value="${cxpSearchProveedor}" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
              ${cxpSearchProveedor ? `<button class="clear-filter-btn-cxp" data-clear="cxpSearchProveedor" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
            <datalist id="proveedoresList">
              ${[...new Set(proveedores.map(p => p.nombre))].map(n => `<option value="${n}">`).join('')}
            </datalist>
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Factura</label>
            <div style="position: relative;">
              <input type="text" id="cxpSearchFactura" placeholder="Número factura... (Enter)" value="${cxpSearchFactura}" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
              ${cxpSearchFactura ? `<button class="clear-filter-btn-cxp" data-clear="cxpSearchFactura" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Asiento</label>
            <div style="position: relative;">
              <input type="text" id="cxpSearchAsiento" list="asientosList" placeholder="Número asiento... (Enter)" value="${cxpSearchAsiento}" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
              ${cxpSearchAsiento ? `<button class="clear-filter-btn-cxp" data-clear="cxpSearchAsiento" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
            <datalist id="asientosList">
              ${[...new Set(detalle.map(d => d.asiento).filter(Boolean))].slice(0, 500).map(a => `<option value="${a}">`).join('')}
            </datalist>
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Tipo Documento</label>
            <div style="position: relative;">
              <select id="cxpSearchTipoDoc" style="width: 100%; padding: 8px; padding-right: 28px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
                <option value="">Todos</option>
                ${tiposDoc.map(t => `<option value="${t}" ${cxpSearchTipoDoc === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
              ${cxpSearchTipoDoc ? `<button class="clear-filter-btn-cxp" data-clear="cxpSearchTipoDoc" style="position: absolute; right: 24px; top: 50%; transform: translateY(-50%); background: #dee2e6; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 12px; line-height: 1; color: #495057;">×</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Tabla Jerárquica de Proveedores -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h5 style="color: var(--text-heading); margin: 0;"><i class="ri-file-list-3-line"></i> Detalle por Proveedor y Factura</h5>
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            Mostrando ${proveedoresConSaldo.length} proveedores
          </div>
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 10px; border-bottom: 2px solid var(--border-color); width: 30px;"></th>
                <th class="sortable-th-cxp" data-sort="nombre" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: left; cursor: pointer;">
                  Documento ${cxpSortField === 'nombre' ? (cxpSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th-cxp" data-sort="tipo" style="padding: 10px; border-bottom: 2px solid var(--border-color); cursor: pointer;">
                  Tipo ${cxpSortField === 'tipo' ? (cxpSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th-cxp" data-sort="fecha" style="padding: 10px; border-bottom: 2px solid var(--border-color); cursor: pointer;">
                  Fecha ${cxpSortField === 'fecha' ? (cxpSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style="padding: 10px; border-bottom: 2px solid var(--border-color);">Detalle</th>
                <th class="sortable-th-cxp" data-sort="compras" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Compras ${cxpSortField === 'compras' ? (cxpSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th-cxp" data-sort="pagos" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Pagos ${cxpSortField === 'pagos' ? (cxpSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th-cxp" data-sort="saldo" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Saldo ${cxpSortField === 'saldo' ? (cxpSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th-cxp" data-sort="dias_sin_pago" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: center; cursor: pointer;" title="Días desde la compra/factura hasta el pago (o hasta 31-dic-2023 si no hay pago)">
                  Días <i class="ri-question-line" style="font-size: 0.7rem; color: var(--text-muted);"></i> ${cxpSortField === 'dias_sin_pago' ? (cxpSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody id="cxpTableBody">
              ${proveedoresConSaldo.slice((this.state.cxpCurrentPage - 1) * this.state.cxpItemsPerPage, this.state.cxpCurrentPage * this.state.cxpItemsPerPage).map(p => {
      const isOpen = this.state.cxpOpenProveedores.has(p.codigo);
      const proveedorDetalle = detalleByProveedor[p.codigo];
      const asientos = proveedorDetalle ? Object.entries(proveedorDetalle.asientos) : [];

      // Calcular fecha más reciente de las transacciones filtradas (solo CXP)
      const allItemsCxp = asientos.flatMap(([_, items]) => items.filter(i => i.es_cxp === true));
      const ultimaFechaFiltrada = allItemsCxp.length > 0
        ? allItemsCxp.map(i => i.fecha).sort().reverse()[0]
        : null;

      // Función auxiliar para calcular días (usada para el promedio y para las filas)
      const calcularDiasAsiento = (items) => {
        const itemsCxp = items.filter(i => i.es_cxp === true);
        const compraItem = itemsCxp.find(i => i.compra > 0) || itemsCxp[0];
        if (!compraItem) return null;

        const fechaCompra = new Date(compraItem.fecha);
        const asientoCompras = itemsCxp.reduce((s, i) => s + (i.compra || 0), 0);
        const asientoPagos = itemsCxp.reduce((s, i) => s + (i.pago || 0), 0);
        const asientoSaldo = asientoCompras - asientoPagos;

        // Si el saldo es > 0.01 (pendiente), contamos hasta el final (fechaCorte)
        // Si está pagado (saldo <= 0.01), usamos la fecha del último pago real
        if (asientoSaldo > 0.01) {
          return Math.floor((fechaCorte - fechaCompra) / (1000 * 60 * 60 * 24));
        } else {
          const ultimoPago = itemsCxp.filter(i => i.pago > 0).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
          const fechaRef = ultimoPago ? new Date(ultimoPago.fecha) : fechaCompra;
          return Math.floor((fechaRef - fechaCompra) / (1000 * 60 * 60 * 24));
        }
      };

      // Mapear días por asiento para el promedio
      const diasPorAsiento = asientos.map(([_, items]) => calcularDiasAsiento(items)).filter(d => d !== null);
      const diasPromedio = diasPorAsiento.length > 0
        ? Math.round(diasPorAsiento.reduce((a, b) => a + b, 0) / diasPorAsiento.length)
        : null;

      return `
                <tr class="proveedor-row" data-codigo="${p.codigo}" style="border-bottom: 1px solid var(--border-color); cursor: pointer; background: ${isOpen ? '#fff3e0' : 'white'}; font-weight: 500;">
                  <td style="padding: 10px; text-align: center;">
                    <i class="ri-arrow-${isOpen ? 'down' : 'right'}-s-line" style="color: var(--warning);"></i>
                  </td>
                  <td style="padding: 10px;" colspan="2">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <i class="ri-store-2-line" style="color: var(--warning);"></i>
                      <div>
                        <div>${p.nombre}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: normal;">${p.codigo} • ${asientos.length} asientos</div>
                      </div>
                    </div>
                  </td>
                  <td style="padding: 10px; font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">
                    ${ultimaFechaFiltrada || '-'}
                  </td>
                  <td style="padding: 10px; font-size: 0.75rem; color: var(--text-muted); font-weight: normal;"></td>
                  <td style="padding: 10px; text-align: right; color: var(--primary);">$${p.compras_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: right; color: var(--success);">$${p.pagos_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: right; color: ${p.saldo_filtrado > 0 ? 'var(--danger)' : 'var(--success)'};">$${p.saldo_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: center;">
                    ${diasPromedio !== null ? `
                      <span style="padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; background: ${diasPromedio > 90 ? '#fff5f5' : diasPromedio > 60 ? '#ffe8cc' : diasPromedio > 30 ? '#fff9db' : '#ebfbee'}; color: ${diasPromedio > 90 ? '#c92a2a' : diasPromedio > 60 ? '#d9480f' : diasPromedio > 30 ? '#e67700' : '#2b8a3e'};">
                        ${diasPromedio}d
                      </span>
                    ` : '-'}
                  </td>
                </tr>
                ${isOpen ? asientos.map(([asientoKey, items]) => {
        // Solo sumar cuentas ES_CXP para los totales
        const itemsCxp = items.filter(i => i.es_cxp === true);
        const asientoCompras = itemsCxp.reduce((s, i) => s + (i.compra || 0), 0);
        const asientoPagos = itemsCxp.reduce((s, i) => s + (i.pago || 0), 0);
        const asientoSaldo = asientoCompras - asientoPagos;
        const isAsientoOpen = this.state.cxpOpenFacturas.has(`${p.codigo}_${asientoKey}`);

        const compraItem = itemsCxp.find(i => i.compra > 0) || itemsCxp[0] || items[0];
        const tipoDoc = compraItem ? compraItem.tipo_doc : 'N/A';
        const factura = items.map(i => i.factura).find(f => f) || '';
        const diasAsiento = calcularDiasAsiento(items);
        const numCuentas = new Set(items.map(i => i.cuenta)).size;
        return `
                  <tr class="factura-row-cxp" data-proveedor="${p.codigo}" data-factura="${asientoKey}" style="background: #fff8f0; cursor: pointer; border-left: 3px solid ${asientoSaldo > 0 ? 'var(--danger)' : 'var(--success)'};">
                    <td style="padding: 8px 10px; text-align: center;">
                      <i class="ri-arrow-${isAsientoOpen ? 'down' : 'right'}-s-line" style="color: var(--text-muted);"></i>
                    </td>
                    <td style="padding: 8px 10px;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <i class="ri-book-2-line" style="color: ${asientoSaldo > 0 ? 'var(--danger)' : 'var(--success)'};"></i>
                        <div>
                          <span style="font-weight: 500;">Asiento ${asientoKey}</span>
                          ${factura ? `<span style="font-size: 0.7rem; color: #868e96; margin-left: 6px;">FA: ${factura}</span>` : ''}
                        </div>
                      </div>
                    </td>
                    <td style="padding: 8px 10px;">
                      <span style="background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">${tipoDoc}</span>
                      <span style="background: #e7f5ff; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-left: 4px;">${numCuentas} ctas</span>
                    </td>
                    <td style="padding: 8px 10px; font-size: 0.8rem; color: var(--text-muted);">
                      ${compraItem ? compraItem.fecha : '-'}
                    </td>
                    <td style="padding: 8px 10px; font-size: 0.8rem; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${compraItem ? compraItem.detalle : ''}">
                      ${compraItem ? compraItem.detalle.substring(0, 50) + (compraItem.detalle.length > 50 ? '...' : '') : ''}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; color: var(--primary);">$${asientoCompras.toLocaleString()}</td>
                    <td style="padding: 8px 10px; text-align: right; color: var(--success);">$${asientoPagos.toLocaleString()}</td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: ${asientoSaldo > 0 ? 'var(--danger)' : 'var(--success)'};">$${asientoSaldo.toLocaleString()}</td>
                    <td style="padding: 8px 10px; text-align: center;">
                      ${diasAsiento !== null ? `
                        <span style="padding: 2px 6px; border-radius: 8px; font-size: 0.7rem; background: ${asientoSaldo <= 0.01 ? '#ebfbee' : (diasAsiento > 90 ? '#fff5f5' : diasAsiento > 60 ? '#ffe8cc' : '#fff9db')}; color: ${asientoSaldo <= 0.01 ? '#2b8a3e' : (diasAsiento > 90 ? '#c92a2a' : diasAsiento > 60 ? '#d9480f' : '#e67700')};">
                          ${diasAsiento}d ${asientoSaldo <= 0.01 ? '✓' : ''}
                        </span>
                      ` : '-'}
                    </td>
                  </tr>
                  ${isAsientoOpen ? items.sort((a, b) => a.cuenta.localeCompare(b.cuenta)).map(item => `
                  <tr class="detalle-row-cxp" style="background: #fef5e7; font-size: 0.8rem;">
                    <td style="padding: 6px 10px;"></td>
                    <td style="padding: 6px 10px;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <i class="ri-wallet-3-line" style="color: #868e96; font-size: 0.85rem;"></i>
                        <div>
                          <span style="font-weight: 500; font-size: 0.75rem;">${item.cuenta}</span>
                          <br><span style="color: #868e96; font-size: 0.7rem; font-weight: normal;">${(item.cuenta_nombre || '').substring(0, 25)}${item.cuenta_nombre?.length > 25 ? '...' : ''}</span>
                        </div>
                      </div>
                    </td>
                    <td style="padding: 6px 10px; text-align: center;">
                       <span style="padding: 2px 5px; border-radius: 4px; font-size: 0.65rem; background: ${item.tipo_doc === 'CH' ? '#e7f5ff' : item.tipo_doc === 'OP' ? '#fff9db' : '#f1f3f5'}; color: ${item.tipo_doc === 'CH' ? '#1971c2' : item.tipo_doc === 'OP' ? '#f08c00' : '#495057'}; border: 1px solid rgba(0,0,0,0.05);">
                        ${item.tipo_doc}
                      </span>
                    </td>
                    <td style="padding: 6px 10px; font-size: 0.75rem; color: var(--text-muted);">${item.fecha}</td>
                    <td style="padding: 6px 10px; color: var(--text-muted); font-size: 0.7rem; max-width: 300px; word-wrap: break-word; white-space: normal;">
                      ${item.documento && item.documento !== 'None' && item.documento !== 'null' ? `<strong style="color: #495057;">[${item.documento}]</strong> ` : ''}
                      ${item.detalle.substring(0, 100)}${item.detalle.length > 100 ? '...' : ''}
                    </td>
                    <td style="padding: 6px 10px; text-align: right; color: ${item.compra > 0 ? 'var(--primary)' : 'var(--text-muted)'};">${item.compra > 0 ? '$' + item.compra.toLocaleString() : '-'}</td>
                    <td style="padding: 6px 10px; text-align: right; color: ${item.pago > 0 ? 'var(--success)' : 'var(--text-muted)'};">${item.pago > 0 ? '$' + item.pago.toLocaleString() : '-'}</td>
                    <td style="padding: 6px 10px;"></td>
                    <td style="padding: 6px 10px;"></td>
                  </tr>
                  `).join('') : ''}
                  `;
      }).join('') : ''}
                `;
    }).join('')}
            </tbody>
          </table>
          ${(() => {
        const totalPages = Math.ceil(proveedoresConSaldo.length / this.state.cxpItemsPerPage);
        const currentPage = this.state.cxpCurrentPage;
        const startItem = (currentPage - 1) * this.state.cxpItemsPerPage + 1;
        const endItem = Math.min(currentPage * this.state.cxpItemsPerPage, proveedoresConSaldo.length);
        if (totalPages <= 1) return '';
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-top: 1px solid var(--border-color); background: var(--bg-light);">
              <span style="font-size: 0.85rem; color: var(--text-muted);">
                Mostrando ${startItem}-${endItem} de ${proveedoresConSaldo.length} proveedores
              </span>
              <div style="display: flex; gap: 4px; align-items: center;">
                <button class="pagination-btn-cxp" data-page="1" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid var(--border-color); background: white; border-radius: 4px; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'}; opacity: ${currentPage === 1 ? '0.5' : '1'};">
                  <i class="ri-skip-back-line"></i>
                </button>
                <button class="pagination-btn-cxp" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid var(--border-color); background: white; border-radius: 4px; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'}; opacity: ${currentPage === 1 ? '0.5' : '1'};">
                  <i class="ri-arrow-left-s-line"></i>
                </button>
                <span style="padding: 6px 12px; font-size: 0.85rem;">Página ${currentPage} de ${totalPages}</span>
                <button class="pagination-btn-cxp" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid var(--border-color); background: white; border-radius: 4px; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'}; opacity: ${currentPage === totalPages ? '0.5' : '1'};">
                  <i class="ri-arrow-right-s-line"></i>
                </button>
                <button class="pagination-btn-cxp" data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid var(--border-color); background: white; border-radius: 4px; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'}; opacity: ${currentPage === totalPages ? '0.5' : '1'};">
                  <i class="ri-skip-forward-line"></i>
                </button>
              </div>
            </div>
            `;
      })()}
        </div>
      </div>

      <!-- Top 5 Proveedores con Pago más Rápido -->
      ${topPagoRapido.length > 0 && !hasFilters ? `
      <div class="card" style="border-left: 4px solid var(--success); margin-bottom: 1rem;">
        <h5 style="color: var(--text-heading); margin-bottom: 1rem;"><i class="ri-trophy-line" style="color: var(--success);"></i> Top 5: Proveedores con Pago más Rápido</h5>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
          ${topPagoRapido.map((p, idx) => `
            <div class="rapido-card-cxp" data-codigo="${p.codigo}" style="padding: 12px; background: #ebfbee; border-radius: 8px; border-left: 3px solid #51cf66; cursor: pointer; transition: transform 0.2s;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="background: #51cf66; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold;">${idx + 1}</span>
                <div style="font-weight: 600; font-size: 0.85rem;">${p.nombre.length > 25 ? p.nombre.substring(0, 25) + '...' : p.nombre}</div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
                <span>Pagos: <strong style="color: var(--success);">$${p.pagos_filtrado.toLocaleString()}</strong></span>
                <span><strong style="color: #2b8a3e;">${p.dias_sin_pago} días</strong></span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Proveedores con Mayor Deuda -->
      ${topMorosos.length > 0 && !hasFilters ? `
      <div class="card" style="border-left: 4px solid var(--danger);">
        <h5 style="color: var(--text-heading); margin-bottom: 1rem;"><i class="ri-alarm-warning-line" style="color: var(--danger);"></i> Alertas: Proveedores con Mayor Deuda Pendiente</h5>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px;">
          ${topMorosos.slice(0, 6).map(p => `
            <div class="moroso-card-cxp" data-codigo="${p.codigo}" style="padding: 12px; background: #fff5f5; border-radius: 8px; border-left: 3px solid #ff6b6b; cursor: pointer; transition: transform 0.2s;">
              <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px;">${p.nombre}</div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
                <span>Saldo: <strong style="color: var(--danger);">$${p.saldo_filtrado.toLocaleString()}</strong></span>
                <span><strong style="color: #c92a2a;">${p.dias_sin_pago} días</strong> sin pago</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                Último pago: ${p.ultimo_pago || 'Sin registro'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    `;

    // Bind events
    this.bindCXPEvents(topCompras, antiguedadTotals);
  },

  bindCXPEvents(topCompras, antiguedadTotals) {
    const self = this;

    // Search inputs - trigger on Enter key only
    ['cxpSearchCuenta', 'cxpSearchProveedor', 'cxpSearchFactura', 'cxpSearchAsiento'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            self.state[id] = e.target.value;
            self.renderCXP();
          }
        };
        input.onchange = (e) => {
          if (id === 'cxpSearchProveedor' && e.target.value) {
            self.state[id] = e.target.value;
            self.renderCXP();
          }
        };
      }
    });

    // Tipo doc select
    const tipoDocSelect = document.getElementById('cxpSearchTipoDoc');
    if (tipoDocSelect) {
      tipoDocSelect.onchange = (e) => {
        self.state.cxpSearchTipoDoc = e.target.value;
        self.renderCXP();
      };
    }

    // Clear filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.onclick = () => {
        const clearKey = chip.dataset.clear;
        if (clearKey && clearKey.startsWith('cxp')) {
          self.state[clearKey] = clearKey.includes('Search') ? '' : null;
          self.renderCXP();
        }
      };
    });

    // Clear filter buttons (X buttons on inputs)
    document.querySelectorAll('.clear-filter-btn-cxp').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const clearKey = btn.dataset.clear;
        if (clearKey) {
          self.state[clearKey] = '';
          self.renderCXP();
        }
      };
    });

    // Clear all filters button
    const clearAllBtn = document.getElementById('clearAllCxpFilters');
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        self.state.cxpSelectedProveedor = null;
        self.state.cxpSelectedAntiguedad = null;
        self.state.cxpSearchCuenta = '';
        self.state.cxpSearchProveedor = '';
        self.state.cxpSearchFactura = '';
        self.state.cxpSearchAsiento = '';
        self.state.cxpSearchTipoDoc = '';
        self.state.cxpCurrentPage = 1; // Reset paginación
        self.renderCXP();
      };
    }

    // Sortable columns
    document.querySelectorAll('.sortable-th-cxp').forEach(th => {
      th.onclick = () => {
        const field = th.dataset.sort;
        if (self.state.cxpSortField === field) {
          self.state.cxpSortDir = self.state.cxpSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          self.state.cxpSortField = field;
          self.state.cxpSortDir = 'desc';
        }
        self.renderCXP();
      };
    });

    // Antigüedad chips
    document.querySelectorAll('.antiguedad-chip').forEach(chip => {
      chip.onclick = () => {
        const range = chip.dataset.range;
        self.state.cxpSelectedAntiguedad = self.state.cxpSelectedAntiguedad === range ? null : range;
        self.renderCXP();
      };
    });

    // Proveedor rows (expand/collapse)
    document.querySelectorAll('.proveedor-row').forEach(row => {
      row.onclick = () => {
        const codigo = row.dataset.codigo;
        if (self.state.cxpOpenProveedores.has(codigo)) {
          self.state.cxpOpenProveedores.delete(codigo);
        } else {
          self.state.cxpOpenProveedores.add(codigo);
        }
        self.renderCXP();
      };
    });

    // Factura rows (expand/collapse)
    document.querySelectorAll('.factura-row-cxp').forEach(row => {
      row.onclick = (e) => {
        e.stopPropagation();
        const proveedor = row.dataset.proveedor;
        const factura = row.dataset.factura;
        const key = `${proveedor}_${factura}`;
        if (self.state.cxpOpenFacturas.has(key)) {
          self.state.cxpOpenFacturas.delete(key);
        } else {
          self.state.cxpOpenFacturas.add(key);
        }
        self.renderCXP();
      };
    });

    // Pagination buttons
    document.querySelectorAll('.pagination-btn-cxp').forEach(btn => {
      btn.onclick = () => {
        if (btn.disabled) return;
        const page = parseInt(btn.dataset.page);
        if (page && page !== self.state.cxpCurrentPage) {
          self.state.cxpCurrentPage = page;
          self.state.cxpOpenProveedores.clear();
          self.state.cxpOpenFacturas.clear();
          self.renderCXP();
        }
      };
    });

    // Moroso cards click
    document.querySelectorAll('.moroso-card-cxp').forEach(card => {
      card.onclick = () => {
        self.state.cxpSelectedProveedor = card.dataset.codigo;
        self.state.cxpCurrentPage = 1;
        self.renderCXP();
      };
    });

    // Rapido cards click (Top 5 pago más rápido)
    document.querySelectorAll('.rapido-card-cxp').forEach(card => {
      card.onclick = () => {
        self.state.cxpSelectedProveedor = card.dataset.codigo;
        self.state.cxpCurrentPage = 1;
        self.renderCXP();
      };
    });

    // Render charts with click handlers
    this.renderCXPCharts(topCompras, antiguedadTotals);
  },

  renderCXPCharts(topCompras, antiguedadTotals) {
    const self = this;

    // Gráfico de Top Compras
    const ctxCompras = document.getElementById('chartTopCompras');
    if (ctxCompras) {
      new Chart(ctxCompras, {
        type: 'bar',
        data: {
          labels: topCompras.map(p => p.nombre.length > 20 ? p.nombre.substring(0, 20) + '...' : p.nombre),
          datasets: [{
            data: topCompras.map(p => p.compras_filtrado),
            backgroundColor: topCompras.map(p => p.codigo === self.state.cxpSelectedProveedor ? '#f59f00' : '#ffc078'),
            borderColor: topCompras.map(p => p.codigo === self.state.cxpSelectedProveedor ? '#e67700' : '#fd7e14'),
            borderWidth: topCompras.map(p => p.codigo === self.state.cxpSelectedProveedor ? 3 : 1)
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const idx = elements[0].index;
              const prov = topCompras[idx];
              self.state.cxpSelectedProveedor = self.state.cxpSelectedProveedor === prov.codigo ? null : prov.codigo;
              self.renderCXP();
            }
          },
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'K' } },
            y: { grid: { display: false } }
          }
        }
      });
    }

    // Gráfico de Antigüedad
    const ctxAntiguedad = document.getElementById('chartAntiguedadCXP');
    if (ctxAntiguedad) {
      const labels = ['0-30', '31-60', '61-90', '>90'];
      const colors = ['#51cf66', '#fcc419', '#ff922b', '#ff6b6b'];
      new Chart(ctxAntiguedad, {
        type: 'doughnut',
        data: {
          labels: labels.map(l => l + ' días'),
          datasets: [{
            data: labels.map(l => antiguedadTotals[l]),
            backgroundColor: colors,
            borderWidth: self.state.cxpSelectedAntiguedad ? labels.map((l, i) => l === self.state.cxpSelectedAntiguedad ? 4 : 0) : 0,
            borderColor: '#e67700'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const idx = elements[0].index;
              const range = labels[idx];
              self.state.cxpSelectedAntiguedad = self.state.cxpSelectedAntiguedad === range ? null : range;
              self.renderCXP();
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  },

  populateDocFilters() {
    const data = this.state.data.promocion.detalle;
    const years = this.state.selectedYears;

    // Get unique individual document types from filtered data
    const tiposDoc = new Set();
    data.forEach(d => {
      if (years.includes(d.anio) && d.tipo_doc) {
        d.tipo_doc.split(', ').forEach(t => {
          if (t && t !== 'OTROS') tiposDoc.add(t);
        });
      }
    });

    // Create checkboxes for document types
    const container = document.getElementById('filter-tipos-doc');
    if (container) {
      const selectedTypes = this.state.selectedTiposDoc || [];
      container.innerHTML = Array.from(tiposDoc).sort().map(t => {
        const isChecked = selectedTypes.includes(t);
        return `
          <label class="chip-checkbox ${isChecked ? 'active' : ''}" style="cursor: pointer; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.75rem; display: flex; align-items: center; gap: 4px; ${isChecked ? 'background: var(--primary); color: white; border-color: var(--primary);' : ''}">
            <input type="checkbox" value="${t}" ${isChecked ? 'checked' : ''} style="display: none;">
            ${t}
          </label>
        `;
      }).join('');

      // Bind checkbox events
      container.querySelectorAll('label.chip-checkbox').forEach(label => {
        label.onclick = (e) => {
          e.preventDefault();
          const cb = label.querySelector('input[type="checkbox"]');
          const type = cb.value;
          const idx = this.state.selectedTiposDoc.indexOf(type);
          if (idx > -1) {
            this.state.selectedTiposDoc.splice(idx, 1);
          } else {
            this.state.selectedTiposDoc.push(type);
          }
          this.renderWithLoading();
        };
      });
    }

    // Document search input with debounce
    const input = document.getElementById('filter-documento');
    if (input) {
      input.value = this.state.searchDocumento || '';
      let debounceTimer;
      input.oninput = (e) => {
        this.state.searchDocumento = e.target.value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.renderWithLoading(), 300);
      };
    }

    // Client filter - populate datalist (uses Cuenta/nombre_cuenta_linea)
    const clienteInput = document.getElementById('filter-cliente');
    const clientesList = document.getElementById('clientes-list');
    if (clienteInput && clientesList) {
      // Get unique account names from filtered data (by year)
      const clientesSet = new Set();
      data.forEach(d => {
        if (years.includes(d.anio) && d.nombre_cuenta_linea) {
          const cuenta = d.nombre_cuenta_linea.trim();
          if (cuenta && cuenta !== 'N/A') {
            clientesSet.add(cuenta);
          }
        }
      });

      // Populate datalist
      clientesList.innerHTML = Array.from(clientesSet).sort().map(c => `<option value="${c}">`).join('');

      // Set current value
      clienteInput.value = this.state.selectedCliente || '';

      // Event handler - only search on selection or Enter key
      clienteInput.onchange = (e) => {
        this.state.selectedCliente = e.target.value;
        this.renderWithLoading();
      };

      clienteInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.state.selectedCliente = clienteInput.value;
          this.renderWithLoading();
        }
      };
    }

    // Clear button
    const clearBtn = document.getElementById('btn-clear-doc-filters');
    if (clearBtn) {
      clearBtn.onclick = () => {
        this.state.selectedTiposDoc = [];
        this.state.searchDocumento = '';
        this.state.selectedCliente = '';
        if (input) input.value = '';
        if (clienteInput) clienteInput.value = '';
        this.renderWithLoading();
      };
    }
  },

  renderCPChart(cpData) {
    const ctx = document.getElementById('cpBreakdownChart').getContext('2d');
    const labels = Object.keys(cpData);
    // Use DEBE for the chart values (investment focus)
    const values = Object.values(cpData).map(v => v.debe);
    const total = values.reduce((a, b) => a + b, 0);

    const colors = { 'CLIENTE': '#696cff', 'INTERNO': '#03c3ec', 'BANCO': '#ffab00', 'PROVEEDOR': '#ff3e1d', 'OTROS': '#8592a3' };

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map(l => colors[l] || '#71dd37'),
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        onClick: (e, activeElements) => {
          if (activeElements.length > 0) {
            const index = activeElements[0].index;
            const type = labels[index];
            this.state.selectedCPType = (this.state.selectedCPType === type) ? null : type;
            this.renderFilters();
            this.renderWithLoading();
          }
        },
        plugins: { legend: { display: false } }
      }
    });

    const list = document.getElementById('cp-breakdown-list');
    list.innerHTML = labels.map((label, i) => {
      const metrics = cpData[label];
      const val = metrics.debe;
      const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
      const color = colors[label] || '#71dd37';
      const isActive = this.state.selectedCPType === label;
      return `
        <div class="cp-item ${isActive ? 'active' : ''}" style="cursor: pointer;" onclick="window.App.setCPFilter('${label}')">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
            <small style="font-weight: 600; color: var(--text-muted);">${label}</small>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap;">
            <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-heading); word-break: break-all;">$${val.toLocaleString()}</span>
            <span style="font-size: 0.75rem; color: var(--primary); font-weight: 600;">${pct}%</span>
          </div>
        </div>
      `;
    }).join('');
  },

  setCPFilter(type) {
    this.state.selectedCPType = (this.state.selectedCPType === type) ? null : type;
    this.renderFilters();
    this.renderWithLoading();
  },

  createHierarchicalTable() {
    const container = document.getElementById('promo-hierarchical-table');

    // Save which details were open before re-render
    this._saveOpenDetails();

    // Show internal loading indicator
    container.innerHTML = `
      <div id="table-loading-overlay" style="text-align: center; padding: 3rem; color: var(--text-muted);">
        <div class="loading-spinner" style="width: 40px; height: 40px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
        <div>Procesando datos...</div>
      </div>
    `;

    // Use setTimeout to allow UI to update before heavy processing
    setTimeout(() => {
      this._renderHierarchicalTable();
      // Restore open details
      this._restoreOpenDetails();
      // Signal that table render is complete
      this._pendingTableRender = false;

      // Keep the loading overlay visible for 6 seconds to ensure DOM is interactive
      // The table is rendered but we show an overlay to prevent interaction until ready
      this._showTableOverlay();
      setTimeout(() => this._hideTableOverlay(), 6000);
    }, 10);
  },

  // Show overlay on table to prevent interaction while DOM settles
  _showTableOverlay() {
    const container = document.getElementById('promo-hierarchical-table');
    if (!container) return;

    // Add overlay div on top of table
    let overlay = document.getElementById('table-interaction-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'table-interaction-overlay';
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255,255,255,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
        border-radius: var(--radius-lg);
      `;
      overlay.innerHTML = `
        <div style="text-align: center; color: var(--text-muted);">
          <div class="loading-spinner" style="width: 30px; height: 30px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 0.5rem;"></div>
          <div style="font-size: 0.85rem;">Preparando tabla...</div>
        </div>
      `;
    }

    // Make container relative for positioning
    container.style.position = 'relative';
    container.appendChild(overlay);
  },

  // Hide table interaction overlay
  _hideTableOverlay() {
    const overlay = document.getElementById('table-interaction-overlay');
    if (overlay) overlay.remove();
  },

  // Save which details elements are currently open
  _saveOpenDetails() {
    const container = document.getElementById('promo-hierarchical-table');
    if (!container) return;

    this.state.openDetails = new Set();
    container.querySelectorAll('details[open]').forEach(detail => {
      const summary = detail.querySelector('summary');
      if (summary) {
        // Use the text content as identifier
        const text = summary.textContent.trim().substring(0, 100);
        this.state.openDetails.add(text);
      }
    });
  },

  // Restore previously open details after re-render
  _restoreOpenDetails() {
    const container = document.getElementById('promo-hierarchical-table');
    if (!container || this.state.openDetails.size === 0) return;

    container.querySelectorAll('details').forEach(detail => {
      const summary = detail.querySelector('summary');
      if (summary) {
        const text = summary.textContent.trim().substring(0, 100);
        if (this.state.openDetails.has(text)) {
          detail.setAttribute('open', '');
        }
      }
    });
  },

  _renderHierarchicalTable() {
    const container = document.getElementById('promo-hierarchical-table');
    const data = this.state.data.promocion.detalle;
    const years = this.state.selectedYears;
    const { selectedAccount: filterAcc, selectedCPType: filterCP, metricFilter, selectedTiposDoc, searchDocumento, selectedCliente, tableSortField, tableSortDir } = this.state;

    const searchTerm = (searchDocumento || '').toLowerCase().trim();
    const tiposFilter = selectedTiposDoc || [];
    const filterCliente = (selectedCliente || '').toLowerCase().trim();

    const filtered = data.filter(d => {
      if (!years.includes(d.anio)) return false;
      if (filterAcc && d.cuenta !== filterAcc) return false;
      if (filterCP && d.tipo_cp !== filterCP) return false;
      if (filterCliente) {
        const cuentaNombre = (d.nombre_cuenta_linea || '').toLowerCase();
        if (!cuentaNombre.includes(filterCliente)) return false;
      }
      if (metricFilter && !(metricFilter === 'debe' ? d.debe > 0 : metricFilter === 'haber' ? d.haber > 0 : true)) return false;
      if (tiposFilter.length > 0) {
        const tipoDocStr = d.tipo_doc || '';
        if (!tiposFilter.some(t => tipoDocStr.includes(t))) return false;
      }
      if (searchTerm && !(d.documentos && d.documentos.toLowerCase().includes(searchTerm))) return false;
      return true;
    });

    // Build hierarchy: Cuenta > Asiento > Rows (each journal entry separate)
    const hierarchy = {};

    filtered.forEach(d => {
      if (!hierarchy[d.cuenta]) {
        hierarchy[d.cuenta] = {};
      }

      // Agrupar por asiento contable
      const asientoId = d.asiento || 'N/A';
      if (!hierarchy[d.cuenta][asientoId]) {
        hierarchy[d.cuenta][asientoId] = {
          rows: [],
          fecha: d.fecha,
          contrapartida: d.contrapartida || 'N/A'
        };
      }
      hierarchy[d.cuenta][asientoId].rows.push(d);
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Sin datos para los filtros seleccionados</div>`;
      return;
    }

    // Sort function
    const sortRows = (rows) => {
      const sorted = [...rows].sort((a, b) => {
        let valA, valB;
        switch (tableSortField) {
          case 'fecha': valA = a.fecha; valB = b.fecha; break;
          case 'debe': valA = a.debe; valB = b.debe; break;
          case 'haber': valA = a.haber; valB = b.haber; break;
          case 'cuenta': valA = a.nombre_cuenta_linea || a.cuenta_linea; valB = b.nombre_cuenta_linea || b.cuenta_linea; break;
          default: valA = a.fecha; valB = b.fecha;
        }
        if (typeof valA === 'string') return tableSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return tableSortDir === 'asc' ? valA - valB : valB - valA;
      });
      return sorted;
    };

    // Sort icon helper
    const sortIcon = (field) => {
      if (tableSortField !== field) return '<i class="ri-arrow-up-down-line" style="opacity: 0.3;"></i>';
      return tableSortDir === 'asc' ? '<i class="ri-arrow-up-line"></i>' : '<i class="ri-arrow-down-line"></i>';
    };

    // Store hierarchy for export functions
    this._currentHierarchy = hierarchy;

    container.innerHTML = Object.entries(hierarchy).map(([acc, asientosGroup]) => {
      // Calcular totales de cuenta sumando todas las filas de todos los asientos
      const accTotals = { debe: 0, haber: 0 };
      Object.values(asientosGroup).forEach(asientoData => {
        asientoData.rows.forEach(row => {
          accTotals.debe += row.debe || 0;
          accTotals.haber += row.haber || 0;
        });
      });
      const accNeto = accTotals.debe - accTotals.haber;

      // Ordenar asientos por fecha (descendente) y luego por debe
      const sortedAsientos = Object.entries(asientosGroup).sort((a, b) => {
        // Primero por fecha descendente
        const dateCompare = b[1].fecha.localeCompare(a[1].fecha);
        if (dateCompare !== 0) return dateCompare;
        // Luego por total debe descendente
        const aTotal = a[1].rows.reduce((s, r) => s + r.debe, 0);
        const bTotal = b[1].rows.reduce((s, r) => s + r.debe, 0);
        return bTotal - aTotal;
      });

      return `
        <details class="h-details h-level-1 h-group-main" data-cuenta="${acc}">
          <summary class="h-header">
            <i class="ri-bookmark-3-line"></i> <strong>${acc}</strong>
            <span style="margin-left: auto; display: flex; gap: 15px; font-weight: 600; align-items: center;">
              <span style="color: var(--primary);">Debe: $${accTotals.debe.toLocaleString()}</span>
              <span style="color: var(--danger);">Haber: $${accTotals.haber.toLocaleString()}</span>
              <span style="color: ${accNeto >= 0 ? 'var(--success)' : 'var(--warning)'};">Neto: $${accNeto.toLocaleString()}</span>
              <button class="btn-export btn-export-cuenta" data-cuenta="${acc}" title="Descargar asientos de ${acc}" onclick="event.stopPropagation();">
                <i class="ri-download-2-line"></i>
              </button>
            </span>
            <i class="ri-arrow-down-s-line h-arrow"></i>
          </summary>
          <div class="h-content">
            ${sortedAsientos.map(([asientoId, asientoData]) => {
        const rows = asientoData.rows;
        const asientoTotals = rows.reduce((s, r) => ({ debe: s.debe + r.debe, haber: s.haber + r.haber }), { debe: 0, haber: 0 });
        const asientoNeto = asientoTotals.debe - asientoTotals.haber;
        const sortedRows = sortRows(rows);
        return `
                <details class="h-details h-level-2" data-cuenta="${acc}" data-asiento="${asientoId}">
                  <summary class="h-header">
                    <i class="ri-file-list-3-line"></i>
                    <span style="font-family: monospace; font-size: 0.85rem;">${asientoId}</span>
                    <span style="margin-left: 10px; color: var(--text-muted); font-size: 0.8rem;">${asientoData.fecha}</span>
                    <span style="margin-left: 10px; color: var(--text-muted); font-size: 0.8rem;" title="${asientoData.contrapartida}">${asientoData.contrapartida}</span>
                    <span style="margin-left: auto; display: flex; gap: 12px; font-size: 0.85rem; align-items: center;">
                      <span style="color: var(--primary);">$${asientoTotals.debe.toLocaleString()}</span>
                      <span style="color: var(--danger);">$${asientoTotals.haber.toLocaleString()}</span>
                      <span style="color: ${asientoNeto >= 0 ? 'var(--success)' : 'var(--warning)'};">$${asientoNeto.toLocaleString()}</span>
                      <button class="btn-export btn-export-asiento" data-cuenta="${acc}" data-asiento="${asientoId}" title="Descargar cuentas de ${asientoId}" onclick="event.stopPropagation();">
                        <i class="ri-download-2-line"></i>
                      </button>
                    </span>
                    <i class="ri-arrow-down-s-line h-arrow"></i>
                  </summary>
                  <div class="h-content" style="padding: 1rem;">
                    ${(() => {
            // Agrupar filas por cuenta_linea dentro del asiento
            const byAccount = {};
            sortedRows.forEach(row => {
              const accKey = row.cuenta_linea || 'N/A';
              if (!byAccount[accKey]) byAccount[accKey] = { rows: [], nombre: row.nombre_cuenta_linea || accKey };
              byAccount[accKey].rows.push(row);
            });

            // Ordenar cuentas por total debe descendente
            const sortedAccounts = Object.entries(byAccount).sort((a, b) => {
              const aTotal = a[1].rows.reduce((s, r) => s + r.debe, 0);
              const bTotal = b[1].rows.reduce((s, r) => s + r.debe, 0);
              return bTotal - aTotal;
            });

            return sortedAccounts.map(([accNum, accData]) => {
              const accTotal = accData.rows.reduce((s, r) => ({ debe: s.debe + r.debe, haber: s.haber + r.haber }), { debe: 0, haber: 0 });
              const accNeto = accTotal.debe - accTotal.haber;
              return `
                      <details class="h-details h-level-3" style="margin-bottom: 8px;" data-cuenta="${acc}" data-asiento="${asientoId}" data-cuenta-linea="${accNum}">
                        <summary class="h-header" style="padding: 8px 12px; background: var(--bg-light); border-radius: 6px;">
                          <i class="ri-account-circle-line"></i>
                          <span style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted);">${accNum}</span>
                          <span style="margin-left: 8px; font-weight: 500;">${accData.nombre}</span>
                          <span style="margin-left: auto; display: flex; gap: 10px; font-size: 0.8rem; align-items: center;">
                            <span style="color: var(--primary);">$${accTotal.debe.toLocaleString()}</span>
                            <span style="color: var(--danger);">$${accTotal.haber.toLocaleString()}</span>
                            <span style="color: ${accNeto >= 0 ? 'var(--success)' : 'var(--warning)'};">$${accNeto.toLocaleString()}</span>
                            <button class="btn-export btn-export-detail" data-cuenta="${acc}" data-asiento="${asientoId}" data-cuenta-linea="${accNum}" data-nombre="${accData.nombre}" data-fecha="${asientoData.fecha}" title="Descargar detalle de ${accData.nombre}" onclick="event.stopPropagation();">
                              <i class="ri-download-2-line"></i>
                            </button>
                          </span>
                          <i class="ri-arrow-down-s-line h-arrow"></i>
                        </summary>
                        <div class="h-content" style="padding: 0.5rem;">
                          <table class="h-table">
                            <thead>
                              <tr>
                                <th>Documentos</th>
                                <th>Tipo Doc</th>
                                <th>Contrapartida</th>
                                <th>Tipo CP</th>
                                <th>Detalle</th>
                                <th style="text-align: right;">Debe</th>
                                <th style="text-align: right;">Haber</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${accData.rows.map(row => {
                const rowClass = row.es_linea_promo ? 'promo-line' : 'haber-line';
                return `
                                <tr class="${rowClass}">
                                  <td style="width: 140px;"><small style="font-family: monospace; font-size: 0.72rem;">${row.documentos}</small></td>
                                  <td style="width: 100px;"><small>${row.tipo_doc}</small></td>
                                  <td style="max-width: 200px;"><small title="${row.contrapartida}">${row.contrapartida}</small></td>
                                  <td style="width: 80px;"><small><span class="badge-cp badge-${(row.tipo_cp || 'otros').toLowerCase()}">${row.tipo_cp || 'N/A'}</span></small></td>
                                  <td><small>${row.detalle}</small></td>
                                  <td style="text-align: right; width: 90px; color: var(--primary); font-weight: 600;">$${row.debe.toLocaleString()}</td>
                                  <td style="text-align: right; width: 90px; color: var(--danger); font-weight: 600;">$${row.haber.toLocaleString()}</td>
                                </tr>
                              `;
              }).join('')}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    `;
            }).join('');
          })()}
                  </div>
                </details>
              `;
      }).join('')}
          </div>
        </details>
      `;
    }).join('');

    // Bind sort events - preserve open details state and show table overlay
    container.querySelectorAll('.sortable').forEach(th => {
      th.onclick = () => {
        const field = th.dataset.sort;
        if (this.state.tableSortField === field) {
          this.state.tableSortDir = this.state.tableSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.tableSortField = field;
          this.state.tableSortDir = 'desc';
        }
        // Show table overlay, save state, re-render, restore
        this._showTableOverlay();
        this._saveOpenDetails();
        setTimeout(() => {
          this._renderHierarchicalTable();
          this._restoreOpenDetails();
          // Keep overlay for 6 seconds
          setTimeout(() => this._hideTableOverlay(), 6000);
        }, 50);
      };
    });

    // Bind export buttons - Cuenta level
    container.querySelectorAll('.btn-export-cuenta').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const cuenta = btn.dataset.cuenta;
        if (this._currentHierarchy && this._currentHierarchy[cuenta]) {
          this.exportCuentaLevel(cuenta, this._currentHierarchy[cuenta]);
        }
      };
    });

    // Bind export buttons - Asiento level
    container.querySelectorAll('.btn-export-asiento').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const cuenta = btn.dataset.cuenta;
        const asientoId = btn.dataset.asiento;
        if (this._currentHierarchy && this._currentHierarchy[cuenta] && this._currentHierarchy[cuenta][asientoId]) {
          this.exportAsientoLevel(cuenta, asientoId, this._currentHierarchy[cuenta][asientoId]);
        }
      };
    });

    // Bind export buttons - Detail level
    container.querySelectorAll('.btn-export-detail').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const cuenta = btn.dataset.cuenta;
        const asientoId = btn.dataset.asiento;
        const cuentaLinea = btn.dataset.cuentaLinea;
        const nombre = btn.dataset.nombre;
        const fecha = btn.dataset.fecha;
        if (this._currentHierarchy && this._currentHierarchy[cuenta] && this._currentHierarchy[cuenta][asientoId]) {
          const rows = this._currentHierarchy[cuenta][asientoId].rows.filter(r => r.cuenta_linea === cuentaLinea);
          this.exportDetailLevel(cuenta, asientoId, fecha, cuentaLinea, nombre, rows);
        }
      };
    });
  },

  // Formatea números con abreviaciones: K (miles), M (millones), MM (miles de millones)
  formatAbreviated(value) {
    if (value >= 1e9) return '$' + (value / 1e9).toFixed(2) + ' MM';
    if (value >= 1e6) return '$' + (value / 1e6).toFixed(2) + ' M';
    if (value >= 1e3) return '$' + (value / 1e3).toFixed(2) + ' K';
    return '$' + value.toFixed(0);
  },

  renderRankingChart(sortedData) {
    const ctx = document.getElementById('rankingChart').getContext('2d');
    const self = this;

    // Plugin para mostrar etiquetas de datos en las barras
    const datalabelsPlugin = {
      id: 'datalabels',
      afterDatasetsDraw(chart) {
        const { ctx, data, scales } = chart;
        ctx.save();

        data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          meta.data.forEach((bar, index) => {
            const value = dataset.data[index];
            const label = self.formatAbreviated(value);

            ctx.fillStyle = '#566a7f';
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // Posición: al final de la barra + 8px de margen
            const x = bar.x + 8;
            const y = bar.y;

            ctx.fillText(label, x, y);
          });
        });

        ctx.restore();
      }
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sortedData.map(d => d[0]),
        datasets: [{ label: 'Inversión', data: sortedData.map(d => d[1]), backgroundColor: '#696cff', borderRadius: 6, barThickness: 15 }]
      },
      plugins: [datalabelsPlugin],
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { right: 80 } // Espacio para las etiquetas
        },
        onClick: (e) => {
          const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
          if (points.length) {
            const index = points[0].index;
            this.state.selectedAccount = sortedData[index][0];
            this.renderFilters();
            this.renderWithLoading();
          }
        },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: true, color: '#f0f2f4' },
            ticks: { callback: (value) => this.formatAbreviated(value) }
          },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' }, color: '#566a7f' } }
        }
      }
    });
  },

  // Excel Export Functions
  _escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  _downloadCSV(filename, csvContent) {
    // Add BOM for Excel UTF-8 compatibility
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  },

  // Export all data at Cuenta level (grouped summary)
  exportCuentaLevel(cuenta, asientosGroup) {
    const rows = [];
    rows.push(['Cuenta', 'Asiento', 'Fecha', 'Contrapartida', 'Total Debe', 'Total Haber', 'Neto'].map(h => this._escapeCSV(h)).join(','));

    Object.entries(asientosGroup).forEach(([asientoId, asientoData]) => {
      const totals = asientoData.rows.reduce((s, r) => ({
        debe: s.debe + (r.debe || 0),
        haber: s.haber + (r.haber || 0)
      }), { debe: 0, haber: 0 });
      const neto = totals.debe - totals.haber;

      rows.push([
        cuenta,
        asientoId,
        asientoData.fecha,
        asientoData.contrapartida,
        totals.debe.toFixed(2),
        totals.haber.toFixed(2),
        neto.toFixed(2)
      ].map(v => this._escapeCSV(v)).join(','));
    });

    this._downloadCSV(`${cuenta.replace(/[^a-zA-Z0-9]/g, '_')}_asientos.csv`, rows.join('\n'));
  },

  // Export data at Asiento level (grouped by cuenta_linea)
  exportAsientoLevel(cuenta, asientoId, asientoData) {
    const rows = [];
    rows.push(['Cuenta Promoción', 'Asiento', 'Fecha', 'Código Cuenta', 'Nombre Cuenta', 'Total Debe', 'Total Haber', 'Neto'].map(h => this._escapeCSV(h)).join(','));

    // Group by cuenta_linea
    const byAccount = {};
    asientoData.rows.forEach(row => {
      const accKey = row.cuenta_linea || 'N/A';
      if (!byAccount[accKey]) byAccount[accKey] = { rows: [], nombre: row.nombre_cuenta_linea || accKey };
      byAccount[accKey].rows.push(row);
    });

    Object.entries(byAccount).forEach(([accNum, accData]) => {
      const totals = accData.rows.reduce((s, r) => ({
        debe: s.debe + (r.debe || 0),
        haber: s.haber + (r.haber || 0)
      }), { debe: 0, haber: 0 });
      const neto = totals.debe - totals.haber;

      rows.push([
        cuenta,
        asientoId,
        asientoData.fecha,
        accNum,
        accData.nombre,
        totals.debe.toFixed(2),
        totals.haber.toFixed(2),
        neto.toFixed(2)
      ].map(v => this._escapeCSV(v)).join(','));
    });

    this._downloadCSV(`${asientoId}_cuentas.csv`, rows.join('\n'));
  },

  // Export detailed rows for a specific cuenta_linea within an asiento
  exportDetailLevel(cuenta, asientoId, fecha, accNum, accNombre, detailRows) {
    const rows = [];
    rows.push(['Cuenta Promoción', 'Asiento', 'Fecha', 'Código Cuenta', 'Nombre Cuenta', 'Documentos', 'Tipo Doc', 'Contrapartida', 'Tipo CP', 'Detalle', 'Debe', 'Haber'].map(h => this._escapeCSV(h)).join(','));

    detailRows.forEach(row => {
      rows.push([
        cuenta,
        asientoId,
        fecha,
        accNum,
        accNombre,
        row.documentos || 'N/A',
        row.tipo_doc || 'OTROS',
        row.contrapartida || 'N/A',
        row.tipo_cp || 'N/A',
        row.detalle || '',
        (row.debe || 0).toFixed(2),
        (row.haber || 0).toFixed(2)
      ].map(v => this._escapeCSV(v)).join(','));
    });

    this._downloadCSV(`${asientoId}_${accNum}_detalle.csv`, rows.join('\n'));
  },

  // Export all filtered data
  exportAllFiltered() {
    const data = this.state.data.promocion.detalle;
    const years = this.state.selectedYears;
    const { selectedAccount: filterAcc, selectedCPType: filterCP, metricFilter, selectedTiposDoc, searchDocumento, selectedCliente } = this.state;

    const searchTerm = (searchDocumento || '').toLowerCase().trim();
    const tiposFilter = selectedTiposDoc || [];
    const filterClienteStr = (selectedCliente || '').toLowerCase().trim();

    const filtered = data.filter(d => {
      if (!years.includes(d.anio)) return false;
      if (filterAcc && d.cuenta !== filterAcc) return false;
      if (filterCP && d.tipo_cp !== filterCP) return false;
      if (filterClienteStr) {
        const cuentaNombre = (d.nombre_cuenta_linea || '').toLowerCase();
        if (!cuentaNombre.includes(filterClienteStr)) return false;
      }
      if (metricFilter && !(metricFilter === 'debe' ? d.debe > 0 : metricFilter === 'haber' ? d.haber > 0 : true)) return false;
      if (tiposFilter.length > 0) {
        const tipoDocStr = d.tipo_doc || '';
        if (!tiposFilter.some(t => tipoDocStr.includes(t))) return false;
      }
      if (searchTerm && !(d.documentos && d.documentos.toLowerCase().includes(searchTerm))) return false;
      return true;
    });

    const rows = [];
    rows.push(['Cuenta Promoción', 'Asiento', 'Fecha', 'Año', 'Código Cuenta', 'Nombre Cuenta', 'Documentos', 'Tipo Doc', 'Contrapartida', 'Tipo CP', 'Detalle', 'Debe', 'Haber'].map(h => this._escapeCSV(h)).join(','));

    filtered.forEach(row => {
      rows.push([
        row.cuenta || '',
        row.asiento || '',
        row.fecha || '',
        row.anio || '',
        row.cuenta_linea || '',
        row.nombre_cuenta_linea || '',
        row.documentos || 'N/A',
        row.tipo_doc || 'OTROS',
        row.contrapartida || 'N/A',
        row.tipo_cp || 'N/A',
        row.detalle || '',
        (row.debe || 0).toFixed(2),
        (row.haber || 0).toFixed(2)
      ].map(v => this._escapeCSV(v)).join(','));
    });

    const filename = `promocion_${years.join('-')}_${new Date().toISOString().slice(0, 10)}.csv`;
    this._downloadCSV(filename, rows.join('\n'));
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
