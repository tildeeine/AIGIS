<script>
    import { GLOBAL_COLORS } from  '$lib/shared/constants/visualizationConstants.js';
    
    import BaseDetailsPanel from '$lib/shared/components/BaseDetailsPanel.svelte';
    import CopyableText from '$lib/shared/components/CopyableText.svelte';
    import * as treeService from '$lib/process-tree/services/treeVisualizationService.js';
    
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    import * as utils from '$lib/shared/services/utils.js';
    
    export let facts;
    export let selectedNode = [];

    // Determine the node type
    $: nodeType = selectedNode?.objType || selectedNode?.data?.type?.name || 'unknown';
    
    // Find related facts for this node
    $: relatedFacts = selectedNode ? findRelatedFacts(selectedNode, facts) : [];
    

    function findRelatedFacts(node, allFacts) {
        if (!node || !allFacts) return [];
        
        const result = [];
        const nodeValue = node.data?.value || node.name || '';
        
        // Check for file-related facts
        if (node.objType === 'file') {
            if (allFacts.fileReads) {
                result.push(...allFacts.fileReads.filter(f => f.destinationObjectUid === node.uid).map(f => ({
                    ...f,
                    factType: 'fileReads',
                    displayType: 'File Read'
                })));
            }
            if (allFacts.fileWrites) {
                result.push(...allFacts.fileWrites.filter(f => f.destinationObjectUid === node.uid).map(f => ({
                    ...f,
                    factType: 'fileWrites',
                    displayType: 'File Write'
                })));
            }
            if (allFacts.fileDeletes) {
                result.push(...allFacts.fileDeletes.filter(f => f.destinationObjectUid === node.uid).map(f => ({
                    ...f,
                    factType: 'fileDeletes',
                    displayType: 'File Delete'
                })));
            }
        }
        
        // Check for registry-related facts
        else if (node.objType === 'registry') {
            if (allFacts.registryReads) {
                result.push(...allFacts.registryReads.filter(f => f.destinationObjectUid === node.uid).map(f => ({
                    ...f, 
                    factType: 'registryReads',
                    displayType: 'Registry Read'
                })));
            }
            if (allFacts.registryWrites) {
                result.push(...allFacts.registryWrites.filter(f => f.destinationObjectUid === node.uid).map(f => ({
                    ...f,
                    factType: 'registryWrites',
                    displayType: 'Registry Write'
                })));
            }
        }
        
        // Check for network-related facts
        else if (node.objType === 'network') {
            if (allFacts.networkConnections) {
                result.push(...allFacts.networkConnections.filter(f => 
                    f.destinationObjectUid === node.uid
                ).map(f => ({
                    ...f,
                    factType: 'networkConnections',
                    displayType: 'Network Connection'
                })));
            }
        }

        // Check for process-related facts
        else if (node.objType === 'process') {
            if (allFacts.processCreations) {
                // Note: Not adding parent process for now
                result.push(...allFacts.processCreations.filter(f => f.destinationObjectUid === node.uid).map(f => ({
                    ...f,
                    factType: 'processCreations',
                    displayType: 'Process Creation'
                })));
            }
        }
        
        // Sort facts by timestamp
        return result.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    function getFactTypeColor(factType) {
        if (!factType) return GLOBAL_COLORS.DEFAULT; 

        switch(factType) {
            case 'fileReads': return GLOBAL_COLORS.readFile;
            case 'fileWrites': return GLOBAL_COLORS.wroteFile;
            case 'fileDeletes': return GLOBAL_COLORS.deletedFile;
            case 'registryReads': return GLOBAL_COLORS.readRegistry;
            case 'registryWrites': return GLOBAL_COLORS.wroteRegistry;
            case 'networkConnections': return GLOBAL_COLORS.connectedTo;
            case 'processCreations': return GLOBAL_COLORS.createdProcess;
            default: return GLOBAL_COLORS.DEFAULT;
        }
    }
</script>


<BaseDetailsPanel {selectedNode} {nodeType} let:formatTimestamp>
    <svelte:fragment slot="header">
        <button 
            class="action-btn primary"
            on:click={() => dispatch('showTimelineView', { nodeData: selectedNode })}
            title="View this event in timeline"
        >
            <span class="icon">→</span>
            View in timeline
        </button>
        {#if selectedNode.objType === "process"}
            <button 
                class="action-btn primary"
                on:click={() => dispatch('showTreeView', { nodeData: selectedNode})}
                title="View this process in process tree"
            >
                <span class="icon">→</span>
                View in process tree
            </button>
            {#if treeService.hasInteractions(selectedNode.uid)}
                <button 
                    class="action-btn primary"
                    on:click={() => dispatch('showGraphView', { nodeData: selectedNode})}
                    title="View this process in process tree"
                >
                    <span class="icon">→</span>
                    View in event graph
                </button>
            {/if}
        {/if}
    </svelte:fragment>
    <svelte:fragment slot="basic-info">
        {#if nodeType === 'file'}
            <tr>
                <th>Path</th>
                <td class="code-text">
                    <CopyableText text={selectedNode.name} monospace={true} transparent={true} />
                </td>
            </tr>
        {:else if nodeType === 'registry'}
            <tr>
                <th>Key</th>
                <td class="code-text">
                    <CopyableText text={selectedNode.name} monospace={true} transparent={true} />
                </td>
            </tr>
        {:else if nodeType === 'network'}
            <tr>
                <th>IP Address</th>
                <td class="code-text">
                    <CopyableText text={selectedNode.label} monospace={true} transparent={true} />
                    <a 
                        href={`https://www.virustotal.com/gui/ip-address/${encodeURIComponent(selectedNode.label)}`}
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
                    <CopyableText text={selectedNode.data.processId || selectedNode.data.metadata.processId} monospace={true} transparent={true} />
                </td>
            <tr>
                <th>Process Name</th>
                <td>
                    <CopyableText text={selectedNode.data.processName || selectedNode.data.metadata.processName} monospace={true} transparent={true} />
                </td>
            </tr>
            <tr>
                <th>Command Line</th>
                <td>
                    <CopyableText text={selectedNode.data.processCommandline || selectedNode.data.metadata.processCommandline} monospace={true} transparent={true} />
                </td>
            </tr>
            <tr>
                <th>Parent Process ID</th>
                <td>
                    <CopyableText text={selectedNode.data.parentProcessId || selectedNode.data.metadata.parentProcessId} monospace={true} transparent={true} />
                </td>
            </tr>
            <tr>
                <th>Parent Process Path</th>
                <td>
                    <CopyableText text={selectedNode.data.processPath || selectedNode.data.metadata.processPath} monospace={true} transparent={true} />
                </td>
            </tr>
            <tr>
                <th>Timestamp (UTC)</th>
                <td>
                    <CopyableText text={utils.formatTimestamp(selectedNode.data.timestamp || selectedNode.data.metadata.timestamp, false)} monospace={true} transparent={true} />
                </td>
            </tr>
        {/if}
    </svelte:fragment>
    
    <svelte:fragment slot="interaction-details">
        <!-- Graph-specific interaction details -->
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
                                                {fact.displayType}
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
                                                <span class="result-pill">Value: {fact.meta.value}</span>
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                                {#if nodeType === 'network'}
                                    <!-- Network details with proper null checks -->
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
 .action-btn {
    margin-bottom: 10px;
 }
</style>