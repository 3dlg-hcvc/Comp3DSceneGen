class PaperTable {
  constructor() {
    this.papers = [];             // All papers from CSV
    this.filteredPapers = [];     // Papers after applying filters
    this.sortColumn = null;       // Column to sort by
    this.sortDirection = "asc";   // Sort direction
    this.filters = {};            // Active filters
    this.iconMappings = null;     // Icon mappings for legend from JSON
    this.colorMaps = {};          // Color mappings for each column's values
    this.columnWidths = null;     // Fixed column widths to prevent shrinking
  }

  // ======================================================================================== Initialization

  // Table setup, called on page load
  async init() {
    try {
      // Load icon mappings
      const iconResponse = await fetch("./static/data/icon_mappings.json");
      this.iconMappings = await iconResponse.json();

      // Load and parse CSV into an array of paper objects
      const csvResponse = await fetch("./static/data/paper_summary_full.csv");
      const csvText = await csvResponse.text();
      this.papers = this.parseCSV(csvText);
      
      // Filter papers where SelectedForTable is "T"
      this.papers = this.papers.filter(paper => paper.SelectedForTable === "T");
      this.filteredPapers = [...this.papers];

      // Generate color mappings for each column
      this.generateColorMaps();

      this.renderTable();
      this.setupEventListeners();
      
      // Capture initial column widths to prevent shrinking when filtered
      this.captureColumnWidths();
    } catch (error) {
      console.error("Error initializing paper table:", error);
    }
  }

  // ======================================================================================== Input Parsing

  // Parse CSV text into an array of paper objects
  parseCSV(csvText) {
    const lines = csvText.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    
    // Handle each line
    const papers = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue; // Skip empty lines

      // Parse the line into a paper object
      const paper = {};
      const values = this.parseCSVLine(line);
      headers.forEach((header, index) => {
        paper[header] = values[index] || "";
      });

      // Extract year from citation column instead of using Year column directly
      if (paper.Citation) {
        const yearMatch = paper.Citation.match(/(\d{4})/);
        if (yearMatch) {
          paper.Year = yearMatch[1];
        }
      }

      papers.push(paper);
    }

    return papers;
  }

  // Parse a single CSV line, handling quoted commas
  parseCSVLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      // Do not split on commas within quotes
      if (char === "\"") {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    
    values.push(current.trim());
    return values;
  }

  // Generate distinct colors for each value in each column
  generateColorMaps() {
    const columns = [
      "Group",
      "Input Conditioning",
      "Scene Representation",
      "Knowledge Base",
      "Layout Generation",
      "Generation Extra",
      "Placement Refinement",
      "Obj Shape",
      "Retrieval Extra"
    ];

    columns.forEach(column => {
      const uniqueValues = this.getUniqueValues(column);
      const colorMap = {};
      
      uniqueValues.forEach((value, index) => {

        // Cycle through hues
        const hue = (index * 1.7 * 360) % 360;
        const saturation = 80;
        const lightness = 95;
        
        colorMap[value] = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      });
      
      this.colorMaps[column] = colorMap;
    });
  }

  // ======================================================================================= Getters and Mappings

  // Check if a value should be displayed for a given column and paper
  shouldDisplayValue(column, paper) {
    // Only show Generation Extra values if Group is "Deep" or "Stats"
    if (column === "Generation Extra") {
      const group = paper["Group"] || "";
      return group === "Deep" || group === "Stats";
    }
    return true;
  }

  // Get mapping category from csv column name to the name used in JSON
  getMappingCategory(column) {
    const mappingCategories = {
      "Input Conditioning": "input_conditioning",
      "Scene Representation": "scene_representation",
      "Knowledge Base": "knowledge_base",
      "Layout Generation": "layout_generation",
      "Generation Extra": "generation_extra",
      "Placement Refinement": "placement_refinement",
      "Obj Shape": "obj_shape",
      "Retrieval Extra": "retrieval_extra"
    };
    
    return mappingCategories[column];
  }

  // Apply _replace mapping to a value if it exists in the JSON
  applyReplacementMapping(category, value) {
    if (!value || !category || !this.iconMappings) {
      return value;
    }

    const categoryMappings = this.iconMappings[category];
    if (!categoryMappings || !categoryMappings._replace) {
      return value;
    }

    const replaceMap = categoryMappings._replace;
    return replaceMap[value] || value;
  }

  // Get display name for a column
  getColumnDisplayName(column) {
    switch (column) {
      case "Input Conditioning":
        return "Input";
      case "Scene Representation":
        return "Representation";
      case "Knowledge Base":
        return "Knowledge";
      case "Layout Generation":
        return "Layout";
      case "Generation Extra":
        return "Layout Details";
      case "Obj Shape":
        return "Object";
      case "Placement Refinement":
        return "Placement";
      case "Retrieval Extra":
        return "Retrieval Details";
      default:
        return column;
    }
  }

  // Map a cell value to its legend using iconMappings
  getLegendValue(category, value) {

    // Return as is if empty or N/A
    if (!value || value === "N/A") {
      return value;
    }

    // Get the mappings for this category
    const categoryMappings = this.iconMappings[category];

    // Return as is if no mapping found for this category
    if (!categoryMappings) {
      return value;
    }
    
    // Split by comma and map each value
    const values = value.split(",").map(v => v.trim());
    const legendValues = values.map(v => {
      const mappedValue = this.applyReplacementMapping(category, v);  // Apply replacements using helper
      const mapping = categoryMappings[mappedValue];                  // Then get the final mapping
      return mapping ? mapping.legend : v;                            // Fallback to original if no mapping
    });

    return legendValues.join(", ");
  }

  // Get unique values for a column, used for filter options
  getUniqueValues(column) {
    const valuesSet = new Set();
    const mappingCategory = this.getMappingCategory(column);
    
    // Go through all papers and collect unique values for the column
    this.papers.forEach(paper => {
      // Skip if this value shouldn't be displayed for this paper
      if (!this.shouldDisplayValue(column, paper)) {
        return;
      }
      
      const value = paper[column];
      if (value) {
        // Split by comma for multi-value fields
        const values = value.split(",").map(v => v.trim());
        values.forEach(v => {
          if (v && v !== "N/A") {
            // Apply replacement mapping if available
            const replacedValue = mappingCategory 
              ? this.applyReplacementMapping(mappingCategory, v)
              : v;
            valuesSet.add(replacedValue);
          }
        });
      }
    });

    return Array.from(valuesSet).sort();
  }

  // ======================================================================================= Filtering and Sorting

  // Apply filters to the papers
  applyFilters() {

    // Select subset of papers matching all active filters into a new array
    this.filteredPapers = this.papers.filter(paper => {

      // Check each column with active filters
      for (const [column, filterValues] of Object.entries(this.filters)) {
        if (filterValues.size === 0) continue; // Skip if no filters for this column
        
        // Get the paper's value(s) for this column
        const paperValue = paper[column] || "";
        const paperValues = paperValue.split(",").map(v => v.trim());
        
        // Get mapping category and apply replacement mappings
        const mappingCategory = this.getMappingCategory(column);
        const replacedPaperValues = mappingCategory
          ? paperValues.map(v => this.applyReplacementMapping(mappingCategory, v))
          : paperValues;
        
        // Check if any of the paper's replaced values match any of the filter values
        const hasMatch = replacedPaperValues.some(pv => filterValues.has(pv));

        // If at least one filter does not match, no need to check further
        if (!hasMatch) {
          return false;
        }
      }

      // If all filters match, include this paper
      return true;
    });
    
    // After filtering, re-apply sorting and re-render
    this.sortPapers();
    this.renderTable();
  }

  // Sort the filtered papers based on current sort settings
  sortPapers() {

    // If no sort column is set, do nothing
    if (!this.sortColumn) {
      return;
    }

    // Sort in place
    this.filteredPapers.sort((a, b) => {

      // Get values from paper a and b for the sort column
      let aVal = a[this.sortColumn] || "";
      let bVal = b[this.sortColumn] || "";

      // Try to parse as numbers for Year column
      if (this.sortColumn === "Year") {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      }

      let comparison = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        // If both are numbers, compare numerically
        comparison = aVal - bVal;
      } else {
        // Else compare as strings
        comparison = aVal.toString().localeCompare(bVal.toString());
      }

      // Return comparison adjusted for sort direction
      return this.sortDirection === "asc" ? comparison : -comparison;
    });
  }

  // ======================================================================================== User Actions

  // Toggle sorting for a column
  toggleSort(column) {

    if (this.sortColumn === column) {
      // If already sorting by this column, reverse direction
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    } else {
      // Else start sorting by this new column ascending
      this.sortColumn = column;
      this.sortDirection = "asc";
    }

    // Re-sort and re-render
    this.sortPapers();
    this.renderTable();
  }

  // Toggle a filter value for a column
  toggleFilter(column, value) {
    
    // Initialize filter set for column if not present
    if (!this.filters[column]) {
      this.filters[column] = new Set();
    }

    // Add or remove the value from the filter set
    if (this.filters[column].has(value)) {
      this.filters[column].delete(value);
    } else {
      this.filters[column].add(value);
    }

    this.applyFilters();
  }

  // Filter the search results in the filter popup
  filterSearchResults() {
    const searchInput = document.getElementById("filter-search-input");
    if (!searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();
    const filterLabels = document.querySelectorAll(".paper-table-filter-label");
    let visibleCount = 0;

    filterLabels.forEach(label => {
      const filterValue = label.getAttribute("data-filter-value") || "";
      if (filterValue.includes(searchTerm)) {
        label.style.display = "flex";
        visibleCount++;
      } else {
        label.style.display = "none";
      }
    });

    // Show "no results" message if nothing matches
    let noResultsMsg = document.getElementById("filter-no-results");
    if (visibleCount === 0 && !noResultsMsg) {
      const listContainer = document.getElementById("filter-options-list");
      listContainer.insertAdjacentHTML("beforeend", `
        <div id="filter-no-results" class="paper-table-filter-empty">
          <i class="fas fa-search"></i>
          <p>No options match your search</p>
        </div>
      `);
    } else if (visibleCount > 0 && noResultsMsg) {
      noResultsMsg.remove();
    }
  }

  // Select all filters for a column
  selectAllFilters(column) {
    const uniqueValues = this.getUniqueValues(column);
    this.filters[column] = new Set(uniqueValues);
    this.applyFilters();
    this.showFilterPopup(column);
  }

  // Deselect all filters for a column
  deselectAllFilters(column) {
    this.filters[column] = new Set();
    this.applyFilters();
    this.showFilterPopup(column);
  }

  // Update the filter UI after a change
  updateFilterUI(column) {
    const currentFilters = this.filters[column] || new Set();
    
    // Update the active state of labels
    const filterLabels = document.querySelectorAll(".paper-table-filter-label");
    filterLabels.forEach(label => {
      const checkbox = label.querySelector("input[type=\"checkbox\"]");
      if (checkbox && checkbox.checked) {
        label.classList.add("is-active");
      } else {
        label.classList.remove("is-active");
      }
    });

    // Update the count in footer
    const countElement = document.getElementById("filter-selected-count");
    if (countElement) {
      countElement.innerHTML = `<strong>${currentFilters.size}</strong> filter${currentFilters.size !== 1 ? "s" : ""} selected`;
    }
  }

  // Clear all filters
  clearFilters() {
    this.filters = {};
    this.applyFilters();
  }

  // ======================================================================================== HTML Rendering

  // Capture the initial column widths to prevent shrinking
  captureColumnWidths() {
    const table = document.querySelector("#paper-table-container table");
    if (table && !this.columnWidths) {
      // Wait for next frame to ensure table is fully rendered
      requestAnimationFrame(() => {
        const headers = table.querySelectorAll("thead th");
        this.columnWidths = Array.from(headers).map(th => th.offsetWidth);
        console.log("Captured column widths:", this.columnWidths);
      });
    }
  }

  // ----------------------------------------------------------------------------------- Main Table Rendering

  renderTable() {
    const container = document.getElementById("paper-table-container");
    if (!container) return;
    
    // The columns to display in the table
    const displayColumns = [
      "Method",
      "Year",
      "Group",
      "Input Conditioning",
      "Scene Representation",
      "Knowledge Base",
      "Layout Generation",
      "Generation Extra",
      "Placement Refinement",
      "Obj Shape",
      "Retrieval Extra"
    ];

    // Start with a status header and clear filters button (outside the scrollable container)
    let html = `
      <div class="box">
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
              <button onclick="paperTable.clearFilters()" class="button is-small is-danger is-outlined"> Clear All Filters </button>
            </div>
          </div>
        </div>
        <div class="table-container">
    `;

    // Start table
    html += `
        <table class="table is-striped is-hoverable is-fullwidth">
          <thead>
            <tr>
    `;

    // ------------ Table headers
    displayColumns.forEach((column, index) => {

      // Determine sort icon to show
      const isSorted = this.sortColumn === column;
      const sortIcon = isSorted 
        ? (this.sortDirection === "asc" ? "fa-sort-up" : "fa-sort-down")
        : "fa-sort";
      
      // Get display name for column
      const columnDisplayName = this.getColumnDisplayName(column);
      
      // Apply fixed width if we have it captured
      const widthStyle = this.columnWidths && this.columnWidths[index] 
        ? ` style="min-width: ${this.columnWidths[index]}px; width: ${this.columnWidths[index]}px;"` 
        : '';
      
      html += `
        <th${widthStyle}>
          <div class="level mb-2">
            <div class="level-left">
              <div class="level-item">
                <span class="is-size-7 has-text-weight-semibold ${columnDisplayName === "Method" ? "paper-table-method-header" : ""}">${columnDisplayName}</span>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button onclick="paperTable.toggleSort('${column}')" class="button is-small is-white mr-0" title="Sort by ${column}">
                  <span class="icon is-small">
                    <i class="fas ${sortIcon}"></i>
                  </span>
                </button>
                <button onclick="paperTable.showFilterPopup('${column}')" class="button is-small is-info is-light"> 
                  <span class="icon is-small">
                    <i class="fas fa-filter"></i>
                  </span>
                  ${this.filters[column] && this.filters[column].size > 0 
                    ? `<span class="is-info is-light ml-1">${this.filters[column].size}</span>`
                    : ''
                  }
                </button>
              </div>
            </div>
          </div>
        </th>
      `;
    });

    // End table header
    html += "</tr></thead><tbody>";

    // ------------ Table rows
    this.filteredPapers.forEach((paper, index) => {
      html += `<tr>`;

      displayColumns.forEach((column, colIndex) => {
        // Get the value, or empty string if it shouldn't be displayed
        let value = this.shouldDisplayValue(column, paper) ? (paper[column] || "") : "";
        
        // Get mapping category for this column
        const mappingCategory = this.getMappingCategory(column);
        
        // Split raw CSV values and filter out empty/N/A/Unknown
        const rawValues = value.split(",").map(v => v.trim()).filter(v => v && v !== "N/A" && v !== "Unknown");
        
        // Process each raw value to get both replaced value (for color) and legend (for display)
        // Use a Map to deduplicate by replaced value (e.g., ObjectCategories & ObjectList -> ObjectInfo)
        const processedMap = new Map();
        rawValues.forEach(rawVal => {
          const replacedVal = mappingCategory 
            ? this.applyReplacementMapping(mappingCategory, rawVal)
            : rawVal;
          
          // Only add if we haven't seen this replaced value yet (deduplication)
          if (!processedMap.has(replacedVal)) {
            const categoryMappings = mappingCategory && this.iconMappings?.[mappingCategory];
            const legendVal = categoryMappings?.[replacedVal]?.legend || rawVal;
            
            processedMap.set(replacedVal, { replaced: replacedVal, legend: legendVal });
          }
        });
        
        // Convert map to array of values
        const processedValues = Array.from(processedMap.values());
        
        // Apply fixed width if we have it captured
        const widthStyle = this.columnWidths && this.columnWidths[colIndex] 
          ? ` style="min-width: ${this.columnWidths[colIndex]}px; width: ${this.columnWidths[colIndex]}px;"` 
          : '';
        
        // Special handling for Method and Year columns (no badges)
        if (column === "Method") {
          const formattedValue = processedValues.length > 0 ? processedValues[0].legend : "-";
          html += `
            <td class="is-size-6 has-text-left"${widthStyle}>
              <a href="https://scholar.google.com/scholar?q=${encodeURIComponent(formattedValue)}" 
                 target="_blank" 
                 class="has-text-link"
                 title="Search on Google Scholar">
                ${formattedValue}
              </a>
            </td>
          `;

        } else if (column === "Year") {
          const formattedValue = processedValues.length > 0 ? processedValues[0].legend : "-";
          html += `<td class="is-size-6 has-text-left"${widthStyle}>${formattedValue}</td>`;

        } else {
          // Use colored badges for all other columns
          // Use replaced value for color lookup, legend value for display
          const formattedValue = processedValues.length > 0 
            ? '<div>' + processedValues.map(pv => {
                const bgColor = this.colorMaps[column]?.[pv.replaced] || "#E0E0E0";
                return `<span class="tag paper-table-tag" style="background-color: ${bgColor};">${pv.legend}</span>`;
              }).join("") + '</div>'
            : "-";
          html += `<td class="is-size-6 has-text-left"${widthStyle}>${formattedValue}</td>`;
        }
      });

      html += "</tr>";
    });

    // End table and close both the table-container and box divs
    html += "</tbody></table></div></div>";

    // Put the HTML into the container
    container.innerHTML = html;
  }

  // ----------------------------------------------------------------------------------- Filter Popup Rendering
  
  showFilterPopup(column) {
    
    // Get unique values and current filters for the column
    const uniqueValues = this.getUniqueValues(column);
    const currentFilters = this.filters[column] || new Set();

    // Get mapping category and display name for column
    const categoryMapping = this.getMappingCategory(column);
    const columnDisplayName = this.getColumnDisplayName(column);
    
    // Start building popup HTML
    let html = `
      <div class="modal is-active" id="filter-popup">
        <div class="modal-background" onclick="paperTable.closeFilterPopup()"></div>
        <div class="modal-card paper-table-modal-card">
          <header class="modal-card-head paper-table-modal-header">
            <p class="modal-card-title">Filter by ${columnDisplayName}</p>
            <button class="delete" aria-label="close" onclick="paperTable.closeFilterPopup()"></button>
          </header>
          <section class="modal-card-body paper-table-modal-body">
    `;

    // Add search box
    html += `
      <div class="paper-table-filter-search">
        <div class="field">
          <div class="control has-icons-left">
            <input 
              class="input" 
              type="text" 
              placeholder="Search options..." 
              id="filter-search-input"
              oninput="paperTable.filterSearchResults()"
            >
            <span class="icon is-left">
              <i class="fas fa-search"></i>
            </span>
          </div>
        </div>
      </div>
    `;

    // Start filter options list
    html += '<div id="filter-options-list">';

    // Add checkboxes for each unique value
    uniqueValues.forEach(value => {
      const isChecked = currentFilters.has(value);
      const displayValue = categoryMapping 
        ? this.getLegendValue(categoryMapping, value)
        : value;

      html += `
        <label class="paper-table-filter-label ${isChecked ? "is-active" : ""}" data-filter-value="${displayValue.toLowerCase()}">
          <input 
            type="checkbox" 
            ${isChecked ? "checked" : ""}
            onchange="paperTable.toggleFilter('${column}', '${value.replace(/'/g, "\\'").replace(/"/g, "&quot;")}'); paperTable.updateFilterUI('${column}');"
          >
          <span>${displayValue}</span>
        </label>
      `;
    });

    html += `
            </div>
          </section>
          <footer class="modal-card-foot paper-table-modal-footer">
            <div class="level is-mobile" style="width: 100%; margin: 0;">
              <div class="level-left">
                <div class="level-item">
                  <span class="paper-table-selected-summary" id="filter-selected-count">
                    <strong>${currentFilters.size}</strong> filter${currentFilters.size !== 1 ? "s" : ""} selected
                  </span>
                </div>
              </div>
              <div class="level-right">
                <div class="level-item">
                  <button class="button is-light" onclick="paperTable.selectAllFilters('${column}')">
                    <span class="icon is-small">
                      <i class="fas fa-check-square"></i>
                    </span>
                    <span>Select All</span>
                  </button>
                </div>
                <div class="level-item">
                  <button class="button is-light" onclick="paperTable.deselectAllFilters('${column}')">
                    <span class="icon is-small">
                      <i class="fas fa-square"></i>
                    </span>
                    <span>Clear</span>
                  </button>
                </div>
                <div class="level-item">
                  <button class="button is-primary" onclick="paperTable.closeFilterPopup()">
                    <span class="icon is-small">
                      <i class="fas fa-check"></i>
                    </span>
                    <span>Done</span>
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
    `;

    // Remove existing popup if any
    this.closeFilterPopup();

    // Add popup to body
    document.body.insertAdjacentHTML("beforeend", html);
  }

  // Close and remove the filter popup
  closeFilterPopup() {
    const popup = document.getElementById("filter-popup");
    if (popup) {
      popup.remove();
    }
  }

  // ======================================================================================== Event Listeners

  setupEventListeners() {
    // Close popup on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeFilterPopup();
      }
    });
  }
}

// Initialize the paper table
const paperTable = new PaperTable();

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => paperTable.init());
} else {
  paperTable.init();
}
