<script>
    import * as d3 from 'd3';
    import { onMount, afterUpdate } from 'svelte';

    import { GLOBAL_COLORS } from '$lib/shared/constants/visualizationConstants.js';

    import * as utils from '$lib/shared/services/utils.js';
    
    // Component props
    export let facts = []; // Array of facts/events with timestamps
    export let width = 300;
    export let height = 85;
    export let margin = { top: 20, right: 20, bottom: 20, left: 15 };
    export let selectedTimeRange = null; 
    export let timeExtent = null; 
    export let onBrushEnd = () => {}; 
    
    let svgElement;
    let minimapXScale;
    let brushElement;
    let timeDomain;
    let bins = [];
    const barColor = "#007bff"; // histogram bar color
    const binNumber = 120; // number of bins for histogram
    
    // Calculate time domain when facts change
    $: timeDomain = calculateTimeDomain(facts, timeExtent);
    $: bins = calculateHistogramBins(facts, timeDomain);

    function getColor(type) {
        return GLOBAL_COLORS[type] || GLOBAL_COLORS.DEFAULT;
    }

    function processFactsForTimeline(facts) {
        if (!facts || facts.length === 0) {
            return [];
        }
        let events = [];
        
        events = events.concat(facts.map(fact => ({
            objectId: fact.destinationObjectUid,
            type: fact.type,
            objType: fact.objType,
            displayType: utils.getDisplayType(fact.type),
            timestamp: new Date(fact.meta.timestamp),
            detail: {
                processId: fact.sourceObjectUid,
                processName: fact.sourceObjectValue,
                value: fact.destinationObjectValue,
            },
            color: getColor(fact.type),
            meta: fact.meta,
        })));

        // Return events sorted by timestamp
        return events.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Calculate the time domain from facts or use provided extent
    function calculateTimeDomain(facts, providedExtent) {
        if (providedExtent && providedExtent.length === 2) {
            return providedExtent;
        }
        
        if (facts.length === 0) {
            return [new Date(), new Date()];
        }
        
        return d3.extent(facts, d => new Date(d.meta.timestamp));
    }

    function generateTimeThresholds(domain) {
        const result = [];
        const start = domain[0];
        const end = domain[1];
        const count = binNumber; 

        const totalMs = end - start;
        const stepMs = totalMs / count;
        
        for (let i = 0; i <= count; i++) {
            result.push(new Date(start.getTime() + (stepMs * i)));
        }
        
        return result;
    }
    
    // Create histogram bins from facts
    function calculateHistogramBins(facts, domain) {
        if (!facts || facts.length === 0 || !domain) {
            return [];
        }
        const thresholds = generateTimeThresholds(domain);
        
        // Create histogram generator
        const histogram = d3.bin()
            .value(d => new Date(d.timestamp))
            .domain(domain)
            .thresholds(thresholds); 
        
        // Generate bins
        const histogramBins = histogram(facts);
        
        return histogramBins;
    }
    
    // Format time labels based on domain span
    function createCustomTimeFormat(domain) {
        const timeSpan = domain[1] - domain[0];
        // Could check for longer than day here, but not relevant with current data

        // Return with ms if less than 4 second span
        return d3.utcFormat(timeSpan > 4 * 60 *60 ? "%H:%M:%S" : "%H:%M:%S.%L");
    }

    function calculateTickCount(domain) {
        const timeSpan = domain[1] - domain[0];
        // Could check for longer than day here, but not relevant with current data

        // Return 10 points if more than 10 minute span, 5 otherwise
        return timeSpan > 10 * 60 ? 10 : 5;
    }
    
    // Create the minimap visualization
    function createMinimapComponent() {
        if (!svgElement) return;
        
        // Clear existing content
        d3.select(svgElement).selectAll("*").remove();
        
        // Calculate inner dimensions
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        
        // Create SVG and set dimensions
        const svg = d3.select(svgElement)
            .attr("width", width)
            .attr("height", height);
        
        // Create group with margin
        const minimapGroup = svg.append("g")
            .attr("class", "minimap")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        // Create scales
        const xScale = d3.scaleUtc()
            .domain(timeDomain)
            .range([0, innerWidth]);
        
        minimapXScale = xScale; // Store for later use
        
        const maxBinLength = d3.max(bins, d => d.length) || 1;
        
        const yScale = d3.scaleLinear()
            .domain([0, maxBinLength])
            .range([innerHeight, 0]);
        
        // Draw histogram bars
        minimapGroup.selectAll(".minimap-bar")
            .data(bins)
            .enter().append("rect")
            .attr("class", "minimap-bar")
            .attr("x", d => xScale(d.x0) + 1)
            .attr("y", d => yScale(d.length || 0))
            .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 2))
            .attr("height", d => Math.max(1, innerHeight - yScale(d.length || 0)))
            .attr("fill", barColor)
            .attr("opacity", 0.7);
        
        // Draw X-axis
        minimapGroup.append("g")
            .attr("class", "timeline-axis x-axis")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(
                d3.axisBottom(xScale)
                    .ticks(calculateTickCount(timeDomain))
                    .tickFormat(createCustomTimeFormat(timeDomain))
            );

        // Add UTC label to SVG
        svg.append("text")
            .attr("class", "utc-label")
            .attr("text-anchor", "middle")
            .attr("x", width / 2)
            .attr("y", height - 80)
            .attr("font-size", "10px")
            .attr("fill", "#555")
                .text(() => {
                    // add date and utc label
                    if (timeDomain && timeDomain.length === 2) {
                        const startDate = d3.timeFormat("%b %d, %Y")(timeDomain[0]);
                        return `${startDate} - Timeline (UTC)`;
                    }
                    return "Time (UTC)";
                });
        
        // Draw border
        minimapGroup.append("rect")
            .attr("class", "minimap-border")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", innerWidth)
            .attr("height", innerHeight)
            .attr("stroke", "#ccc")
            .attr("stroke-width", 1)
            .attr("fill", "none");
        
        // Store reference data
        minimapGroup.datum({
            xScale: xScale,
            innerHeight: innerHeight,
            innerWidth: innerWidth
        });
    }
    
    // Setup brush interaction
    function setupBrushInteraction() {
        if (!svgElement) return;
        
        const minimapGroup = d3.select(svgElement).select(".minimap");
        if (!minimapGroup.node()) return;
        
        // Retrieve minimap data
        const minimapData = minimapGroup.datum();
        if (!minimapData) return;
        
        const innerHeight = minimapData.innerHeight;
        const innerWidth = minimapData.innerWidth;
        const xScale = minimapData.xScale;
        
        // Create brush
        const brush = d3.brushX()
            .extent([[0, 0], [innerWidth, innerHeight]])
            .on("brush", brushed)
            .on("end", brushEnded);
        
        // Add brush to minimap
        const brushGroup = minimapGroup.append("g")
            .attr("class", "brush")
            .call(brush);
        
        // Apply initial selection if provided
        if (selectedTimeRange && selectedTimeRange.length === 2) {
            brushGroup.call(
                brush.move,
                selectedTimeRange.map(d => xScale(new Date(d)))
            );
        }
        
        brushElement = brushGroup;
    }
    
    // Brush event handlers
    function brushed(event) {
        if (event.sourceEvent && event.sourceEvent.type === "zoom") return; // ignore brush-by-zoom
    }
    
    function brushEnded(event) {
        if (!event.selection) return; // ignore empty selections
        
        const minimapGroup = d3.select(svgElement).select(".minimap");
        if (!minimapGroup.node()) return;
        
        const minimapData = minimapGroup.datum();
        if (!minimapData) return;
        
        // Get brush selection in pixels
        const [x0, x1] = event.selection;
        
        // Convert to date objects
        const timeRange = [
            minimapData.xScale.invert(x0),
            minimapData.xScale.invert(x1)
        ];
        
        // Notify parent component
        onBrushEnd(timeRange);
    }
    
    // Update brush selection programmatically
    export function updateBrushSelection(timeRange) {
        if (!brushElement || !minimapXScale || !timeRange || timeRange.length !== 2) return;
        
        const pixelRange = [
            minimapXScale(new Date(timeRange[0])),
            minimapXScale(new Date(timeRange[1]))
        ];
        
        brushElement.call(d3.brush().move, pixelRange);
    }

    // Initialize component after mount
    onMount(() => {
        if (facts.length > 0) {
            facts = processFactsForTimeline(facts);
            createMinimapComponent();
            setupBrushInteraction();
        }
    });
    
    // Update when facts or size changes
    afterUpdate(() => {
        if (facts.length > 0 && svgElement) {
            createMinimapComponent();
            setupBrushInteraction();
        }
    });
</script>

<div class="timeline-minimap-container">
    <slot name="before-minimap"></slot>
    <svg bind:this={svgElement} width={width} height={height}></svg>
    <slot name="after-minimap"></slot>
</div>

<style>
    .timeline-minimap-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        position: relative;
        margin-bottom: 10px;
    }
    
    :global(.timeline-minimap-container .minimap-bar) {
        shape-rendering: crispEdges;
    }
    
    :global(.timeline-minimap-container .timeline-axis path, .timeline-minimap-container .timeline-axis line) {
        stroke: #ddd;
    }
    
    :global(.timeline-minimap-container .timeline-axis text) {
        fill: #555;
        font-size: 9px;
    }
    
    :global(.timeline-minimap-container .handle) {
        fill: #555;
        stroke: #000;
        stroke-opacity: 0.5;
        stroke-width: 1px;
    }
    
    :global(.timeline-minimap-container .brush .selection) {
        stroke: #333;
        fill: #777;
        fill-opacity: 0.15;
        stroke-width: 1px;
    }
</style>