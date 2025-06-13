<script>
    import { fade } from 'svelte/transition';
    import { HELP_CONTENT } from '$lib/shared/constants/helpContent.js';
    
    export let currentView = null;
    export let title = "Help";
    export let showHelp = false;
        
    function toggleHelp() {
      showHelp = !showHelp;
    }
    
    function closeHelp() {
      showHelp = false;
    }

    $: helpContent = currentView ? HELP_CONTENT[currentView] : null;
  </script>
  
<div class="help-container">
    
    {#if showHelp}
      <div class="help-modal-backdrop" 
        on:click={closeHelp} 
        transition:fade={{ duration: 150 }}
        on:keydown={e => e.key === 'Enter' && selectBookmark(bookmark)}
        tabindex="0"
        role="button"
        ></div>
      <div class="help-modal" transition:fade={{ duration: 200 }}>
        <div class="help-modal-header">
          <h3>{helpContent ? helpContent.title : title}</h3>
          <button class="close-button" on:click={closeHelp} aria-label="Close help">×</button>
        </div>
        <div class="help-modal-content">
          {#if helpContent}
            <p>{helpContent.intro}</p>
            
            {#each helpContent.sections as section}
              <h5>{section.title}</h5>
              <ul>
                {#each section.items as item}
                  <li>{@html item}</li>
                {/each}
              </ul>
            {/each}
            
            {#if helpContent.legend}
              <h5>Color Legend</h5>
              <p>The color of a node indicates its type or behavior:</p>
              <div class="help-legend">
                {#each helpContent.legend as item}
                  <div class="help-legend-item">
                    <span 
                      class="legend-dot" 
                      style={item.type === 'hasInteractions' ? 
                        `background-color: transparent; border: 2px solid ${item.color};` : 
                        `background-color: ${item.color}; border: 2px solid ${item.color};`}
                    ></span>
                    <span>{item.label}</span>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
</div>
  
  <style>
   .help-container {
      position: relative;
    }
    
    .help-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.3);
      z-index: 1000;
    }
    
    .help-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      width: 90%;
      max-width: 800px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 10001;
      font-size:14px;
    }
    
    .help-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #eee;
    }
    
    .help-modal-header h3 {
      margin: 0;
      font-size: 18px;
      color: #333;
    }
    
    .close-button {
      background: none;
      border: none;
      font-size: 24px;
      color: #999;
      cursor: pointer;
      padding: 0;
      margin: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .close-button:hover {
      color: #333;
    }
    
    .help-modal-content {
      padding: 16px;
    }
  </style>