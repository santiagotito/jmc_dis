import { dataService } from './services/dataService';

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
    // Sorting state for hierarchical table
    tableSortField: 'fecha', // fecha, debe, haber, cuenta
    tableSortDir: 'desc', // asc, desc
    isLoading: false,
    // Track which details are open (to preserve state on re-render)
    openDetails: new Set()
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
    this.state.data = await dataService.load();
    if (!this.state.data) return;

    // Default to latest year
    const availableYears = this.state.data.metadata.available_years;
    this.state.selectedYears = [availableYears[availableYears.length - 1]];

    this.bindEvents();
    this.renderFilters();
    this.render();
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

    const titles = { resumen: 'Resumen General', promocion: 'Promoción & Publicidad' };
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
    }
  },

  renderResumen() {
    const data = this.state.data.resumen;
    const years = this.state.selectedYears;

    // Aggregation
    const summary = years.reduce((acc, y) => {
      if (data[y]) {
        acc.registros += data[y].registros;
        acc.debe += data[y].debe;
        acc.haber += data[y].haber;
      }
      return acc;
    }, { registros: 0, debe: 0, haber: 0 });

    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="kpi-grid">
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon icon-primary"><i class="ri-file-list-3-line"></i></div>
          </div>
          <div class="kpi-label">Registros Totales</div>
          <div class="kpi-value">${summary.registros.toLocaleString()}</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon icon-success"><i class="ri-money-dollar-circle-line"></i></div>
          </div>
          <div class="kpi-label">Flujo (Debe)</div>
          <div class="kpi-value">$${summary.debe.toLocaleString()}</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon icon-danger"><i class="ri-arrow-right-up-line"></i></div>
          </div>
          <div class="kpi-label">Egresos (Haber)</div>
          <div class="kpi-value">$${summary.haber.toLocaleString()}</div>
        </div>
      </div>

      <div class="card">
        <h5 style="margin-bottom: 1.5rem; color: var(--text-heading);">Evolución Histórica</h5>
        <div style="height: 350px;">
          <canvas id="evolutionChart"></canvas>
        </div>
      </div>
    `;

    this.renderResumenChart();
  },

  renderResumenChart() {
    const ctx = document.getElementById('evolutionChart').getContext('2d');
    const years = this.state.data.metadata.available_years;
    const data = this.state.data.resumen;

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [
          {
            label: 'Flujo (Debe)',
            data: years.map(y => data[y]?.debe || 0),
            borderColor: '#696cff',
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(105, 108, 255, 0.1)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { display: false } },
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

    // 1. Filtrado Base (Afecta a todo: KPIs, Gráficos y Tabla)
    const baseFiltered = data.detalle.filter(d => {
      // Filtro de Año
      if (!years.includes(d.anio)) return false;
      // Filtro de Cuenta
      if (filterAcc && d.cuenta !== filterAcc) return false;
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
    // El donut debe mostrar el desglose de lo que está filtrado por base
    // Si hay filtros de documento activos, mostrar todas las líneas; si no, solo líneas de promoción
    const hasDocFilters = tiposFilter.length > 0 || searchTerm;
    const cpAggGeneral = {};
    baseFiltered.forEach(d => {
      // Si hay filtros de documento, mostrar todas las líneas; si no, solo promoción
      if (hasDocFilters || d.es_linea_promo) {
        const type = d.tipo_cp || 'OTROS';
        if (!cpAggGeneral[type]) cpAggGeneral[type] = { debe: 0, haber: 0 };
        cpAggGeneral[type].debe += d.debe;
        cpAggGeneral[type].haber += d.haber;
      }
    });

    // 3. Filtrado Final para KPIs y Ranking (Aplica también el filtro del Donut)
    const finalFiltered = baseFiltered.filter(d => !filterCP || d.tipo_cp === filterCP);

    // Para KPIs: Si hay filtros de documento activos, mostrar todas las líneas filtradas
    // Si no hay filtros, solo mostrar líneas de promoción (es_linea_promo = true)
    let totalDebe = 0;
    let totalHaber = 0;
    const accountAgg = {};
    const accountsSet = new Set();

    finalFiltered.forEach(d => {
      // Si hay filtros de documento, contar todas las líneas; si no, solo promoción
      if (hasDocFilters || d.es_linea_promo) {
        totalDebe += d.debe;
        totalHaber += d.haber;
        accountAgg[d.cuenta] = (accountAgg[d.cuenta] || 0) + d.debe;
      }
      accountsSet.add(d.cuenta);
    });

    const netValue = totalDebe - totalHaber;
    const sortedAccounts = Object.entries(accountAgg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="kpi-grid">
        <div class="card kpi-card metric-card ${filterMetric === 'debe' ? 'active' : ''}" data-metric="debe" style="cursor: pointer;">
          <div class="kpi-header">
            <div class="kpi-icon icon-primary"><i class="ri-arrow-down-circle-line"></i></div>
            <div class="kpi-info-icon" data-tooltip="Filtrar por Gastos (Debe)">i</div>
          </div>
          <div class="kpi-label">Inversión (Debe)</div>
          <div class="kpi-value">$${totalDebe.toLocaleString()}</div>
        </div>
        <div class="card kpi-card metric-card ${filterMetric === 'haber' ? 'active' : ''}" data-metric="haber" style="cursor: pointer;">
          <div class="kpi-header">
            <div class="kpi-icon icon-warning"><i class="ri-arrow-up-circle-line"></i></div>
            <div class="kpi-info-icon" data-tooltip="Filtrar por Ajustes (Haber)">i</div>
          </div>
          <div class="kpi-label">Ajustes (Haber)</div>
          <div class="kpi-value">$${totalHaber.toLocaleString()}</div>
        </div>
        <div class="card kpi-card metric-card ${filterMetric === 'neto' ? 'active' : ''}" data-metric="neto" style="cursor: pointer;">
          <div class="kpi-header">
            <div class="kpi-icon icon-success"><i class="ri-shield-check-line"></i></div>
            <div class="kpi-info-icon" data-tooltip="Cero Neto indica auditoría perfecta.">i</div>
          </div>
          <div class="kpi-label">Estado Auditoría</div>
          <div class="kpi-value" style="font-size: 1.2rem;">Neto: $${netValue.toLocaleString()}</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon icon-info"><i class="ri-bank-line"></i></div>
          </div>
          <div class="kpi-label">Cuentas Publicidad</div>
          <div class="kpi-value">${accountsSet.size} Unidades</div>
        </div>
      </div>

      <div class="row" style="display: flex; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div class="card" style="flex: 2; position: relative;">
          <h5 style="color: var(--text-heading); margin-bottom: 1.5rem;">Ranking de Inversión por Cuenta</h5>
          <div style="height: 350px;">
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

      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <h5 style="color: var(--text-heading); margin: 0;">Auditoría Jerárquica (Gasto > Contrapartida > Asiento)</h5>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <div id="filter-tipos-doc" style="display: flex; gap: 8px; flex-wrap: wrap;"></div>
            <input type="text" id="filter-documento" placeholder="Buscar documento (ej: 2047)"
              style="padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 6px; width: 180px; font-size: 0.85rem;">
            <button id="btn-clear-doc-filters" style="padding: 6px 12px; background: var(--border-color); border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
              <i class="ri-close-line"></i> Limpiar
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

    // Bind Events
    document.querySelectorAll('.metric-card').forEach(card => {
      card.onclick = () => {
        const m = card.dataset.metric;
        this.state.metricFilter = (this.state.metricFilter === m) ? null : m;
        this.renderFilters();
        this.renderWithLoading();
      };
    });
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

    // Clear button
    const clearBtn = document.getElementById('btn-clear-doc-filters');
    if (clearBtn) {
      clearBtn.onclick = () => {
        this.state.selectedTiposDoc = [];
        this.state.searchDocumento = '';
        if (input) input.value = '';
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

      // Keep the loading overlay visible for 15 seconds to ensure DOM is interactive
      // The table is rendered but we show an overlay to prevent interaction until ready
      this._showTableOverlay();
      setTimeout(() => this._hideTableOverlay(), 15000);
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
    const { selectedAccount: filterAcc, selectedCPType: filterCP, metricFilter, selectedTiposDoc, searchDocumento, tableSortField, tableSortDir } = this.state;

    const searchTerm = (searchDocumento || '').toLowerCase().trim();
    const tiposFilter = selectedTiposDoc || [];

    const filtered = data.filter(d => {
      if (!years.includes(d.anio)) return false;
      if (filterAcc && d.cuenta !== filterAcc) return false;
      if (filterCP && d.tipo_cp !== filterCP) return false;
      if (metricFilter && !(metricFilter === 'debe' ? d.debe > 0 : metricFilter === 'haber' ? d.haber > 0 : true)) return false;
      if (tiposFilter.length > 0) {
        const tipoDocStr = d.tipo_doc || '';
        if (!tiposFilter.some(t => tipoDocStr.includes(t))) return false;
      }
      if (searchTerm && !(d.documentos && d.documentos.toLowerCase().includes(searchTerm))) return false;
      return true;
    });

    // Build hierarchy: Cuenta > Cliente Individual > Rows
    // Separar contrapartidas por ";" para agrupar por cliente individual
    const hierarchy = {};
    const uniqueAsientosByCuenta = {}; // Para calcular totales sin duplicar

    filtered.forEach(d => {
      if (!hierarchy[d.cuenta]) {
        hierarchy[d.cuenta] = {};
        uniqueAsientosByCuenta[d.cuenta] = new Set();
      }

      // Track unique asientos for accurate account totals
      const asientoKey = `${d.asiento}_${d.cuenta_linea}_${d.debe}_${d.haber}`;
      uniqueAsientosByCuenta[d.cuenta].add(JSON.stringify({ debe: d.debe, haber: d.haber, key: asientoKey }));

      // Separar clientes por ";" y agregar a cada uno
      const clientes = (d.contrapartida || 'N/A').split(';').map(c => c.trim()).filter(c => c);
      clientes.forEach(cliente => {
        if (!hierarchy[d.cuenta][cliente]) hierarchy[d.cuenta][cliente] = [];
        hierarchy[d.cuenta][cliente].push(d);
      });
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

    container.innerHTML = Object.entries(hierarchy).map(([acc, cpGroup]) => {
      // Calcular totales de cuenta usando registros únicos (evitar duplicados por separación de clientes)
      const accTotals = { debe: 0, haber: 0 };
      uniqueAsientosByCuenta[acc].forEach(jsonStr => {
        const item = JSON.parse(jsonStr);
        accTotals.debe += item.debe;
        accTotals.haber += item.haber;
      });
      const accNeto = accTotals.debe - accTotals.haber;

      // Ordenar clientes por total de debe (descendente)
      const sortedClients = Object.entries(cpGroup).sort((a, b) => {
        const aTotal = a[1].reduce((s, r) => s + r.debe, 0);
        const bTotal = b[1].reduce((s, r) => s + r.debe, 0);
        return bTotal - aTotal;
      });

      return `
        <details class="h-details h-level-1 h-group-main">
          <summary class="h-header">
            <i class="ri-bookmark-3-line"></i> <strong>${acc}</strong>
            <span style="margin-left: auto; display: flex; gap: 15px; font-weight: 600;">
              <span style="color: var(--primary);">Debe: $${accTotals.debe.toLocaleString()}</span>
              <span style="color: var(--danger);">Haber: $${accTotals.haber.toLocaleString()}</span>
              <span style="color: ${accNeto >= 0 ? 'var(--success)' : 'var(--warning)'};">Neto: $${accNeto.toLocaleString()}</span>
            </span>
            <i class="ri-arrow-down-s-line h-arrow"></i>
          </summary>
          <div class="h-content">
            ${sortedClients.map(([cliente, rows]) => {
        const cpTotals = rows.reduce((s, r) => ({ debe: s.debe + r.debe, haber: s.haber + r.haber }), { debe: 0, haber: 0 });
        const cpNeto = cpTotals.debe - cpTotals.haber;
        const sortedRows = sortRows(rows);
        return `
                <details class="h-details h-level-2">
                  <summary class="h-header">
                    <i class="ri-user-follow-line"></i> <span>${cliente}</span>
                    <span style="margin-left: auto; display: flex; gap: 12px; font-size: 0.85rem;">
                      <span style="color: var(--primary);">$${cpTotals.debe.toLocaleString()}</span>
                      <span style="color: var(--danger);">$${cpTotals.haber.toLocaleString()}</span>
                      <span style="color: ${cpNeto >= 0 ? 'var(--success)' : 'var(--warning)'};">$${cpNeto.toLocaleString()}</span>
                    </span>
                    <i class="ri-arrow-down-s-line h-arrow"></i>
                  </summary>
                  <div class="h-content" style="padding: 1rem;">
                    <table class="h-table">
                      <thead>
                        <tr>
                          <th class="sortable" data-sort="fecha" style="cursor: pointer;">Fecha ${sortIcon('fecha')}</th>
                          <th>Asiento</th>
                          <th>Documentos</th>
                          <th class="sortable" data-sort="cuenta" style="cursor: pointer;">Cuenta ${sortIcon('cuenta')}</th>
                          <th>Tipo Doc</th>
                          <th>Detalle</th>
                          <th class="sortable" data-sort="debe" style="cursor: pointer; text-align: right;">Debe ${sortIcon('debe')}</th>
                          <th class="sortable" data-sort="haber" style="cursor: pointer; text-align: right;">Haber ${sortIcon('haber')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${sortedRows.map(row => {
          const rowClass = row.es_linea_promo ? 'promo-line' : 'haber-line';
          return `
                          <tr class="${rowClass}">
                            <td style="width: 85px;"><small>${row.fecha}</small></td>
                            <td style="width: 130px;"><small style="font-family: monospace; font-size: 0.72rem;">${row.asiento}</small></td>
                            <td style="width: 140px;"><small style="font-family: monospace; font-size: 0.72rem;">${row.documentos}</small></td>
                            <td style="width: 150px;"><small title="${row.cuenta_linea}">${row.nombre_cuenta_linea || row.cuenta_linea}</small></td>
                            <td style="width: 100px;"><small>${row.tipo_doc}</small></td>
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
          // Keep overlay for 15 seconds
          setTimeout(() => this._hideTableOverlay(), 15000);
        }, 50);
      };
    });
  },

  renderRankingChart(sortedData) {
    const ctx = document.getElementById('rankingChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sortedData.map(d => d[0]),
        datasets: [{ label: 'Inversión', data: sortedData.map(d => d[1]), backgroundColor: '#696cff', borderRadius: 6, barThickness: 15 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
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
          x: { grid: { display: true, color: '#f0f2f4' }, ticks: { callback: (value) => '$' + value.toLocaleString() } },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' }, color: '#566a7f' } }
        }
      }
    });
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
