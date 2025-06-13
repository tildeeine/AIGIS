<script>
    import * as d3 from 'd3';
    import { tick } from 'svelte';
    import { onMount, onDestroy, createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();
    
    import GraphDetailsPanel from '$lib/process-graph/components/GraphDetailsPanel.svelte';
    import SearchSidebar from "$lib/shared/components/SearchSidebar.svelte";
    import TimelineMinimap from "$lib/shared/components/TimelineMinimap.svelte";
    import HelpButton from "$lib/shared/components/HelpButton.svelte";
    import ColorLegend from "$lib/shared/components/ColorLegend.svelte";
    import { GLOBAL_COLORS } from  '$lib/shared/constants/visualizationConstants.js';

    import * as apiService from '$lib/shared/services/apiService';
    import * as graphVizService from '$lib/process-graph/services/graphVisualizationService.js';
    import * as nodeGraphModel from '$lib/process-graph/models/nodeGraphModel.js';

    export let processNode;
    export let selectedNode = null;
    export let showHelpModal = false;

    // state props
    let isLoading = false;
    let isMounted = false;

    // visualization props
    let graphSvgContainer;
    let currentView = "graph"; 
    let isLegendExpanded = true; 
    let switchedNode = false;

    let minimapWidth = 800;
    let minimapHeight = 90;

    // extended context props
    let relatedFactsCache = new Map(); // cache for facts related to the radial nodes
    let expandedNodes = new Set(); // track which nodes should be expanded 
    let isLoadingRelatedFacts = false; // loading state for related facts
    let expandedNodeData = new Map(); 

    let nodeSelectedInGraphView = false;
    let newNodeObjects = [];
    let newLinkObjects = []; // save to make it easier to remove later

    // data props
    let facts = {};
    let allFacts = {};
    let graphData = { 
        nodes: [], 
        links: [] 
    };
    const filteredData = {
        nodes: [],
        links: [],
    }

    let isMinimapCollapsed = false; 
    let timeRangeFilter = null; 
    let filteredByTime = false;

    let filters = {
        networkConnections: false,
        fileReads: false,
        fileWrites: false,
        fileDeletes: false,
        registryReads: false,
        registryWrites: false, 
        processCreations: false,
    }

    let interactionCounts = {
        fileReads: 0,
        fileWrites: 0,
        fileDeletes: 0,
        registryReads: 0,
        registryWrites: 0,
        networkConnections: 0
    };

    // react to processNode changes
    $: if (processNode && isMounted) {
        createNodeGraph(processNode);
    }

    $: if (currentView != "graph") {
        // reset processNode when switching views
        processNode = null;
        isMounted = false;
        graphData = { nodes: [], links: [] };
    }

    $: if (facts && Object.keys(facts).some(key => Array.isArray(facts[key]) && facts[key].length > 0)) {
        // Update allFacts with the current facts
        allFacts = flattenFacts(facts);
    } else {
        allFacts = {};
    }

    $: {
        if (isMinimapCollapsed !== undefined) {
            // Schedule a UI update after the component renders
            tick().then(() => {
                // Get the container element
                const container = document.querySelector('.visualization-container');
                if (container) {
                    if (isMinimapCollapsed) {
                        // Use collapsed margin
                        container.style.marginTop = '28px';
                    } else {
                        // Use expanded margin
                        container.style.marginTop = '90px';
                    }
                }
            });
        }
    }

    function flattenFacts(factsObj) {
        if (!factsObj || typeof factsObj !== 'object') return [];
        
        // Flatten all fact arrays into a single array
        return Object.values(factsObj)
            .filter(arr => Array.isArray(arr))
            .flat();
    }

    function handleFilterChange(event) {
        filters = event.detail.filters;
        graphVizService.applyFilters(filters);
    }

    function handleSelectSearchResult(event) {
        const nodeId = event.detail.nodeId;
        const nodeType = event.detail.nodeType;
        const nodeName = event.detail.nodeName || "Unknown Node";

        // If the node is not in the current graph, we need to create the graph for it
        let node = graphData.nodes.find(n => n.uid === nodeId);
        if (!node && nodeType == "process") {
            console.log(`Node with ID ${nodeId} not found in current graph, creating new graph...`);
            const nodeData = {                
                data: { 
                    uid: nodeId, 
                    name: nodeName 
                },
                objType: "process" 
            }
            processNode = nodeData;
        } else {
            graphVizService.handleNodeClick(nodeId);

            // Find the node in the graph data
            selectedNode = node;
        }
    }

    function handleNodeSelected(event) {
        const node = event.detail.node;
        if (node.uid != selectedNode?.uid) {
            collapseNode(selectedNode?.uid); 
        }
        selectedNode = node;
        nodeSelectedInGraphView = true;
        if (node.objType != "process") {
            // don't expand process nodes for now
            expandNode(node); 
        }
    }

    function handleShowTimelineView(event) {
        const nodeData = event.detail.nodeData;
        dispatch('showTimelineView', { nodeData });
        processNode = null; 
    }

    function handleShowTreeView(event) {
        const nodeData = event.detail.nodeData;
        dispatch('showTreeView', { eventId: nodeData.uid });
        processNode = null; 
    }

    function handleSwitchGraphView(event) {
        const nodeData = event.detail.nodeData;
        switchedNode = true;
        processNode = nodeData;
    }

    function handleTimeRangeSelection(timeRange) {
        timeRangeFilter = timeRange;
        filteredByTime = !!timeRange;
        isLegendExpanded = false;
        
        // update nodes and links
        graphVizService.applyTimeRangeFilter(timeRange, allFacts);
    }

    function closeDetailsPanel() {
        selectedNode = null;
        nodeSelectedInGraphView = false;
        const expandedNodeID = expandedNodes.values().next().value;
        collapseNode(expandedNodeID); // Collapse the first expanded node
        graphVizService.panToNodeById(processNode.data.uid); 
    }

    function backToTreeView() {
        currentView = "tree";
        dispatch('backToTreeView', { eventId: processNode?.data?.uid || null });
        processNode = null; 
    }

    function updateInteractionCounts(facts) {
        interactionCounts.fileReads = facts.fileReads?.length || 0;
        interactionCounts.fileWrites = facts.fileWrites?.length || 0;
        interactionCounts.fileDeletes = facts.fileDeletes?.length || 0;
        interactionCounts.registryReads = facts.registryReads?.length || 0;
        interactionCounts.registryWrites = facts.registryWrites?.length || 0;
        interactionCounts.networkConnections = facts.networkConnections?.length || 0;
        interactionCounts.processCreations = facts.processCreations?.length || 0;
    }

    async function createNodeGraph(processNode) {
        console.log("Creating graph for process node:", processNode);

        isLoading = true;
        let uid = processNode.data.uid || processNode.uid;

        try { 
            facts = await apiService.getAllFactsForObject(uid);
            updateInteractionCounts(facts);

            graphData = nodeGraphModel.buildNodeGraph(processNode, facts, false, switchedNode);

            await tick;

            if (!graphSvgContainer) {
                console.error("SVG container not available");
                isLoading = false;
                return;
            }

            graphVizService.createSvgContents(graphData, graphSvgContainer);

            // Event listeners for node click 
            graphSvgContainer.addEventListener("nodeClicked", handleNodeSelected);
            graphSvgContainer.addEventListener("backgroundClicked", closeDetailsPanel);

            preloadRelatedFacts();
            
            isLoading = false;
        } catch (error) {
            console.error("Error loading node graph facts:", error);
            isLoading = false;
        }
    }

    // get related facts for a node
    async function fetchRelatedFactsForNode(node) {
        // check cache first
        if (relatedFactsCache.has(node.uid)) {
            return relatedFactsCache.get(node.uid);
        }
        
        isLoadingRelatedFacts = true;
        
        try {
            // Get all facts for this object
            const relatedFacts = await apiService.getAllFactsForObject(node.uid);
            
            
            // Cache the results
            relatedFactsCache.set(node.uid, relatedFacts);
            isLoadingRelatedFacts = false;
            
            return relatedFacts;
        } catch (error) {
            console.error(`Error fetching related facts for node ${node.uid}:`, error);
            isLoadingRelatedFacts = false;
            return {};
        }
    }

    async function preloadRelatedFacts() {
        if (!processNode) return;

        // for each node in the graph, get related facts
        for (const node of graphData.nodes) {
            if (node.id === processNode.data.uid) continue; // skip the main process node

            fetchRelatedFactsForNode(node);
        }
    }

    // Add the related nodes and links for a given node to the graph, called on click
    async function expandNode(node) {
        if (expandedNodes.has(node.uid)) {
            return; // Already expanded
        }
        if (node.uid === processNode.data.uid) {
            return; // Don't expand the main process node
        }
        expandedNodes.add(node.uid);
        
        // Fetch related facts
        const relatedFacts = await fetchRelatedFactsForNode(node);
        // Filter out facts with processNode.uid as source, as these are already included with the node
        const filteredFacts = {};
        Object.entries(relatedFacts).forEach(([category, facts]) => {
            if (!Array.isArray(facts) || facts.length === 0) {
                return; // Skip empty categories
            }
            
            // remove facts that have main processNode as source
            const filteredCategoryFacts = facts.filter(fact => 
                fact.sourceObjectUid !== processNode.data.uid
            );
            
            // Only add the category if it has at least one valid fact
            if (filteredCategoryFacts.length > 0) {
                filteredFacts[category] = filteredCategoryFacts;
            }
        });

        if (Object.keys(filteredFacts).length === 0) {
            console.log(`No related facts found for node ${node.uid} except from the main process`);
            return;
        }      

        const newNodeData = nodeGraphModel.buildNodeGraph(node, filteredFacts, true);
        let newNodes = newNodeData.nodes;
        const newLinks = newNodeData.links;
    
        if ((!newNodes || newNodes.length === 0) && (!newLinks || newLinks.length === 0)) {
            console.log("No new nodes or links to add");
            return;
        }

        // get actual names for processes, not just pids
        if (newNodes.length > 0) {
            newNodes = await getProcessNames(newNodes);
        }
        
        // update graph data
        const updatedGraphData = {
            nodes: [...graphData.nodes, ...newNodes],
            links: [...graphData.links, ...newLinks]
        };
        
        // Store the related nodes and links for this expanded node for later
        expandedNodeData.set(node.uid, { nodes: newNodes, links: newLinks });
        
        // update graphdata prop
        graphData = updatedGraphData;
        
        // Update the visualization
        const newObjects = graphVizService.addNodesToVisualization(newNodes, newLinks, node); 
        newNodeObjects = newNodeData.nodes;
        newLinkObjects = newNodeData.links;
    }

    async function getProcessNames(nodes) {
        if (!nodes || nodes.length === 0) {
            return [];
        }

        const updatedNodes = await Promise.all(nodes.map(async (node) => {
            if (node && node.uid) {
                try {
                    const processObject = await apiService.searchFacts({
                        factType: ["createdProcess"], 
                        objectID: [node.uid],
                    });

                    // get the result which has node.uid as destinationObjectUid
                    const processResult = processObject.data.find(fact => 
                        fact.destinationObjectUid === node.uid
                    );
                    let processName = processResult?.meta.processName || null;
                                        
                    // Uadd name to label
                    node.name = processName || `Process ${node.label}`;
                    node.label = node.name; 

                } catch (error) {
                    console.error(`Error fetching process name for ${node.uid}:`, error);
                    node.name = `Process ${node.label}`;
                }
            }
            return node;
        }));
        
        return updatedNodes;
    }

    function collapseNode(nodeId) {
        if (!expandedNodes.has(nodeId)) {
            return; // Not expanded
        }
        
        // Get the related nodes and links for this node
        const relatedData = expandedNodeData.get(nodeId);
        if (!relatedData) return;
        
        const { nodes: relatedNodes, links: relatedLinks } = relatedData;
        
        // Get node IDs to remove
        const nodeIdsToRemove = relatedNodes.map(n => n.uid);
        
        // Update the graph data
        graphData.nodes = graphData.nodes.filter(n => !nodeIdsToRemove.includes(n.uid));
        // update link data
        if (newLinkObjects && newLinkObjects.length > 0) {
            console.log("Removing links from newLinkObjects:", newLinkObjects.length);
            
            // Convert newLinkObjects to a set of string identifiers for comparison
            const newLinkIdentifiers = new Set(newLinkObjects.map(link => {
                const sourceId = typeof link.source === 'object' ? link.source.uid : link.source;
                const targetId = typeof link.target === 'object' ? link.target.uid : link.target;
                return `${sourceId}->${targetId}`;
            }));
            
            // Filter out links that match identifiers in newLinkObjects
            graphData.links = graphData.links.filter(link => {
                const linkSourceId = typeof link.source === 'object' ? link.source.uid : link.source;
                const linkTargetId = typeof link.target === 'object' ? link.target.uid : link.target;
                const linkIdentifier = `${linkSourceId}->${linkTargetId}`;
                
                // Keep the link if it's NOT in our set of new link identifiers
                return !newLinkIdentifiers.has(linkIdentifier);
            });
        }
            
        // Remove from visualization
        graphVizService.removeNodesFromVisualization(nodeIdsToRemove, relatedLinks, nodeId);
        
        // Clean up tracking
        expandedNodes.delete(nodeId);
        expandedNodeData.delete(nodeId);
    }

    onMount(async () => {
        isMounted = true;

        nodeSelectedInGraphView = false;

        if (processNode) {
            await createNodeGraph(processNode);
        }
    });

</script>

<div class="node-graph-header">
    <div class="node-graph-container">
        <!--- Search sidebar -->
        <SearchSidebar
            {isLoading}
            {currentView}
            {processNode}
            on:collapseAll={handleCollapseAll}
            on:expandAll={handleExpandAll}
            on:filterChange={handleFilterChange}
            on:selectNode={handleSelectSearchResult}
        />
        
        <!--- Graph visualization -->
        <div class="visualization-container">
            {#if !processNode}
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="empty-state-icon">
                        <circle cx="32" cy="32" r="28" stroke="#e53935" stroke-width="4" fill="#fff3f3"/>
                        <rect x="29" y="16" width="6" height="24" rx="3" fill="#e53935"/>
                        <circle cx="32" cy="48" r="4" fill="#e53935"/>
                    </svg>
                    <h3>No Process Selected</h3>
                    <p>To view the event graph visualization, please select a process node from:</p>
                    <ul class="empty-state-list">
                        <li>The Process Tree view</li>
                        <li>The Timeline view</li>
                        <li>Search results</li>
                    </ul>
                    <button class="action-btn" on:click={backToTreeView}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        <span>Back to Process Tree</span>
                    </button>
                </div>
            {:else if isLoading}
                <div class="loading">Loading fact data...</div>
            {:else if graphData.nodes.length <= 1}
                <div class="empty-state">
                    <h3>No fact data available for {processNode.data.name}</h3>
                    <p>This process has no file, registry or network interactions.</p>
                </div>
            {/if}
            <div class="svg-wrapper" style="{(!processNode || isLoading) ? "display: none;" : ""}">
                <svg bind:this={graphSvgContainer} class="graph-svg"></svg>
            </div>
            {#if processNode}
                <div class="left-controls">
                    <button 
                        class="back-button"
                        on:click={backToTreeView}
                        aria-label="Back to Tree View">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        <span>Back to Tree View</span>
                    </button>
                </div>
            {/if}
            <div class="right-controls">
                <ColorLegend {currentView} expanded={isLegendExpanded} title={"Event Graph Legend"}/>
                <ColorLegend currentView={"tree"} expanded={false} title={"Process Legend"}/>
            </div>
        </div>

        <!--- Graph details panel -->
        {#if selectedNode && nodeSelectedInGraphView}
            <GraphDetailsPanel
                {facts}
                bind:selectedNode = {selectedNode}
                on:showTreeView={handleShowTreeView}
                on:showTimelineView={handleShowTimelineView}
                on:showGraphView={handleSwitchGraphView}
            />
        {/if}
    </div>
</div>


<div class="timeline-minimap-overlay" class:collapsed={isMinimapCollapsed}>
    <!-- Header stays outside the collapsible part -->
    <div class="timeline-minimap-header">
        <h3>Timeline Overview</h3>
        <div class="minimap-actions">
            {#if filteredByTime}
                <button class="reset-filter-btn" on:click={() => handleTimeRangeSelection(null)}>
                    Clear Filter
                </button>
            {/if}
            <button class="toggle-minimap-btn" on:click={() => isMinimapCollapsed = !isMinimapCollapsed}>
                {isMinimapCollapsed ? '▼ Show' : '▲ Hide'}
            </button>
        </div>
    </div>
    
    <!-- Content is the part that collapses -->
    <div class="timeline-minimap-content" class:collapsed={isMinimapCollapsed}>
        {#if processNode && !isLoading && Object.keys(facts).some(key => Array.isArray(facts[key]) && facts[key].length > 0) && !showHelpModal}
            <TimelineMinimap 
                facts={allFacts}
                width={minimapWidth}
                height={minimapHeight}
                onBrushEnd={handleTimeRangeSelection}
                selectedTimeRange={timeRangeFilter}
            />
        {/if}
    </div>
</div>


<style>
    :root {
        --minimap-expanded-margin: 90px;
        --minimap-collapsed-margin: 28px;
    }
    
    .visualization-container {
        flex: 1;
        position: relative;
        overflow: hidden;
        margin-left: 230px;
        margin-top: var(--current-margin-top, var(--minimap-expanded-margin));
        min-height: 500px;
        display: flex;
        transition: margin-top 0.3s ease;
    }
     .visualization-container {
        flex: 1;
        position: relative;
        overflow: hidden;
        margin-left: 230px;
        margin-top: 90px;
        min-height: 500px;
        display: flex;
    }
    
    .left-controls {
        position: fixed;
        bottom: 20px;
        left: 340px;
        z-index: 100; 
        pointer-events: auto;
    }
    
    /* Right side controls */
    .right-controls {
        position: fixed;
        bottom: 20px; 
        right: 20px;
        z-index: 10; 
        display: flex;
        flex-direction: column;
        gap: 10px;
        justify-content: flex-end;
        align-items: center;
        padding: 10px;
        pointer-events: auto;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.9); 
    }

    .node-graph-header {
        position: relative; 
        padding-top: 12px; 
    }

    .node-graph-container {
        height: 100%;
        width: 100%;
        display: flex;
    }

    .loading, .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #666;
        text-align: center;
    }

    .svg-wrapper {
        flex: 1;
        width: 100%; 
        height: 100%;
        min-height: 500px;
    }

    .graph-svg {
        width: 100%;
        height: 100%;
        display: block;
        min-height: 500px;
    }

    .back-button {
        z-index: 10; /* Lower z-index */
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 8px 12px;
        background-color: #f6f8fa;
        border: 1px solid #d1d5da;
        border-radius: 6px;
        font-size: 13px;
        color: #24292e;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-bottom: 10px; /* Space between button and color legend */
        align-self: flex-end;
    }

    .back-button:hover {
        background-color: #e1e4e8;
    }

    .back-button svg {
        width: 16px;
        height: 16px;
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

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #586069;
        text-align: center;
        padding: 32px;
        max-width: 400px;
        margin: 0 auto;
    }

    .empty-state-icon {
        margin-bottom: 16px;
        opacity: 0.6;
    }

    .empty-state h3 {
        margin-bottom: 16px;
        color: #24292e;
        font-size: 18px;
        font-weight: 600;
    }

    .empty-state p {
        margin-bottom: 16px;
        line-height: 1.5;
    }

    .empty-state-list {
        text-align: left;
        margin-bottom: 24px;
        list-style-type: disc;
        padding-left: 20px;
    }

    .empty-state-list li {
        margin-bottom: 8px;
        line-height: 1.5;
    }

    .empty-state .action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background-color: #f6f8fa;
        border: 1px solid #d1d5da;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .empty-state .action-btn:hover {
        background-color: #e1e4e8;
    }
    :global(.node.time-filtered-out) {
        opacity: 0.3;
        pointer-events: none;
    }

    :global(.link.time-filtered-out) {
        opacity: 0.1;
        pointer-events: none;
    }
</style>