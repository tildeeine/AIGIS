import { filter } from "d3";

export const GLOBAL_COLORS = {
    root: '#000000',       // Black for root node 
    
    process: '#8b662e', // Purple for process objects
    createdProcess: '#8b662e', // AIGIS color for process creation events

    // Network related (BLUE)
    network: '#2196f3',      
    connectedTo: '#2196f3',
    
    // File related
    file: '#4caf50',         // Green for file objects
    readFile: '#4caf50',     // Light green for file read operations
    wroteFile: '#2e6930',    // Medium green for file write operations
    deletedFile: '#0f2310',  // Dark green for file deletion operations  
    
    // Registry related
    registry: '#ff9800',     // Orange for registry object
    readRegistry: '#ffb74d', // Light orange for registry read operations
    wroteRegistry: '#ec8d00',

    // Tree status related
    filtered: '#e0e0e0',     // Very light gray for filtered objects
    highlighted: '#03a9f4',   // Cyan for highlighted objects
    hasInteraction: '#f19d37', // Orange circle for nodes with interactions
    
    suspicious: '#c73f36',   // Red for suspicious activity -> https://color.adobe.com/nb/create/color-wheel
    malicious: '#d32f2f',    // Dark red for confirmed malicious activity
    Windows: '#357ec7',      // Windows Blue for standard Windows activity
    common: '#455b72',      // Blueish gray -> https://color.adobe.com/nb/create/color-wheel
    
    treeNode: '#b8c736', // yellowish green for tree nodes -> https://color.adobe.com/nb/create/color-wheel

    extendedNode: '#8A00E0', // Nodes that are extended in the force graph view on click
    
    // Default/other
    DEFAULT: '#757575',      // Medium gray for unclassified nodes
}
  
// Node size constants
export const NODE_SIZES = {
    XL: 8,
    L: 6,
    M: 4,
    S: 2,
};
  
// Export all constants in a group for convenience
export const VIZ_CONSTANTS = {
    GLOBAL_COLORS,
    NODE_SIZES
};

// Default export for convenience
export default VIZ_CONSTANTS;

