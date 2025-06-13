<script>
    import { createEventDispatcher } from 'svelte';

    import { GLOBAL_COLORS } from '$lib/shared/constants/visualizationConstants';
    
    import * as apiService from '$lib/shared/services/apiService.js';
    import * as utils from '$lib/shared/services/utils.js';
    
    export let isLoading = false;
    export let currentView = "tree"; 
    export let processNode = null; //processNode, only used in graph view for correct search implementation

    let searchQuery = "";
    let searchResults = null;
    let selectedResultId = null;
    let globalSearch = false; 
    let isSearching = false;
    let filterSearchTimeout;

    // Display filters state
    let showFiltersPanel = false;
    let filters = {
        networkConnections: false,
        fileReads: false,
        fileWrites: false,
        fileDeletes: false,
        registryReads: false,
        registryWrites: false, 
        interactionCount: null,
        processCreations: false,
        searchNodeIds: null,

        processId: "",
        processName: "",
        commandLine: "",
        ipAddress: "",
        port: "",
        protocol: null,
        path: ""
    };

    let expandedSections = {
        eventType: false, 
        eventCounts: false,
        processId: false,
        processDetails: false,
        networkDetails: false,
        path: false,
        time: false, 
        treeControls: false
    }

    function toggleSection(section) {
        expandedSections[section] = !expandedSections[section];
    }

    function toggleProtocol(protocol) {
        if (filters.protocol === protocol) {
            filters.protocol = null;
        } else {
            filters.protocol = protocol;
        }
        handleFilterChange();
    }
    
    // Time filter state
    let moreThanOneDate = false;
    let defaultDate = "2025-02-18"; // ! placeholder that works for test malware runs, needs to get from data for production
    // Time
    let timeRange = {
        after: {
            date: defaultDate,
            time: ""
        },
        before: {
            date: defaultDate,
            time: ""
        }
    };

    let DISPLAY_VALUES = {
        process: "processPath",
        file: "count",
        registry: "count",
        network: ["srcIp", "srcPort"],
    };

    let DISPLAY_KEYS = {
        process: "Path:",
        file: "Count:",
        registry: "Count:",
        network: "Src IP:",
    };

    // ===== DISPATCHES =====
    const dispatch = createEventDispatcher();

    function collapseAll() {
        dispatch('collapseAll');
    }

    function expandAll() {
        dispatch('expandAll');
    }

    function selectNode(nodeId) {
        dispatch('selectNode', { nodeId });
    }

    function handleFilterChange() {
        dispatch('filterChange', { filters });
    }


    // ===== SEARCH FUNCTIONS =====

    function getActiveFactTypes() {
        const factTypes = [];
        if (filters.networkConnections) factTypes.push("connectedTo");
        if (filters.fileReads) factTypes.push("readFile");
        if (filters.fileWrites) factTypes.push("wroteFile");
        if (filters.fileDeletes) factTypes.push("deletedFile");
        if (filters.registryReads) factTypes.push("readRegistry");
        if (filters.registryWrites) factTypes.push("wroteRegistry");
        if (filters.processCreations) factTypes.push("createdProcess");

        return factTypes;
    }

    function filterSearchResults(results) {
        // Filter out duplicate results based on factId
        const uniqueResults = [];
        const seenFactIds = new Set();

        results.forEach(result => {
            if (!seenFactIds.has(result.factId)) {
                seenFactIds.add(result.factId);
                uniqueResults.push(result);
            }
        });

        return uniqueResults;
    }

    function hexToRgba(hex, alpha = 1) {
        hex = hex.replace('#', '');
        
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // get light version of a color (for normal state)
    function getLightColor(color) {
        return hexToRgba(color, 0.15);
    }

    function getDarkColor(color) {
        return color; // normal color
    }

    // return dark text for light backgrounds and light text for dark backgrounds
    function getTextColor(bgColor) {
        if (bgColor.includes('rgba')) {
            return GLOBAL_COLORS[getFactTypeForFilter(bgColor)] || '#333';
        }
        return '#fff';
    }

    // Map filter names to fact types
    function getFactTypeForFilter(filterName) {
        const mapping = {
            'networkConnections': 'connectedTo',
            'fileReads': 'readFile',
            'fileWrites': 'wroteFile',
            'fileDeletes': 'deletedFile',
            'registryReads': 'readRegistry',
            'registryWrites': 'wroteRegistry',
            'processCreations': 'createdProcess'
        };
        
        return mapping[filterName] || filterName;
    }

    // Get color for a filter
    function getColorForFilter(filterName) {
        const factType = getFactTypeForFilter(filterName);
        return GLOBAL_COLORS[factType] || '#e0e0e0';
    }

     async function applySearch() {
        isSearching = true;

        try {
            // Base search params
            const searchParams = {
                limit: 100,
            };

            // get query from main search field
            searchParams.keywords = "";
            if (searchQuery.trim()) {
                searchParams.keywords = searchQuery;
            }

            // get timestamps if active
            const timestamps = getFormattedTimestamps();
            if (timestamps.after) searchParams.after = timestamps.after;
            if (timestamps.before) searchParams.before = timestamps.before;

            // Event type (fact type) filters
            const activeFactTypes = getActiveFactTypes();

            if (activeFactTypes.length > 0) {
                searchParams.factType = activeFactTypes;
            }

            // Process ID filter
            if (filters.processId.trim()) {
                searchParams.objectValue = [filters.processId.trim()];
            }

            // Process detail filters (name, command line)
            if (isFilterSectionActive('processDetails')) {
                searchParams.objectType = ["process"];

                if (filters.processName.trim()) {
                    // Add process name to keywords search
                    searchParams.keywords += " + " + filters.processName.trim(); 
                }

                if (filters.commandLine.trim()) {
                    // Add command line to keywords search
                    searchParams.keywords += " + " + filters.commandLine.trim(); 
                }
            }

            // Network details filters (IP, port, protocol)
            if (isFilterSectionActive('networkDetails')) {
                searchParams.objectType = ["network"];
                
                if (filters.protocol) {
                    if (searchParams.keywords == "") {
                        searchParams.keywords = filters.protocol;
                    } else {
                        searchParams.keywords = filters.protocol + "\\-" + searchParams.keywords;
                    } 
                }

                if (filters.port.trim()) {
                    if (searchParams.keywords == "") {
                        searchParams.keywords = filters.port.trim();
                    } else {
                        searchParams.keywords = filters.port.trim() + " + \\-" + searchParams.keywords;
                    }
                }

                if (filters.ipAddress.trim()) {
                    if (searchParams.keywords == "") {
                        searchParams.keywords = filters.ipAddress.trim();
                    } else {
                        searchParams.keywords = filters.ipAddress.trim() + " + \\-" + searchParams.keywords;
                    }
                }
            }

            // Path (registry or file) filter
            if (isFilterSectionActive('path')) {
                searchParams.objectType = ["file", "registry"];
                
                if (filters.path.trim()) {
                    searchParams.keywords += " + " + filters.path.trim();
                }
            }
            let rawsearchResults = await apiService.searchFacts(searchParams);
            searchResults = filterSearchResults(rawsearchResults.data); // To remove duplicate results 
            if (currentView === "graph") {
                // filter search results that are not related to the processNode
                if (processNode) {
                    searchResults = searchResults.filter(result => {
                        return result.sourceObjectUid === processNode.data.uid;
                    });
                }
            }
    
            showFiltersPanel = false;
            
            // Highlight nodes based on search results
            if (searchResults) {
                const matchingNodeIds = getMatchingNodeIds(searchResults);
                filters.searchNodeIds = matchingNodeIds;
            } else {
                // Clear highlighting if no results
                filters.searchNodeIds = null;
            }
            handleFilterChange();
        } catch (error) {
            console.error("Error during search:", error);
        } finally {
            isSearching = false;
        }
    }

    function clearSearchResults() {
        clearAllFilters();
    }

    function clearAllFilters() {
        filters = {
            networkConnections: false,
            fileReads: false,
            fileWrites: false,
            fileDeletes: false,
            registryReads: false,
            registryWrites: false, 
            processCreations: false,
            interactionCount: null,
            searchNodeIds: null,

            processId: "",
            processName: "",
            commandLine: "",
            ipAddress: "",
            port: "",
            protocol: null,
            path: ""
        };

        searchResults = null;
        searchQuery = "";
        selectedResultId = null;


        handleFilterChange();
    }

    function clearInteractionCountFilters() {
        filters.interactionCount = null;
        handleFilterChange();
    }

    // Clear interaction type filters
    function clearInteractionTypeFilters() {
        filters.networkConnections = false;
        filters.fileReads = false;
        filters.fileWrites = false;
        filters.fileDeletes = false;
        filters.registryReads = false;
        filters.registryWrites = false;
        filters.processCreations = false;

        handleFilterChange();
    }


    // Clear time filters only
    function clearTimeFilters() {
        timeRange = {
            after: {
                date: defaultDate,
                time: ""
            },
            before: {
                date: defaultDate,
                time: ""
            }
        };
    }

    function hasActiveInteractionCountFilters() {
        return filters.interactionCount !== null;
    }

    function hasActiveInteractionTypes() {
        return filters.networkConnections || 
               filters.fileReads || 
               filters.fileWrites || 
               filters.fileDeletes || 
               filters.registryReads || 
               filters.processCreations ||
               filters.registryWrites;
    }

    function hasActiveTimeFilters() {
        return timeRange.after.time || timeRange.before.time;
    }

    function handleKeydown(event) {
        if (event.key === 'Enter') {
            applySearch();
        }
    }

    function toggleInteractionType(type) {
        filters[type] = !filters[type]; 
        handleFilterChange();
    }

    function selectInteractionCount(countType) {
        // If already selected, unselect
        if (filters.interactionCount === countType) {
            filters.interactionCount = null;
        } else {
            // Otherwise select new option
            filters.interactionCount = countType;
        }
        handleFilterChange();
    }
    
    function toggleGlobalSearch() {
        globalSearch = !globalSearch;
    }

    // Select node in the tree when clicked
    function handleResultClick(result) {
        selectedResultId = result.factId;

        if (currentView === "tree") {
            handleTreeResultClick(result);
        } else {
            handleGraphResultClick(result);
        }
    }

    function handleTreeResultClick(result) {
        if (result.destinationObjectType === 'process') {
            // Dispatch event to select this process in the tree
            dispatch('selectNode', { 
                nodeId: result.destinationObjectUid,
            });
        } else {
            // For non-process objects, select all processes that interact with it
            dispatch('selectNode', { 
                nodeId: result.sourceObjectUid,
            });
        }
    }

    function handleGraphResultClick(result) {
        dispatch('selectNode', { 
            nodeId: result.destinationObjectUid,
            nodeType: result.destinationObjectType,
            nodeName: getDisplayTitle(result),
        });
    }

    function getFormattedTimestamps() {
        const after = timeRange.after.time ? 
            `${timeRange.after.date}T${timeRange.after.time}Z` : null;
            
        const before = timeRange.before.time ? 
            `${timeRange.before.date}T${timeRange.before.time}Z` : null;
            
        return { after, before };
    }

    function getMatchingNodeIds(results) {
        const nodeIds = [];
        
        results.forEach(result => {
            if (currentView === "tree") {
                if (result.destinationObjectType === 'process') {
                    // For process objects, add their ID directly
                    nodeIds.push(result.destinationObjectUid);
                } else {
                    // Non-process objects not in tree
                    // Only add if not already in nodeIds
                    if (!nodeIds.includes(result.sourceObjectUid)) {
                        nodeIds.push(result.sourceObjectUid);
                    }
                }
            } else {
                if (!nodeIds.includes(result.destinationObjectUid)) {
                    nodeIds.push(result.destinationObjectUid);
                }
            }
        });
        
        return nodeIds;
    }

    function getDisplayTitle(result) {
        const type = result.destinationObjectType;
        if (type === "process") {
            return result.meta["processName"];
        }
        else if (type === "network") {
            return result.destinationObjectValue + ":" + result.meta["destPort"];
        }
        else {
            return result.destinationObjectValue;
        }
    }

    function getDisplayValue(result) {
        const type = result.destinationObjectType;
        const field = DISPLAY_VALUES[type];
        if (Array.isArray(field)) { // if network, both IP and port
            return result.meta[field[0]] + ":" + result.meta[field[1]];
        } else {

            return result.meta[field] || result.destinationObjectValue;
        }
    }

    function getFactTypeColor(result) {
        const factType = result.type;
        if (GLOBAL_COLORS[factType]) {
            return GLOBAL_COLORS[factType];
        } else {
            return "#000"; 
        }
    }

    function getFactTypeBackgroundColor(result) {
        const color = getFactTypeColor(result);

        return `${color}20`; 
    }

    function isFilterSectionActive(section) {
        switch(section) {
            case 'eventType':
                return hasActiveInteractionTypes();
            case 'eventCounts':
                return filters.interactionCount !== null;
            case 'processId':
                return filters.processId !== "";
            case 'processDetails':
                return filters.processName !== "" || filters.commandLine !== "";
            case 'networkDetails':
                return filters.ipAddress !== "" || filters.port !== "" || filters.protocol !== null;
            case 'path':
                return filters.path !== "";
            case 'time':
                return timeRange.after.time || timeRange.before.time;
            default:
                return false;
        }
    }

    function isFilterActive() {
        return hasActiveInteractionTypes() || 
               hasActiveInteractionCountFilters() || 
               filters.processId || 
               filters.processName || 
               filters.commandLine || 
               filters.ipAddress || 
               filters.port || 
               filters.protocol || 
               filters.path || 
               hasActiveTimeFilters();
    }

    function Spinner() {
        return `
            <svg class="spinner" viewBox="0 0 50 50" width="24" height="24">
                <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
            </svg>
        `;
    }


</script>

<div class="search-container">
    <img src="/AIGIS_graa.png" alt="Logo" class="logo" />

    <div class="search-section">
        <h3>Search & Filter</h3>
        
        <div class="search-bar">
            <input
                type="text"
                placeholder="Search (e.g. IP, pid, file name...)"
                bind:value={searchQuery}
                on:keydown={handleKeydown}
            />
            <button 
                class="search-button" 
                on:click={applySearch} 
                aria-label="Search"
                disabled={isSearching}
            >
                {#if isSearching}
                    <div class="spinner-container">
                        <svg class="spinner" viewBox="0 0 50 50" width="18" height="18">
                            <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                        </svg>
                    </div>
                {:else}
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                {/if}
            </button>
        </div>

        {#if searchQuery || searchResults}
            <button class="clear-button" on:click={clearSearchResults}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>Clear search</span>
            </button>
        {/if}

        <div class="filters-section">
            <button class="filters-header {isFilterActive() ? 'active' : ''}" on:click={() => showFiltersPanel = !showFiltersPanel}>
                <div class="header-content">
                    <svg class="filter-icon" viewBox="0 0 24 24" width="18" height="18">
                        <path d="M12 16v4M6 12h12M2 8h20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <span>Show filters</span>
                </div>
                <svg class="chevron {showFiltersPanel ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                </svg>
            </button>
            {#if showFiltersPanel}
                <div class="filters-panel">
                    {#if isFilterActive() || searchResults}
                        <div class="clear-filters-global">
                            <button class="clear-all-button" on:click={clearAllFilters}>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                Clear All Filters
                            </button>
                        </div>
                    {/if}

                    <div class="filter-sections">
                        <!-- EVENT TYPE SECTION -->
                        <div class="collapsible-section">
                            <button class="section-header {isFilterSectionActive('eventType') ? 'active' : ''}" 
                                on:click={() => toggleSection('eventType')}>
                                <span>Event Type</span>
                                <svg class="chevron {expandedSections.eventType ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                                </svg>
                            </button>
                            
                            {#if expandedSections.eventType}
                                <div class="section-content">
                                    <p class="section-description">Highlight only nodes related to a given interaction</p>
                                    
                                    <!-- Network section -->
                                    <h5>Network</h5>
                                    <div class="pill-buttons">
                                        <button 
                                            class="pill-button {filters.networkConnections ? 'active' : ''}" 
                                            style="background-color: {filters.networkConnections ? getDarkColor(getColorForFilter('networkConnections')) : getLightColor(getColorForFilter('networkConnections'))}; 
                                                color: {filters.networkConnections ? '#fff' : getColorForFilter('networkConnections')}; 
                                                border-color: {getColorForFilter('networkConnections')}"
                                            on:click={() => toggleInteractionType('networkConnections')} 
                                            on:keydown={handleKeydown}>
                                            Network Connections
                                        </button>
                                    </div>

                                    <!-- Replace your File Operations pill buttons with this: -->
                                    <h5>File Operations</h5>
                                    <div class="pill-buttons">
                                        <button 
                                            class="pill-button {filters.fileReads ? 'active' : ''}" 
                                            style="background-color: {filters.fileReads ? getDarkColor(getColorForFilter('fileReads')) : getLightColor(getColorForFilter('fileReads'))};
                                                color: {filters.fileReads ? '#fff' : getColorForFilter('fileReads')};
                                                border-color: {getColorForFilter('fileReads')}"
                                            on:click={() => toggleInteractionType('fileReads')} 
                                            on:keydown={handleKeydown}>
                                            File Reads
                                        </button>
                                        <button 
                                            class="pill-button {filters.fileWrites ? 'active' : ''}" 
                                            style="background-color: {filters.fileWrites ? getDarkColor(getColorForFilter('fileWrites')) : getLightColor(getColorForFilter('fileWrites'))};
                                                color: {filters.fileWrites ? '#fff' : getColorForFilter('fileWrites')};
                                                border-color: {getColorForFilter('fileWrites')}"
                                            on:click={() => toggleInteractionType('fileWrites')} 
                                            on:keydown={handleKeydown}>
                                            File Writes
                                        </button>
                                        <button 
                                            class="pill-button {filters.fileDeletes ? 'active' : ''}" 
                                            style="background-color: {filters.fileDeletes ? getDarkColor(getColorForFilter('fileDeletes')) : getLightColor(getColorForFilter('fileDeletes'))};
                                                color: {filters.fileDeletes ? '#fff' : getColorForFilter('fileDeletes')};
                                                border-color: {getColorForFilter('fileDeletes')}"
                                            on:click={() => toggleInteractionType('fileDeletes')} 
                                            on:keydown={handleKeydown}>
                                            File Deletes
                                        </button>
                                    </div>

                                    <!-- Replace your Registry Operations pill buttons with this: -->
                                    <h5>Registry Operations</h5>
                                    <div class="pill-buttons">
                                        <button 
                                            class="pill-button {filters.registryReads ? 'active' : ''}" 
                                            style="background-color: {filters.registryReads ? getDarkColor(getColorForFilter('registryReads')) : getLightColor(getColorForFilter('registryReads'))};
                                                color: {filters.registryReads ? '#fff' : getColorForFilter('registryReads')};
                                                border-color: {getColorForFilter('registryReads')}"
                                            on:click={() => toggleInteractionType('registryReads')} 
                                            on:keydown={handleKeydown}>
                                            Registry Reads
                                        </button>
                                        <button 
                                            class="pill-button {filters.registryWrites ? 'active' : ''}" 
                                            style="background-color: {filters.registryWrites ? getDarkColor(getColorForFilter('registryWrites')) : getLightColor(getColorForFilter('registryWrites'))};
                                                color: {filters.registryWrites ? '#fff' : getColorForFilter('registryWrites')};
                                                border-color: {getColorForFilter('registryWrites')}"
                                            on:click={() => toggleInteractionType('registryWrites')} 
                                            on:keydown={handleKeydown}>
                                            Registry Writes
                                        </button>
                                    </div>

                                    <!-- Replace your Process Creations pill button with this: -->
                                    {#if currentView === "graph"}
                                        <h5>Process Creations</h5>
                                        <div class="pill-buttons">
                                            <button 
                                                class="pill-button {filters.processCreations ? 'active' : ''}" 
                                                style="background-color: {filters.processCreations ? getDarkColor(getColorForFilter('processCreations')) : getLightColor(getColorForFilter('processCreations'))};
                                                    color: {filters.processCreations ? '#fff' : getColorForFilter('processCreations')};
                                                    border-color: {getColorForFilter('processCreations')}"
                                                on:click={() => toggleInteractionType('processCreations')} 
                                                on:keydown={handleKeydown}>
                                                Process Creations
                                            </button>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>

                        <!-- EVENT COUNTS SECTION -->
                        {#if currentView === "tree"}
                            <div class="collapsible-section">
                            <button class="section-header {isFilterSectionActive('eventCounts') ? 'active' : ''}" 
                                on:click={() => toggleSection('eventCounts')}>
                                    <span>Event Counts</span>
                                    <svg class="chevron {expandedSections.eventCounts ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                                        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                                    </svg>
                                </button>
                                
                                {#if expandedSections.eventCounts}
                                    <div class="section-content">
                                        <p class="section-description">Highlight only processes with a given number of related events</p>
                                        <div class="pill-buttons">
                                            <button 
                                                class="pill-button {filters.interactionCount === 'none' ? 'active' : ''}" 
                                                on:click={() => selectInteractionCount('none')}>
                                                None
                                            </button>
                                            <button 
                                                class="pill-button {filters.interactionCount === 'one-plus' ? 'active' : ''}" 
                                                on:click={() => selectInteractionCount('one-plus')}>
                                                1+
                                            </button>
                                            <button 
                                                class="pill-button {filters.interactionCount === 'five-plus' ? 'active' : ''}" 
                                                on:click={() => selectInteractionCount('five-plus')}>
                                                5+
                                            </button>
                                            <button 
                                                class="pill-button {filters.interactionCount === 'ten-plus' ? 'active' : ''}" 
                                                on:click={() => selectInteractionCount('ten-plus')}>
                                                10+
                                            </button>                                        
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- PROCESS ID SECTION -->
                        <div class="collapsible-section">
                            <button class="section-header {isFilterSectionActive('processId') ? 'active' : ''}" 
                                on:click={() => toggleSection('processId')}>
                                <span>Process ID</span>
                                <svg class="chevron {expandedSections.processId ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                                </svg>
                            </button>
                            
                            {#if expandedSections.processId}
                                <div class="section-content">
                                    <div class="filter-search-field">
                                        <input 
                                            type="text" 
                                            placeholder="Enter process ID..." 
                                            bind:value={filters.processId} 
                                            on:keydown={handleKeydown}
                                        />
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <!-- PROCESS DETAILS SECTION -->
                        <div class="collapsible-section">
                            <button class="section-header {isFilterSectionActive('processDetails') ? 'active' : ''}" 
                                on:click={() => toggleSection('processDetails')}>
                                <span>Process Details</span>
                                <svg class="chevron {expandedSections.processDetails ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                                </svg>
                            </button>
                            
                            {#if expandedSections.processDetails}
                                <div class="section-content">
                                    <!-- Process Name -->
                                    <h5>Process Name</h5>
                                    <div class="filter-search-field">
                                        <input 
                                            type="text" 
                                            placeholder="Search by process name..." 
                                            bind:value={filters.processName} 
                                            on:keydown={handleKeydown}
                                        />
                                    </div>
                                    
                                    <!-- Command Line -->
                                    <h5>Command Line</h5>
                                    <div class="filter-search-field">
                                        <input 
                                            type="text" 
                                            placeholder="Search in command line..." 
                                            bind:value={filters.commandLine} 
                                            on:keydown={handleKeydown}
                                        />
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <!-- NETWORK DETAILS SECTION -->
                        <div class="collapsible-section">
                            <button class="section-header {isFilterSectionActive('networkDetails') ? 'active' : ''}" 
                                on:click={() => toggleSection('networkDetails')}>
                                <span>Network Details</span>
                                <svg class="chevron {expandedSections.networkDetails ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                                </svg>
                            </button>
                            
                            {#if expandedSections.networkDetails}
                                <div class="section-content">
                                    <!-- IPv4 Address -->
                                    <h5>IPv4 Address or Prefix</h5>
                                    <div class="filter-search-field">
                                        <input 
                                            type="text" 
                                            placeholder="e.g. 10.5.1.0/24..." 
                                            bind:value={filters.ipAddress} 
                                            on:keydown={handleKeydown}
                                        />
                                    </div>
                                    
                                    <!-- Port -->
                                    <h5>Port</h5>
                                    <div class="filter-search-field">
                                        <input 
                                            type="text" 
                                            placeholder="Search by port..." 
                                            bind:value={filters.port} 
                                            on:keydown={handleKeydown}
                                        />
                                    </div>
                                    
                                    <!-- Protocol -->
                                    <h5>Protocol</h5>
                                    <div class="pill-buttons">
                                        <button 
                                            class="pill-button {filters.protocol === 'tcp' ? 'active' : ''}" 
                                            on:click={() => toggleProtocol('tcp')}>
                                            TCP
                                        </button>
                                        <button 
                                            class="pill-button {filters.protocol === 'udp' ? 'active' : ''}" 
                                            on:click={() => toggleProtocol('udp')}>
                                            UDP
                                        </button>
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <!-- PATH SECTION -->
                        <div class="collapsible-section">
                            <button class="section-header {isFilterSectionActive('path') ? 'active' : ''}" 
                                on:click={() => toggleSection('path')}>
                                <span>Path</span>
                                <svg class="chevron {expandedSections.path ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                                </svg>
                            </button>
                            
                            {#if expandedSections.path}
                                <div class="section-content">
                                    <p class="section-description">Search by file or registry path:</p>
                                    <div class="filter-search-field">
                                        <input 
                                            type="text" 
                                            placeholder="Enter path..." 
                                            bind:value={filters.path} 
                                            on:keydown={handleKeydown}
                                        />
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <!-- TIME SECTION -->
                        <div class="collapsible-section">
                            <button class="section-header {isFilterSectionActive('time') ? 'active' : ''}" 
                                on:click={() => toggleSection('time')}>
                                <span>Time</span>
                                <svg class="chevron {expandedSections.time ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                                </svg>
                            </button>
                            
                            {#if expandedSections.time}
                                <div class="section-content">
                                    <p class="section-description">Select time interval for search results:</p>
                                    
                                    {#if moreThanOneDate}
                                        <div class="date-selector">
                                            <label for="date">Date</label>
                                            <input 
                                                type="date" 
                                                bind:value={timeRange.after.date}
                                                on:change={() => {
                                                    timeRange.before.date = timeRange.after.date;
                                                }}
                                                on:keydown={handleKeydown}
                                            />
                                        </div>
                                    {/if}
                                    
                                    <div class="time-range">
                                        <!-- After time -->
                                        <div class="time-input">
                                            <label for="time-after">After</label>
                                            <input 
                                                id="time-after"
                                                type="time" 
                                                step="0.001"
                                                bind:value={timeRange.after.time}
                                                on:keydown={handleKeydown}
                                            />
                                        </div>
                                        
                                        <!-- Before time -->
                                        <div class="time-input">
                                            <label for="time-before">Before</label>
                                            <input 
                                                id="time-before"
                                                type="time"
                                                step="0.001"
                                                bind:value={timeRange.before.time}
                                                on:keydown={handleKeydown}
                                            />
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <!-- Tree control section -->
                        {#if currentView === "tree"}
                            <div class="collapsible-section">
                                <button class="section-header" on:click={() => toggleSection('treeControls')}>
                                    <span>Tree Controls</span>
                                    <svg class="chevron {expandedSections.treeControls ? 'open' : ''}" viewBox="0 0 24 24" width="16" height="16">
                                        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" />
                                    </svg>
                                </button>
                                
                                {#if expandedSections.treeControls}
                                    <div class="section-content">
                                        <p class="section-description">Hide or show all nodes:</p>
                                        <div class="tree-control-buttons">
                                            <button 
                                                class="tree-control-button" 
                                                on:click={collapseAll}
                                                disabled={isLoading}
                                                title="Collapse to first level">
                                                <span class="icon">−</span> Hide All
                                            </button>
                                            <button 
                                                class="tree-control-button" 
                                                on:click={expandAll}
                                                disabled={isLoading}
                                                title="Expand all nodes">
                                                <span class="icon">+</span> Show All
                                            </button>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    <button class="apply-filter-button" on:click={() => applySearch()}>
                        Search
                    </button>
                </div>
            {/if}
        </div>
    </div>


    <!-- Results Section -->
    <div class="results-section">
        <h3 class="results-heading">Search Results</h3>
        
        {#if isSearching}
            <div class="loading-results">
                <svg class="spinner" viewBox="0 0 50 50" width="24" height="24">
                    <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
                <p>Searching for "{searchQuery}"...</p>
            </div>
        {:else if searchResults === null}
            <!-- No search performed yet -->
            <p class="no-results-message">Enter a search query to see results.</p>
        {:else if !searchResults || searchResults.length === 0}
            <!-- Search performed but no results -->
            <p class="no-results-message">
                {searchQuery ? `No results found for "${searchQuery}"` : 
                 "No results match your selected filters"}
            </p>
        {:else}
            <!-- Search results found -->
            <p class="results-count">
                {searchResults.length} Results 
                {searchQuery ? `for "${searchQuery}"` : "matching your filters"}
            </p>
            
            <div class="results-list">
                {#each searchResults as result}
                    <button 
                        class="result-card {selectedResultId === result.factId ? 'selected' : ''}" 
                        on:click={() => handleResultClick(result)}
                        on:keydown={(e) => e.key === 'Enter' && handleResultClick(result)}
                    >
                        <div class="result-header">
                            <span class="result-name">{getDisplayTitle(result)}</span>
                            <span 
                                class="result-pill" 
                                style="background-color: {getFactTypeBackgroundColor(result)}; color: {getFactTypeColor(result)};">
                                {result.type}
                            </span>
                        </div>
                        
                        {#if result.timestamp}
                        <div class="result-header">
                            <div class="result-timestamp">
                                {utils.formatTimestamp(result.meta.timestamp, true)} (UTC)
                            </div>
                            <span class="result-pill">
                                PID {result.type === "createdProcess" ? result.destinationObjectValue : result.sourceObjectValue}
                            </span>
                        </div>
                        {/if}
                        
                        <div class="result-details">
                            {DISPLAY_KEYS[result.destinationObjectType]} {getDisplayValue(result)}
                        </div>
                    </button>
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .search-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
        padding-left:20px;
        padding-bottom:0px;
        background-color: #fafafa;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        width: 300px;
        max-width: 300px;
        overflow-x: hidden;
        overflow-y: auto;
        height: calc(100vh); 
        box-sizing: border-box;
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        z-index: 10;
    }

    .search-container::-webkit-scrollbar { 
        width: 8px; 
    }

    .filter-sections {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 8px;
    }

    .collapsible-section {
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        overflow: hidden;
    }

    .section-header {
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        background: #f5f5f5;
        border: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        color: #333;
    }

    .section-header:hover {
        background: #efefef;
    }

    .section-header.active, .filters-header.active{
        background-color: #e3f2fd; 
        border-left: 3px solid #2196f3; 
    }

    .section-content {
        padding: 12px;
        background: white;
        border-top: 1px solid #e0e0e0;
        box-sizing: border-box;
        overflow: hidden;
    }

    .filter-search-field {
        margin-bottom: 12px;
    }

    .filter-search-field input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
        box-sizing: border-box;
        max-width: 100%;
    }

    .apply-filter-button {
        background-color: #0366d6;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: block;
        width: 100%;
        margin-top: 16px;
    }

    /* Logo */
    .logo {
        max-width: 60%;
        height: auto;
        margin-bottom: 8px;
        align-self: start;
    }
    
    /* Search Section */
    .search-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .search-bar {
        display: flex;
    }

    .search-bar input {
        flex: 1;
        padding: 10px 12px;
        border: 1px solid #e5e5e5;
        border-radius: 6px 0 0 6px;
        font-size: 12px;
    }
    
    .search-button {
        background-color: #0366d6;
        color: white;
        border: none;
        border-radius: 0 6px 6px 0;
        padding: 0 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .clear-button {
        display: flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: none;
        color: #666;
        font-size: 11px;
        cursor: pointer;
        padding: 6px 10px;
        border-radius: 4px;
        align-self: flex-end;
    }
    
    .clear-button:hover {
        background-color: #f0f0f0;
        color: #333;
    }

    /* Filters Section */
    .filters-section {
        display: flex;
        flex-direction: column;
    }

    .filters-header {
        background-color: #fafafa;
        border: 1px solid #a6bcd4;
        border-radius: 6px;
        padding: 12px 16px;
        font-size: 12px;
        font-weight: 500;
        color: #333;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        text-align: left;
    }
    
    .filters-header:hover {
        background-color: #84bcfc;
    }
    
    .filters-panel {
        border: 1px solid #8fb8e7;
        border-top: none;
        border-radius: 0 0 6px 6px;
        padding: 16px;
        margin-top: -6px;
        background-color: white;
    }
    
    h3 {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 8px 0;
        color: #333;
    }
    
    h5 {
        font-size: 12px;
        color: #555;
        margin: 12px 0 6px 0;
        font-weight: 500;
    }
    
    .section-description {
        font-size: 11px;
        color: #666;
        margin: 0 0 8px 0;
    }
    
    .pill-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
    }
    
    .pill-button {
        background-color: #f1f1f1;
        border: 1px solid #ddd;
        border-radius: 16px;
        padding: 6px 10px;
        font-size: 11px;
        cursor: pointer;
    }
    
    .pill-button:hover {
        background-color: #e9e9e9;
    }
    
    .pill-button.active {
        background-color: #0366d6;
        color: white;
        border-color: #0366d6;
    }
    
    /* Apply button */
    .apply-filter-button {
        background-color: #0366d6;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: block;
        width: 100%;
        margin-top: 8px;
    }
    
    .apply-filter-button:hover {
        background-color: #0366d6;
    }
    
    /* Results section */
    .results-section {
        border-top: 1px solid #eee;
        padding-top: 8px;
    }
    
    .results-heading {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 12px 0;
    }
    
    .no-results-message {
        color: #666;
        font-size: 12px;
        margin: 16px 0;
        text-align: center;
        font-style: italic;
    }
    
    .results-count {
        font-size: 12px;
        color: #666;
        margin-bottom: 12px;
    }
    
    .results-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    
    .result-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        background-color: white;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 12px;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
        text-align: left;
        font: inherit;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    
    .result-card:hover {
        background-color: #f9f9f9;
        border-color: #ccc;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .result-card.selected {
        background-color: #deedff;
        border-color: #0366d6;
        box-shadow: 0 2px 6px rgba(76, 175, 80, 0.2);
    }
    
    .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-bottom: 8px;
    }

    .result-name {
        font-weight: 500;
        color: #333;
        font-size: 12px;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .result-timestamp {
        font-size: 10px;
        color: #888;
    }
    
    .result-details {
        font-size: 11px;
        color: #666;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    /* Tree Controls */
    .tree-control-buttons {
        display: flex;
        gap: 8px;
    }
    
    .tree-control-button {
        background-color: #f1f1f1;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 8px;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        justify-content: center;
    }
    
    .tree-control-button:hover {
        background-color: #e9e9e9;
    }
    
    .clear-filters-global {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 12px;
    }
    
    .clear-all-button {
        display: flex;
        align-items: center;
        gap: 6px;
        background-color: #f5f5f5;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 11px;
        color: #555;
        cursor: pointer;
    }
    
    /* Time input styles */
    .date-selector {
        margin-bottom: 12px;
    }
    
    .date-selector label {
        display: block;
        font-size: 11px;
        color: #666;
        margin-bottom: 4px;
    }
    
    .date-selector input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
    }
    
    .time-range {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .time-input {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    
    .time-input label {
        font-size: 11px;
        color: #666;
    }
    
    .time-input input {
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
    }
    
    /* Spinner & Loading */
    .spinner {
        animation: rotate 2s linear infinite;
    }
    
    .spinner .path {
        stroke: white;
        stroke-linecap: round;
        animation: dash 1.5s ease-in-out infinite;
    }
    
    @keyframes rotate {
        100% { transform: rotate(360deg); }
    }
    
    @keyframes dash {
        0% {
            stroke-dasharray: 1, 150;
            stroke-dashoffset: 0;
        }
        50% {
            stroke-dasharray: 90, 150;
            stroke-dashoffset: -35;
        }
        100% {
            stroke-dasharray: 90, 150;
            stroke-dashoffset: -124;
        }
    }
    
    .loading-results {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px 0;
        gap: 12px;
        color: #666;
    }
    
    .loading-results .spinner .path {
        stroke: #0366d6;
    }

    /* Header styling */
    .header-content {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .chevron {
        transition: transform 0.3s ease;
    }
    
    .chevron.open {
        transform: rotate(180deg);
    }
 
</style>