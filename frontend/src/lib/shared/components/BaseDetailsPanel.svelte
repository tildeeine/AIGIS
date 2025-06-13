<script>
    import { utcMillisecond } from 'd3';
    import { slide } from 'svelte/transition';

    import * as utils from '$lib/shared/services/utils';
    
    export let selectedNode = null;

    let isPanelVisible = false;

    // Reactive variables
    $: isPanelVisible = !!selectedNode;

    $: nodeType = selectedNode?.objType || 'unknown';

    function closePanel() {
        selectedNode = null;
        isPanelVisible = false;
    }

    function getDisplayName(node) {
        if (!node) return 'Unknown Node';
        if (node.objType === "process") {
            return node.data?.processName || node.meta?.processName || 'Process';
        } else {
            return node.name || node.detail.value;
        }
    }

</script>

{#if isPanelVisible && selectedNode}
    <div class="details-panel" transition:slide={{ duration: 300, axis: 'x' }}>
        <div class="panel-header">
            <h2>
                <span class="node-type">{getDisplayName(selectedNode)}</span>
            </h2>
            <button class="close-btn" on:click={closePanel} aria-label="Close panel">×</button>
        </div>

        <div class="panel-content">
            <slot name="header"></slot>
            <!-- Basic Information - Common to all -->
            <div class="section">
                <h3>Basic Information</h3>
                <table>
                    <tbody>
                        <tr>
                            <th>Type</th>
                            <td>{nodeType.charAt(0).toUpperCase() + nodeType.slice(1)}</td>
                        </tr>
                        <tr>
                            <th>Interaction</th>
                            <td>
                                <span class="interaction-type" style="background-color: {selectedNode.color}20; color: {selectedNode.color};">
                                    {utils.getDisplayType(selectedNode.factType || selectedNode.type)}
                                </span>
                            </td>
                        </tr>
                        
                        <!-- Use a slot for node-specific basic info -->
                        <slot name="basic-info"></slot>
                    </tbody>
                </table>
            </div>
            
            <!-- Use a slot for custom content -->
            <slot name="interaction-details"></slot>
        </div>
    </div>
{/if}

<style>
    :global(.details-panel) {
        position: fixed;
        top: 0;
        right: 0;
        width: 300px;
        height: 100vh;
        background: white;
        box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
        z-index: 190;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
    }

    :global(.panel-header) {
        padding: 15px;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f8f8f8;
        position: sticky;
        top: 0;
        z-index: 2;
    }
    
    :global(.panel-header h2) {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 280px;
    }

    :global(.timeline) { 
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 10px;
    }

    :global(.timeline-item) {
        display: flex;
        flex-direction: column;
        padding-left: 12px;
        border-left: 3px solid #ddd;
        font-size: 12px;
    }

    :global(.result-pill) {
        background-color: #eeeeee;
    }

    :global(.network-details-grid) {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        width: 100%;
        margin-top: 4px;
        background: #f9f9f9;
        padding: 6px;
        border-radius: 4px;
    }

    :global(.grid-item) {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    :global(.grid-item .detail-label) {
        font-size: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #777;
    }

    :global(.grid-item .detail-value) {
        font-size: 11px;
        color: #333;
    }

    :global(.detail-label) {
        color: #666;
        margin-right: 5px;
    }
    
    :global(.detail-value) {
        color: #333;
    }

    :global(.detail-value.monospace) {
        font-family: monospace;
    }

    .close-btn {
        border: none;
        background: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
    }
    
    .close-btn:hover {
        background: #eee;
        color: #333;
    }

    :global(.action-btn.small) {
        padding: 4px 8px;
        font-size: 12px;
    }

    .panel-content {
        padding: 15px;
        flex: 1;
    }

    table {
        width: 100%;
        border-collapse: collapse;
    }
    
    .node-type {
        text-transform: capitalize;
    }

    .interaction-type {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 500;
    }

    :global(.base-info) {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
    }
    
    :global(.base-info-header) {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    :global(.timeline-details) {
        display: flex;
        gap: 6px;
        margin-bottom: 2px;
    }

    :global(.timeline) {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 10px;
    }
    
    :global(.timeline-time) {
        min-width: 80px;
        color: #777;
        font-size: 12px;
        padding-right: 10px;
    }
    
    :global(.timeline-content) {
        flex: 1;
    }
    
    :global(.timeline-type) {
        font-weight: 600;
        margin-bottom: 4px;
    }
</style>