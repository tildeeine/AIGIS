<script>
    import { onMount, createEventDispatcher } from 'svelte';

    import { bookmarkStore, removeBookmark } from '$lib/bookmarks/stores/bookmarkStore';
    import TreeDetailsPanel from '$lib/process-tree/components/TreeDetailsPanel.svelte';
    import * as utils from '$lib/shared/services/utils.js';
    
    const dispatch = createEventDispatcher();
    
    let selectedBookmark = null;
    
    function handleViewInTree() {
        dispatch('viewInTree', { nodeId: selectedBookmark.uid });
    }
    
    function handleViewInGraph() {
        dispatch('viewInGraph', { nodeId: selectedBookmark.uid });
    }
    
    function handleViewInTimeline() {
        dispatch('viewInTimeline', { nodeId: selectedBookmark.uid });
    }
    
    function handleDeleteBookmark(bookmark) {
        if (confirm(`Remove bookmark for ${bookmark.name}?`)) {
            removeBookmark(bookmark.uid);
            if (selectedBookmark?.uid === bookmark.uid) {
                selectedBookmark = null;
            }
        }
    }
    
    function selectBookmark(bookmark) {
        selectedBookmark = bookmark;
    }
</script>

<div class="bookmarks-container">
    <div class="bookmarks-list">
        <h2>Bookmarked Processes</h2>
        
        {#if $bookmarkStore.length === 0}
            <div class="empty-state">
                <p>No bookmarks yet. Bookmark processes to track them here.</p>
            </div>
        {:else}
            {#each $bookmarkStore as bookmark (bookmark.uid)}
                <div 
                    class="bookmark-card" 
                    class:selected={selectedBookmark?.uid === bookmark.uid}
                    on:click={() => selectBookmark(bookmark)}
                    on:keydown={e => e.key === 'Enter' && selectBookmark(bookmark)}
                    role="button"
                    tabindex="0"
                >
                    <div class="bookmark-header">
                        <h3>{bookmark.name}</h3>
                        <button 
                            class="delete-bookmark" 
                            on:click|stopPropagation={() => handleDeleteBookmark(bookmark)}
                            title="Remove bookmark"
                        >
                            ×
                        </button>
                    </div>
                    <div class="bookmark-metadata">
                        <div class="bookmark-row">
                            <span class="bookmark-label">Process ID:</span>
                            <span>{bookmark.metadata.processId || 'N/A'}</span>
                        </div>
                        <div class="bookmark-row">
                            <span class="bookmark-label">Created:</span>
                            <span>{utils.formatTimestamp(bookmark.timestamp, true)}</span>
                        </div>
                        <div class="bookmark-row">
                            <span class="bookmark-label">Bookmarked:</span>
                            <span>{utils.formatTimestamp(bookmark.bookmarkedAt, true)}</span>
                        </div>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
    
    <div class="bookmark-details">
        {#if selectedBookmark}
            <TreeDetailsPanel 
                context="bookmarks"
                bookmarkData={selectedBookmark}
                on:showTreeView={handleViewInTree}
                on:showGraphView={handleViewInGraph}
                on:showTimelineView={handleViewInTimeline}
            />
        {:else}
            <div class="empty-details">
                <p>Select a bookmark to view details</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .bookmarks-container {
        display: flex;
        height: 100%;
        width: 100%;
    }
    
    .bookmarks-list {
        width: 70%;
        min-height: 300px;
        border-right: 1px solid #eee;
        overflow-y: auto;
        padding: 16px;
        margin-left: 20px;
    }
    
    .bookmark-details {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        min-width: 32%; 
    }
    
    .bookmark-card {
        background: white;
        border: 1px solid #eee;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 12px;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .bookmark-card:hover {
        border-color: #ddd;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    
    .bookmark-card.selected {
        border-color: #bbdefb;
        background: #e3f2fd;
    }
    
    .bookmark-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }
    
    .bookmark-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
    }
    
    .bookmark-metadata {
        font-size: 12px;
        color: #666;
    }
    
    .bookmark-row {
        margin: 4px 0;
    }
    
    .bookmark-label {
        font-weight: 500;
        margin-right: 4px;
    }
    
    .delete-bookmark {
        background: none;
        border: none;
        color: #999;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
    }
    
    .delete-bookmark:hover {
        color: #d32f2f;
    }
    
    .empty-state, .empty-details {
        display: flex;
        height: 100%;
        align-items: center;
        justify-content: center;
        color: #999;
        font-style: italic;
        text-align: center;
        padding: 20px;
    }
</style>