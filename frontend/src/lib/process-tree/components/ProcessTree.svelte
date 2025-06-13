<script>
    import * as d3 from "d3";
    import { nodeToggleStore } from "$lib/process-tree/services/treeVisualizationService.js";
    import { tick, onMount, onDestroy, createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    import SearchSidebar from "$lib/shared/components/SearchSidebar.svelte";
    import TreeDetailsPanel from "$lib/process-tree/components/TreeDetailsPanel.svelte";
    import HelpButton from "$lib/shared/components/HelpButton.svelte";
    import ColorLegend from "$lib/shared/components/ColorLegend.svelte";
    import TimelineMinimap from "$lib/shared/components/TimelineMinimap.svelte";
    import { GLOBAL_COLORS } from  '$lib/shared/constants/visualizationConstants.js';
    import { colorTagStore } from '$lib/shared/stores/colorTagStore.js';
    import { getNodeDisplayColor } from '$lib/shared/services/colorService.js';

    import * as treeService from "$lib/process-tree/services/treeVisualizationService.js";
    import * as apiService from "$lib/shared/services/apiService.js";
    import { processDataStore } from "$lib/shared/services/apiService.js";
    import * as utils from '$lib/shared/services/utils.js';
        
    // Constants for layout and styling
    let NAME_LENGTH_LIMIT = 25;
    let TOP_NODE_PADDING = 20; 
    let NODE_RADIUS = 3.5;

    // Props from parent (page.svelte)
    export let selectedNode = null;
    export let isLoading = false;
    
    // View state management
    export let height = 600;
    export let width = 800;
    export let showHelpModal = false;

    export let facts = []; // For timeline minimap
    let isMinimapCollapsed = false; 
    let timeRangeFilter = null; 
    let filteredByTime = false;
    let minimapWidth = 800;
    let minimapHeight = 90;
    
    // Search bar and filter state
    let currentView = "tree"; 
    let filters = {}; // 

    // Node and link data
    let svgContainer;
    let nodes = [];
    let links = [];

    // For toggles from viz service
    let unsubscribe;

    // for color tag changes, make sure svg updates
    let colorTagSubscription;
    let colorTagVersion = 0;

    let isLegendExpanded = true; 

    // Tooltip vars
    let tooltipElement;
    let activeTooltipNode = null;

    /**
     * Get node color based on node state and properties
     * @param node
     */
    function getNodeColor(node) {
        if (!node) return GLOBAL_COLORS.DEFAULT;
        
        // Check for custom color tag first (highest priority)
        const customColor = getNodeDisplayColor(node, {viewType: 'tree'});
        if (customColor) return customColor;
        
        // Check if node has filter state and is filtered
        if (node.filterState?.isFiltered) {
            return GLOBAL_COLORS.FILTERED; // Light gray for filtered nodes
        }
                
        // Default colors 
        return GLOBAL_COLORS.treeNode;
    }

    function hasInteractions(nodeId) {
        return treeService.hasInteractions(nodeId);
    }

    // ======== EVENT HANDLERS ========
    // Handle node click (select, highlight, details panel)
    function handleNodeClick(nodeData) {
        if (!nodeData) return; 
        console.log("Node clicked:", nodeData);
        isLegendExpanded = false;


        selectedNode = nodeData;

        treeService.selectNode(nodeData); 
        treeService.highlightNodePath(nodeData);
    }

    // Handle node double-click (open event graph view)
    function handleDoubleClick(nodeData) {
        if (!nodeData) return;
        if (!hasInteractions(nodeData.data.uid)) return;
        selectedNode = null; 
        currentView = "graph"; 
        dispatch("enterGraphView", { nodeData: nodeData });
    }

    function handleBackgroundClick() {
        selectedNode = null; 
    }

    function handleShowGraphView(event) {
        let nodeData = event.detail.nodeData;

        nodeData = { data: nodeData };

        handleDoubleClick(nodeData);
    }

    function handleShowTimelineView(event) {
        const nodeData = event.detail.nodeData;

        selectedNode = nodeData;
        currentView = "timeline"; 
        dispatch("enterTimelineView", { nodeData: nodeData });
    }

    // Handle someone clicking on a search result in the sidebar
    function handleSelectResult(event) {
        const nodeId = event.detail.nodeId;
        isLegendExpanded = false;

        const node = treeService.getNodeById(nodeId); 

        selectedNode = node;
        treeService.highlightNodePath(node); 
    }

    // Handle someone updating the display filters
    function handleFilterChange(event) { 
        // React to filter changes from the search sidebar
        const filters = event.detail.filters;

        const updatedState = treeService.updateFilters(filters);

        nodes = [...updatedState.nodes];
        links = [...updatedState.links];
    }

    function handleCollapseAll() {
        const updatedState = treeService.collapseAll();
        
        // Update local variables
        nodes = [...updatedState.nodes];
        links = [...updatedState.links];
        width = Math.max(width, updatedState.dimensions.width);
        height = Math.max(height, updatedState.dimensions.height);
    }

    function handleExpandAll() {
        const updatedState = treeService.expandAll();
        
        // Update local variables
        nodes = [...updatedState.nodes];
        links = [...updatedState.links];
        width = Math.max(width, updatedState.dimensions.width);
        height = Math.max(height, updatedState.dimensions.height);
    }

    function toggleNode() {
        if (!selectedNode) return;
        isLegendExpanded = false;

        const updatedState = treeService.toggleNode(selectedNode);

        // Update local variables for right visualization
        nodes = [...updatedState.nodes];
        links = [...updatedState.links];
        width = Math.max(width, updatedState.dimensions.width);
        height = Math.max(height, updatedState.dimensions.height);
    }

    function handleTimeRangeSelection(timeRange) {
        timeRangeFilter = timeRange;
        filteredByTime = !!timeRange;
        isLegendExpanded = false;
        
        // Use the service to apply filtering
        const updatedState = treeService.applyTimeFilter(timeRange);
        
        // Update local state variables
        nodes = [...updatedState.nodes];
        links = [...updatedState.links];
    }

    function showTooltip(event, node) {
        if (!tooltipElement) return;
        
        event.stopPropagation();
        activeTooltipNode = node;
        
        // Position tooltip near the mouse pointer
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // Get tooltip content
        const title = node.data.name;
        const details = getTooltipDetails(node);
        
        // Update tooltip content
        const tooltipTitle = tooltipElement.querySelector('.tooltip-title');
        const tooltipDetails = tooltipElement.querySelector('.tooltip-details');
        
        if (tooltipTitle) tooltipTitle.textContent = title;
        if (tooltipDetails) tooltipDetails.innerHTML = details;
        
        // Position tooltip
        tooltipElement.style.left = `${mouseX + 15}px`;
        tooltipElement.style.top = `${mouseY + 15}px`;
        tooltipElement.style.display = 'block';
    }

    // Hide tooltip
    function hideTooltip() {
        if (tooltipElement) {
            tooltipElement.style.display = 'none';
            activeTooltipNode = null;
        }
    }

    // Get formatted details for node tooltip
    function getTooltipDetails(node) {
        if (!node || !node.data) return '';
        if (node.data.name === "root") return '';
        
        const metadata = node.data.metadata || {};
        const timestamp = utils.formatTimestamp(metadata.timestamp, true);
        
        let details = `
            <div class="tooltip-row"><span class="tooltip-label">PID:</span> ${metadata.processId || 'N/A'}</div>
            <div class="tooltip-row"><span class="tooltip-label">Parent PID:</span> ${metadata.parentProcessId || 'N/A'}</div>
            <div class="tooltip-row"><span class="tooltip-label">Created:</span> ${timestamp} (UTC)</div>
            <div class="tooltip-row"><span class="tooltip-label">Path:</span> ${metadata.processPath || 'N/A'}</div>
        `;
        
        return details;
    }


    // ======== REACTIVITY ========    
    // Apply interactivity after Svelte updates the DOM
    $: if (nodes.length > 0 && svgContainer) {
        tick().then(() => {
            treeService.makeNodesInteractive(svgContainer, handleNodeClick, handleDoubleClick, showTooltip, hideTooltip);
        });
    }

    // React to process data changing in the datastore
    $: {
        if ($processDataStore && $processDataStore.length > 0) {
            isLoading = true;

            const updatedState = treeService.setProcessData($processDataStore);

            // Update local state from service state
            nodes = [...updatedState.nodes];
            links = [...updatedState.links];
            width = Math.max(width, updatedState.dimensions.width);
            height = Math.max(height, updatedState.dimensions.height);
            isLoading = updatedState.isLoading;
        } 
    }

    $: if (svgContainer) {
        treeService.initialize(svgContainer, { width, height });

        if (selectedNode && selectedNode.data) {
            // If selectedNode is already set, check if in tree
            const nodeId = selectedNode.data.uid;
            selectedNode = treeService.getNodeById(nodeId);
        } else if (selectedNode && !selectedNode.data) {
            // If selectedNode is not set or has no data, try to find it by ID - happens when navigating from bookmarks to tree to timeline
            const nodeId = selectedNode.uid || selectedNode.id;
            selectedNode = treeService.getNodeById(nodeId);
        }
    }

    $: if (colorTagVersion > 0 && svgContainer) {
        // Force update of node colors // ? is this necessary?
        tick().then(() => {
            // Update circle fills with new colors
            d3.select(svgContainer)
                .selectAll('.node circle')
                .attr('fill', d => getNodeColor(d));
        });
    }

    function handleColorChange(event) {
        const { nodeId, color } = event.detail;
        
        // Force update node color in the visualization
        if (svgContainer) {
            d3.select(svgContainer)
                .selectAll(`.node-${nodeId} circle`)
                .attr('fill', color || getNodeColor(d3.select(`.node-${nodeId}`).datum()));
        }
    }
    
    onMount(async () => {
        // Initialize visualization service
        treeService.initialize(null, { width, height });
        
        if ($processDataStore && $processDataStore.length > 0) {
            const updatedState = treeService.setProcessData($processDataStore);
            nodes = [...updatedState.nodes];
            links = [...updatedState.links];
            width = Math.max(width, updatedState.dimensions.width);
            height = Math.max(height, updatedState.dimensions.height);
            isLoading = updatedState.isLoading;
        }
        
        // Subscribe to node toggle events
        unsubscribe = nodeToggleStore.subscribe((event) => {
            if (event) {
                // Update local state based on event
                nodes = [...event.state.nodes];
                links = [...event.state.links];
                width = Math.max(width, event.state.dimensions.width);
                height = Math.max(height, event.state.dimensions.height);
            }
        });
        facts = await apiService.getAllFactsForTimeline();

        colorTagSubscription = colorTagStore.subscribe(() => {
            // increment to trigger reactivity in the SVG
            colorTagVersion++;
        });
    });

    onDestroy(() => {
        if (unsubscribe) {
            unsubscribe();
        }
    });
</script>

<div class="app-container">

    <SearchSidebar
        {isLoading}
        {currentView}
        on:collapseAll={handleCollapseAll}
        on:expandAll={handleExpandAll}
        on:filterChange={handleFilterChange}
        on:selectNode={handleSelectResult}
    />


    <div class="timeline-minimap-overlay" class:collapsed={isMinimapCollapsed}>
        <div class="timeline-minimap-header">
            <h3>Timeline Overview</h3>
            <div class="minimap-actions">
                {#if filteredByTime}
                    <button class="reset-filter-btn" on:click={() => handleTimeRangeSelection(null)}>
                        Clear Time Filter
                    </button>
                {/if}
                <button class="toggle-minimap-btn" on:click={() => isMinimapCollapsed = !isMinimapCollapsed}>
                    {isMinimapCollapsed ? '▼ Show' : '▲ Hide'}
                </button>
            </div>
        </div>
        
        <!-- Content is the part that collapses -->
        <div class="timeline-minimap-content" class:collapsed={isMinimapCollapsed}>
            {#if !isLoading && facts && facts.length > 0 && !showHelpModal}
                <TimelineMinimap 
                    facts={facts}
                    width={minimapWidth}
                    height={minimapHeight}
                    onBrushEnd={handleTimeRangeSelection}
                    selectedTimeRange={timeRangeFilter}
                />
            {/if}
        </div>
    </div>
    <div class="main-content-area">
        <!--- Help button -->


        <div class="visualization-container">
            <!-- Visualization area -->
            {#if isLoading}
                <div class="loading">Loading process data...</div>
            {:else if nodes.length > 0}
                <svg bind:this={svgContainer} {width} {height}>
                    <rect 
                        x="0" 
                        y="0" 
                        width="100%" 
                        height="100%" 
                        fill="transparent" 
                        on:click={handleBackgroundClick} 
                        on:keydown={e => e.key === 'Enter' && selectBookmark(bookmark)}
                        role="button"
                        tabindex="0"
                    />
                    <g
                        transform="translate(50, {Math.abs(
                            Math.min(0, Math.min(...nodes.map((n) => n.x))),
                        ) + TOP_NODE_PADDING})"
                    >
                        <!-- Draw links -->
                        {#each links as link}
                            <path
                                d={d3
                                    .linkHorizontal()
                                    .x((d) => d.y)
                                    .y((d) => d.x)(link)}
                                fill="none"
                                class="link"
                                class:filtered-out={link.source.filterState?.isFiltered || link.target.filterState?.isFiltered}
                                class:time-filtered={link.timeFiltered}
                                stroke="#555"
                                stroke-opacity="0.4"
                                stroke-width="1.5"
                                data-source-id={link.source.data.uid}
                                data-target-id={link.target.data.uid}
                            />
                        {/each}

                        <!-- Draw nodes -->
                        {#each nodes as node}
                            <g
                                class="node node-{node.data.uid}"
                                class:has-interactions={hasInteractions(node.data.uid)}
                                class:filtered-out={node.filterState?.isFiltered}
                                class:time-highlight={node.timeHighlight}
                                class:time-filtered={node.timeFiltered}
                                transform={`translate(${node.y},${node.x})`}
                                data-node-id={node.data.uid}
                            >
                                <!-- Node circle -->
                                <circle r="{NODE_RADIUS}" fill={getNodeColor(node)} />

                                <!-- Node label -->
                                <text
                                    dy={"0.35em"}
                                    x={node.children ? -6 : 6}
                                    text-anchor={node.children   ? "end" : "start"}
                                    font-size="10px"
                                >
                                    {node.data.name.length > NAME_LENGTH_LIMIT
                                        ? node.data.name.substring(0, NAME_LENGTH_LIMIT) + "..."
                                        : node.data.name}

                                </text>

                                <!-- Collapse indicator-->
                                {#if node.data.children && node.data.children.length > 0 && node.data._collapsed}
                                    <!-- Collapse indicator only shows when there are children -->
                                    <g class="collapse-indicator" transform="translate(100, 0)">
                                        <text
                                            dy="0.31em"
                                            text-anchor="start"
                                            font-size="9px"
                                            class="collapsed-count"
                                            fill="#666"
                                        >
                                            + {node.data.children.length}
                                        </text>
                                    </g>
                                {/if}
                            </g>
                        {/each}
                    </g>
                </svg>

            {:else}
                <div class="empty-state">No process data available</div>
            {/if}
        </div>
        <div class="visualization-controls">
            <ColorLegend 
                {currentView}
                title="Process Tree Legend"
                expanded = {isLegendExpanded} 
            />
        </div>
    </div>

    <TreeDetailsPanel
        bind:selectedNode={selectedNode}
        on:toggleNode={toggleNode}
        on:showGraphView={handleShowGraphView}
        on:showTimelineView={handleShowTimelineView}
    />
    <div class="node-tooltip" bind:this={tooltipElement} style="display: none;">
        <div class="tooltip-content">
            <div class="tooltip-header">
                <span class="tooltip-title"></span>
            </div>
            <div class="tooltip-details"></div>
        </div>
    </div>
</div>




<style>
    :global(.timeline-minimap-overlay) {
        position: fixed;
        top: 0;
        left: 330px; /* Match sidebar width */
        right: 0;
        background: white;
        z-index: 150;
        border-bottom: 1px solid #ddd;
    }
    
    :global(.timeline-minimap-header) {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 16px;
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
        z-index: 151;
    }
    
    :global(.timeline-minimap-header h3) {
        margin: 0;
        font-size: 12px;
        font-weight: 500;
        color: #555;
    }
    
    :global(.timeline-minimap-content) {
        padding: 10px 16px 5px;
        overflow-x: auto;
        max-height: 100px;
        transition: max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease;
    }
    
    :global(.timeline-minimap-content.collapsed) {
        max-height: 0;
        padding-top: 0;
        padding-bottom: 0;
        overflow: hidden;
        opacity: 0;
    }
    
    .main-content-area {
        transition: margin-top 0.3s ease;
    }
        
    :global(.timeline-minimap-overlay.collapsed .timeline-minimap-content) {
        max-height: 0;
        padding: 0 16px;
        overflow: hidden;
        opacity: 0;
    }
    :global(.timeline-minimap-overlay.collapsed ~ .main-content-area) {
        margin-top: 28px; 
    }

    .main-content-area {
        flex: 1;
        margin-left: 300px; /* Sidebar width */
        margin-top: 130px;
        width: calc(100% - 280px);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    .app-container {
        display: flex;
        height: 100vh;
        width: 100%;
        overflow: hidden;
        position: relative;
    }

    .sidebar-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 300px;
        height: 100vh;
        z-index: 200;
        overflow-y: auto; /* This makes the sidebar independently scrollable */
        background: white; /* Add background to prevent content showing through */
        border-right: 1px solid #eee;
    }

    .visualization-controls {
        position: fixed;
        bottom: 15px;
        right: 10px;
        z-index: 100;
        display: flex;
        gap: 10px;
        align-items: flex-start;
    }

    .visualization-container {
        width: 100%;
        height: 100%; /*calc(100vh - 100px); */
        overflow: auto;
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 5px;
        position: relative; 
    }

    .visualization-container svg {
        display: block;
        margin: 0 auto;
        width: 100%;
        min-width: 800px; 
        height: auto; 
    }
    .minimap-actions {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .toggle-minimap-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 12px;
        color: #666;
        border-radius: 4px;
        line-height: 1;
    }

    .toggle-minimap-btn:hover {
        background: #e0e0e0;
    }

    :global(.reset-filter-btn) {
        background: none;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 1px 6px;
        font-size: 10px;
        cursor: pointer;
        color: #666;
    }

    :global(.reset-filter-btn:hover) {
        background: #e0e0e0;
    }

    .scroll-indicator {
        position: absolute;
        background-color: rgba(0, 0, 0, 0.1);
        color: #555;
        padding: 8px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        width: 30px;
        height: 30px;
        opacity: 0.7;
        pointer-events: none;
        z-index: 5;
    }

    .loading,
    .empty-state {
        padding: 20px;
        font-style: italic;
        color: #666;
    }

    /* tooltip styling */
    .node-tooltip {
        position: fixed;
        z-index: 1000;
        background-color: rgba(0,0,0,0.8);
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        pointer-events: none;
        max-width: 300px;
        font-size: 12px;
        overflow: hidden;
        padding: 0;
    }

    .tooltip-content {
        padding: 8px;
    }

    .tooltip-header {
        margin-bottom: 4px;
    }

    .tooltip-title {
        font-weight: 600;
        color: white;
        font-size: 13px;
    }

    .tooltip-details {
        color: white;
        line-height: 1.4;
    }

    .tooltip-row {
        margin: 3px 0;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
    }

    .tooltip-label {
        font-weight: 500;
        color: #666;
        margin-right: 4px;
    }

    .tooltip-divider {
        height: 1px;
        background: #eee;
        margin: 6px 0;
    }

    .tooltip-chip {
        background: #f1f1f1;
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 11px;
        white-space: nowrap;
    }

    .tooltip-chip.file-reads {
        background: #e3f2fd;
        color: #0d47a1;
    }

    .tooltip-chip.registry {
        background: #e8f5e9;
        color: #1b5e20;
    }

    .tooltip-chip.network {
        background: #fff3e0;
        color: #e65100;
    } 
</style>