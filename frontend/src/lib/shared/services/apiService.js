import { writable } from 'svelte/store';
import { buildTreeFromProcessFacts } from '$lib/shared/models/processModel.js';

/**
 * API service for interacting with the backend API
 * Provides methods for searching facts, loading process data, and handling interactions
 */

// Configuration
const API_BASE_URL = 'http://localhost:3000'; // API URL (points to bridge API)
const API_HEADERS = {
    'Content-Type': 'application/json',
};
const DEFAULT_LIMIT = 100;

// ----------------
// Stores and Caches
// ----------------

// Svelte stores for reactive state management
export const processDataStore = writable([]);
export const factsDataStore = writable({});
export const loadingStore = writable({
    processes: false,
    facts: false
});

// Cache objects for improved performance
const networkConnectionsCache = new Map();
const interactionCache = new Map();
const factCache = new Map();

// ----------------
// Core API Methods
// ----------------

/**
 * Core function to handle API requests with consistent error handling
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} body - Request body
 * @returns {Promise<Object>} Response data
 */
async function apiRequest(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: API_HEADERS,
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error in API request to ${endpoint}:`, error);
        throw error;
    }
}

/**
 * Search for facts based on various criteria
 * @param {Object} options - Search parameters
 * @returns {Promise<Object>} Search results
 */
export async function searchFacts(options = {}) {
    try {
        // Clean up search parameters
        const searchParams = options;

        // Remove null values
        Object.keys(searchParams).forEach(key =>
            (searchParams[key] === null) && delete searchParams[key]
        );

        let endpoint = '/v1/fact/search';
        // Use uuid endpoint if objectID is in request
        if (searchParams.objectID) {
            endpoint = `/v1/object/uuid/${searchParams.objectID}/facts`;
            delete searchParams.objectID; // not acceppted as param in endpoint
        } 

        // Generate cache key based on search parameters
        const cacheKey = `search_${JSON.stringify(searchParams)}`;
        if (factCache.has(cacheKey)) {
            console.debug("Using cached search results:", cacheKey);
            return factCache.get(cacheKey);
        }

        // Make API request
        const results = await apiRequest(endpoint, 'POST', searchParams);
        
        // Cache results
        factCache.set(cacheKey, results);
        return results;
    } catch (error) {
        console.error('Error searching facts:', error);
        return { data: [], count: 0 };
    }
}

/**
 * Get facts for a specific object
 * @param {string} objectId - Object ID
 * @param {Array<string>} factType - Fact types to filter
 * @param {string} keywords - Keywords to search for
 * @param {Array<string>} objectType - Object types to filter
 * @param {string} before - Return facts before this date
 * @param {string} after - Return facts after this date
 * @returns {Promise<Object>} Object facts
 */
export async function getFactsForObject(
        objectId, 
        factType = null, 
        keywords = null, 
        objectType = null, 
        before = null, 
        after = null
    ) {
    try {
        if (!objectId) {
            throw new Error("Missing required parameter: objectId");
        }

        // Build search parameters
        const searchParams = {
            keywords: keywords,
            factType: factType,
            objectType: objectType,
            before: before,
            after: after,
            limit: DEFAULT_LIMIT
        };

        // Remove null values
        Object.keys(searchParams).forEach(key =>
            (searchParams[key] === null) && delete searchParams[key]
        );

        // Generate cache key
        const cacheKey = `object_${objectId}_${JSON.stringify(searchParams)}`;
        if (factCache.has(cacheKey)) {
            return factCache.get(cacheKey);
        }

        // Make API request
        const results = await apiRequest(`/v1/object/uuid/${objectId}/facts`, 'POST', searchParams);
        // Cache results
        factCache.set(cacheKey, results);
        return results;
    } catch (error) {
        console.error(`Error fetching facts for object ${objectId}:`, error);
        return { data: [], count: 0 };
    }
}

// ----------------
// Process Data Methods
// ----------------

/**
 * Get processed data for all processes
 * @param {boolean} withInteractions - Whether to include interaction data
 * @returns {Promise<Array>} Processed process data
 */
export async function getProcessData(withInteractions = false) {
    try {
        const processes = await getAllProcesses();
        const processData = buildTreeFromProcessFacts(processes.data);
        
        if (withInteractions) {
            return await addInteractionDataToProcesses(processData);
        }
        
        return processData;
    } catch (error) {
        console.error('Error getting process data:', error);
        return [];
    }
}

/**
 * Fetch all processes from the API
 * @returns {Promise<Object>} Raw process data
 */
async function getAllProcesses() {
    try {
        loadingStore.update(state => ({ ...state, processes: true }));

        const processes = await searchFacts({
            objectType: ['process'],
            factType: ['createdProcess'],
            limit: DEFAULT_LIMIT
        });

        if (!processes) {
            throw new Error('Failed to fetch processes');
        }

        // Process the data and update the store
        const processData = buildTreeFromProcessFacts(processes.data); 
        processDataStore.set(processData);

        loadingStore.update(state => ({ ...state, processes: false }));
        return processes;
    } catch (error) {
        console.error('Error fetching processes:', error);
        processDataStore.set([]);
        loadingStore.update(state => ({ ...state, processes: false }));
        return { data: [], count: 0 };
    }
}

// ----------------
// Network Connection Methods
// ----------------

/**
 * Get all network connections for a given object ID
 * @param {string} objectId - Object ID
 * @returns {Promise<Array>} List of network connections
 */
export async function getNetworkConnectionsForObject(objectId) {
    if (!objectId) return [];

    // Check cache first
    if (networkConnectionsCache.has(objectId)) {
        return networkConnectionsCache.get(objectId);
    }

    try {
        const networkConnections = await getFactsForObject(objectId, ['connectedTo']);
        const connectionData = networkConnections?.data || [];
        
        // Process the connections into a more usable format
        const processedConnections = connectionData.map(fact => {
            // Only process network-related facts
            if (!fact.destinationObjectType === 'network') return null;
            
            // Format connection data
            const connection = {
                id: fact.factId || null,
                timestamp: fact.meta.timestamp,
                destinationIp: fact.destinationObjectValue || null,
                destinationPort: fact.meta?.destPort || null,
                protocol: fact.meta?.proto || 'unknown',
                sourceIp: fact.meta?.srcIp || null,
                sourcePort: fact.meta?.srcPort || null,
                sourceObjectValue: fact.sourceObjectValue || null, 
                destinationObjectType: fact.destinationObjectType || null, // For using in nodegraph
                destinationObjectValue: fact.destinationObjectValue || null, // For using in nodegraph
                destinationObjectUid: fact.destinationObjectUid || null, // For using in nodegraph
                sourceObjectUid: fact.sourceObjectUid || null, // Process that made the connection
                meta: fact.meta // Keep raw data for reference
            };

            // Add VirusTotal link
            connection.virustotalLink = `https://www.virustotal.com/gui/ip-address/${connection.destinationIp}`;
            
            return connection;
        }).filter(Boolean); // Remove null entries

        
        
        // Cache the processed data
        networkConnectionsCache.set(objectId, processedConnections);
        
        return processedConnections;
    } catch (error) {
        console.error('Error fetching network connections:', error);
        return [];
    }
}

/**
 * Fetch all network connection facts in the system
 * @returns {Promise<Array>} List of all network connections
 */
export async function getAllNetworkConnections() {
    // Check global cache first
    const cacheKey = 'all_network_connections';
    if (networkConnectionsCache.has(cacheKey)) {
        console.debug("Using cached global network connections");
        return networkConnectionsCache.get(cacheKey);
    }
    
    try {
        // Get all network connection facts
        const networkFacts = await searchFacts({
            factType: ['connectedTo'],
            limit: DEFAULT_LIMIT
        });
        
        if (!networkFacts || !networkFacts.data) {
            console.warn("Failed to fetch network connections or empty result");
            return [];
        }
        
        // Process the connections using the same format as getNetworkConnectionsForObject
        const connections = networkFacts.data
            .filter(fact => fact.destinationObjectType === 'network')
            .map(fact => {
                // Format connection data using the same structure
                const connection = {
                    id: fact.factId || null,
                    timestamp: fact.meta?.timestamp || null, 
                    destinationIp: fact.destinationObjectValue || null,
                    destinationPort: fact.meta?.destPort || null,
                    protocol: fact.meta?.proto || 'unknown',
                    sourceIp: fact.meta?.srcIp || null,
                    sourcePort: fact.meta?.srcPort || null,
                    sourceObjectUid: fact.sourceObjectUid || null, // Process that made the connection
                    sourceObjectType: fact.sourceObjectType || null,
                    sourceObjectValue: fact.sourceObjectValue || null,
                    destinationObjectType: fact.destinationObjectType || null,
                    destinationObjectValue: fact.destinationObjectValue || null,
                    destinationObjectUid: fact.destinationObjectUid || null,
                    meta: fact.meta // Keep raw metadata
                };
                
                // Add VirusTotal link if we have a destination IP
                if (connection.destinationIp) {
                    connection.virustotalLink = `https://www.virustotal.com/gui/ip-address/${connection.destinationIp}`;
                }
                
                return connection;
            });
        
        console.debug(`Processed ${connections.length} network connections`);
        
        // Cache the result
        networkConnectionsCache.set(cacheKey, connections);
        
        return connections;
    } catch (error) {
        console.error("Error fetching all network connections:", error);
        return [];
    }
}


/**
 * Fetch all facts in the system
 * @returns {Promise<Array>} List of all facts
 */
export async function getAllFactsForTimeline() {
    // No need for cache check, searchFacts caches
    
    try {
        // Get all facts
        const allFacts = await searchFacts({
            factType: ["readFile", "wroteFile", "deletedFile", "readRegistry", "wroteRegistry", "createdProcess", "connectedTo"], // unbounded search not allowed, must specify all fact types
            limit: 300
        });
        
        if (!allFacts || !allFacts.data) {
            console.warn("Failed to fetch facts or empty result");
            return [];
        }
        
        // Process the facts to format for timeline
        const facts = allFacts.data
            .map(fact => {
                // Format facts data using the same structure
                const timelineFact = {
                    id: fact.factId || null,
                    type: fact.type || null,
                    timestamp: fact.meta.timestamp, 
                    objType: fact.destinationObjectType || null,
                    sourceObjectUid: fact.sourceObjectUid || null, // Process that made the facts
                    sourceObjectType: fact.sourceObjectType || null,
                    sourceObjectValue: fact.sourceObjectValue || null,
                    destinationObjectType: fact.destinationObjectType || null,
                    destinationObjectValue: fact.destinationObjectValue || null,
                    destinationObjectUid: fact.destinationObjectUid || null,
                    meta: fact.meta // Keep raw metadata
                };
                
                return timelineFact;
            });
        
        console.debug(`Processed ${facts.length} network facts`);
        
        return facts;
    } catch (error) {
        console.error("Error fetching all facts:", error);
        return [];
    }
}

// ----------------
// Interaction Methods
// ----------------

/**
 * Get all facts for a specific object organized by type
 * @param {string} objectId - Object ID
 * @returns {Promise<Object>} Organized facts
 */
export async function getAllFactsForObject(objectId) {
    if (!objectId) return null;

    // Check cache
    if (interactionCache.has(objectId)) {
        return interactionCache.get(objectId);
    }

    loadingStore.update(state => ({ ...state, facts: true }));

    const networkConnectionsResult = await getNetworkConnectionsForObject(objectId);

    try {
        // Get different types of facts in parallel
        const [
            fileReadsResult,
            fileWritesResult,
            fileDeletesResult,
            registryReadsResult,
            registryWritesResult,
            processCreationsResult
        ] = await Promise.all([
            getFactsForObject(objectId, ['readFile']),
            getFactsForObject(objectId, ['wroteFile']),
            getFactsForObject(objectId, ['deletedFile']),
            getFactsForObject(objectId, ['readRegistry']),
            getFactsForObject(objectId, ['wroteRegistry']),
            getFactsForObject(objectId, ['createdProcess'])
        ]);

        const facts = {
            fileReads: fileReadsResult.data || [],
            fileWrites: fileWritesResult.data || [],
            fileDeletes: fileDeletesResult.data || [],
            registryReads: registryReadsResult.data || [],
            registryWrites: registryWritesResult.data || [],
            networkConnections: networkConnectionsResult || [],
            processCreations: processCreationsResult.data || [],
        };
        
        // Update store and cache
        factsDataStore.set(facts);
        interactionCache.set(objectId, facts);

        loadingStore.update(state => ({ ...state, facts: false }));
        return facts;
    } catch (error) {
        console.error('Error fetching all facts:', error);
        loadingStore.update(state => ({ ...state, facts: false }));
        
        // Return empty data structure on error
        const emptyFacts = {
            fileReads: [],
            fileWrites: [],
            fileDeletes: [],
            registryReads: [],
            registryWrites: [],
            networkConnections: [],
            processCreations: []
        };
        
        return emptyFacts;
    }
}

/**
 * Add interaction data to process objects
 * @param {Array} processes - Array of process objects
 * @returns {Promise<Array>} Processes with added interaction data
 */
export async function addInteractionDataToProcesses(processes) {
    if (!processes || !Array.isArray(processes)) return processes;
    
    loadingStore.set({ processes: false, facts: true });
      
    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    const processesWithData = [...processes];
    
    // Process in batches
    for (let i = 0; i < processesWithData.length; i += batchSize) {
        const batch = processesWithData.slice(i, i + batchSize);
        
        // Process each batch in parallel
        await Promise.all(batch.map(async (process) => {
            try {
                const interactions = await getAllFactsForObject(process.uid);
                
                // Add interaction counts
                process.interactionCounts = {
                    fileReads: interactions.fileReads.length,
                    fileWrites: interactions.fileWrites.length,
                    fileDeletes: interactions.fileDeletes.length,
                    registryReads: interactions.registryReads.length,
                    registryWrites: interactions.registryWrites.length,
                    networkConnections: interactions.networkConnections.length, 
                    processCreations: interactions.processCreations.length,
                    // Total count for convenience
                    total: interactions.fileReads.length + 
                           interactions.fileWrites.length + 
                           interactions.fileDeletes.length +
                           interactions.registryReads.length + 
                           interactions.registryWrites.length +
                           interactions.networkConnections.length + 
                           interactions.processCreations.length
                };
                
                // Store the raw interactions for detail views
                process.interactions = interactions;
            } catch (error) {
                console.error(`Error getting interactions for process ${process.uid}:`, error);
                
                // Set empty values on error
                process.interactionCounts = {
                    fileReads: 0,
                    fileWrites: 0,
                    fileDeletes: 0,
                    registryReads: 0,
                    registryWrites: 0,
                    networkConnections: 0, 
                    processCreations: 0,
                    total: 0
                };
                process.interactions = {
                    fileReads: [],
                    fileWrites: [],
                    fileDeletes: [],
                    registryReads: [],
                    registryWrites: [],
                    networkConnections: [], 
                    processCreations: []
                };
            }
        }));
        
        // Small delay between batches to avoid overloading the server
        if (i + batchSize < processesWithData.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    
    // Update the store and loading state
    processDataStore.set(processesWithData);
    loadingStore.set({ processes: false, facts: false });
    console.log("All interaction data loaded");
    
    return processesWithData;
}