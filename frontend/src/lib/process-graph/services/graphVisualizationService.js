import * as d3 from 'd3';

import { tick } from 'svelte';

import * as utils from '$lib/shared/services/utils.js';

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

// Module state - centralizes all shared variables
const state = {
  svg: null,
  mainGroup: null,
  simulation: null,
  graphData: null,
  dimensions: {
    width: 0,
    height: 0,
    centerX: 0,
    centerY: 0
  },
  nodes: null,
  links: null,
  selectedNode: null,
  
  // Configuration
  config: {
    linkDistance: 100,
    chargeStrength: -1500,
    collisionStrength: 0.7
  }
};


// Clustering types and positions
const typeClusters = {
  "readFile": { x: state.dimensions.centerX - 150, y: state.dimensions.centerY - 150 },
  "wroteFile": { x: state.dimensions.centerX, y: state.dimensions.centerY - 200 },
  "deletedFile": { x: state.dimensions.centerX + 150, y: state.dimensions.centerY - 150 },
  "readRegistry": { x: state.dimensions.centerX - 200, y: state.dimensions.centerY },
  "wroteRegistry": { x: state.dimensions.centerX + 200, y: state.dimensions.centerY },
  "connectedTo": { x: state.dimensions.centerX, y: state.dimensions.centerY + 200 },  
  "process": { x: state.dimensions.centerX, y: state.dimensions.centerY },
  
  "default": { x: state.dimensions.centerX, y: state.dimensions.centerY + 100 }
};


/**
 * Create and render the node graph visualization
 */
export function createSvgContents(graphData, svgContainer) {
  // Store references in state
  state.graphData = graphData;
  state.svg = d3.select(svgContainer);

  try {
    updateDimensions(svgContainer);
  } catch (error) {
    console.error("Error getting dimensions:", error);

    state.dimensions = {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      centerX: DEFAULT_HEIGHT / 2,
      centerY: DEFAULT_WIDTH / 2
    };
  }
  
  // Setup visualization
  setupSvg();
  positionCenterNode();
  createForceSimulation();
  createLinks();
  createNodes();
  setupEventHandlers();
}

/**
 * Update dimensions from SVG container
 */
function updateDimensions(svgContainer) {
  // Handle case where container isn't mounted yet
  if (!svgContainer || !svgContainer.parentElement) {
    console.warn("SVG container or parent element not available");
    return;
  }
  
  const rect = svgContainer.parentElement.getBoundingClientRect();
  
  state.dimensions = {
    width: rect.width || DEFAULT_WIDTH,
    height: rect.height || DEFAULT_HEIGHT,
    centerX: (rect.width || DEFAULT_WIDTH) / 2,
    centerY: (rect.height || DEFAULT_HEIGHT) / 2
  };
  updateClusterCenters(); 
}

/**
 * Set up the SVG container and main group
 */
function setupSvg() {
  // Clear previous contents
  state.svg.selectAll("*").remove();
  
  // Set SVG dimensions
  state.svg
    .attr("width", state.dimensions.width)
    .attr("height", state.dimensions.height)
    .attr("cursor", "grab");
  
  // Create main group
  state.mainGroup = state.svg.append("g");

    // Add zoom/pan behavior
  const zoom = d3.zoom()
    .scaleExtent([1, 1])
    .on("zoom", (event) => {
      state.mainGroup.attr("transform", event.transform);
    })
    .on("start", () => {
      state.svg.attr("cursor", "grabbing"); 
    })
    .on("end", () => {
      state.svg.attr("cursor", "grab"); 
    });
  
  // Apply zoom/pan behavior to svg
  state.svg.call(zoom);
  
  // Disable double-click zoom
  state.svg.on("dblclick.zoom", null);
}

/**
 * Position the center process node
 */
function positionCenterNode() {
  const processNode = state.graphData.nodes.find(node => node.type === "process");
  
  if (processNode) {
    const offsetX = 75;  // offset to make sure full graph visible
    const offsetY = -50; // as above
    
    processNode.x = state.dimensions.centerX + offsetX;
    processNode.y = state.dimensions.centerY + offsetY;
  }
}

/**
 * Create the force simulation
 */
function createForceSimulation() {
  // Add the same offset as used for other functions
  const offsetX = 75;
  const offsetY = -50;
  
  state.simulation = d3.forceSimulation(state.graphData.nodes)
    .force("link", d3.forceLink(state.graphData.links)
      .id(d => d.uid)
      .distance(state.config.linkDistance))
    .force("charge", d3.forceManyBody().strength(state.config.chargeStrength))
    // Center force with offset
    .force("center", d3.forceCenter(
      state.dimensions.centerX + offsetX, 
      state.dimensions.centerY + offsetY
    ))
    // X and Y forces with offset
    .force("x", d3.forceX(state.dimensions.centerX + offsetX).strength(0.05))
    .force("y", d3.forceY(state.dimensions.centerY + offsetY).strength(0.05))
    .force("collision", d3.forceCollide()
      .radius(d => d.size + 10)
      .strength(state.config.collisionStrength))
    .force("cluster", forceCluster() 
      .centers(d => typeClusters[d.factType] || typeClusters.default)
      .strength(0.5));
  
  state.simulation.on("tick", handleSimulationTick);
}

/**
 * Update cluster centers whenever dimensions change
 */
function updateClusterCenters() {
  // Add the same offset as used for the center node
  const offsetX = 75;
  const offsetY = -50;
  
  typeClusters.process = { 
    x: state.dimensions.centerX + offsetX, 
    y: state.dimensions.centerY + offsetY 
  };
  
  // distribute clusters around a circle
  const radius = Math.min(state.dimensions.width, state.dimensions.height) * 0.35;
  const actionTypes = ["readFile", "wroteFile", "deletedFile", "readRegistry", "wroteRegistry", "connectedTo"];
  
  actionTypes.forEach((type, i) => {
    const angle = (i / actionTypes.length) * 2 * Math.PI;
    typeClusters[type] = {
      // Use the same offset for all cluster centers
      x: state.dimensions.centerX + offsetX + Math.cos(angle) * radius,
      y: state.dimensions.centerY + offsetY + Math.sin(angle) * radius
    };
  });
  
  // Default position also with offset
  typeClusters.default = { 
    x: state.dimensions.centerX + offsetX, 
    y: state.dimensions.centerY + offsetY + radius * 0.5 
  };
}

/**
 * Force for clustering nodes of same type
*/
function forceCluster() {
  let nodes;
  let strength = 0.1; //tightness of cluster
  let centersFn;
  
  function force(alpha) {
    // force towards clyster center
    for (const node of nodes) {
      if (node.type === "process") continue;  // Dont move process node
      
      const center = centersFn(node);
      if (!center) continue;
      
      node.vx = (node.vx || 0) + (center.x - node.x) * alpha * strength;
      node.vy = (node.vy || 0) + (center.y - node.y) * alpha * strength;
    }
  }
  
  force.initialize = (_) => nodes = _;
  force.strength = (_) => (strength = _, force);
  force.centers = (_) => (centersFn = _, force);
  
  return force;
}

/**
 * Create link elements
 */
function createLinks() {
  state.links = state.mainGroup.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(state.graphData.links)
    .enter()
    .append("line")
    .attr("class", d => `link link-${d.uid}`)
    .attr("stroke", d => d.color || "#999")
    .attr("stroke-width", d => Math.sqrt(d.value))
    .attr("stroke-opacity", 0.6);
}

  function createTooltip() {
      // Remove any existing tooltip
      d3.select(".timeline-tooltip").remove();
      
      // Create tooltip container
      return d3.select("body").append("div")
          .attr("class", "timeline-tooltip")
          .style("opacity", 0)
          .style("position", "absolute")
          .style("pointer-events", "none")
          .style("background", "rgba(0, 0, 0, 0.8)")
          .style("color", "white")
          .style("padding", "8px 12px")
          .style("border-radius", "4px")
          .style("font-size", "14px")
          .style("z-index", 1000)
          .style("max-width", "300px")
          .style("box-shadow", "0 2px 10px rgba(0, 0, 0, 0.2)");
  }

/**
 * Create node elements
 */
function createNodes() {
  // Create node groups
  state.nodes = state.mainGroup.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(state.graphData.nodes)
    .enter()
    .append("g")
    .attr("class", d => `node node-${d.uid}`);
  
  // Add circles to node groups
  state.nodes.append("circle")
    .attr("r", d => d.size)
    .attr("fill", d => d.color || "#69b3a2")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5);
  
  // Add text labels
  state.nodes.append("text")
    .attr("dy", d => d.type === "process" ? -25 : -15)
    .attr("text-anchor", "middle")
    .attr("font-size", d => d.type === "process" ? "14px" : "10px")
    .attr("fill", "#333")
    .text(d => d.label);

}

function getDisplayValue(objType) {
  switch (objType) {
    case "process":
      return "Command Line";
    case "network":
      return "Source IP";
    case "file":
      return "File Name";
    case "registry":
      return "Registry Key";
    default:
      return "Label";
  }
}

function getFullName(node) {
  if (node.objType === "process") {
    return node.data.processCommandline || node.data.metadata.processCommandline;
  } else if (node.objType === "network") {
    return node.data.srcIp;
  } else if (node.objType === "file" || node.objType === "registry") {
    return node.name;
  } else {
    return node.label || "";
  }
}

/**
 * Set up event handlers for user interaction
 */
function setupEventHandlers() {
  // Node click
  state.nodes.on("click", (event, d) => {
    event.stopPropagation();
    handleNodeClick(d.uid);

    // Dispatch event to open details panel
    const customEvent = new CustomEvent("nodeClicked", {
      detail: { node: d },
      bubbles: true
    });
    event.target.dispatchEvent(customEvent);
  });
  
  // Background click (reset)
  state.svg.on("click", (event) => {
    resetHighlighting();
    
    // Dispatch event to close details panel
    const customEvent = new CustomEvent("backgroundClicked", { 
      bubbles: true
    });
    event.target.dispatchEvent(customEvent);
  });

  // Node hover (tooltip)
  const tooltip = createTooltip();

  state.nodes
  .on("mouseover", function(event, d) {
    d3.select(this)
      .classed("hover", true);
      
    d3.select(this)
        .attr("r", 8)
        .attr("stroke-width", 2);

    // Show tooltip
    tooltip.transition()
        .duration(200)
        .style("opacity", 0.9);

    // Format tooltip content
    const formattedTime = utils.formatTimestamp(d.data.timestamp || d.data.metadata.timestamp, false);
    let tooltipContent = `
        <strong>${d.label}</strong><br>
        <span>${d.objType.charAt(0).toUpperCase() + d.objType.substring(1)}</span><br>
        <span>Time: ${formattedTime} (UTC)</span><br>
        <span>${getDisplayValue(d.objType)}: ${getFullName(d)}</span>
    `;
    
    tooltip.html(tooltipContent)
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 28) + "px");
  })
  .on("mouseout", function() {
    // Reset visualization
    d3.select(this)
      .classed("hover", false)
    // Hide tooltip
    tooltip.transition()
        .duration(500)
        .style("opacity", 0);
  });
}

/**
 * Handle simulation tick - update positions
 */
function handleSimulationTick() {
  // offset
  const offsetX = 75;
  const offsetY = -50;

  // Zero out velocities to avoid ddrift
  state.graphData.nodes.forEach(d => {
    d.vx = 0;
    d.vy = 0;
  });
  
  const processNode = state.graphData.nodes.find(n => n.type === "process");
  if (processNode) {
    processNode.x = state.dimensions.centerX + offsetX;
    processNode.y = state.dimensions.centerY + offsetY;
  }
  
  // Update link positions
  state.links
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);
  
  // Update node positions
  state.nodes.attr("transform", d => `translate(${d.x},${d.y})`);
}

//==== Highlighting Functions ===//

/**
 * Highlight node and connected nodes
 */
function highlightConnectedNodes(node) {
  // Collect connected nodes
  resetNodeHighlighting(); 
  const connectedNodeIds = findConnectedNodeIds(node);

  // Dim all nodes and links
  state.svg.selectAll(".node").classed("dimmed", true);
  state.svg.selectAll(".link").classed("dimmed", true);
  
  // Highlight connected nodes
  connectedNodeIds.forEach(id => {
    state.svg.selectAll(`.node-${id}`)
      .classed("highlighted", true)
      .classed("dimmed", false);
  });
}

/**
 * Find all nodes connected to the given node
 */
function findConnectedNodeIds(node) {
  const connectedNodeIds = new Set();
  connectedNodeIds.add(node.uid);
  
  // Find connected links and add their nodes
  state.graphData.links.forEach(link => {
    const sourceId = typeof link.source === 'object' ? link.source.uid : link.source;
    const targetId = typeof link.target === 'object' ? link.target.uid : link.target;
    
    if (sourceId === node.uid) {
      connectedNodeIds.add(targetId);
      highlightLink(sourceId, targetId, link.uid);
    } else if (targetId === node.uid) {
      connectedNodeIds.add(sourceId);
      highlightLink(sourceId, targetId, link.uid);
    }
  });
  
  return connectedNodeIds;
}

/**
 * Highlight a specific link
 */
function highlightLink(sourceId, targetId, uid) {
  state.svg
    .selectAll(`.link-${uid}`)
    .filter(function() {
      const d = d3.select(this).datum();
      const s = typeof d.source === 'object' ? d.source.uid : d.source;
      const t = typeof d.target === 'object' ? d.target.uid : d.target;
      return (s === sourceId && t === targetId) || (s === targetId && t === sourceId);
    })
    .classed("highlighted", true)
    .classed("dimmed", false);
}

/**
 * Reset all highlighting
 */
function resetHighlighting() {
  resetNodeHighlighting(); 
  state.svg.selectAll(".node").classed("dimmed", false);
  state.svg.selectAll(".link").classed("dimmed", false);
  state.svg.selectAll(".link").classed("highlighted", false);
  
  // Set promise to add a small delay before resolving
  return new Promise(resolve => setTimeout(resolve, 50))
}

function resetNodeHighlighting() {
  state.svg.selectAll(".node")
    .classed("highlighted", false)
}

/**
 * Update data and redraw visualization
 */
export function updateData(graphData, svgContainer) {
  createSvgContents(graphData, svgContainer);
}

/**
 * Handle node click event
 */
export function handleNodeClick(nodeId) {
  const allNodes = [...state.simulation.nodes()];
  const node = allNodes.find(n => n.uid === nodeId);

  if (!node) return;

  state.selectedNode = node;

  highlightConnectedNodes(node);

  panToNode(node);
}

/**
 * Apply selected filters
 */
export function applyFilters(filters) {

  const nodeSelection = state.svg.selectAll(".node");
  const linkSelection = state.svg.selectAll(".link");
  
  // If all filters are off, show all nodes and links
  let hasActiveTypeFilters = filters.fileReads | filters.fileWrites | filters.fileDeletes | filters.registryReads | filters.registryWrites | filters.networkConnections | filters.processCreations
  let hasActiveSearchFilter = filters.searchNodeIds?.length > 0 || false;
  if (!hasActiveTypeFilters & !hasActiveSearchFilter) {
    nodeSelection.classed("filtered-out", false);
    linkSelection.classed("filtered-out", false);
    return;
  }

  nodeSelection.each(function(d) {
    if (d.objType === "process" && d.size > 10) return; // Skip main node
    
    const nodeElement = d3.select(this);
    let shouldShow = true;
    
    if (filters.searchNodeIds.includes(d.uid) ) shouldShow = true;
    else if (d.factType === "readFile" | filters.fileReads) shouldShow = false;
    else if (d.factType === "wroteFile" && !filters.fileWrites) shouldShow = false;
    else if (d.factType === "deletedFile" && !filters.fileDeletes) shouldShow = false;
    else if (d.factType === "readRegistry" && !filters.registryReads) shouldShow = false;
    else if (d.factType === "wroteRegistry" && !filters.registryWrites) shouldShow = false;
    else if (d.factType === "connectedTo" && !filters.networkConnections) shouldShow = false;
    else if (d.factType === "createdProcess" && !filters.processCreations) shouldShow = false;

    nodeElement.classed("filtered-out", !shouldShow);
  });
  
  linkSelection.each(function(d) {
    const linkElement = d3.select(this);
    let shouldShow = true;
    
    if (d.factType === "readFile" && !filters.fileReads) shouldShow = false;
    else if (d.factType === "wroteFile" && !filters.fileWrites) shouldShow = false;
    else if (d.factType === "deletedFile" && !filters.fileDeletes) shouldShow = false;
    else if (d.factType === "readRegistry" && !filters.registryReads) shouldShow = false;
    else if (d.factType === "wroteRegistry" && !filters.registryWrites) shouldShow = false;
    else if (d.factType === "connectedTo" && !filters.networkConnections) shouldShow = false;
    else if (d.factType === "createdProcess" && !filters.processCreations) shouldShow = false;
    
    linkElement.classed("filtered-out", !shouldShow);
  });
}

/**
 * Apply time range filter to the visualization
 * @param {Array} timeRange - Array of two timestamps [startTime, endTime]
 */
export function applyTimeRangeFilter(timeRange, facts) {
  // If no time range provided, reset filtering
  if (!timeRange || timeRange.length !== 2) {
    resetTimeRangeFilter();
    return state;
  }
  
  const [startTime, endTime] = timeRange;
  
  // Store the time range for reference
  state.timeFiltering = {
    active: true,
    timeRange: timeRange
  };
  
  const nodesInTimeRange = new Set();
  
  // Always include the main process node
  const mainProcessNode = state.graphData.nodes.find(n => n.objType === "process" && n.size > 10);
  if (mainProcessNode) {
    nodesInTimeRange.add(mainProcessNode.uid);
  }
  
  // Process all facts to find nodes that appear within the time range
  facts.forEach(fact => {
    // Get timestamp from the fact object
    const rawTimestamp = fact.meta.timestamp;
    
    if (rawTimestamp) {
      // Convert the ISO string to a JavaScript Date object for proper comparison
      const factTimestamp = new Date(rawTimestamp);
      
      if (factTimestamp >= startTime && factTimestamp <= endTime) {
        // Add both source and destination nodes to our set
        if (fact.sourceObjectUid) nodesInTimeRange.add(fact.sourceObjectUid);
        if (fact.destinationObjectUid) nodesInTimeRange.add(fact.destinationObjectUid);
      }
    }
  });
  
  console.log(`Found ${nodesInTimeRange.size} nodes within time range`);
  
  // Apply filter to nodes
  state.nodes.each(function(d) {
    const nodeElement = d3.select(this);
    let visible = nodesInTimeRange.has(d.uid);
    
    // Apply visibility class
    nodeElement.classed("time-filtered-out", !visible);
  });
  
  // Apply filter to links based on their endpoint nodes
  state.links.each(function(d) {
    const linkElement = d3.select(this);
    
    // Get source and target IDs
    const sourceId = typeof d.source === 'object' ? d.source.uid : d.source;
    const targetId = typeof d.target === 'object' ? d.target.uid : d.target;
    
    // Link is visible only if both its endpoints are visible
    const visible = nodesInTimeRange.has(sourceId) && nodesInTimeRange.has(targetId);
    
    // Apply visibility class
    linkElement.classed("time-filtered-out", !visible);
  });

  return state;
}

/**
 * Reset time range filtering
 */
export function resetTimeRangeFilter() {
  if (!state.svg) return state;
  
  // Clear time filtering state
  state.timeFiltering = {
    active: false,
    timeRange: null
  };
  
  // Remove time filtering classes
  state.svg.selectAll(".node").classed("time-filtered-out", false);
  state.svg.selectAll(".link").classed("time-filtered-out", false);
  
  return state;
}

/**
 * Adds new nodes and links to an existing visualization
 * @param {Array} newNodes - Array of new node objects to add
 * @param {Array} newLinks - Array of new link objects to add
 * @param {Object} centralNode - The node from which these new nodes are related
 */
export function addNodesToVisualization(newNodes, newLinks, centralNode) {
  // Get D3 visualization elements
  const svg = state.svg;
  const simulation = state.simulation;
  
  if (!svg || !simulation) {
    console.error("SVG or simulation not found");
    return;
  }
  
  // Mark the clicked node as expanded (centralNode)
  svg.selectAll(".node")
    .filter(d => d.uid === centralNode.uid)
    .classed("expanded", true)
    .select("circle")
    .transition()
    .duration(300)
    .attr("r", d => d.size * 1.2)
    .attr("stroke", "#333")
    .attr("stroke-width", 2);
  
  // Get initial positions for new nodes
  const allNodes = [...simulation.nodes(), ...newNodes];
  const parentNode = allNodes.find(n => n.uid === centralNode.uid);
  const mainProcessNode = allNodes.find(n => n.objType === "process" && n.size < 15);

  if (parentNode && mainProcessNode) {
    // Find the parent's cluster type (or use 'default' if not found)
    const clusterType = centralNode.factType || centralNode.type || 'default';
    const clusterPosition = typeClusters[clusterType] || typeClusters.default;
    
    // Calculate vector from process center to the cluster center
    const vectorX = clusterPosition.x - typeClusters.process.x;
    const vectorY = clusterPosition.y - typeClusters.process.y;
    
    // Normalize the vector
    const magnitude = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
    const normalizedX = vectorX / magnitude;
    const normalizedY = vectorY / magnitude;
    
    // Calculate distribution angle for new nodes
    const angleStep = (2 * Math.PI) / (newNodes.length || 1);
    
    // Position new nodes along the vector direction but further out
    newNodes.forEach((node, index) => {
      // Extension factor (place nodes 30% further than parent cluster)
      const extensionFactor = 1.3;
      
      // Calculate base position along the main vector
      const baseX = typeClusters.process.x + vectorX * extensionFactor;
      const baseY = typeClusters.process.y + vectorY * extensionFactor;
      
      // Add some spread around this direction (using the index to create a fan pattern)
      const spreadAngle = (index - (newNodes.length - 1) / 2) * angleStep * 0.3;
      const spreadX = Math.cos(spreadAngle) * normalizedX - Math.sin(spreadAngle) * normalizedY;
      const spreadY = Math.sin(spreadAngle) * normalizedX + Math.cos(spreadAngle) * normalizedY;
      
      // Final position with some random jitter to prevent exact overlaps
      const jitterRange = 20;
      node.x = baseX + spreadX * jitterRange + (Math.random() - 0.5) * 10;
      node.y = baseY + spreadY * jitterRange + (Math.random() - 0.5) * 10;
      
      // Fix nodes in place
      node.fx = node.x;
      node.fy = node.y;
      
      // Mark as related node
      node.isRelated = true;
  });
  } else {
    console.warn("Parent or main process node not found, cannot position new nodes");
  }
  
  // Add links to the visualization
  const linkGroup = svg.select(".links");
  const newLinkElements = linkGroup.selectAll(".link.related-link")
    .data(newLinks, d => `${d.source}-${d.target}-${d.type || "default"}`)
    .enter()
    .append("line")
    .attr("class", d => `link related-link link-${d.uid || "related"}`)
    .attr("stroke", d => d.color || "#999")
    .attr("stroke-width", d => Math.sqrt(d.value) || 1.5)
    .attr("stroke-opacity", 0.6)
    .attr("stroke-dasharray", "5,3") // Make related links dashed
    .style("opacity", 0) // Start invisible for fade-in
    .attr("x1", d => {
      const sourceNode = typeof d.source === 'object' ? d.source : 
        simulation.nodes().find(n => n.uid === d.source);
      return sourceNode ? sourceNode.x : 0;
    })
    .attr("y1", d => {
      const sourceNode = typeof d.source === 'object' ? d.source : 
        simulation.nodes().find(n => n.uid === d.source);
      return sourceNode ? sourceNode.y : 0;
    })
    .attr("x2", d => {
      const targetNode = typeof d.target === 'object' ? d.target : 
        simulation.nodes().find(n => n.uid === d.target);
      return targetNode ? targetNode.x : 0;
    })
    .attr("y2", d => {
      const targetNode = typeof d.target === 'object' ? d.target : 
        simulation.nodes().find(n => n.uid === d.target);
      return targetNode ? targetNode.y : 0;
    });
  
  // Fade in the links
  newLinkElements.transition()
    .duration(500)
    .style("opacity", 1);
  
  // Add nodes to the visualization
  const nodeGroup = svg.select(".nodes");
  const newNodeElements = nodeGroup.selectAll(".node.related-node")
    .data(newNodes, d => d.uid)
    .enter()
    .append("g")
    .attr("class", d => `node related-node node-${d.uid}`)
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .style("opacity", 0); // Start invisible for fade-in
  
  // Add circles to nodes
  newNodeElements.append("circle")
    .attr("r", d => d.size || 8)
    .attr("fill", d => d.color || "#69b3a2")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "3,2"); // dashes
  
  // Add text labels
  newNodeElements.append("text")
    .attr("dy", d => d.type === "process" ? -15 : -12)
    .attr("text-anchor", "middle")
    .attr("font-size", "10px")
    .attr("fill", "#333")
    .text(d => {
      // shorten long labels
      const label = d.label || "";
      return label.length > 20 ? label.substring(0, 18) + "..." : label;
    });
  
  // Add tooltips
  newNodeElements.append("title")
    .text(d => d.fullLabel || d.label || "");
  
  // Add click handlers to new nodes
  newNodeElements.on("click", (event, d) => {
    event.stopPropagation();
    highlightConnectedNodes(d);
    panToNode(d);
    
    // Dispatch node clicked event
    const customEvent = new CustomEvent("nodeClicked", {
      detail: { node: d },
      bubbles: true
    });
    event.target.dispatchEvent(customEvent);
  });
  
  // Add hover handlers
  newNodeElements
    .on("mouseenter", function(event, d) {
      d3.select(this).classed("hover", true);
      
      // Show tooltip
      d3.select("#graph-tooltip")
        .style("opacity", 1)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px")
        .html(`
          <div style="font-weight:bold">${d.label}</div>
          <div>${d.fullLabel || ""}</div>
          <div><small>Click for details</small></div>
        `);
    })
    .on("mousemove", function(event) {
      d3.select("#graph-tooltip")
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseleave", function() {
      d3.select(this).classed("hover", false);
      d3.select("#graph-tooltip").style("opacity", 0);
    });
  
  // Fade in the nodes
  newNodeElements.transition()
    .duration(500)
    .style("opacity", 1);
  
  // Update the simulation with new nodes and links
  // Convert link source/target references to objects if they're not already
  const updatedLinks = newLinks.map(link => {
    const allNodes = [...simulation.nodes(), ...newNodes];
    
    if (typeof link.source !== 'object') {
      const sourceNode = allNodes.find(n => n.uid === link.source);
      if (sourceNode) link.source = sourceNode;
    }
    
    if (typeof link.target !== 'object') {
      const targetNode = allNodes.find(n => n.uid === link.target);
      if (targetNode) link.target = targetNode;
    }
    
    return link;
  });
  
  // Add new nodes and links to simulation
  simulation.nodes([...simulation.nodes(), ...newNodes]);
  simulation.force("link").links([...simulation.force("link").links(), ...updatedLinks]);
  
  // Update state references
  state.nodes = svg.selectAll(".node");
  state.links = svg.selectAll(".link");
  
  // Run the simulation again with alpha to reposition nodes
  simulation.alpha(0.3).restart();
  
  // Store the simulation reference on SVG
  svg.property("_simulation", simulation);
  
  return { newNodeElements, newLinkElements };
}

/**
 * Removes nodes and links from the visualization when collapsing a node
 * @param {Array} nodeIds - Array of node IDs to remove
 * @param {Array} links - Array of links to remove
 * @param {Object} centralNode - The node that was expanded and is now being collapsed
 */
export function removeNodesFromVisualization(nodeIds, links, centralNode) {
  const svg = state.svg;
  const simulation = state.simulation;
  
  if (!svg || !simulation) {
    console.error("SVG or simulation not found");
    return;
  }
  
  // Remove expanded visual state from central node
  svg.selectAll(".node")
    .filter(d => d.uid === centralNode.uid)
    .classed("expanded", false)
    .select("circle")
    .transition()
    .duration(300)
    .attr("r", d => d.size)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5);
  
  // Fade out and remove related nodes
  svg.selectAll(".node.related-node")
    .filter(d => nodeIds.includes(d.uid))
    .transition()
    .duration(300)
    .style("opacity", 0)
    .remove();
  
  // Fade out and remove related links
  svg.selectAll(".link.related-link")
    .filter(d => {
      const sourceId = typeof d.source === 'object' ? d.source.uid : d.source;
      const targetId = typeof d.target === 'object' ? d.target.uid : d.target;
      
      // Check if this link matches any in our remove list
      return links.some(link => {
        const linkSourceId = typeof link.source === 'object' ? link.source.uid : link.source;
        const linkTargetId = typeof link.target === 'object' ? link.target.uid : link.target;
        
        return (sourceId === linkSourceId && targetId === linkTargetId) || 
               (sourceId === linkTargetId && targetId === linkSourceId);
      });
    })
    .transition()
    .duration(300)
    .style("opacity", 0)
    .remove();
  
  // Update simulation by removing nodes and links
  const remainingNodes = simulation.nodes().filter(node => !nodeIds.includes(node.uid));
  
  const remainingLinks = simulation.force("link").links().filter(link => {
    const sourceId = typeof link.source === 'object' ? link.source.uid : link.source;
    const targetId = typeof link.target === 'object' ? link.target.uid : link.target;
    
    // Check if this link matches any in our remove list
    return !links.some(rl => {
      const rlSourceId = typeof rl.source === 'object' ? rl.source.uid : rl.source;
      const rlTargetId = typeof rl.target === 'object' ? rl.target.uid : rl.target;
      
      return (sourceId === rlSourceId && targetId === rlTargetId) || 
             (sourceId === rlTargetId && targetId === rlSourceId);
    });
  });
  
  // Update simulation
  simulation.nodes(remainingNodes);
  simulation.force("link").links(remainingLinks);
  
  // Update state references
  state.nodes = svg.selectAll(".node");
  state.links = svg.selectAll(".link");
  
  // Restart simulation with reduced alpha
  simulation.alpha(0.1).restart();
  
}

/**
 * Utility function to generate a consistent ID for a link
 * @param {Object} link - The link object
 * @returns {String} A unique identifier for the link
 */
function getLinkId(link) {
  const sourceId = typeof link.source === 'object' ? link.source.uid : link.source;
  const targetId = typeof link.target === 'object' ? link.target.uid : link.target;
  return `${sourceId}-${targetId}-${link.type || 'default'}`;
}

export function panToNodeById(nodeId) {
  const allNodes = [...state.simulation.nodes()];
  const node = allNodes.find(n => n.uid === nodeId);
  
  if (!node) {
    console.warn(`Node with ID ${nodeId} not found`);
    return;
  }
  
  panToNode(node);
}

export function panToNode(node, animate = true) {
  if (!node || !state.svg || !state.mainGroup) {
    console.warn("Cannot pan: missing node, SVG, or main group");
    return;
  }
  const svg = state.svg;
  const mainGroup = state.mainGroup;
  
  // Get SVG dimensions
  const svgWidth = state.dimensions.width;
  const svgHeight = state.dimensions.height;
  
  // Calculate center point of viewport
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  
  // Extract current transform
  let currentTransform = { x: 0, y: 0 };
  const existingTransform = mainGroup.attr("transform");
  if (existingTransform && existingTransform.includes("translate")) {
    const match = /translate\(\s*([^\s,)]+)[ ,]([^\s,)]+)/.exec(existingTransform);
    if (match) {
      currentTransform.x = parseFloat(match[1]);
      currentTransform.y = parseFloat(match[2]);
    }
  }
  
  // Calculate node position in viewport coordinates
  const nodeViewportX = currentTransform.x + node.x;
  const nodeViewportY = currentTransform.y + node.y;
  
  // Calculate distance from center
  const distanceFromCenterX = centerX - nodeViewportX;
  const distanceFromCenterY = centerY - nodeViewportY;
  
  // Calculate new transform 
  const newTransformX = currentTransform.x + (distanceFromCenterX);
  const newTransformY = currentTransform.y + (distanceFromCenterY);
  
  // Apply the transformation with or without animation
  if (animate) {
    mainGroup.transition()
      .duration(500)
      .attr("transform", `translate(${newTransformX}, ${newTransformY})`);
  } else {
    mainGroup.attr("transform", `translate(${newTransformX}, ${newTransformY})`);
  }
} 
