// Paper Table Management
class PaperTable {
  constructor() {
    this.papers = [];
    this.filteredPapers = [];
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.filters = {};
    this.iconMappings = null;
  }

  async init() {
    try {
      // Load icon mappings
      const iconResponse = await fetch('./static/data/icon_mappings.json');
      this.iconMappings = await iconResponse.json();

      // Load and parse CSV
      const csvResponse = await fetch('./static/data/paper_summary_full.csv');
      const csvText = await csvResponse.text();
      this.papers = this.parseCSV(csvText);
      
      // Filter papers where SelectedForTable is 'T'
      this.papers = this.papers.filter(paper => paper.SelectedForTable === 'T');
      this.filteredPapers = [...this.papers];

      this.renderTable();
      this.setupEventListeners();
    } catch (error) {
      console.error('Error initializing paper table:', error);
    }
  }

  parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const papers = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const values = this.parseCSVLine(line);
      const paper = {};
      
      headers.forEach((header, index) => {
        paper[header] = values[index] || '';
      });

      papers.push(paper);
    }

    return papers;
  }

  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current.trim());
    return values;
  }

  getLegendValue(category, value) {
    if (!value || value === 'N/A') return value;
    
    const categoryMappings = this.iconMappings[category];
    if (!categoryMappings) return value;

    const replaceMap = categoryMappings._replace || {};
    
    // Split by comma and map each value
    const values = value.split(',').map(v => v.trim());
    const legendValues = values.map(v => {
      // Check if there's a replacement mapping
      const mappedValue = replaceMap[v] || v;
      const mapping = categoryMappings[mappedValue];
      return mapping ? mapping.legend : v;
    });

    return legendValues.join(', ');
  }

  getUniqueValues(column) {
    const valuesSet = new Set();
    
    this.papers.forEach(paper => {
      const value = paper[column];
      if (value) {
        // Split by comma for multi-value fields
        const values = value.split(',').map(v => v.trim());
        values.forEach(v => {
          if (v && v !== 'N/A') {
            valuesSet.add(v);
          }
        });
      }
    });

    return Array.from(valuesSet).sort();
  }

  applyFilters() {
    this.filteredPapers = this.papers.filter(paper => {
      for (const [column, filterValues] of Object.entries(this.filters)) {
        if (filterValues.size === 0) continue;

        const paperValue = paper[column] || '';
        const paperValues = paperValue.split(',').map(v => v.trim());
        
        // Check if any of the paper's values match any of the filter values
        const hasMatch = paperValues.some(pv => filterValues.has(pv));
        if (!hasMatch) return false;
      }
      return true;
    });

    this.sortPapers();
    this.renderTable();
  }

  sortPapers() {
    if (!this.sortColumn) return;

    this.filteredPapers.sort((a, b) => {
      let aVal = a[this.sortColumn] || '';
      let bVal = b[this.sortColumn] || '';

      // Try to parse as numbers for Year column
      if (this.sortColumn === 'Year') {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      }

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = aVal.toString().localeCompare(bVal.toString());
      }

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  toggleSort(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.sortPapers();
    this.renderTable();
  }

  toggleFilter(column, value) {
    if (!this.filters[column]) {
      this.filters[column] = new Set();
    }

    if (this.filters[column].has(value)) {
      this.filters[column].delete(value);
    } else {
      this.filters[column].add(value);
    }

    this.applyFilters();
  }

  clearFilters() {
    this.filters = {};
    this.applyFilters();
  }

  renderTable() {
    const container = document.getElementById('paper-table-container');
    if (!container) return;

    const displayColumns = [
      'Method',
      'Short Name',
      'Year',
      'Group',
      'Input Conditioning',
      'Scene Representation',
      'Knowledge Base',
      'Layout Generation',
      'Placement Refinement',
      'Obj Shape'
    ];

    let html = `
      <div class="box mb-4">
        <div class="level">
          <div class="level-left">
            <div class="level-item">
              <p class="is-size-7 has-text-grey">
                Showing ${this.filteredPapers.length} of ${this.papers.length} papers
              </p>
            </div>
          </div>
          <div class="level-right">
            <div class="level-item">
              <button 
                onclick="paperTable.clearFilters()" 
                class="button is-small is-grey"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="table-container">
        <table class="table is-striped is-hoverable is-fullwidth">
          <thead>
            <tr>
    `;

    // Table headers with sort buttons
    displayColumns.forEach(column => {
      const isSorted = this.sortColumn === column;
      const sortIcon = isSorted 
        ? (this.sortDirection === 'asc' ? '▲' : '▼')
        : '⇅';
      
      html += `
        <th>
          <div class="is-flex is-justify-content-space-between is-align-items-center mb-2">
            <span class="is-size-7 has-text-weight-semibold">${column}</span>
            <button 
              onclick="paperTable.toggleSort('${column}')"
              class="button is-small is-ghost"
              title="Sort by ${column}"
            >
              ${sortIcon}
            </button>
          </div>
          <div>
            <button 
              onclick="paperTable.showFilterPopup('${column}')"
              class="button is-small is-info is-light"
            >
              <span class="is-size-7">Filter</span>
            </button>
            ${this.filters[column] && this.filters[column].size > 0 
              ? `<span class="tag is-info is-light ml-1">${this.filters[column].size}</span>`
              : ''
            }
          </div>
        </th>
      `;
    });

    html += '</tr></thead><tbody>';

    // Table rows
    this.filteredPapers.forEach((paper, index) => {
      html += `<tr>`;

      displayColumns.forEach(column => {
        let value = paper[column] || '';
        
        // Map values to legends for specific columns
        const mappingCategories = {
          'Input Conditioning': 'input_conditioning',
          'Scene Representation': 'scene_representation',
          'Knowledge Base': 'knowledge_base',
          'Layout Generation': 'layout_generation',
          'Placement Refinement': 'placement_refinement',
          'Obj Shape': 'obj_shape'
        };

        if (mappingCategories[column]) {
          value = this.getLegendValue(mappingCategories[column], value);
        }

        // Add citation link for Method column
        if (column === 'Method' && paper['Citation']) {
          const citation = paper['Citation'];
          html += `
            <td>
              <a href="https://scholar.google.com/scholar?q=${encodeURIComponent(value)}" 
                 target="_blank" 
                 class="has-text-link"
                 title="Search on Google Scholar">
                ${value}
              </a>
            </td>
          `;
        } else {
          html += `<td class="is-size-7">${value}</td>`;
        }
      });

      html += '</tr>';
    });

    html += '</tbody></table></div>';

    container.innerHTML = html;
  }

  showFilterPopup(column) {
    const uniqueValues = this.getUniqueValues(column);
    const currentFilters = this.filters[column] || new Set();

    // Map values to legends for display
    const mappingCategories = {
      'Input Conditioning': 'input_conditioning',
      'Scene Representation': 'scene_representation',
      'Knowledge Base': 'knowledge_base',
      'Layout Generation': 'layout_generation',
      'Placement Refinement': 'placement_refinement',
      'Obj Shape': 'obj_shape'
    };

    const categoryMapping = mappingCategories[column];

    let html = `
      <div class="modal is-active" id="filter-popup">
        <div class="modal-background" onclick="paperTable.closeFilterPopup()"></div>
        <div class="modal-card" style="max-height: 80vh;">
          <header class="modal-card-head">
            <p class="modal-card-title">Filter by ${column}</p>
            <button class="delete" aria-label="close" onclick="paperTable.closeFilterPopup()"></button>
          </header>
          <section class="modal-card-body" style="max-height: 60vh; overflow-y: auto;">
            <div class="content">
    `;

    uniqueValues.forEach(value => {
      const isChecked = currentFilters.has(value);
      const displayValue = categoryMapping 
        ? this.getLegendValue(categoryMapping, value)
        : value;

      html += `
        <label class="checkbox is-block mb-2 p-2" style="cursor: pointer;">
          <input 
            type="checkbox" 
            ${isChecked ? 'checked' : ''}
            onchange="paperTable.toggleFilter('${column}', '${value.replace(/'/g, "\\'")}'); paperTable.closeFilterPopup();"
          >
          <span class="ml-2 is-size-7">${displayValue}</span>
        </label>
      `;
    });

    html += `
            </div>
          </section>
          <footer class="modal-card-foot">
            <button class="button" onclick="paperTable.closeFilterPopup()">Close</button>
          </footer>
        </div>
      </div>
    `;

    // Remove existing popup if any
    this.closeFilterPopup();

    // Add popup to body
    document.body.insertAdjacentHTML('beforeend', html);
  }

  closeFilterPopup() {
    const popup = document.getElementById('filter-popup');
    if (popup) {
      popup.remove();
    }
  }

  setupEventListeners() {
    // Close popup on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeFilterPopup();
      }
    });

    // Close popup on background click
    document.addEventListener('click', (e) => {
      const popup = document.getElementById('filter-popup');
      if (popup && e.target === popup) {
        this.closeFilterPopup();
      }
    });
  }
}

// Initialize the paper table
const paperTable = new PaperTable();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => paperTable.init());
} else {
  paperTable.init();
}
