<script>
    import { slide, fade } from 'svelte/transition';
    import { createEventDispatcher, onMount, onDestroy } from 'svelte';
    const dispatch = createEventDispatcher();

    import CopyableText from '$lib/shared/components/CopyableText.svelte';

    import * as utils from '$lib/shared/services/utils.js';
    import * as apiService from '$lib/shared/services/apiService';
    import * as processModel from '$lib/shared/models/processModel';
    import * as treeVizService from '$lib/process-tree/services/treeVisualizationService.js';
    import * as colorStore from '$lib/shared/stores/colorTagStore.js';
    import * as bookmarkStore from '$lib/bookmarks/stores/bookmarkStore.js';
    import { processDataStore } from "$lib/shared/services/apiService.js";

    
    export let selectedNode = null;
    export let context = "tree";
    export let bookmarkData = null;

    let isPanelVisible = false;
    let activeTab = 'details';
    let networkConnections = [];
    let isLoadingConnections = false;

    let nodeIsBookmarked = false;
    let colorTagUnsubscribe;

    let parentProcessData = null;

    // Fields you should be able to copy
    const copyableFields = [
        'processcommandline',
        'processid',
        'processpath',
        'processname',
        'timestamp'
    ]

    // Watch for changes to selectedNode
    $: isPanelVisible = (!!selectedNode) || (!!bookmarkData);
    
    $: nodeData = context === "tree" ? selectedNode?.data : bookmarkData;

    $: isCollapsed = checkifCollapsed(selectedNode);

    function checkifCollapsed(node) {
        if (!node || !node.data || !node.data.uid) return false;
        return node.data._collapsed;
    }

    $: unsortedGroupedMetadata = nodeData && nodeData.metadata 
        ? processModel.groupMetadataByCategory({
            ...nodeData.metadata
        })
        : {
            // Default empty structure
            basicInfo: [],
            parent: [],
            metadata: [],
            other: []
        };
    
    $: groupedMetadata = sortMetadataFields(unsortedGroupedMetadata);
    
    // Get networkConnections data for the selected node
    $: if (selectedNode) {
        isLoadingConnections = true;
        loadNetworkConnections(selectedNode);
    }

    $: nodeColor = nodeData?.uid ? colorStore.getCustomNodeColor(nodeData.uid) : null;

    $: {
        parentProcessData = null;
        if (nodeData) {
            const parentId = nodeData.parentUid;
            
            // Look up parent in the processDataStore
            $processDataStore.forEach(process => {
                if (process.uid === parentId) {
                    parentProcessData = process;
                    return;
                }
            });
        }
    }

    function handleColorSelect(color) {
        if (!nodeData || !nodeData.uid) return;
        
        if (nodeColor === color.value) {
            // toggle remove set color
            colorStore.setNodeColor(nodeData.uid, null);
            nodeColor = null;
        } else {
            // set new color
            colorStore.setNodeColor(nodeData.uid, color.value);
            nodeColor = color.value;
        }
        dispatch('colorChange', { nodeId: nodeData.uid, color: color.value });
    }

    function removeColorTag() {
        if (!nodeData || !nodeData.uid) return;
        colorStore.setNodeColor(nodeData.uid, null);
        nodeColor = null;
    }

    $: if (selectedNode) {
        updateBookmarkStatus();
    }

    function updateBookmarkStatus() {
        if (!nodeData) {
            nodeIsBookmarked = false;
            return;
        }
        
        nodeIsBookmarked = bookmarkStore.isBookmarked(nodeData.uid);
    }

    function toggleBookmark() {
        if (!nodeData) return;
        
        if (nodeIsBookmarked) {
            bookmarkStore.removeBookmark(nodeData.uid);
        } else {
            // If in tree view, use selectedNode, otherwise use bookmarkData
            if (context === "tree") {
                bookmarkStore.addBookmark(selectedNode);
            } else {
                bookmarkStore.addBookmark({ data: bookmarkData });
            }
        }
        
        // Force immediate update
        updateBookmarkStatus();
    }
    
    function closePanel() {
        selectedNode = null;
        isPanelVisible = false;
    }

    function isFieldCopyable(key) {
        if (!key) return false;
        const lowerKey = key.toLowerCase();
        return copyableFields.some(field => lowerKey.includes(field));
    }

    function formatValue(value, key) {
        if (value === null || value === undefined) {
            return "—";
        }
        if (key && key.startsWith("parent")) {
            key = key.replace("parent", "").trim();
            key = key.charAt(0).toLowerCase() + key.slice(1); // Convert to camelCase
        }

        if (value === "None") {
            // get value from parentProcessData 
            if (parentProcessData && parentProcessData.metadata) {
                if (parentProcessData.pid === "root") {
                    console.log("Parent is root, returning None for key:", key);
                    return "—";
                }

                const parentValue = parentProcessData.metadata[key];
                if (parentValue !== undefined && parentValue !== null) {
                    return formatValue(parentValue);
                }
            }
        }
        
        if (typeof value === "boolean") {
            return value ? "Yes" : "No";
        }
        
        if (typeof value === "object") {
            return JSON.stringify(value);
        }
        
        return String(value);
    }

    function setActiveTab(tab) {
        activeTab = tab;
    }

    function sortMetadataFields(metadata) {
        const sortedMetadata = { ...metadata };
        
        sortCategory(sortedMetadata, 'basicInfo');
        sortCategory(sortedMetadata, 'parent');
        
        return sortedMetadata;
    }

    function sortCategory(metadata, category) {
        const otherItems = [];
        const processItem = [];

        metadata[category].forEach(field => {
            if (field.key === 'processId' || field.key === 'parentProcessId') {
                processItem.push(field);
            } else {
                otherItems.push(field);
            }
        });

        metadata[category] = [
            ...processItem,
            ...otherItems
        ]

        return metadata;
    }

    async function loadNetworkConnections(node) {
        if (!node || !node.data.uid) {
            isLoadingConnections = false;
            networkConnections = [];
            return;
        };

        try {
            networkConnections = await apiService.getNetworkConnectionsForObject(node.data.uid);
        } catch (error) {
            console.error("Error loading network connections:", error);
            networkConnections = [];
        } finally {
            isLoadingConnections = false;
        }
    }

    onMount(() => {
        colorTagUnsubscribe = colorStore.colorTagStore.subscribe(() => {
            // force the nodeColor reactive statement to re-run
            if (nodeData?.uid) {
                nodeColor = colorStore.getCustomNodeColor(nodeData.uid);
            }
        });
    });
    
    onDestroy(() => {
        // Clean up subscription
        if (colorTagUnsubscribe) colorTagUnsubscribe();
    });

</script>


{#if isPanelVisible && nodeData}
    <div class="details-panel {context}-context" transition:slide={{ duration: 300, axis: 'x' }}>
        <div class="panel-header">
            <h2>{nodeData.name || selectedNode.name || 'Process Details'}</h2>
            <button class="close-btn" on:click={closePanel} aria-label="Close panel">×</button>
        </div>

        <!-- Tab Navigation -->
        <div class="tab-navigation">
            <button 
                class="tab-btn {activeTab === 'details' ? 'active' : ''}" 
                on:click={() => setActiveTab('details')}
            >
                Details
            </button>
            {#if networkConnections && networkConnections.length > 0}
                <button 
                    class="tab-btn {activeTab === 'network' ? 'active' : ''}" 
                    on:click={() => setActiveTab('network')}
                >
                    Network
                </button>
            {/if}
            <button 
                class="tab-btn {activeTab === 'notes' ? 'active' : ''}" 
                on:click={() => setActiveTab('notes')}
            >
                Edit node
            </button>
        </div>

        <div class="panel-content">
            <!-- Details Tab -->
            {#if activeTab === 'details'}
                <!-- Action Buttons Section -->
                <div class="section actions-section">
                    {#if treeVizService.hasInteractions(nodeData.uid)}
                        <button 
                            class="action-btn primary"
                            on:click={() => dispatch('showGraphView', { nodeData: nodeData })}
                            title="View this process in graph view"
                        >
                            <span class="icon">→</span>
                            View in event graph
                        </button>
                    {/if}
                    <button 
                        class="action-btn primary"
                        on:click={() => dispatch('showTimelineView', { nodeData: nodeData })}
                        title="View this process in timeline"
                    >
                        <span class="icon">→</span>
                        View in timeline
                    </button>
                    {#if context === "bookmarks"}
                        <button 
                            class="action-btn primary"
                            on:click={() => dispatch('showTreeView', { nodeData: nodeData })}
                            title="View this process in the process tree"
                        >
                            <span class="icon">→</span>
                            View in process tree
                        </button>
                    {/if}
                    
                    {#if nodeData && context === "tree" && (selectedNode.children?.length > 0)}
                        <button 
                            class="action-btn"
                            on:click={() => {
                                dispatch('toggleNode', { selectedNode });
                                isCollapsed = !isCollapsed;
                            }}
                            title={!isCollapsed ? "Collapse all children of this process" : "Expand all children of this process"}
                        >
                            <span class="icon">{!isCollapsed ? '−' : '+'}</span>
                            {!isCollapsed ? 'Collapse' : 'Expand'} Children
                            <span class="count">({nodeData.children?.length || 0})</span>
                        </button>
                    {/if}
                </div>

                <!-- Process Information Section -->
                <div class="section">
                    <h3>Process Information</h3>
                    <table>
                        <tbody>
                            {#each [...(groupedMetadata.basicInfo || [])] as field}
                                <tr>
                                    <th>{field.label}:</th>
                                    <td>
                                        {#if isFieldCopyable(field.key) && field.value}
                                            <CopyableText 
                                                text={formatValue(field.value)} 
                                            />
                                        {:else}
                                            <span class={field.key.includes('path') || field.key.includes('commandline') ? 'code-text' : ''}>
                                                {formatValue(field.value)}
                                            </span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                            {#if context === "tree"}
                                <tr>
                                    <th>Children:</th>
                                    <td>{selectedNode.children ? selectedNode.children.length : 0} processes</td>
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </div>

                <!-- Parent Process Section -->
                {#if groupedMetadata.parent && groupedMetadata.parent.length > 0}
                    <div class="section">
                        <h3>Parent Process</h3>
                        <table>
                            <tbody>                            
                                {#each groupedMetadata.parent as field}
                                    <tr>
                                        <th>{field.label}:</th>
                                        <td>
                                            {#if isFieldCopyable(field.key) && field.value}
                                                <CopyableText 
                                                    text={formatValue(field.value, field.key)} 
                                                />
                                            {:else}
                                                <span class={field.key.includes('path') || field.key.includes('commandline') ? 'code-text' : ''}>
                                                    {formatValue(field.value, field.key)}
                                                </span>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
                
                <!-- Additional Metadata Section -->
                {#if (groupedMetadata.metadata && groupedMetadata.metadata.length > 0) || (groupedMetadata.other && groupedMetadata.other.length > 0)}
                    <div class="section">
                        <h3>Additional Metadata</h3>
                        <table>
                            <tbody>
                                {#each [...(groupedMetadata.metadata || []), ...(groupedMetadata.other || [])].filter(Boolean) as field}
                                    <tr>
                                        <th>{field.label} {field.label === "Timestamp" ? "(UTC)" : ""}:</th>
                                        <td>
                                            {#if isFieldCopyable(field.key) && field.value}
                                                <CopyableText 
                                                    text={formatValue(field.value)} 
                                                />
                                            {:else}
                                                <span class={field.key.includes('path') || field.key.includes('commandline') ? 'code-text' : ''}>
                                                    {formatValue(field.value)}
                                                </span>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            {/if}

            <!-- Network Tab -->
            {#if activeTab === 'network'}
                <div class="section network-section">
                    <h3>Network Connections</h3>
                    
                    {#if isLoadingConnections}
                        <div class="loading">Loading network connections...</div>
                    {:else if networkConnections && networkConnections.length > 0}
                        <div class="summary">
                            <p>Found {networkConnections.length} network connection{networkConnections.length !== 1 ? 's' : ''} for the process</p>
                            <p>Number of unique destination IP{new Set(networkConnections.map(conn => conn.destinationIp)).size !== 1 ? 's' : ''}: 
                                {new Set(networkConnections.map(conn => conn.destinationIp)).size}</p>
                        </div>
                        <div class="connections-list">
                            {#each networkConnections as connection}
                                <div class="connection-item">
                                    <div class="connection-header">
                                        <div class="connection-protocol">{connection.protocol || 'Unknown'}</div>
                                        <div class="connection-timestamp">{utils.formatTimestamp(connection.timestamp, true)} (UTC)</div>
                                    </div>
                                    
                                    <div class="connection-flow">
                                        <!-- Source -->
                                        <div class="connection-endpoint source">
                                            <div class="endpoint-label">Source IP</div>
                                            {#if connection.sourceIp}
                                                <div class="endpoint-address">
                                                    <CopyableText 
                                                        text={connection.sourcePort ? `${connection.sourceIp}:${connection.sourcePort}` : connection.sourceIp}
                                                        transparent={true}
                                                    >
                                                        <span class="ip">{connection.sourceIp}</span>
                                                        {#if connection.sourcePort}
                                                            <span class="port">:{connection.sourcePort}</span>
                                                        {/if}
                                                    </CopyableText>
                                                </div>
                                            {:else}
                                                <div class="endpoint-address unknown">Local process</div>
                                            {/if}
                                        </div>
                                        
                                        <!-- Destination -->
                                        <div class="connection-endpoint destination">
                                            <div class="endpoint-label">Destination IP</div>
                                            {#if connection.destinationIp}
                                                <div class="endpoint-address">
                                                    <CopyableText 
                                                        text={connection.destinationPort ? `${connection.destinationIp}:${connection.destinationPort}` : connection.destinationIp}
                                                        transparent={true}
                                                    >
                                                        <span class="ip">{connection.destinationIp}</span>
                                                        {#if connection.destinationPort}
                                                            <span class="port">:{connection.destinationPort}</span>
                                                        {/if}
                                                    </CopyableText>
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                    
                                    <!-- VirusTotal Link -->
                                    {#if connection.virustotalLink}
                                        <a href={connection.virustotalLink} target="_blank" rel="noopener noreferrer" class="vt-link">
                                            Check on VirusTotal ↗
                                        </a>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="no-data">No network connections found for this process</p>
                    {/if}
                </div>
            {/if}

            {#if activeTab === 'notes'}
                <div class="section interactions-section">
                    <h3>Bookmark and Color Tags</h3>
                    
                    <div class="interaction-features">
                        <div class="bookmark-section">
                            <button 
                                class="bookmark-button" 
                                class:bookmarked={nodeIsBookmarked}
                                on:click={toggleBookmark}
                                disabled={!selectedNode}
                            >
                                <span class="bookmark-icon">
                                    {#if nodeIsBookmarked}
                                        <!-- Filled bookmark icon (bookmarked) -->
                                        <svg width="16" height="16" viewBox="0 0 24 24">
                                            <path fill="currentColor" d="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z" />
                                        </svg>
                                    {:else}
                                        <!-- Outline bookmark icon (not bookmarked) -->
                                        <svg width="16" height="16" viewBox="0 0 24 24">
                                            <path fill="currentColor" d="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3M17,18L12,15.82L7,18V5H17V18Z" />
                                        </svg>
                                    {/if}
                                </span>
                                {nodeIsBookmarked ? 'Remove Bookmark' : 'Bookmark Process'}
                            </button>
                        </div>
                        
                        <div class="feature">
                            <h4>Color Tagging</h4>
                            <p class="color-tagging-help">
                                Select a color to highlight this node in visualizations. This helps track important nodes across different views.
                            </p>
                            <div class="color-options">
                                {#each colorStore.COLOR_OPTIONS as color}
                                    <button 
                                        class="color-option" 
                                        style="background-color: {color.value}"
                                        class:selected={nodeColor === color.value}
                                        on:click={() => handleColorSelect(color)}
                                        aria-label="Set color to {color.name}"
                                        title="{color.name}"
                                    ></button>
                                {/each}
                                
                                {#if nodeColor}
                                    <button 
                                        class="color-option remove-color" 
                                        on:click={removeColorTag}
                                        aria-label="Remove color tag"
                                        title="Remove color tag"
                                    >×</button>
                                {/if}
                            </div>
                            
                            {#if nodeColor}
                                <div class="current-color-status">
                                    <span class="color-preview" style="background-color: {nodeColor}"></span>
                                    <span class="color-name">
                                        {colorStore.COLOR_OPTIONS.find(c => c.value === nodeColor)?.name || 'Custom Color'}
                                    </span>
                                </div>
                            {:else}
                                <div class="current-color-status">
                                    <span class="no-color">No color tag set</span>
                                </div>
                            {/if}
                        </div>                    
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .actions-section {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
    }

    .details-panel.bookmarks-context {
        width: 450px; /* bookmarks view 100 px wider*/
    }

    .tab-navigation {
        display: flex;
        border-bottom: 1px solid #eee;
        position: sticky;
        top: 56px; /* Height of the header */
        background: white;
        z-index: 1;
    }
    
    .tab-btn {
        flex: 1;
        padding: 10px 5px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        color: #777;
        transition: all 0.2s ease;
        text-align: center;
    }
    
    .tab-btn:hover:not(:disabled) {
        color: #333;
        background-color: #f8f8f8;
    }
    
    .tab-btn.active {
        color: #2563EB;
        border-bottom: 2px solid #2563EB;
    }
    
    .tab-btn:disabled {
        color: #ccc;
        cursor: not-allowed;
    }

    .connection-item {
        padding: 12px;
        border: 1px solid #eee;
        border-radius: 4px;
        margin-bottom: 12px;
        background-color: #f9f9f9;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        transition: all 0.2s ease;
    }

    .connection-item:hover {
        border-color: #ddd;
        box-shadow: 0 2px 5px rgba(0,0,0,0.08);
    }

    .connection-flow {
        display: flex;
        align-items: flex-start;
        margin: 16px 0;
        justify-content: space-between;
        gap: 20px;
    }

    .connection-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
        font-size: 10px;
        color: #666;
    }

    .connection-protocol {
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .connection-endpoint {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .connection-endpoint.source {
        text-align: left;
    }

    .connection-endpoint.destination {
        text-align: left;
    }

    .connection-endpoint.source .endpoint-address {
        background: #f2f7ff; 
        border-color: #dbe7fd;
    }

    .connection-endpoint.destination .endpoint-address {
        background: #f2f9f2; 
        border-color: #dceddc;
    }

    .endpoint-label {
        font-size: 11px;
        color: #777;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
    }

    .endpoint-address {
        font-family: monospace;
        font-size: 12px;
        padding: 6px 10px;
        background: #f0f0f0;
        border-radius: 4px;
        display: inline-block;
        border: 1px solid #e0e0e0;
    }

    .ip, .port {
        display: inline;
    }

    .port {
        color: #666;
    }

    .vt-link {
        display: block;
        text-align: right;
        font-size: 10px;
        color: #2563EB;
        text-decoration: none;
        margin-top: 8px;
        transition: color 0.2s;
    }

    .vt-link:hover {
        text-decoration: underline;
        color: #1d4ed8;
    }

    .summary {
        margin-bottom: 12px;
        font-size: 12px;
        color: #333;
    }

    .unknown {
        color: #888;
        font-style: italic;
    }

    .notes-input {
        width: 100%;
        padding: 8px;
        padding-right: 0px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
        resize: vertical;
        margin-bottom: 8px;
    }

    .loading {
        padding: 10px;
        text-align: center;
        font-style: italic;
        color: #666;
    }
    
    .interaction-features {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }
    
    .feature h4 {
        margin: 0 0 8px 0;
        font-size: 12px;
        font-weight: 500;
    }

    .panel-content {
        padding: 15px;
        flex: 1;
    }

    .bookmark-section {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #eee;
    }
    
    .bookmark-button {
        display: flex;
        align-items: center;
        gap: 8px;
        background: none;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 6px 12px;
        cursor: pointer;
        color: #666;
        font-size: 12px;
        transition: all 0.2s;
    }
    
    .bookmark-button:hover {
        background: #f5f5f5;
    }
    
    .bookmark-button.bookmarked {
        background: #e3f2fd;
        color: #0d47a1;
        border-color: #bbdefb;
    }
    
    .bookmark-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .color-tagging-container {
        padding: 16px;
    }
    
    .color-tagging-help {
        color: #666;
        font-size: 13px;
        margin-bottom: 16px;
    }
    
    .color-options {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 16px;
    }
    
    .color-option {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
    }
    
    .color-option:hover {
        transform: scale(1.1);
    }
    
    .color-option.selected {
        border-color: #333;
        box-shadow: 0 0 0 2px white, 0 0 0 4px #ccc;
    }
    
    .remove-color {
        background: #f5f5f5;
        color: #666;
        font-size: 20px;
        font-weight: bold;
    }
    
    .current-color-status {
        display: flex;
        align-items: center;
        margin-top: 8px;
        font-size: 14px;
    }
    
    .color-preview {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        margin-right: 8px;
        display: inline-block;
    }
    
    .no-color {
        color: #999;
        font-style: italic;
    }
</style>