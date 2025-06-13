import * as d3 from "d3";
import { writable } from 'svelte/store';

import { getCustomNodeColor } from "$lib/shared/stores/colorTagStore";
import { getNodeDisplayColor } from "$lib/shared/services/colorService";

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 300;
const DEFAULT_PADDING = 40;
const DX = 15;  // Vertical separation between nodes
const DY = 150; // Horizontal separation between depth levels (between parents and children)

// Centralized state variables for visualization
const state = {
  svg: null,
  g: null,
  root: null,
  nodes: [],
  links: [],
  selectedNode: null,
  dimensions: {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  },
  timeFiltering: {
    active: false,
    timeRange: null
  },
  filters: {}, 
  isLoading: false
};

export const nodeToggleStore = writable(null);

/**
 * Initialize the visualization with an SVG container
 */
export function initialize(svgContainer, dimensions = {}) {
  state.svg = svgContainer;
  
  // Update dimensions if provided
  if (dimensions.width) state.dimensions.width = dimensions.width;
  if (dimensions.height) state.dimensions.height = dimensions.height;

    
  console.log("Tree visualization initialized with dimensions:", state.dimensions);

  setupDrag(svgContainer);
  
  return state;
}

export function setupDrag(svgElement) {
  if (!svgElement) return;
  
  const svg = d3.select(svgElement);
  const g = svg.select("g"); // Get the main group element
  
  if (!g.node()) {
    console.warn("Main group element not found in SVG");
    return;
  }
  
  // Set grab cursor on SVG
  svg.style("cursor", "grab");
  
  // Extract current transform if it exists
  let currentTransform = { x: 0, y: 0 };
  const existingTransform = g.attr("transform");
  if (existingTransform && existingTransform.includes("translate")) {
    const match = /translate\(\s*([^\s,)]+)[ ,]([^\s,)]+)/.exec(existingTransform);
    if (match) {
      currentTransform.x = parseFloat(match[1]);
      currentTransform.y = parseFloat(match[2]);
    }
  }
  
  // Create drag behavior
  const drag = d3.drag()
    .subject(() => ({ x: currentTransform.x, y: currentTransform.y }))
    .on("start", function(event) {

      svg.style("cursor", "grabbing");
    })
    .on("drag", function(event) {

      
      // Apply new transform
      g.attr("transform", `translate(${event.x}, ${event.y})`);
      
      // Update current transform
      currentTransform.x = event.x;
      currentTransform.y = event.y;
    })
    .on("end", function() {
      svg.style("cursor", "grab");
    });
  
  state.currentTransform = currentTransform;
  // Apply drag to SVG
  svg.call(drag);
}

/**
 * Update the visualization filters
 * @param {Object} filters - Filter settings
 */
export function updateFilters(filters) {
  state.filters = { ...filters };
  
  // Apply filters to current nodes
  if (state.nodes.length > 0) {
    applyVisualFilters();
  }
  
  return state;
}

/**
 * Set new process data and generate hierarchy
 * @param {Array} processData - Array of process objects
 */
export function setProcessData(processData) {
  state.isLoading = true;
  
  if (!processData || processData.length === 0) {
    state.root = null;
    state.nodes = [];
    state.links = [];
    state.isLoading = false;
    return state;
  }
  
  try {
    // Build hierarchy from data
    const processHierarchy = buildProcessHierarchy(processData);
    state.root = d3.hierarchy(processHierarchy);
    
    // Update layout
    updateLayout();
    
    state.isLoading = false;
  } catch (error) {
    console.error("Error setting process data:", error);
    state.isLoading = false;
  }
  
  return state;
}

/**
 * Update tree layout based on current root
 */
export function updateLayout() {
  if (!state.root) {
    state.nodes = [];
    state.links = [];
    return state;
  }
  
  try {
    const layout = calculateLayout(state.root);
    
    state.nodes = layout.nodes;
    state.links = layout.links;
    state.dimensions.width = layout.width;
    state.dimensions.height = layout.height;
    
    // Apply any active filters
    if (state.filters) {
      applyVisualFilters();
    }
  } catch (error) {
    console.error("Error updating layout:", error);
  }
  
  return state;
}

/**
 * Calculate tree layout from hierarchy
 * @param {d3.HierarchyNode} root - Hierarchy root
 * @returns {Object} Layout data with nodes, links, width, height
 */
export function calculateLayout(root) {
    if (!root) return { nodes: [], links: [], width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    
    try {
        const tempRoot = root.copy(); // Working copy
        let currentTransform = null;
        if (state.svg) {
            const g = d3.select(state.svg).select("g");
            if (g.node()) {
                currentTransform = g.attr("transform");
            }
        }
        
        // Sort nodes after number of children and then alphabetically
        tempRoot.sort((a, b) => {
            const aChildCount = a.children ? a.children.length : 0;
            const bChildCount = b.children ? b.children.length : 0;
            
            if (aChildCount !== bChildCount) {
                return aChildCount - bChildCount;
            }
            
            return d3.ascending(a.data.name, b.data.name);
        });
        
        // Process collapsed nodes for correct layout
        hideCollapsedChildren(tempRoot);
    
        // Create cluster layout
        const cluster = d3.cluster().nodeSize([DX, DY]);
        cluster(tempRoot);

        // Scale horizontal positions for better spacing
        tempRoot.each((d) => {
            d.y = d.depth * DY;
        });
        
        // Get visible (non-collapsed) nodes and links 
        const visibleNodes = tempRoot.descendants();
        const visibleLinks = tempRoot.links();
        
        // Calculating bounds for alyout
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        visibleNodes.forEach(d => {
            if (d.x < minX) minX = d.x;
            if (d.x > maxX) maxX = d.x;
            if (d.y < minY) minY = d.y;
            if (d.y > maxY) maxY = d.y;
        });

        const padding = { top: DEFAULT_PADDING, bottom: DEFAULT_PADDING + 30 };

        // Calculate actual dimensions
        const actualWidth = maxY - minY + 60;
        const actualHeight = maxX - minX + padding.top + padding.bottom;

        // Set minimum dimensions
        const width = Math.max(actualWidth, DEFAULT_WIDTH);
        const height = Math.max(actualHeight, DEFAULT_HEIGHT);

        return {
            nodes: visibleNodes,
            links: visibleLinks,
            width,
            height, 
            transform: currentTransform 
        };
    } catch (error) {
        console.error("Error calculating layout:", error);
        return { nodes: [], links: [], width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, transform: null };
    }
}

/**
 * Toggle node expansion/collapse
 * @param {Object} nodeId - Node to toggle
 */
export function toggleNode(nodeData) {
  if (!nodeData || !state.root) return state;
  
  console.log("Toggling node:", nodeData);

  // Find node
  const hierarchyNode = getNodeById(nodeData.data.uid);
  if (!hierarchyNode) {
      console.warn("Node not found in hierarchy:", nodeData.data.uid);
      return state;
  }

  hierarchyNode.data._collapsed = !hierarchyNode.data._collapsed;
  
  updateLayout();
  
  return state;
}

/**
 * Find a node by its ID in the hierarchy
 * @param {string} nodeId - ID to search for
 * @returns {Object} Found node object or null
 */
export function getNodeById(nodeId) {
  const node = state.nodes.find(n => n.data.uid === nodeId);
  return node || null;
}

// Export the state for external access
export function getState() {
  return state;
}

/**
 * Expand all nodes in the tree
 */
export function expandAll() {
  if (!state.root) return state;
  
  // Recursively expand all nodes
  function expandNode(node) {
      if (!node) return;
      
      node.data._collapsed = false;
      
      if (node.children) {
          node.children.forEach(child => {
              expandNode(child);
          });
      }
  }
  
  expandNode(state.root);
  updateLayout();
  
  return state;
}

/**
 * Collapse all nodes in the tree
 */
export function collapseAll() {
  if (!state.root) return state;
  
  // Only necessary to collapse first children of root, will make childrne of these not visible as well
  if (state.root.children) {
      state.root.children.forEach(child => {
          child.data._collapsed = true;
      });
  }
  
  updateLayout();
  
  return state;
}

/**
 * Expand children of a specific node
 * @param {Object} node - Node whose children to expand
 */
export function expandChildren(node) {
  if (!node || !state.root) return state;
  
  const hierarchyNode = getNodeById(node.data.uid); //? is this necessary? passing node object already
  if (hierarchyNode) {
      hierarchyNode.data._collapsed = false;
      updateLayout();
  }
  
  return state;
}

/**
 * Collapse children of a specific node
 * @param {Object} node - Node whose children to collapse
 */
export function collapseChildren(node) {
  if (!node || !state.root) return state;
  
  const hierarchyNode = getNodeById(state.root, node.data.uid);
  if (hierarchyNode) {
      hierarchyNode.data._collapsed = true;
      updateLayout();
  }
  
  return state;
}

/**
 * Set the selected node
 * @param {Object} node - Node to select
 */
export function selectNode(node) {
  state.selectedNode = node;
  return state;
}

/**
 * Check if a node has any interactions
 * @param {Object} node - Node to check
 * @returns {boolean} True if node has interactions
 */
export function hasInteractions(nodeId) {
  if (!nodeId) return false;
  let node = getNodeById(nodeId);
  if (!node || !node.data || !node.data.data) return false;
  const interactionCounts = node.data.data.interactionCounts;
  if (!interactionCounts) return false;

  const hasFileInteractions = (
      (interactionCounts.fileReads > 0) || 
      (interactionCounts.fileWrites > 0) ||
      (interactionCounts.fileDeletes > 0) ||
      (interactionCounts.registryReads > 0) ||
      (interactionCounts.registryWrites > 0) ||
      (interactionCounts.networkConnections > 0)
  );
  return hasFileInteractions;
}

/**
 * Apply visual filters to nodes
 * @returns {Object} Updated state
 */
export function applyVisualFilters() {
  if (!state.nodes || state.nodes.length === 0) return state;
  
  console.log("Applying filters to", state.nodes.length, "visible nodes with filters:", state.filters);
  
  const filters = state.filters;
  const highlightedNodeSet = new Set(filters.searchNodeIds || []);

  // Process time filtering - calculate time range once for efficiency
  const isTimeFilterActive = state.timeFiltering.active && state.timeFiltering.timeRange && 
                            state.timeFiltering.timeRange.length === 2;
  let startTime, endTime;
  
  if (isTimeFilterActive) {
    startTime = state.timeFiltering.timeRange[0].getTime();
    endTime = state.timeFiltering.timeRange[1].getTime();
  }
  
  for (const node of state.nodes) {
      if (!node.filterState) node.filterState = {};
      
      node.filterState.isFiltered = false;
      node.timeFiltered = false;
      // Apply search nodeId filters
      if (filters.searchNodeIds && filters.searchNodeIds.length > 0 && 
          !highlightedNodeSet.has(node.data.uid)) {
          node.filterState.isFiltered = true;
          continue;
      }

      // Apply time-based filtering
      if (isTimeFilterActive) {
        const hasTimestamp = !!(node.data.data.metadata.timestamp || node.data.startTime); // this can't be the best wat to handle this data but no time to refactor
        let nodeTime = 0;
        let nodeInTimeRange = false;
        
        if (hasTimestamp) {
          nodeTime = new Date(node.data.data.metadata.timestamp || node.data.startTime || 0).getTime();
          // Determine if process timestamp is in time range
          nodeInTimeRange = hasTimestamp && (nodeTime >= startTime && nodeTime <= endTime);
        }
        
        let eventsInTimeRange = false;
        
        const interactions = node.data.data.interactions || [];
        if (interactions) {
          const allEvents = [
            ...interactions.networkConnections,
            ...interactions.fileReads,
            ...interactions.fileWrites,
            ...interactions.fileDeletes,
            ...interactions.registryReads,
            ...interactions.registryWrites
          ]
          
          eventsInTimeRange = allEvents.some(event => {
            const eventTime = new Date(event.meta.timestamp).getTime();
            return eventTime >= startTime && eventTime <= endTime;
          });
        }

        const isInTimeRange = nodeInTimeRange || eventsInTimeRange;
        
        if (isInTimeRange) {
          node.timeHighlight = true; // Highlight nodes in time range
        } else if (hasTimestamp) {
          node.timeFiltered = true; // Filter nodes outside time range
        }
      }
    
      // If already filtered by time, also mark in filter state
      if (node.timeFiltered) {
        node.filterState.isFiltered = true;
        continue;
      }
        
      const interactionCounts = node.data?.data?.interactionCounts;
      
      // Apply interaction count filters
      if (filters.interactionCount === 'none') {
          // Show only nodes with no interactions
          if (hasInteractions(node.data.uid)) {
              node.filterState.isFiltered = true;
              continue; 
          }
      } else if (filters.interactionCount === 'one-plus') {
          // Show only nodes with at least one interaction
          if (!hasInteractions(node.data.uid)) {
              node.filterState.isFiltered = true;
              continue; 
          }
      } else if (filters.interactionCount === 'five-plus') {
        if (interactionCounts.total < 5) node.filterState.isFiltered = true;
      } else if (filters.interactionCount === 'ten-plus') {
        if (interactionCounts.total < 10) node.filterState.isFiltered = true;
      } 
      
      // Apply interaction type filters
      const hasActiveTypeFilters = 
          filters.networkConnections || 
          filters.fileReads || 
          filters.fileWrites ||
          filters.fileDeletes ||
          filters.registryReads || 
          filters.registryWrites;
      
      if (!hasActiveTypeFilters) continue;
      
      // Check that node has all active interaction type filters
      if (filters.networkConnections && 
          (!interactionCounts?.networkConnections || interactionCounts.networkConnections.length === 0)) {
          node.filterState.isFiltered = true;
          continue;
      }
      
      if (filters.fileReads && 
          (!interactionCounts?.fileReads || interactionCounts.fileReads.length === 0)) {
          node.filterState.isFiltered = true;
          continue;
      }
      
      if (filters.fileWrites && 
          (!interactionCounts?.fileWrites || interactionCounts.fileWrites.length === 0)) {
          node.filterState.isFiltered = true;
          continue;
      }
      
      if (filters.fileDeletes && 
          (!interactionCounts?.fileDeletes || interactionCounts.fileDeletes.length === 0)) {
          node.filterState.isFiltered = true;
          continue;
      }
      
      if (filters.registryReads && 
          (!interactionCounts?.registryReads || interactionCounts.registryReads.length === 0)) {
          node.filterState.isFiltered = true;
          continue;
      }
      
      if (filters.registryWrites && 
          (!interactionCounts?.registryWrites || interactionCounts.registryWrites.length === 0)) {
          node.filterState.isFiltered = true;
          continue;
      }
  }
  
  return state;
}

/**
 * Build a D3 hierarchy-compatible object from process data
 * @param {Array} processes - Process array
 * @returns {Object} Hierarchy object that can be used with d3.hierarchy()
 */
export function buildProcessHierarchy(processes) {
  const nodeMap = {};
  let rootNode = {};

  // First pass: create all process nodes
  processes.forEach((process) => {
    nodeMap[process.uid] = {
      // D3 visualization properties 
      uid: process.uid,
      parentUid: process.parentUid || null,
      name: process.metadata.processName || `${process.pid}`,
      pid: process.pid,
      parentPid: process.parentPid || null,
      children: [],
      _collapsed: false,
      
      // Original process object and complete metadata
      data: process,
      metadata: process.metadata || {},
    };

    // Handle special case for root
    if (process.pid === "root") {
      rootNode = nodeMap[process.uid];
      nodeMap[process.uid].name = 'root'; 
    }
  });

  // Second pass: build relationships
  processes.forEach((process) => {
    const uid = process.uid;
    const parentUid = process.parentUid || null;
    const node = nodeMap[uid];

    if (parentUid && nodeMap[parentUid]) {
      // If parent in nodemap, add as child to parent
      nodeMap[parentUid].children.push(node);
    } else if (process.pid === 'root') {
      console.log("Root node found:", uid);
    } else {
      // If no parent already in node map, don't add but log the error
      console.log("No parent found for process:", uid, "Parent UID:", parentUid);
    }
  });

  return rootNode;
}

/**
 * Hide children of collapsed nodes
 * @param {d3.HierarchyNode} root - Root node to process
 * @returns {Map} Map of hidden children
 * @private
 */
function hideCollapsedChildren(root) {
  if (!root) return new Map();
  
  const hiddenChildrenMap = new Map();
  
  // Process nodes recursively
  function processNode(node) {
    if (!node) return;
    
    // Store original children before modification
    const originalChildren = node.children ? [...node.children] : [];
    
    // If collapsed, hide children
    if (node.data && node.data._collapsed && node.children && node.children.length > 0) {
      // Store reference to hidden children
      hiddenChildrenMap.set(node, node.children);
      
      // Remove children from hierarchy
      node.children = null;
    }
    
    // Process children of expanded nodes or original children if modifying
    (node.children || originalChildren).forEach(child => {
      processNode(child);
    });
  }
  
  processNode(root);
  return hiddenChildrenMap;
}

/**
 * Restore children that were hidden by hideCollapsedChildren.
 * 
 * @param {Map} hiddenChildrenMap - Map of nodes to their hidden children
 * @private
 */
function restoreHiddenChildren(hiddenChildrenMap) {
  if (!hiddenChildrenMap) return;

  hiddenChildrenMap.forEach((children, node) => {
      node.children = children;
  });
}

/**
 * Process a hierarchy for display, removing collapsed children but preserving structure.
 * Returns visible nodes and links for rendering. Does NOT modify the original hierarchy.
 * 
 * @param {d3.HierarchyNode} root - The hierarchy root node
 * @returns {Object} Object containing visibleNodes and visibleLinks
 * @public
 */
export function processCollapsedNodes(root) {
  if (!root) return { visibleNodes: [], visibleLinks: [] };

  // Remove collapsed nodes
  const hiddenChildrenMap = hideCollapsedChildren(root, true);

  // Get visible elements
  const visibleNodes = root.descendants();
  const visibleLinks = root.links();

  // Restore all nodes 
  restoreHiddenChildren(hiddenChildrenMap);

  return { visibleNodes, visibleLinks };
}

/**
 * Highlight path from root to a specific node
 * @param {Object} node - Target node
 */
export function highlightNodePath(node) {
  if (!state.svg || !node) return;
  
  const svg = d3.select(state.svg);
  
  // Reset all highlights
  svg.selectAll(".node").classed("highlighted", false);
  svg.selectAll(".link").classed("highlighted", false);

  // Check if node is valid
  if (!node.data || !node.data.uid) {
    console.warn("Node missing data or uid");
    return state;
  }
  
  let currentNode = node;
  const nodeIdsInPath = new Set();
  const linkPairsInPath = new Set();
  
  // Walk up tree to root
  while (currentNode && currentNode.parent) {
    nodeIdsInPath.add(currentNode.data.uid);
    linkPairsInPath.add(`${currentNode.parent.data.uid}-${currentNode.data.uid}`);
    currentNode = currentNode.parent;
  }

  // Add root separately
  if (currentNode) {
    nodeIdsInPath.add(currentNode.data.uid);
  }

  // Highlight all nodes in path
  nodeIdsInPath.forEach(nodeId => {
      svg.selectAll(`.node-${nodeId}`).classed("highlighted", true);
  });
  
  svg.selectAll("path.link").each(function() {
    const path = d3.select(this);
    const sourceId = path.attr("data-source-id");
    const targetId = path.attr("data-target-id");
    
    if (sourceId && targetId) {
      const linkPairId = `${sourceId}-${targetId}`;
      if (linkPairsInPath.has(linkPairId)) {
        path.classed("highlighted", true);
      }
    }
  });
  
  return state;
}

/**
 * Add D3 interactivity to nodes
 * @param {Function} handleNodeClick - Function to call when node is clicked
 * @param {Function} handleDoubleClick - Function to call when node is double-clicked
 */
export function makeNodesInteractive(svgContainer, handleNodeClick, handleDoubleClick, mouseOverHandler, mouseOutHandler) {
  if (!svgContainer) {
      console.log("SVG container not available");
      return;
  }

  // Bind data to nodes
  const nodeElements = d3.select(svgContainer).selectAll(".node");
  
  // Create a map of nodes by ID for fast lookup
  const nodeMap = new Map();
  state.nodes.forEach(node => {
      nodeMap.set(node.data.uid, node);
  });
  
  // Manually bind data to each element
  nodeElements.each(function() {
      const nodeId = this.getAttribute('data-node-id');
      if (nodeId && nodeMap.has(nodeId)) {
          d3.select(this).datum(nodeMap.get(nodeId));
      }
  });
  
  // Clear existing event handlers
  nodeElements
      .on("click", null)
      .on("dblclick", null)
      .on("contextmenu", null)
      .on("mouseenter", null)
      .on("mouseleave", null);

  // to handle normal vs double click
  let clickTimeout = null;
  const CLICK_DELAY = 250;

  // Add click handler for selection
  nodeElements.on("click", function(event) {
      event.stopPropagation();
      
      const nodeData = d3.select(this).datum();
      if (!nodeData) return;

      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }

      // timeout for potential doubleclick
      clickTimeout = setTimeout(() => {
        clickTimeout = null;
        handleNodeClick(nodeData); // Process single click after delay
      }, CLICK_DELAY);
  });
  
  // Add double-click handler for graph view
  nodeElements.on("dblclick", function(event) {
      event.stopPropagation();
      event.preventDefault();

      // clear double click timeout if it exists
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      
      const nodeData = d3.select(this).datum();
      if (!nodeData) return;
      
      handleDoubleClick(nodeData);
  });
  
  // Add right-click handler for expand/collapse
  nodeElements.on("contextmenu", function(event) {
    event.stopPropagation();
    event.preventDefault();
    
    const nodeData = d3.select(this).datum();
    if (!nodeData) return;

    const updatedState = toggleNode(nodeData);
    
    nodeToggleStore.set({
        type: 'nodeToggled', 
        node: nodeData,
        state: {
            nodes: state.nodes,
            links: state.links,
            dimensions: state.dimensions
        }
    });
    
    return updatedState;
  });

  // Add hover effects
  nodeElements
      .on("mouseenter", function() {
          d3.select(this).classed("hover", true);
      })
      .on("mouseleave", function() {
          d3.select(this).classed("hover", false);
      });
  
  nodeElements.on("mouseover", function(event) {
      const nodeData = d3.select(this).datum();
      mouseOverHandler(event, nodeData);
  });
  nodeElements.on("mouseout", function(event) {
      const nodeData = d3.select(this).datum();
      mouseOutHandler(event, nodeData);
  });

    nodeElements.each(function() {
        const node = d3.select(this).datum();
        if (node) {
            d3.select(this).select('circle')
                .attr('fill', getNodeColor(node));
        }
    });

  return state;
}

function getNodeColor(node) {
    if (!node || !node.data) return "#999"; // Default gray
    
    // First check for registered custom color
    const customColor = getCustomNodeColor(node.data.uid);
    if (customColor) return customColor;
    const newColor = getNodeDisplayColor(node, { viewType: 'tree' });
    if (newColor) return newColor;
    
    // Then check for filtering/highlighting state
    if (node.filterState && node.filterState.isFiltered) {
        return "#ccc"; // Filtered nodes
    }
    
    if (node.timeHighlight) {
        return "#ff9800"; // Time highlighted nodes
    }
    
    // Default based on node type
    return "#6baed6"; // Default blue
}

/**
 * Apply time-based filtering to nodes and links
 * @param {Array} timeRange - [startTime, endTime] as Date objects
 */
export function applyTimeFilter(timeRange) {
  if (!timeRange || timeRange.length !== 2) {
    // Reset time filtering
    resetTimeFilter();
    return state;
  }
  
  // Set the time filter state
  state.timeFiltering.active = true;
  state.timeFiltering.timeRange = timeRange;
  
  // Use the unified filter application function
  applyVisualFilters();
  
  return state;
}

/**
 * Reset time-based filtering
 */
export function resetTimeFilter() {
  console.log("Resetting time filter");
  state.timeFiltering.active = false;
  state.timeFiltering.timeRange = null;
  
  // Use the unified filter application function
  applyVisualFilters();
  
  return state;
}
