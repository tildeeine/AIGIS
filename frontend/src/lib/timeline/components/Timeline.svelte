<script>
    import * as d3 from "d3";

    import { onMount, onDestroy, tick } from "svelte";
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    import TimelineDetailsPanel from "$lib/timeline/components/TimelineDetailsPanel.svelte";
    import TimelineMinimap from "$lib/shared/components/TimelineMinimap.svelte";
    import SearchSidebar from "$lib/shared/components/SearchSidebar.svelte";
    import HelpButton from "$lib/shared/components/HelpButton.svelte";
    import ColorLegend from "$lib/shared/components/ColorLegend.svelte";

    import * as utils from "$lib/shared/services/utils.js";
    import * as apiService from "$lib/shared/services/apiService";
    import { GLOBAL_COLORS } from  '$lib/shared/constants/visualizationConstants.js';
    import { getNodeDisplayColor } from '$lib/shared/services/colorService.js';
    import { colorTagStore } from '$lib/shared/stores/colorTagStore.js';

    export let isLoading = true; 
    export let selectedNode; 
    export let width = 0; // placeholder
    let minimapWidth = 600-60;
    export let height = 600;
    const margin = { top: 0, right: 30, bottom: 100, left: 150 };
    const minimapMargin = { top: 10, right: margin.right, bottom: 30, left: margin.left };
    let containerWidth = 0;
    let container;
    let currentView = "timeline";

    let networkConnections = []; 
    let allFacts = []; 
    let timelineData = []; // Processed data for the timeline
    let selectedEvent = null;
    let timeRangeFilter = null;
    let isLegendExpanded = true;

    // For zooming
    let zoomHandleElement;
    let zoomLevel = 1; // Default zoom level
    const minZoom = 0.5;
    const maxZoom = 20;
    let isDragging = false;
    let startY, startZoom;
    let mainTimelineXScale;
    let minimapXScale;

    // For dragging timeline
    let isDraggingTimeline = false;
    let dragStartX = 0;
    let dragStartDomain = null;

    // Minimap props
    let minimapHeight = 100;
    
    // svg containers
    let svgElement;
    let minimapElement;

    let colorTagUnsubscribe;
    let colorTagVersion = 0;

    // filtering
    let activeFilters = {
        searchNodeIds: null,
        eventTypes: {
            networkConnections: false,
            fileReads: false,
            fileWrites: false,
            fileDeletes: false,
            registryReads: false,
            registryWrites: false,
            processCreations: false
        },
        timeRange: null,
        processId: "",
        processName: "",
        commandLine: "",
        ipAddress: "",
        port: "",
        path: ""
    };

    function clearAllFilters() {
        activeFilters = {
            searchNodeIds: null,
            eventTypes: {
                networkConnections: false,
                fileReads: false,
                fileWrites: false,
                fileDeletes: false,
                registryReads: false,
                registryWrites: false,
                processCreations: false
            },
            timeRange: null,
            processId: "",
            processName: "",
            commandLine: "",
            ipAddress: "",
            port: "",
            path: ""
        };
        
        filteredEvents.clear();
        updateEventVisibility();
    }

    function getTooltipKey(type) {
        const tooltipKeys = {
            process: "Process ID",
            file: "Full File Path",
            registry: "Full Registry Key",
            network: "Source IP"
        };
        return tooltipKeys[type] || type;
    }

    function getTooltipValue(event) {
        if (event.objType === "process") {
            return event.detail.value || "";
        } else if (event.objType === "file" || event.objType === "registry") {
            return event.detail.value || "";
        } else if (event.objType === "network") {
            return event.meta.srcIp || "";
        }
        return "";
    }

    function getEventColor(event) {
        return getNodeDisplayColor(event, {
            viewType: 'timeline',
            isSelected: selectedEvent && event.objectId === selectedEvent.objectId,
            selectionColor: '#3498db'
        });
    }

    function handleShowGraphView(event) {
        const nodeData = event.detail.nodeData;
        selectedEvent = null; 
        dispatch("enterGraphView", { eventId: nodeData.objectId });
    }

    function handleShowTreeView(event) {
        const eventId = event.detail.eventId;
        selectedEvent = null; 
        dispatch("enterTreeView", { eventId: eventId });
    }

    function handleEventClick(event) {
        // Toggle selection if clicking the same event again
        isLegendExpanded = false; 
        if (event.objType != "process") {
            selectedNode = null
        }
        if (selectedEvent === event) {
            // de-select
            selectedEvent = null;
        } else {
            // select event
            selectedEvent = event;

            if (event.objType === "process") {
                dispatch("selectedNodeId", { eventId: event.objectId });
            }
        }
        
        // Update visual state of all events
        const mainGroup = d3.select(svgElement).select(".main-timeline");
        mainGroup.selectAll(".timeline-event")
            .attr("r", d => selectedEvent && d === selectedEvent ? 8 : 6)
            .attr("stroke-width", d => selectedEvent && d === selectedEvent ? 2 : 1)
            .attr("stroke", d => selectedEvent && d === selectedEvent ? "#333" : "white");
    }

        // SearchBar event handler
    function handleSearchFilterChange(event) {
        const filters = event.detail.filters;
        
        // Store filters and apply visuals
        activeFilters = {...filters};
        applyVisualFilters(filters);
    }

    function handleSelectedNode(selectedNode) {
        const nodeId = selectedNode.data.uid || selectedNode.uid;
        const foundEvent = timelineData.find(event => event.objectId === nodeId);
        if (foundEvent) {
            handleEventClick(foundEvent);
        }
    }

    function handleSelectResult(event) {
        const selectedNodeId = event.detail.nodeId;

        // Find event with ID in eventsByType
        const foundEvent = timelineData.find(event => event.objectId === selectedNodeId);
        handleEventClick(foundEvent);
    }

    function applyVisualFilters(filters) {
        console.log("Applying filters to timeline events:", filters);
        
        // clear previous filtered events
        filteredEvents = new Set();
        let hasActiveFilters = false;
        
        // Check if we have search node IDs filter (search results)
        const hasNodeIdsFilter = filters.searchNodeIds && filters.searchNodeIds.length > 0;
        if (hasNodeIdsFilter) hasActiveFilters = true;
        const nodeIdSet = new Set(filters.searchNodeIds || []);
        
        // Check for active event type filters
        const hasEventTypeFilters = 
            filters.networkConnections || 
            filters.fileReads || 
            filters.fileWrites ||
            filters.fileDeletes ||
            filters.registryReads || 
            filters.registryWrites ||
            filters.processCreations;
            
        if (hasEventTypeFilters) hasActiveFilters = true;
        
        
        // return if no filters are active
        if (!hasActiveFilters) {
            updateEventVisibility();
            return;
        }
        
        // check if each event should be filtered
        timelineData.forEach(event => {
            let shouldFilter = false;
            
            // Filter by search result IDs if active
            if (hasNodeIdsFilter) {
                if (!nodeIdSet.has(event.objectId)) {
                    shouldFilter = true;
                }
            }
            
            // Filter by event type if active
            if (hasEventTypeFilters && !shouldFilter) {
                let matchesEventType = false;
                
                // Check each active event type filter
                if (filters.networkConnections && event.type === 'connectedTo') {
                    matchesEventType = true;
                }
                
                if (filters.fileReads && event.type === 'readFile') {
                    matchesEventType = true;
                }
                
                if (filters.fileWrites && event.type === 'wroteFile') {
                    matchesEventType = true;
                }
                
                if (filters.fileDeletes && event.type === 'deletedFile') {
                    matchesEventType = true;
                }
                
                if (filters.registryReads && event.type === 'readRegistry') {
                    matchesEventType = true;
                }
                
                if (filters.registryWrites && event.type === 'wroteRegistry') {
                    matchesEventType = true;
                }
                
                if (filters.processCreations && event.type === 'createdProcess') {
                    matchesEventType = true;
                }
                
                // If event doesn't match any active type filter, filter it out
                if (hasEventTypeFilters && !matchesEventType) {
                    shouldFilter = true;
                }
            }
            
            
            // If this event should be filtered, add it to the filteredEvents set
            if (shouldFilter) {
                filteredEvents.add(event.objectId);
            }
        });
        
        // Apply visual updates
        updateEventVisibility();
    }

            
    function processFactsForTimeline(facts) {
        let events = [];
        
        events = events.concat(facts.map(fact => {
            const event = {
                objectId: fact.destinationObjectUid,
                type: fact.type,
                objType: fact.destinationObjectType,
                displayType: utils.getDisplayType(fact.type),
                timestamp: new Date(fact.timestamp),
                detail: {
                    processId: fact.sourceObjectUid,
                    processName: fact.sourceObjectValue,
                    value: fact.destinationObjectValue,
                },
                meta: fact.meta,
                uid: fact.destinationObjectUid // Add uid for getNodeDisplayColor
            };
            
            // Use the shared color service
            event.color = getEventColor(event);
            
            return event;
        }));

        // Return events sorted by timestamp
        return events.sort((a, b) => a.timestamp - b.timestamp);
    }

    // ==== VISUALIZATION ====
    function createTimelineView() {
        createTimelineComponent();
    }

    function calculateTickCount(domain) {
        const timeSpan = domain[1] - domain[0];
        // Could check for longer than day here, but not relevant with current data

        // Return 10 points if more than 10 minute span, 20 otherwise
        return timeSpan > 10 * 60 ? 10 : 5;
    }

    function createCustomTimeFormat(domain) {
        const timeSpan = domain[1] - domain[0];
        // Could check for longer than day here, but not relevant with current data

        // Return with ms if less than 4 second span
        return d3.utcFormat(timeSpan > 4 * 60 *60 ? "%H:%M:%S" : "%H:%M:%S.%L");
    }     

    function createTimelineComponent() {
        // Clear any existing content
        d3.select(svgElement).selectAll("*").remove();

        // Create SVG and explicitly set width and height
        const svg = d3.select(svgElement)
            .attr("width", width)
            .attr("height", height);

        // Set margins for svg
        const mainGroup = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`)
            .attr("class", "main-timeline");
            
        // Calculate inner dimensions
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        
        // Create a clipping path for the timeline area
        svg.append("defs")
            .append("clipPath")
            .attr("id", "timeline-clip")
            .append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", innerWidth)
            .attr("height", innerHeight);

        // Create scales
        const xScale = d3.scaleTime()
            .domain(timeDomain)
            .range([10, innerWidth-10]);

        mainTimelineXScale = xScale;
            
        const eventTypes = Array.from(eventsByType.keys());
        const yScale = d3.scaleBand()
            .domain(eventTypes)
            .range([0, innerHeight]);

        const tickCount = calculateTickCount(timeDomain);
        const timeFormat = createCustomTimeFormat(timeDomain);
            
        // Draw axes
        // X-axis (time)
        const xAxis = mainGroup.append("g")
            .attr("class", "timeline-axis x-axis")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(
                d3.axisBottom(xScale)
                    .ticks(tickCount)
                    .tickFormat(timeFormat)
            );

        // Rotate labels 
        xAxis.selectAll("text")
            .attr("transform", "rotate(-45)")
            .attr("text-anchor", "end")
            .attr("dy", ".9em")
            .attr("dx", "-.8em");
            
        // Y-axis (event types)
        mainGroup.append("g")
            .attr("class", "timeline-axis y-axis")
            .call(d3.axisLeft(yScale).tickFormat(d => {
                const typeLabels = {
                    'createdProcess': 'Process Creation',
                    'readFile': 'File Read',
                    'wroteFile': 'File Write',
                    'deletedFile': 'File Delete',
                    'readRegistry': 'Registry Read',
                    'wroteRegistry': 'Registry Write',
                    'connectedTo': 'Network Connection'
                };
                return typeLabels[d] || d;
            }));
            
        // Draw horizontal grid lines
        mainGroup.selectAll(".row-background")
            .data(eventTypes)
            .enter().append("rect")
            .attr("class", "row-background")
            .attr("x", 0)
            .attr("y", d => yScale(d))
            .attr("width", innerWidth)
            .attr("height", yScale.bandwidth())
            .attr("fill", (d, i) => i % 2 === 0 ? "#f8f9fa" : "#ffffff");

        // Create a group for events with clipping applied
        const eventsGroup = mainGroup.append("g")
            .attr("class", "events-group")
            .attr("clip-path", "url(#timeline-clip)");

        // Create tooltip
        const tooltip = createTooltip();

            
        // Draw events for each type
        eventsByType.forEach((events, type) => {
            eventsGroup.selectAll(`.event-${type}`)
                .data(events)
                .enter().append("circle")
                .attr("class", d => `timeline-event event-${type}`)
                .attr("cx", d => xScale(d.timestamp))
                .attr("cy", d => yScale(type) + yScale.bandwidth() / 2)
                .attr("r", 7)
                .attr("fill", d => d.color)
                .style("opacity", d => filteredEvents.has(d.objectId) ? 0.2 : 1.0)
                .attr("stroke", "white")
                .attr("stroke-width", 1)
                .on("click", (event, d) => {
                    event.stopPropagation();
                    handleEventClick(d);
                })
                .on("mouseover", function(event, d) {
                    // Visual feedback
                    d3.select(this)
                        .attr("r", 8)
                        .attr("stroke-width", 2);

                    // Show tooltip
                    tooltip.transition()
                        .duration(200)
                        .style("opacity", 0.9);

                    // Format tooltip content
                    const formattedTime = utils.formatTimestamp(d.timestamp, false);
                    
                    let tooltipContent = `
                        <strong>${getDisplayTitle(d).substring(0, 50)}</strong><br> 
                        <span>${d.displayType}</span><br>
                        <span>Time: ${formattedTime} (UTC)</span>
                    `; 
                    
                    if (d.detail.processName) {
                        tooltipContent += `<br><span>Parent Process: ${d.detail.processName}</span>`;
                    }
                    
                    if (d.detail.value) {
                        tooltipContent += `<br><span>${getTooltipKey(d.objType)}: ${getTooltipValue(d)}</span>`;
                    }
                    
                    tooltip.html(tooltipContent)
                        .style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
            .on("mouseout", function() {
                // Reset visual
                d3.select(this)
                    .attr("r", d => selectedEvent && d === selectedEvent ? 8 : 6)
                    .attr("stroke-width", d => selectedEvent && d === selectedEvent ? 2 : 1);
                
                // Hide tooltip
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
        });

        // Click on background resets event selection
        svg.on("click", () => {
            selectedEvent = null;
            isLegendExpanded = false;
        });

        setupTimelineDrag();
    }

    function getDisplayTitle(event) {
        if (event.objType === "process") {
            return event.detail.processName;
        } else {
            return event.detail.value || "";
        }
    }

    function resetTimelineView() {
        // Reset zoom level
        zoomLevel = 1;
        updateZoomSliderPosition();

        updateMainTimelineView(timeDomain);

        // Clear brush selection in minimap
        const minimapGroup = d3.select(minimapElement).select(".minimap");
        if (minimapGroup.node()) {
            const minimapData = minimapGroup.datum();
            if (minimapData && minimapData.xScale) {
                // Get the brush object
                const brushObj = d3.brush();
                
                // Clear the brush selection
                minimapGroup.select(".brush").call(
                    d3.brushX()
                        .extent([[0, 0], [minimapData.xScale.range()[1], minimapData.innerHeight]])
                        .on("brush", brushed)
                        .on("end", brushEnded)
                        .move, null
                );
            }
        }
    }

    // Function to update main timeline after brush selection
    function updateMainTimelineView(domain) {
        timeRangeFilter = domain;
        const mainGroup = d3.select(svgElement).select(".main-timeline");
        if (!mainGroup.node()) {
            console.error("Main timeline group not found");
            return;
        }

        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        
        // Update x-scale with new domain
        const xScale = d3.scaleTime()
            .domain(domain)
            .range([10, innerWidth-10]);
            
        mainTimelineXScale = xScale;
        // Update x-axis
        mainGroup.select(".x-axis")
            .transition()
            .duration(750)
            .call(
                d3.axisBottom(xScale)
                    .ticks(calculateTickCount(domain))
                    .tickFormat(createCustomTimeFormat(domain))
            );
        
        // Rotate labels again after transition
        mainGroup.select(".x-axis").selectAll("text")
            .attr("transform", "rotate(-45)")
            .attr("text-anchor", "end")
            .attr("dy", ".9em")
            .attr("dx", "-.8em");
        
        // Update event positions
        const eventTypes = Array.from(eventsByType.keys());
        const yScale = d3.scaleBand()
            .domain(eventTypes)
            .range([0, innerHeight]);
            
        eventTypes.forEach(type => {
            mainGroup.selectAll(`.event-${type}`)
                .transition()
                .duration(750)
                .attr("cx", d => xScale(d.timestamp));
        });
    }

    function setupZoomSlider() {
        if (!zoomHandleElement) return;
        
        // Set initial slider position
        updateZoomSliderPosition();
        
        // Mouse down event to start dragging
        zoomHandleElement.addEventListener('mousedown', startSliderDrag);
        
        // Add mouse wheel event to the timeline chart
        const chartContainer = document.querySelector('.timeline-chart');
        if (chartContainer) {
            chartContainer.addEventListener('wheel', handleMouseWheel, { passive: false });
        }
    }

    // Drag zoom slider
    function startSliderDrag(e) {
        e.preventDefault();
        isDragging = true;
        startY = e.clientY;
        startZoom = zoomLevel;
        
        // Add document-level event listeners
        document.addEventListener('mousemove', handleSliderDrag);
        document.addEventListener('mouseup', stopSliderDrag);
    }

    // Handle zoom slider drag
    function handleSliderDrag(e) {
        if (!isDragging) return;
        
        const trackHeight = document.querySelector('.zoom-track').offsetHeight;
        const deltaY = startY - e.clientY;
        const deltaZoomFactor = (deltaY / trackHeight) * (maxZoom - minZoom);
        
        // Update zoom level
        zoomLevel = Math.max(minZoom, Math.min(maxZoom, startZoom + deltaZoomFactor));
        
        // Update slider position
        updateZoomSliderPosition();
        
        // Apply zoom to timeline
        applyZoomToTimeline();
    }

    // Stop dragging
    function stopSliderDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', handleSliderDrag);
        document.removeEventListener('mouseup', stopSliderDrag);
    }

    // Handle mouse wheel for zooming
    function handleMouseWheel(e) {
        e.preventDefault();
        
        // Determine zoom direction
        const direction = e.deltaY > 0 ? -1 : 1;
        const zoomFactor = 1.2;
        
        // Update zoom level
        if (direction > 0) {
            zoomLevel = Math.min(maxZoom, zoomLevel * zoomFactor);
        } else {
            zoomLevel = Math.max(minZoom, zoomLevel / zoomFactor);
        }
        
        // Update slider position
        updateZoomSliderPosition();
        
        // Apply zoom to timeline
        applyZoomToTimeline();
    }

    // Update the position of the zoom slider handle
    function updateZoomSliderPosition() {
        if (!zoomHandleElement) return;
        
        const trackHeight = document.querySelector('.zoom-track').offsetHeight;
        const zoomPercentage = (zoomLevel - minZoom) / (maxZoom - minZoom);
        const position = trackHeight * (1 - zoomPercentage);
        
        zoomHandleElement.style.top = `${position}px`;
    }

    // Apply current zoom level to timeline
    function applyZoomToTimeline() {
        const mainGroup = d3.select(svgElement).select(".main-timeline");
        if (!mainGroup.node()) return;
        
        // Get current domain and calculate center
        const currentDomain = mainTimelineXScale.domain();
        const centerTime = new Date((currentDomain[0].getTime() + currentDomain[1].getTime()) / 2);
        
        // Calculate new domain based on zoom level
        const fullTimeSpan = timeDomain[1] - timeDomain[0];
        const newTimeSpan = fullTimeSpan / zoomLevel;
        
        // Calculate new domain around center point
        const newDomain = [
            new Date(centerTime.getTime() - newTimeSpan / 2),
            new Date(centerTime.getTime() + newTimeSpan / 2)
        ];
        
        // Update views
        updateMainTimelineView(newDomain);
        updateBrushFromDomain(newDomain);
    }

    // Update brush position based on zoom domain
    function updateBrushFromDomain(domain) {
        const minimapGroup = d3.select(minimapElement).select(".minimap");
        if (!minimapGroup.node()) return;
        
        const minimapData = minimapGroup.datum();
        if (!minimapData || !minimapData.xScale) return;
        
        const xScale = minimapData.xScale;
        const brushSelection = [
            xScale(domain[0]),
            xScale(domain[1])
        ];
        
        // Find the brush group and update its position
        minimapGroup.select(".brush")
            .call(d3.brushX()
                .extent([[0, 0], [xScale.range()[1], minimapData.innerHeight]])
                .on("brush", brushed)
                .on("end", brushEnded)
                .move, brushSelection);
    }

    // Set up timeline drag functionality
    function setupTimelineDrag() {
        const mainGroup = d3.select(svgElement).select(".main-timeline");
        if (!mainGroup.node()) return;
        
        // Create a transparent overlay for dragging
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        
        mainGroup.insert("rect", ".events-group")
            .attr("class", "drag-overlay")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", innerWidth)
            .attr("height", innerHeight)
            .attr("fill", "transparent")
            .style("cursor", "grab")
            .on("mousedown", startTimelineDrag);
            
    }

    // Set up event listeners
    function startTimelineDrag(event) {
        // Only enable drag with left mouse button
        if (event.button !== 0) return;

        // Stop drag if the user clicked on an event circle
        if (event.target.classList.contains('timeline-event')) {
            return;
        }
        
        event.preventDefault();
        isDraggingTimeline = true;
        dragStartX = event.clientX;
        dragStartDomain = [...mainTimelineXScale.domain()];
        
        // Change cursor style
        d3.select(this).style("cursor", "grabbing");
        
        // Add document-level event listeners
        document.addEventListener('mousemove', handleTimelineDrag);
        document.addEventListener('mouseup', stopTimelineDrag);
    }

    // Handle timeline drag movement
    function handleTimelineDrag(event) {
        if (!isDraggingTimeline || !dragStartDomain) return;
        
        const mainGroup = d3.select(svgElement).select(".main-timeline");
        if (!mainGroup.node()) return;
        
        // Calculate the drag distance in pixels
        const deltaX = event.clientX - dragStartX;
        
        // Convert pixel movement to time
        const innerWidth = width - margin.left - margin.right;
        const currentDomain = mainTimelineXScale.domain();
        const domainWidth = currentDomain[1] - currentDomain[0];
        const pixelsPerMs = innerWidth / domainWidth;
        
        const timeShift = -deltaX / pixelsPerMs; // Negative because dragging left moves timeline right
        
        // Calculate new domain
        const newDomain = [
            new Date(dragStartDomain[0].getTime() + timeShift),
            new Date(dragStartDomain[1].getTime() + timeShift)
        ];
        
        // Update views
        updateMainTimelineView(newDomain);
        updateBrushFromDomain(newDomain);
    }

    // Stop timeline dragging
    function stopTimelineDrag() {
        isDraggingTimeline = false;
        
        // Reset cursor
        d3.select(svgElement).select(".drag-overlay").style("cursor", "grab");
        
        // Remove document-level event listeners
        document.removeEventListener('mousemove', handleTimelineDrag);
        document.removeEventListener('mouseup', stopTimelineDrag);
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

    function updateEventVisibility() {
        const hasActiveFilters = filteredEvents.size > 0;

        // Select all timeline event dots
        d3.select(svgElement).selectAll(".timeline-event")
            .transition()
            .duration(300)
            .style("opacity", d => {
                if (!hasActiveFilters) return 1.0; // No filters, everything visible
                return filteredEvents.has(d.objectId) ? 0.2 : 1.0; // Dim filtered events
            })
            .style("fill", d => {
                if (!hasActiveFilters || !filteredEvents.has(d.objectId)) {
                    return d.color; // Normal color for visible events
                } 
                return "#bbb"; // Gray for filtered events
            });
    }

    function updateTimelineColors() {
        if (!svgElement) return;
        
        const mainGroup = d3.select(svgElement).select(".main-timeline");
        if (!mainGroup.node()) return;
        
        mainGroup.selectAll(".timeline-event")
            .attr("fill", d => getEventColor(d))
            .style("opacity", d => {
                if (filteredEvents.size === 0) return 1.0;
                return filteredEvents.has(d.objectId) ? 0.2 : 1.0;
            });
    }
    
    // Group events by type
    $: eventsByType = d3.group(timelineData, d => d.type);

    // Calculate time domain (length of time axis)
    $: timeDomain = timelineData.length > 0
        ? d3.extent(timelineData, d => d.timestamp)
        : ["issues"];

    $: width = containerWidth > 0 ? containerWidth : 700;

    $: filteredEvents = new Set();

    $: if (colorTagVersion > 0 && svgElement) {
        tick().then(updateTimelineColors);
    }

    // Get all fact data
    onMount(async () => {
        isLoading = true;
        try {

            allFacts = await apiService.getAllFactsForTimeline();
            timelineData = processFactsForTimeline(allFacts);

            // Wait for next tick to ensure DOM is ready
            setTimeout(() => {
                createTimelineView();
                setupZoomSlider();
                isLoading = false;
            }, 10);
            if (selectedNode) {
                handleSelectedNode(selectedNode);
            }
            colorTagUnsubscribe = colorTagStore.subscribe(() => {
                colorTagVersion++;
                updateTimelineColors();
            });
                
        } catch (error) {
            console.error("Error loading facts:", error);
            allFacts = [];
        } finally {
            isLoading = false;
        }
    });

    onDestroy(() => {        
        // Clean up subscription
        if (colorTagUnsubscribe) colorTagUnsubscribe();
    });
</script>

<div class="timeline-container" bind:this={container} >
    <SearchSidebar
        {isLoading}
        {currentView}
        on:collapseAll={handleCollapseAll}
        on:expandAll={handleExpandAll}
        on:filterChange={handleSearchFilterChange}
        on:selectNode={handleSelectResult}
    />
    <!--- Help button and Color Legend-->
    <div class="visualization-controls">
            <ColorLegend {currentView} expanded={isLegendExpanded} title={"Timeline Legend"}/>
            <ColorLegend currentView={"tree"} expanded={false} title={"Process Legend"}/>
    </div>
    {#if isLoading}
        <div class="loading">Loading timeline data...</div>
    {:else if allFacts.length === 0}
        <div class="no-data">No timeline data found</div>
    {:else}
        <div class="timeline-view">
            <!-- Minimap bar chart -->
             <div class="timeline-minimap-container">
                <div class="timeline-controls">       
                    <button class="reset-button" on:click={() => {
                        resetTimelineView();
                        clearAllFilters();
                    }}>
                        Reset View
                    </button>
                </div>
                <div class="timeline-minimap">
                    <TimelineMinimap 
                        facts={allFacts}
                        width={minimapWidth}
                        height={90}
                        onBrushEnd={updateMainTimelineView}
                        selectedTimeRange={timeRangeFilter}
                    />             
                </div>
            </div>

            <!-- Main timeline view -->
            <div class="timeline-chart-container">
                <div class="timeline-chart">
                    <svg bind:this={svgElement} width={width} height={height}></svg>
                </div>
                <div class="zoom-slider-container">
                    <div class="zoom-label zoom-in">+</div>
                    <div class="zoom-track">
                        <div class="zoom-handle" bind:this={zoomHandleElement}></div>
                    </div>
                    <div class="zoom-label zoom-out">-</div>
                </div>
            </div>

        </div>
        <TimelineDetailsPanel
            facts = {allFacts}
            bind:selectedNode = {selectedEvent}
            on:showGraphView = {handleShowGraphView}
            on:showTreeView = {handleShowTreeView}
        />
    {/if}
</div>

<style>
    .timeline-minimap-container {
        height: 120px; 
        border: 1px solid #e9ecef;
        border-radius: 4px;
        background: white;
        margin-top: 10px;
        display: flex;
        flex-direction: row;
        overflow: hidden; /* Prevent overflow */
    }


    .timeline-minimap {
        flex: 1; /* Take up remaining space */
        height: 100%;
        position: relative;
        overflow: hidden;
        padding: 8px 10px 0 0; /* Add some padding */
    }

    .timeline-controls {
        display: flex;
        justify-content: flex-end;
        background: #f8f9fa;
        padding: 8px;
        min-width: 100px;
        border-right: 1px solid #e9ecef;
    }

    .timeline-container {
        width: 100%;
        height: 100%;
        position: relative;
        user-select: none;
        padding-left: 320px; /*nav bar + searchsidebar*/
    }
    
    .timeline-view {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 70%;
    }
        
    .timeline-chart-container {
        height: 380px;
        display: flex;
        border: 1px solid #e9ecef;
        border-radius: 4px;
        background: white;
        padding-bottom: 50px;
    }

    .timeline-chart {
        padding-top: 10px;
        flex: 1;
        overflow: hidden;
    }

    .visualization-controls {
        position: fixed;
        top: 15px;
        right: 10px;
        z-index: 100;
        display: flex;
        gap: 10px;
        align-items: flex-start;
        flex-direction: column;
    }

    .zoom-slider-container {
        width: 40px;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 10px 0;
        border-left: 1px solid #e9ecef;
        background: #f8f9fa;
    }

    .zoom-label {
        font-size: 16px;
        font-weight: bold;
        color: #555;
        margin: 5px 0;
    }

    .zoom-track {
        flex: 1;
        width: 4px;
        background-color: #ddd;
        position: relative;
        border-radius: 2px;
        margin: 10px 0;
    }

    .zoom-handle {
        position: absolute;
        width: 14px;
        height: 14px;
        background-color: #0366d6;
        border-radius: 50%;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        transition: background-color 0.2s;
    }

    .zoom-handle:hover {
        background-color: #0256b0;
    }

    .zoom-handle:active {
        background-color: #0147a6;
    }

    .reset-button {
        padding: 5px 10px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        color: #333;
        height: fit-content;
        margin: auto; 
        white-space: nowrap; 
        transition: all 0.2s;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }

    .reset-button:hover {
        background: #f0f0f0;
        border-color: #ccc;
    }

    .reset-button:active {
        background: #e0e0e0;
        transform: translateY(1px);
    }
    
    .loading, .no-data {
        color: #666;
        font-style: italic;
    }
    
    svg {
        width: 100%;
        height: 100%;
    }

    :global(.timeline-event.filtered) {
        opacity: 0.2;
        fill: #bbb !important;
    }

    :global(.timeline-event.filtered:hover) {
        opacity: 0.5;
        stroke-width: 1px;
    }

    :global(.drag-overlay) {
        cursor: grab;
    }

    :global(.drag-overlay:active) {
        cursor: grabbing;
    }

    :global(.timeline-axis path, .timeline-axis line) {
        stroke: #ddd;
    }

    :global(.events-group) {
        pointer-events: none; 
    }
    
    :global(.timeline-axis text) {
        fill: #555;
        font-size: 12px;
    }
    
    :global(.timeline-event) {
        pointer-events: all;
        cursor: pointer;
    }
    
    :global(.timeline-event:hover) {
        stroke: #333;
        stroke-width: 2px;
    }

    :global(.minimap-bar:hover) {
        opacity: 0.9;
    }

    :global(.minimap-bar) {
        transition: opacity 0.2s;
    }

    :global(.brush .selection) {
        fill: rgba(70, 130, 180, 0.3);
        stroke: steelblue;
        stroke-width: 1px;
    }

    :global(.brush .handle) {
        fill: #666;
    }

    :global(.brush .overlay) {
        pointer-events: all;
    }
</style>