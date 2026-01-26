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
    cxcSearchCuenta: '', // Search by account code
    cxcSearchCliente: '', // Search by client name
    cxcSearchFactura: '', // Search by invoice number
    cxcSearchTipoDoc: '', // Filter by document type
    cxcSortField: 'saldo', // saldo, debe, haber, nombre, dias_sin_cobro
    cxcSortDir: 'desc', // asc, desc
    cxcOpenClientes: new Set(), // Track which client groups are open
    cxcOpenFacturas: new Set() // Track which invoice groups are open
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
  renderCXC() {
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
    const detalle = cxcData.detalle || [];
    const resumenAnual = cxcData.resumen_anual;

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

    // Análisis de antigüedad (antes de filtros)
    const antiguedadData = { '0-30': [], '31-60': [], '61-90': [], '>90': [] };
    const antiguedadTotals = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    clientesConSaldo.forEach(c => {
      if (c.saldo_filtrado > 0 && c.dias_sin_cobro !== null) {
        if (c.dias_sin_cobro <= 30) { antiguedadData['0-30'].push(c); antiguedadTotals['0-30'] += c.saldo_filtrado; }
        else if (c.dias_sin_cobro <= 60) { antiguedadData['31-60'].push(c); antiguedadTotals['31-60'] += c.saldo_filtrado; }
        else if (c.dias_sin_cobro <= 90) { antiguedadData['61-90'].push(c); antiguedadTotals['61-90'] += c.saldo_filtrado; }
        else { antiguedadData['>90'].push(c); antiguedadTotals['>90'] += c.saldo_filtrado; }
      }
    });

    // Rankings (antes de filtros para los gráficos)
    const topVentas = [...clientesConSaldo].sort((a, b) => b.debe_filtrado - a.debe_filtrado).slice(0, 10);

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
      clientesConSaldo = clientesConSaldo.filter(c => c.codigo.toLowerCase().includes(searchLower));
      detalleFiltrado = detalleFiltrado.filter(d => d.cliente_codigo.toLowerCase().includes(searchLower));
    }
    if (cxcSearchCliente) {
      const searchLower = cxcSearchCliente.toLowerCase();
      clientesConSaldo = clientesConSaldo.filter(c => c.nombre.toLowerCase().includes(searchLower));
      detalleFiltrado = detalleFiltrado.filter(d => d.cliente_nombre.toLowerCase().includes(searchLower));
    }
    if (cxcSearchFactura) {
      const searchLower = cxcSearchFactura.toLowerCase();
      detalleFiltrado = detalleFiltrado.filter(d =>
        (d.factura && d.factura.toLowerCase().includes(searchLower)) ||
        (d.asiento && d.asiento.toLowerCase().includes(searchLower))
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

    // Recalcular KPIs después de filtros
    let kpiDebe = 0, kpiHaber = 0;
    if (cxcSelectedCliente || cxcSelectedAntiguedad || cxcSearchCuenta || cxcSearchCliente) {
      clientesConSaldo.forEach(c => { kpiDebe += c.debe_filtrado; kpiHaber += c.haber_filtrado; });
    } else {
      kpiDebe = totalDebe; kpiHaber = totalHaber;
    }
    const saldoTotal = kpiDebe - kpiHaber;

    // Ordenar clientes
    const { cxcSortField, cxcSortDir } = this.state;
    clientesConSaldo.sort((a, b) => {
      let va = a[cxcSortField] || 0;
      let vb = b[cxcSortField] || 0;
      if (cxcSortField === 'nombre') { va = a.nombre || ''; vb = b.nombre || ''; }
      if (cxcSortField === 'saldo') { va = a.saldo_filtrado; vb = b.saldo_filtrado; }
      if (cxcSortField === 'debe') { va = a.debe_filtrado; vb = b.debe_filtrado; }
      if (cxcSortField === 'haber') { va = a.haber_filtrado; vb = b.haber_filtrado; }
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

      <!-- Filtros de búsqueda -->
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Cuenta</label>
            <input type="text" id="cxcSearchCuenta" placeholder="Código cuenta..." value="${cxcSearchCuenta}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Cliente</label>
            <input type="text" id="cxcSearchCliente" placeholder="Nombre cliente..." value="${cxcSearchCliente}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Buscar Factura/Doc</label>
            <input type="text" id="cxcSearchFactura" placeholder="Número factura..." value="${cxcSearchFactura}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
          </div>
          <div style="flex: 1; min-width: 150px;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Tipo Documento</label>
            <select id="cxcSearchTipoDoc" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;">
              <option value="">Todos</option>
              ${tiposDoc.map(t => `<option value="${t}" ${cxcSearchTipoDoc === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
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
                <th style="padding: 10px; border-bottom: 2px solid var(--border-color); width: 40px;"></th>
                <th class="sortable-th" data-sort="nombre" style="padding: 10px; border-bottom: 2px solid var(--border-color); cursor: pointer;">
                  Cliente ${cxcSortField === 'nombre' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="debe" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Ventas ${cxcSortField === 'debe' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="haber" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Cobros ${cxcSortField === 'haber' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="saldo" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: right; cursor: pointer;">
                  Saldo ${cxcSortField === 'saldo' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sortable-th" data-sort="dias_sin_cobro" style="padding: 10px; border-bottom: 2px solid var(--border-color); text-align: center; cursor: pointer;">
                  Días sin Cobro ${cxcSortField === 'dias_sin_cobro' ? (cxcSortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody id="cxcTableBody">
              ${clientesConSaldo.slice(0, 50).map(c => {
                const isOpen = this.state.cxcOpenClientes.has(c.codigo);
                const clienteDetalle = detalleByCliente[c.codigo];
                const facturas = clienteDetalle ? Object.entries(clienteDetalle.facturas) : [];

                return `
                <tr class="cliente-row" data-codigo="${c.codigo}" style="border-bottom: 1px solid var(--border-color); cursor: pointer; background: ${isOpen ? '#f8f9fa' : 'white'};">
                  <td style="padding: 10px; text-align: center;">
                    <i class="ri-arrow-${isOpen ? 'down' : 'right'}-s-line" style="color: var(--text-muted);"></i>
                  </td>
                  <td style="padding: 10px;">
                    <div style="font-weight: 500;">${c.nombre}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${c.codigo}</div>
                  </td>
                  <td style="padding: 10px; text-align: right; color: var(--primary);">$${c.debe_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: right; color: var(--success);">$${c.haber_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: right; font-weight: 600; color: ${c.saldo_filtrado > 0 ? 'var(--warning)' : 'var(--success)'};">$${c.saldo_filtrado.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: center;">
                    ${c.dias_sin_cobro !== null ? `
                      <span style="padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; background: ${c.dias_sin_cobro > 90 ? '#fff5f5' : c.dias_sin_cobro > 60 ? '#ffe8cc' : c.dias_sin_cobro > 30 ? '#fff9db' : '#ebfbee'}; color: ${c.dias_sin_cobro > 90 ? '#c92a2a' : c.dias_sin_cobro > 60 ? '#d9480f' : c.dias_sin_cobro > 30 ? '#e67700' : '#2b8a3e'};">
                        ${c.dias_sin_cobro} días
                      </span>
                    ` : '-'}
                  </td>
                </tr>
                ${isOpen ? facturas.map(([facKey, items]) => {
                  const facDebe = items.reduce((s, i) => s + i.debe, 0);
                  const facHaber = items.reduce((s, i) => s + i.haber, 0);
                  const facSaldo = facDebe - facHaber;
                  const isFacOpen = this.state.cxcOpenFacturas.has(`${c.codigo}_${facKey}`);
                  return `
                  <tr class="factura-row" data-cliente="${c.codigo}" data-factura="${facKey}" style="background: #f1f3f5; cursor: pointer;">
                    <td style="padding: 8px 10px;"></td>
                    <td style="padding: 8px 10px; padding-left: 30px;">
                      <i class="ri-arrow-${isFacOpen ? 'down' : 'right'}-s-line" style="color: var(--text-muted); margin-right: 4px;"></i>
                      <i class="ri-file-text-line" style="color: var(--primary); margin-right: 4px;"></i>
                      <span style="font-size: 0.8rem;">${facKey}</span>
                      <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 8px;">(${items.length} mov.)</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-size: 0.8rem; color: var(--primary);">$${facDebe.toLocaleString()}</td>
                    <td style="padding: 8px 10px; text-align: right; font-size: 0.8rem; color: var(--success);">$${facHaber.toLocaleString()}</td>
                    <td style="padding: 8px 10px; text-align: right; font-size: 0.8rem; font-weight: 500; color: ${facSaldo > 0 ? 'var(--warning)' : 'var(--success)'};">$${facSaldo.toLocaleString()}</td>
                    <td style="padding: 8px 10px;"></td>
                  </tr>
                  ${isFacOpen ? items.map(item => `
                  <tr class="detalle-row" style="background: #e9ecef; font-size: 0.8rem;">
                    <td style="padding: 6px 10px;"></td>
                    <td style="padding: 6px 10px; padding-left: 50px; color: var(--text-muted);">
                      <span style="margin-right: 8px;">${item.fecha}</span>
                      <span style="background: #dee2e6; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">${item.tipo_doc}</span>
                      <div style="font-size: 0.75rem; margin-top: 2px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.detalle}</div>
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
          ${clientesConSaldo.length > 50 ? `
          <div style="text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">
            Mostrando 50 de ${clientesConSaldo.length} clientes. Use los filtros para reducir resultados.
          </div>
          ` : ''}
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

    // Search inputs with debounce
    let debounceTimer;
    ['cxcSearchCuenta', 'cxcSearchCliente', 'cxcSearchFactura'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.oninput = (e) => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            self.state[id] = e.target.value;
            self.renderCXC();
          }, 400);
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

    // Moroso cards click
    document.querySelectorAll('.moroso-card').forEach(card => {
      card.onclick = () => {
        self.state.cxcSelectedCliente = card.dataset.codigo;
        self.state.cxcOpenClientes.add(card.dataset.codigo);
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

    const filename = `promocion_${years.join('-')}_${new Date().toISOString().slice(0,10)}.csv`;
    this._downloadCSV(filename, rows.join('\n'));
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
