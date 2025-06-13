<script>
    import * as d3 from "d3";
    import { onMount, onDestroy, afterUpdate } from "svelte";
    import { slide, fade, fly } from "svelte/transition";

    import ProcessNodeGraph from "$lib/process-graph/components/ProcessNodeGraph.svelte";
    import ProcessTree from "$lib/process-tree/components/ProcessTree.svelte";
    import Timeline from "$lib/timeline/components/Timeline.svelte";
    import Bookmarks from "$lib/bookmarks/components/Bookmarks.svelte";
    import HelpButton from "$lib/shared/components/HelpButton.svelte";
    
    import * as apiService from "$lib/shared/services/apiService.js";
    
    // Width and height for visualization. Initial values, actual are calculated by calculateLayout function
    let width = 600;
    let height = 400;
    
    // Manage view state
    let focusedProcessNode = null; // Used for node-graph view
    let selectedNode = null; // Used for process-tree view
    let currentView = "tree"
    let isLoading = true;

    let showHelpModal = false;

    function handleShowGraphView(event) {
        let nodeData; 

        if (currentView === "tree") {
            nodeData = event.detail.nodeData;
        } else if (currentView === "timeline") {
            const eventId = event.detail.eventId;

            nodeData = getNodeDataByEventId(eventId);
        }

        focusedProcessNode = nodeData;
        currentView = "graph";
    }

    function handleShowTimelineView(event) {
        const nodeData = event.detail.nodeData;
        selectedNode = nodeData;
        currentView = "timeline";
    }

    function handleSelectedNodeId(event) {
        const eventId = event.detail.eventId;
        if (!eventId) {
            console.error("Event ID not found");
            return;
        }
        
        // Get node data by event ID
        let nodeData = getNodeDataByEventId(eventId);
        if (nodeData) {
            selectedNode = nodeData;
        } else {
            console.warn(`No process found for event ID: ${eventId}`);
        }
    }

    function handleBookmarkNavigation(event) {
        const nodeId = event.detail.nodeId;
        
        if (!nodeId) {
            console.error("No node ID provided for navigation");
            return;
        }
        
        // Get node data for the bookmarked process
        let nodeData = getNodeDataByEventId(nodeId);

        if (event.type === 'viewInTree') {
            selectedNode = nodeData;
            currentView = "tree";
        } 
        else if (event.type === 'viewInGraph') {
            focusedProcessNode = nodeData;
            currentView = "graph";
        }
        else if (event.type === 'viewInTimeline') {
            selectedNode = nodeData;
            currentView = "timeline";
        }
    }

    function getNodeDataByEventId(eventId) {
        if (!eventId) {
            console.error("Event ID not found");
            return;
        }
        let processes = [];
        apiService.processDataStore.subscribe(data => {
            processes = data;
        })();
        
        // Look for a process with this ID
        const process = processes.find(p => p.uid === eventId);

        let nodeData = {
            data: process,
            type: "process",
            id: process.uid,
            name: process.metadata.processName,
            interactions: process.interactions,
            children: []
        };
        return nodeData;     
    }

    function handleBackToTreeView(event) {
        const eventId = event.detail.eventId;

        if (eventId) {
            let nodeData = getNodeDataByEventId(eventId);
            selectedNode = nodeData;
        }

        currentView = "tree";
        focusedProcessNode = null;
    }

    let previousView = "tree";
    
    function switchView(view) {
        previousView = currentView;
        currentView = view;
        
        // Reset graph view state when switching away from it
        if (view !== "graph") {
            focusedProcessNode = null;
        } else if (view == "graph" && selectedNode) {
            focusedProcessNode = selectedNode; 
        }
    }
    
    // Determine transition direction based on view change
    function getTransitionProps() {
        // Tree → Graph: slide right
        if (previousView === "tree" && currentView === "graph") {
            return { x: 300, duration: 300 };
        }
        // Graph → Tree: slide left
        else if (previousView === "graph" && currentView === "tree") {
            return { x: -300, duration: 300 };
        }
        // Tree ↔ Timeline: vertical slide
        else if ((previousView === "tree" && currentView === "timeline") ||
                 (previousView === "timeline" && currentView === "tree")) {
            return { y: 100, duration: 300 };
        }
        // Default
        return { duration: 300 };
    }

    function toggleShowHelpModal() {
        showHelpModal = !showHelpModal;
    }

    // Get process data store on first load
    onMount(async () => {
        isLoading = true;
        await apiService.getProcessData(true).finally(() => {
            isLoading = false;
        });
    });
</script>

<div class="sidebar-navigation">
    <div class="sidebar-nav-items">
        <button 
            class="sidebar-nav-item {currentView === 'tree' ? 'active' : ''}" 
            on:click={() => switchView('tree')}
            aria-label="Process Tree"
        >
            <div class="icon-container">
                <img src="/binary-tree-icon.svg" alt="Process Tree" width="24" height="24" class="tree-icon">
            </div>
            <span class="tooltip">Process Tree</span>
        </button>
        
        <button 
            class="sidebar-nav-item {currentView === 'timeline' ? 'active' : ''}" 
            on:click={() => switchView('timeline')}
            aria-label="Timeline"
        >
            <div class="icon-container">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
                </svg>
            </div>
            <span class="tooltip">Event Timeline</span>
        </button>

        <button 
            class="sidebar-nav-item {currentView === 'graph' ? 'active' : ''}" 
            on:click={() => switchView('graph')}
            aria-label="Process Graph"
        >
            <div class="icon-container">
                <img src="/network-icon.svg" alt="Process Graph" width="24" height="24" class="graph-icon">
            </div>
            <span class="tooltip">Process Event Graph</span>
        </button>

        <button 
            class="sidebar-nav-item {currentView === 'bookmarks' ? 'active' : ''}" 
            on:click={() => switchView('bookmarks')}
            aria-label="Bookmarks"
        >
            <div class="icon-container">
                <svg width="20" height="20" viewBox="0 0 24 24" style="opacity: 0.3;">
                    <path fill="currentColor" d="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z" />
                </svg>
            </div>  
            <span class="tooltip">Bookmarks</span>
        </button>

        <button 
            class="sidebar-nav-item help-nav-item" 
            on:click={() => toggleShowHelpModal()}
            aria-label="Help"
        >
            <div class="icon-container">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="help-icon">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
                </svg>
            </div>
            <span class="tooltip">Help</span>
        </button>

        <!-- Help Button in sidebar -->
        <HelpButton currentView={currentView} bind:showHelp={showHelpModal}/>
    </div>
</div>

<div class="main-content">
    {#key currentView}
        <div class="view-container" in:fly={getTransitionProps()}>
            {#if currentView === "tree"}
                <ProcessTree
                    {width}
                    {height}
                    {isLoading}
                    bind:selectedNode={selectedNode}
                    bind:showHelpModal={showHelpModal}
                    on:enterGraphView={handleShowGraphView}
                    on:enterTimelineView={handleShowTimelineView}
                />
            {:else if currentView === "graph"}
                <ProcessNodeGraph 
                    processNode={focusedProcessNode}
                    width={width}
                    height={height}
                    bind:selectedNode={selectedNode}
                    bind:showHelpModal={showHelpModal}
                    on:backToTreeView={handleBackToTreeView}
                    on:showTimelineView={handleShowTimelineView}
                    on:showTreeView={handleBackToTreeView}
                />
            {:else if currentView === "timeline"}
                <Timeline 
                    {width}
                    {height}
                    {isLoading}
                    on:enterTreeView={handleBackToTreeView}
                    on:enterGraphView={handleShowGraphView}
                    on:selectedNodeId={handleSelectedNodeId}
                    bind:selectedNode={selectedNode}
                />
            {:else if currentView === "bookmarks"}
                <Bookmarks
                    on:viewInTree={handleBookmarkNavigation}
                    on:viewInGraph={handleBookmarkNavigation}
                    on:viewInTimeline={handleBookmarkNavigation}
                />
            {/if}
        </div>
    {/key}
</div>

<style>
    .main-content {
        margin-left: 0px;
        flex: 1;
        width: calc(100% - 40px);
        padding: 20px;
        padding-top: 0;
        position: relative;
    }

    .view-container {
        position: relative;
        width: 100%;
        min-height: 500px;
        overflow: visible;
    }

    /* sidebar nav styling */
    .sidebar-navigation {
        position: fixed;
        top: 0;
        left: 0;
        height: 100vh;
        width: 40px;
        background-color: #e1ecff;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 20px;
        z-index: 100;
    }

    .sidebar-nav-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    }

    .sidebar-nav-item {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 50px;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .sidebar-nav-item:hover {
        background-color: #3e81c4;
    }

    .sidebar-nav-item.active {
        background-color: #0366d6;
    }

    .sidebar-nav-item svg, .sidebar-nav-item img {
        width: 24px;
        height: 24px;
        fill: #c9d1d9;
        transition: fill 0.2s ease;
    }

    .sidebar-nav-item .icon-container {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .sidebar-nav-item .tooltip {
        position: absolute;
        left: 68px;
        background-color: #24292e;
        color: white;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 14px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transform: translateX(-10px);
        transition: all 0.2s ease;
        z-index: 10;
    }

    .sidebar-nav-item:hover .tooltip {
        opacity: 1;
        visibility: visible;
        transform: translateX(0);
    }

    .sidebar-nav-item .tooltip::before {
        content: '';
        position: absolute;
        top: 50%;
        left: -4px;
        transform: translateY(-50%) rotate(45deg);
        width: 8px;
        height: 8px;
        background-color: #24292e;
    }

    .sidebar-nav-item img.tree-icon {
        width: 24px;
        height: 24px;
        opacity: 0.3;
        transform:  rotate(-90deg);
        /* Mirror image */
        filter: invert(20%);
        transition: filter 0.2s ease;
    }

    .sidebar-nav-item:hover img.tree-icon {
        filter: invert(100%);
    }

    .sidebar-nav-item.active img.tree-icon {
        filter: invert(100%);
    }

    .sidebar-nav-item img.graph-icon {
        filter: invert(70%);
    }

    :global(body) {
        margin: 0;
        padding: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; /* consider changing*/
        line-height: 1.5;
    }

    :global(.action-btn) { 
        display: flex;
        align-items: center;
        padding: 8px 12px;
        background-color: #f5f5f5;
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
        justify-content: center;
        margin-bottom: 3px;
        width: 100%;
    }
    :global(.action-btn:hover) {
        background-color: #e9e9e9;
    }

    :global(.action-btn.primary) {
        background-color: #2563EB;
        color: white;
        border-color: #2057D2;
    }

    :global(.action-btn.primary:hover) {
        background-color: #1D4ED8;
    }

    :global(.icon) {
        margin-right: 8px;
        font-weight: bold;
    }

    :global(.result-pill) {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 12px;
    }

    :global(.section h3) {
        font-size: 12px;
        margin: 0 0 10px 0;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    :global(.section) {
        margin-bottom: 20px;
        border-bottom: 1px solid #eee;
        padding-bottom: 15px;
    }

    :global(.section:last-child) {
        border-bottom: none;
        margin-bottom: 0;
    }

    :global(.code-text) {
        font-family: monospace;
        font-size: 11px;
        white-space: pre-wrap;
        background: #f9f9f9;
        padding: 4px 6px;
        border-radius: 3px;
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #eee;
        word-break: break-all;
    }

    :global(.no-data, .loading) {
        font-style: italic;
        font-size: 11px;
        color: #999;
        padding: 10px 0;
        /* search bar */
        display: flex;
        align-items: center;
        justify-content: center;
        height: 300px;
    }

    /* help and legend styles */
    
    :global(.help-content p, .help-content ul) {
        margin-bottom: 12px;
        font-size: 14px;
        color: #555;
        line-height: 1.5;
    }
    
    :global(.help-content ul) {
        padding-left: 18px;
    }
    
    :global(.help-content li) {
        margin-bottom: 4px;
    }

    :global(.help-legend) {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 8px;
    }
    
    :global(.help-legend-item) {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
    }

    :global(.legend-dot) {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        display: inline-block;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    :global(.interaction-dot) {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        display: inline-block;
        border: 1px solid rgba(0, 0, 0, 0.1);
        /* check */
        margin-right: 8px;
    }

    :global(.legend-container) {
      max-height: 250px;
    }
    
    :global(.legend-container:not(.expanded)) {
      max-height: 36px;
    }
    
    /* Node and link styling */
    :global(.node) {
        transition: opacity 0.3s ease-in-out;
        cursor: pointer;
    }

    :global(.link) {
        transition: stroke-opacity 0.3s ease-in-out;
    }

    :global(.node circle) {
        transition: fill 0.3s ease-in-out;
    }
    :global(.node text) {
        transition: font-size 0.2s;
    }

    :global(.node:hover circle) {
        stroke: #f3b91a;
        fill: #f3b91a;
    }

    :global(.node.hover text) {
        font-weight: bold;
        font-size: 11px !important;
    }

    :global(.node.filtered-out) {
        opacity: 0.3;
        transition: opacity 0.3s ease;
    }
    
    :global(.node.filtered-out circle) {
        fill: #cccccc !important;
    }
    
    :global(.node.filtered-out text) {
        fill: #999999;
    }
    
    :global(.link.filtered-out) {
        stroke: #dddddd;
        stroke-opacity: 0.2;
    }

    :global(.node.dimmed) {
        opacity: 0.3;
    }
    
    :global(.link.dimmed) {
        opacity: 0.1;
    }

    :global(.node.has-interactions circle) {
        stroke: #ff9900f3;
        stroke-width: 1px;
    }

    :global(.node.highlighted circle) {
        stroke: #f3b91a; 
    }
    
    :global(.node.highlighted text) {
        font-weight: bold;
        fill: #f3b91a;            
    }

    :global(.link.highlighted) {
        stroke-width: 2.5px;
        stroke-opacity: 0.9;
    }

    :global(.node.expanded circle) {
        stroke: #333;
        stroke-width: 2px;
    }

    :global(.related-node circle) {
        stroke-dasharray: 3,2;
    }

    :global(.related-link) {
        stroke-dasharray: 5,3;
        stroke-opacity: 0.6;
    }

    :global(.node.time-filtered) {
        opacity: 0.4;
    }

    :global(.link.time-filtered) {
        opacity: 0.2;
    }

    /* Table styling */
    :global(th, td) {
        padding: 8px 10px;
        text-align: left;
        border-bottom: 1px solid #f0f0f0;
        font-size: 11px;
        line-height: 1.5;
    }
    
    :global(th) {
        font-weight: 500;
        color: #555;
        width: 40%;
        vertical-align: top;
    }
    
    :global(td) {
        word-break: break-word;
    }
</style>