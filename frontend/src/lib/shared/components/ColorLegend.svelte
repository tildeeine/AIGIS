<script>
    import { GLOBAL_COLORS } from '$lib/shared/constants/visualizationConstants.js';
    import { HELP_CONTENT } from '$lib/shared/constants/helpContent.js';
        
    export let expanded = true;
    export let currentView = "tree";
    export let title = "Color Legend";

    function toggleExpanded() {
      expanded = !expanded;
    }

    $: helpContent = currentView ? HELP_CONTENT[currentView] : null;
  </script>
  
  <div class="legend-container" class:expanded>
    <div class="legend-header" on:click={toggleExpanded}>
      <span>{title}</span>
      <span class="toggle-icon">{expanded ? '−' : '+'}</span>
    </div>
    
    {#if expanded}
      <div class="legend-items">
          {#each helpContent.legend as item}
            <div class="legend-item">
              <span 
                class="color-dot" 
                style={item.type === 'hasInteractions' ? 
                  `background-color: transparent; border: 2px solid ${item.color};` : 
                  `background-color: ${item.color}; border: 2px solid ${item.color};`}
              ></span>
              <span>{item.label}</span>
            </div>
          {/each}
      </div>
    {/if}
  </div>
  
  <style>
    .legend-container {
      background-color: rgba(255, 255, 255, 0.95);
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
      width: 220px;
      overflow: hidden;
      transition: all 0.2s ease-in-out;
    }
    
    .legend-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background-color: #f8f8f8;
      border-bottom: 1px solid #eee;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    
    .legend-items {
      padding: 8px 12px;
      font-size: 12px;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      margin-bottom: 6px;
      color: #555;
    }
    
    .legend-item:last-child {
      margin-bottom: 0;
    }
    
    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .toggle-icon {
      font-weight: bold;
    }
  </style>