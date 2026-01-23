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
    metricFilter: null // 'debe' or 'haber' filter from KPIs
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
        this.render();
      });
    });

    if (document.getElementById('btn-clear-all')) {
      document.getElementById('btn-clear-all').onclick = () => {
        this.state.selectedAccount = null;
        this.state.selectedCPType = null;
        this.state.metricFilter = null;
        this.renderFilters();
        this.render();
      };
    }
  },

  render() {
    switch (this.state.currentPage) {
      case 'resumen':
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

    // Aggregations
    let totalDebe = 0;
    let totalHaber = 0;
    const accountAgg = {};
    const cpAggGeneral = {};
    const accountsSet = new Set();

    // 1. First, aggregate CP Breakdown (always filtered by selectedAccount)
    // This populates the Donut chart and breakdown list regardless of selectedCPType
    Object.entries(data.cp_breakdown).forEach(([acc, yearsData]) => {
      if (filterAcc && acc !== filterAcc) return;
      years.forEach(y => {
        if (yearsData[y]) {
          Object.entries(yearsData[y]).forEach(([type, metrics]) => {
            if (!cpAggGeneral[type]) cpAggGeneral[type] = { debe: 0, haber: 0 };
            cpAggGeneral[type].debe += metrics.debe;
            cpAggGeneral[type].haber += metrics.haber;
          });
        }
      });
    });

    // 2. Then, calculate KPIs and Ranking based on BOTH filters
    Object.entries(data.cp_breakdown).forEach(([acc, yearsData]) => {
      // Filter by account if selected
      if (filterAcc && acc !== filterAcc) return;

      years.forEach(y => {
        if (yearsData[y]) {
          Object.entries(yearsData[y]).forEach(([type, metrics]) => {
            // Filter by CP Type if selected
            if (filterCP && type !== filterCP) return;

            totalDebe += metrics.debe;
            totalHaber += metrics.haber;
            accountAgg[acc] = (accountAgg[acc] || 0) + metrics.debe;
            accountsSet.add(acc);
          });
        }
      });
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
        <h5 style="color: var(--text-heading); margin-bottom: 1.5rem;">Auditoría Jerárquica (Gasto > Contrapartida > Asiento)</h5>
        <div id="promo-hierarchical-table" class="hierarchical-table"></div>
      </div>
    `;

    this.renderRankingChart(sortedAccounts);
    this.renderCPChart(cpAggGeneral);
    this.createHierarchicalTable();

    // Bind Events
    document.querySelectorAll('.metric-card').forEach(card => {
      card.onclick = () => {
        const m = card.dataset.metric;
        this.state.metricFilter = (this.state.metricFilter === m) ? null : m;
        this.renderFilters();
        this.render();
      };
    });
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
            this.render();
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
    this.render();
  },

  createHierarchicalTable() {
    const data = this.state.data.promocion.detalle;
    const years = this.state.selectedYears;
    const { selectedAccount: filterAcc, selectedCPType: filterCP, metricFilter } = this.state;

    const filtered = data.filter(d =>
      years.includes(d.anio) &&
      (!filterAcc || d.cuenta === filterAcc) &&
      (!filterCP || d.tipo_cp === filterCP) &&
      (!metricFilter || (metricFilter === 'debe' ? d.debe > 0 : metricFilter === 'haber' ? d.haber > 0 : true))
    );

    const hierarchy = {};
    filtered.forEach(d => {
      if (!hierarchy[d.cuenta]) hierarchy[d.cuenta] = {};
      if (!hierarchy[d.cuenta][d.contrapartida]) hierarchy[d.cuenta][d.contrapartida] = [];
      hierarchy[d.cuenta][d.contrapartida].push(d);
    });

    const container = document.getElementById('promo-hierarchical-table');
    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Sin datos para los filtros seleccionados</div>`;
      return;
    }

    container.innerHTML = Object.entries(hierarchy).map(([acc, cpGroup]) => {
      const accTotals = Object.values(cpGroup).reduce((s, rows) => {
        rows.forEach(r => { s.debe += r.debe; s.haber += r.haber; });
        return s;
      }, { debe: 0, haber: 0 });
      const accNeto = accTotals.debe - accTotals.haber;

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
            ${Object.entries(cpGroup).map(([cp, rows]) => {
        const cpTotals = rows.reduce((s, r) => ({ debe: s.debe + r.debe, haber: s.haber + r.haber }), { debe: 0, haber: 0 });
        const cpNeto = cpTotals.debe - cpTotals.haber;
        return `
                <details class="h-details h-level-2">
                  <summary class="h-header">
                    <i class="ri-user-follow-line"></i> <span>Cliente: ${cp}</span>
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
                          <th>Fecha</th>
                          <th>Asiento</th>
                          <th>Documentos</th>
                          <th>Cuenta</th>
                          <th>Tipo Doc</th>
                          <th>Detalle</th>
                          <th style="text-align: right;">Debe</th>
                          <th style="text-align: right;">Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${rows.map(row => {
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
            this.render();
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
