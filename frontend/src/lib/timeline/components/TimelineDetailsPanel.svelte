<script>
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    import BaseDetailsPanel from '$lib/shared/components/BaseDetailsPanel.svelte';
    import CopyableText from '$lib/shared/components/CopyableText.svelte';

    import { GLOBAL_COLORS } from  '$lib/shared/constants/visualizationConstants.js';
    import * as utils from '$lib/shared/services/utils.js';

    export let facts;
    export let selectedNode = [];

    // Determine the node type
    $: nodeType = selectedNode?.objType || 'unknown';
    
    // Find related facts for this node
    $: relatedFacts = selectedNode ? findRelatedFacts(selectedNode, facts) : [];
    
    function findRelatedFacts(node, facts) {
        if (!node || !facts) return [];
        const relatedFacts = [];

        const nodeId = node.objectId;

        relatedFacts.push(...facts.filter(f => f.destinationObjectUid === nodeId));
            
        return relatedFacts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    function hasInteractions(nodeId) {
        return facts.some(fact => fact.sourceObjectUid === nodeId);
    }

</script>

<BaseDetailsPanel {selectedNode} {nodeType} let:formatTimestamp>
    <svelte:fragment slot="header">

        {#if nodeType ==='process'}
            <div class="view-buttons">
                {#if hasInteractions(selectedNode.objectId)}
                    <button 
                        class="action-btn primary"
                        on:click={() => dispatch('showGraphView', { nodeData: selectedNode })}
                        title="View this process and its interactions in graph view"
                    >
                        <span class="icon">→</span>
                        View in event graph
                    </button>
                {/if}
                <button 
                    class="action-btn primary"
                    on:click={() => dispatch('showTreeView', { eventId: selectedNode.objectId })}
                    title="View this node in context in tree view"
                >
                    <span class="icon">→</span>
                    View in process tree
                </button>
            </div>
        {/if}
    </svelte:fragment>
    <svelte:fragment slot="basic-info">
        {#if nodeType === 'file'}
            <tr>
                <th>Path</th>
                <td class="code-text">
                    <CopyableText text={selectedNode.detail.value} monospace={true} transparent={true} />
                </td>
            </tr>
        {:else if nodeType === 'registry'}
            <tr>
                <th>Key</th>
                <td class="code-text">
                    <CopyableText text={selectedNode.detail.value} monospace={true} transparent={true} />
                </td>
            </tr>
        {:else if nodeType === 'network'}
            <tr>
                <th>IP Address</th>
                <td class="code-text">
                    <CopyableText text={selectedNode.detail.value} monospace={true} transparent={true} />
                    <a 
                        href={`https://www.virustotal.com/gui/ip-address/${encodeURIComponent(selectedNode.detail.value)}`}
                        target="_blank" 
                        rel="noopener noreferrer" 
                        class="vt-link"
                    >
                        Check on VirusTotal ↗
                    </a>
                </td>
            </tr>
        {:else if nodeType === 'process'}
            <tr>
                <th>Process ID</th>
                <td>
                    <CopyableText text={selectedNode.detail.value} monospace={true} transparent={true} />
                </td>
            <tr>
                <th>Process Name</th>
                <td>
                    <CopyableText text={selectedNode.meta.processName } monospace={true} transparent={true} />
                </td>
            </tr>
            <tr>
                <th>Command Line</th>
                <td class="code-text">
                    <CopyableText text={selectedNode.meta.processCommandline} monospace={true} transparent={true} />
                </td>
            </tr>
            <tr>
                <th>Parent Process ID</th>
                <td>
                    <CopyableText text={selectedNode.meta.parentProcessId} monospace={true} transparent={true} />
                </td>
            </tr>
            <tr>
                <th>Parent Process Path</th>
                <td>
                    <CopyableText text={selectedNode.meta.processPath} monospace={true} transparent={true} />
                </td>
            </tr>
            <tr>
                <th>Timestamp (UTC)</th>
                <td>
                    <CopyableText text={utils.formatTimestamp(selectedNode.meta.timestamp, false)} monospace={true} transparent={true} />
                </td>
            </tr>
        {/if}
    </svelte:fragment>
    
    <svelte:fragment slot="interaction-details">
        <!-- Timeline-specific interaction details -->
        {#if selectedNode.objType !== 'process'}
            <div class="section">
                <h3>All interactions with this node</h3>
                {#if relatedFacts.length > 0}
                    <div class="timeline">
                        {#each relatedFacts as fact}
                            <div class="timeline-item">
                                <div class="base-info">
                                    <div class="base-info-header">
                                        <div class="timeline-time">
                                            {utils.formatTimestamp(fact.meta.timestamp, false)} (UTC)
                                        </div>
                                        <div class="timeline-content">
                                            <div class="timeline-type" style="color: {selectedNode.color}">
                                                {utils.getDisplayType(fact.type)}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="timeline-details">
                                        <div class="detail-item">
                                            <span class="result-pill">PID: {fact.sourceObjectValue}</span>
                                        </div>
                                        <div class="detail-item">
                                            <span class="result-pill">Count: {fact.meta.count}</span>
                                        </div>
                                        {#if nodeType === 'registry'}
                                            <div class="detail-item">
                                                <span class="result-pill">Value:{fact.meta.value}</span>
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                                {#if nodeType === 'network'}
                                <!-- Network details -->
                                    {#if fact.meta}
                                        <div class="network-details-grid">
                                            <div class="grid-item">
                                                <span class="detail-label">Source IP:</span>
                                                <span class="detail-value monospace">{fact.meta.srcIp}</span>
                                            </div>

                                            <div class="grid-item">
                                                <span class="detail-label">Source Port:</span>
                                                <span class="detail-value monospace">{fact.meta.srcPort}</span>
                                            </div>
                                            <div class="grid-item">
                                                <span class="detail-label">Dest port:</span>
                                                <span class="detail-value monospace">{fact.meta.destPort}</span>
                                            </div>

                                            <div class="grid-item">
                                                <span class="detail-label">Protocol:</span>
                                                <span class="detail-value">{fact.meta.proto.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="no-data">No detailed interaction data available.</div>
                {/if}
            </div>
        {/if}
    </svelte:fragment>
</BaseDetailsPanel>

<style>
     .no-data {
        font-style: italic;
        color: #999;
        padding: 10px 0;
    }

    .view-buttons {
        margin-bottom: 15px;
    }

    .action-btn {
        margin-bottom: 5px;
    }
    
</style>