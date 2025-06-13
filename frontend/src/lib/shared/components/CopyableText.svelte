<script>
    import { fade } from 'svelte/transition';
    
    export let text = '';
    export let monospace = false;
    export let maxHeight = null;
    export let transparent = false;

    let copied = false;
    let timeout;
    let container;

    function copyToClipboard() {
        navigator.clipboard.writeText(text).then(() => {
            copied = true;
            
            // Clear any existing timeout
            if (timeout) clearTimeout(timeout);
            
            // Reset after 2 seconds
            timeout = setTimeout(() => {
                copied = false;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    }

    // Clean up timeout on component destroy
    import { onDestroy } from 'svelte';
    onDestroy(() => {
        if (timeout) clearTimeout(timeout);
    });
</script>

<div 
    class="copyable-text-container {monospace ? 'monospace' : ''} {transparent ? 'transparent' : ''}"
    bind:this={container}
>
    <button 
        class="copyable-text"
        style={maxHeight ? `max-height: ${maxHeight}px` : ''}
        on:click={copyToClipboard}
        aria-label="Click to copy text"
    >
        <span class="text-content">
            <slot>{text}</slot>
        </span>
        <span class="copy-icon" aria-hidden="true">
            {#if copied}
                ✓
            {:else}
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            {/if}
        </span>
    </button>
    {#if copied}
        <div class="copy-notification" transition:fade={{ duration: 150 }}>Copied!</div>
    {/if}
</div>

<style>
    .copyable-text-container {
        position: relative;
        width: 100%;
        background-color: #f5f5f5;
        border-radius: 4px;
        border: 1px solid #e0e0e0;
        overflow: hidden;
        transition: all 0.2s;
    }

    .copyable-text-container.transparent {
        background-color: transparent;
        border: none;
    }

    .copyable-text-container.transparent:hover {
        border: none;
        box-shadow: none;
    }
    
    .copyable-text-container.transparent .copyable-text {
        background-color: transparent;
    }
    
    .copyable-text-container:hover {
        border-color: #ccc;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    .copyable-text {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        width: 100%;
        cursor: pointer;
        padding: 6px 8px;
        word-break: break-word;
        text-align: left;
        background: transparent;
        border: none;
        min-height: 30px;
        font-family: monospace;
        font-size: 12px;
        overflow-y: auto;
    }
    
    .text-content {
        flex: 1;
        white-space: pre-wrap;
        overflow-x: auto;
        padding-right: 24px;
    }
    
    .copy-icon {
        position: absolute;
        top: 6px;
        right: 6px;
        color: #777;
        opacity: 0.6;
        padding: 2px;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .copyable-text:hover .copy-icon {
        opacity: 1;
        color: #2563EB;
        background-color: rgba(255, 255, 255, 0.8);
    }

    .copy-notification {
        position: absolute;
        top: -28px;
        right: 0;
        background-color: #2563EB;
        color: white;
        border-radius: 4px;
        padding: 3px 8px;
        font-size: 12px;
        pointer-events: none;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
</style>