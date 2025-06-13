import * as utils from '$lib/shared/services/utils.js';

/**
 * Process object model for representing process data in a structured format
 * @typedef {Object} Process
 * @property {string} pid - Number ID of process
 * @property {string} uid - Unique identifier for the process assigned by backend
 * @property {string|nul} parentPid - Number ID of parent process, str 'root' if parent id 0 
 * @property {string|null} parentUid - Unique identifier for the parent process assigned by backend
 * @property {Object} metadata - All metadata associated with this process
 * @property {Array<Process>} children - Child processes
 * @property {interactionCounts} interactionCounts - Counts of different interaction types
 * @property {Aray<NetworkConnection>} networkConnections - Network connection facts related to the process
*/

/**
 * Network Connection object model for representing a network connection fact
 * @typedef {Object} NetworkConnection
 * @property {string} uid - Unique identifier for the fact assigned by backend
 * @property {string} sourceIp - Source IP address of the connection
 * @property {string} sourcePort - Source port of the connection
 * @property {string} destinationIp - Destination IP address of the connection
 * @property {string} destinationPort - Destination port of the connection
 * @property {string} protocol - Protocol used for the connection (e.g., TCP, UDP)
 * @property {string} protocolId - Protocol ID (e.g., 6 for TCP, 17 for UDP)
 * @property {string} timestamp - Timestamp of the connection event
 * @property {string} processId - Process ID associated with the connection
 */

/**
 * Interaction counts for different types of process interactions. Use for filtering and highlighting.
 * @property {Object} interactionCounts - Counts of different interaction types
 * @property {number} interactionCounts.fileReads - Number of file reads interactions
 * @property {number} interactionCounts.fileWrites - Number of file writes interactions
 * @property {number} interactionCounts.fileDeletes
 * @property {number} interactionCounts.registryReads - Number of registry reads interactions
 * @property {number} interactionCounts.registryWrites - Number of registry writes interactions
 * @property {number} interactionCounts.networkConnections - Number of network interactions
 */

/**
 * Standard metadata fields for all process facts as iven in sandbox json
 * @type {Object}
 */
export const PROCESS_EVENT_FIELDS = {
  // Process fields
  processId: { label: "Process ID", category: "basicInfo" },
  processName: { label: "Process Name", category: "basicInfo" },
  processPath: { label: "Path", category: "basicInfo" },
  processCommandline: { label: "Command Line", category: "basicInfo" },
  processCurrentDirectory: { label: "Current Directory", category: "basicInfo" },
  processGuid: { label: "Process GUID", category: "basicInfo" },
  processUsername: { label: "Username", category: "basicInfo" },

  // Parent process fields
  parentProcessId: { label: "Parent Process ID", category: "parent" },
  parentProcessName: { label: "Parent Process Name", category: "parent" },
  parentProcessPath: { label: "Parent Process Path", category: "parent" },
  parentProcessCommandline: { label: "Parent Command Line", category: "parent" },
  parentProcessCurrentDirectory: { label: "Parent Directory", category: "parent" },
  parentProcessGuid: { label: "Parent Process GUID", category: "parent" },
  parentProcessUsername: { label: "Parent Username", category: "parent" },

  // Metadata fields
  timestamp: { label: "Timestamp", category: "metadata", isDate: true },
  version: { label: "Version", category: "metadata" },
  count: { label: "Count", category: "metadata" },
  originalSample: { label: "Original Sample", category: "metadata" }
};

export const NETWORK_EVENT_FIELDS = {
  // Network connection fields
  sourceIp: { label: "Source IP"},
  sourcePort: { label: "Source Port"},
  destinationIp: { label: "Destination IP"},
  destinationPort: { label: "Destination Port"},
  protocolId: { label: "Protocol ID"},
  protocolName: { label: "Protocol Name"},
  timestamp: { label: "Timestamp", isDate: true }
}

/**
 * Create a standardized process object from raw data
 * @param {Object} data - Raw process data from the API, including metadata
 * @returns {Process} - Standardized process object
 */
function createProcessObject(data = {}) {
  // Extract only the core structural properties
  const processObject = {
    // Unique identifiers (string uids)
    uid: data.uid || null,
    parentUid: data.parentUid  || null, 
    pid: data.pid || null,
    parentPid: data.parentPid || null,
    interactionCounts: null,
    children: [],
    metadata: {}, 
    networkConnections: [],
  };
  
  // Move all metadata properties to the metadata object
  Object.entries(data).forEach(([key, value]) => {
    // Skip core properties (IDs) and null/undefined values
    if (['pid', 'uid', 'parentPid', 'parentUid', 'children'].includes(key)) {
      return;
    }
    
    if (value !== null && value !== undefined) {
      processObject.metadata[key] = value;
    }
  });

  
  return processObject;
}

function getNetworkConnection(fact) {
  if (!fact || !fact.destinationObject.type.name !== 'network') return [];

  const connection = {
    uid: fact.id || null,
    sourceIp: fact.sourceObject.value || null,
    sourcePort: fact.metadata.srcPort, 
    destinationIp: fact.metadata.destinationObjectValue || null, 
    destinationPort: fact.metadata.destPort,
    protocol: fact.metadata.proto || null, 
    protocolId: fact.metadata.protoId || null,
    timestamp: fact.metadata.timestamp || null,
  }

  return connection;
}

/**
 * Extract metadata from an API fact
 * @param {Object} fact - API fact object
 * @returns {Object} Metadata object with all process information
 */
function extractMetadata(fact) {
  if (!fact || !fact.meta) return {};
  
  // Get all fields from the meta object
  return { ...fact.meta };
}

/**
 * Convert API process facts to an array of process objects
 * @param {Array} facts - Raw facts from the API
 * @returns {Array<Process>} Array of standardized process objects
 */
export function buildTreeFromProcessFacts(facts) {
  if (!facts || !Array.isArray(facts)) {
    console.error("Invalid facts data:", facts);
    return [];
  }
  
  const processMap = new Map();

  // First pass: Create all process objects
  facts.forEach(fact => {
    const metadata = extractMetadata(fact);
    
    // Handle source process only if root
    if (fact.sourceObjectUid && fact.sourceObjectType === 'process' && fact.sourceObjectValue === "root") {
      const uid = fact.sourceObjectUid;

      if (!processMap.has(uid)) {
        const processData = {
          // Process IDs (PIDs), numeric process values from process_id fields
          pid: fact.sourceObjectValue, 
          parentPid: null,

          // Unique IDs (uuids) assigned by the backend, used in processMap for indexing
          uid: uid, 
          parentUid: null,
          ...metadata
        };
        
        processMap.set(uid, createProcessObject(processData));
      } else {
        // Update metadata if process already exists
        const existingProcess = processMap.get(uid);
        Object.entries(metadata).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            existingProcess.metadata[key] = value;
          }
        });
      }
    }

    // Handle destination process (child)
    if (fact.destinationObjectType && fact.destinationObjectType === 'process') {
      // Create destination process object if it doesn't exist
      const uid = fact.destinationObjectUid;
      const parentUid = fact.sourceObjectUid;

      if (!processMap.has(uid)) {
        const processData = {
          // Process IDs (PIDs), numeric process values from process_id fields
          pid: fact.destinationObjectValue, 
          parentPid: fact.sourceObjectValue,

          // Unique IDs (uuids) assigned by the backend, used in processMap for indexing
          uid: uid, 
          parentUid: parentUid,
          ...metadata
        };
        
        // Add destination process to the processMap
        processMap.set(uid, createProcessObject(processData));
      } else {
        // Update process with parent ID and additional metadata if it already exists
        const existingProcess = processMap.get(uid);
        if (parentUid) {
          existingProcess.parentUid = parentUid;
          existingProcess.parentPid = fact.sourceObjectValue;
        }
        
        Object.entries(metadata).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            existingProcess.metadata[key] = value;
          }
        });
      }
    }
  });

  // Second pass: Build parent-child relationships
  processMap.forEach(process => {
    if (process.parentUid && processMap.has(process.parentUid)) {
      const parent = processMap.get(process.parentUid);
      if (!parent.children.some(child => child.uid === process.uid)) {
        parent.children.push(process);
      }
    }
  });

  return Array.from(processMap.values());
}

/**
 * Build a D3 hierarchy-compatible object from process data
 * @param processes - Process array
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

    // Handle special case root
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

  let root = d3.hierarchy(rootNode)

  updateLayout();

  return rootNode;
}

/**
 * Group process metadata fields by category for right sidebar
 * @param {Object} metadata - Process metadata
 * @returns {Object} Grouped metadata by category
 */
export function groupMetadataByCategory(metadata) {
  if (!metadata) return {};
  
  const result = {
    basicInfo: [],
    parent: [],
    metadata: [],
    other: []
  };
  
  // Process each field in the metadata
  Object.entries(metadata).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    
    // Get field definition or use default
    const fieldDef = PROCESS_EVENT_FIELDS[key] || { label: key, category: "other" };
    
    // Format the value if it's a date
    const formattedValue = fieldDef.isDate && value 
      ? utils.formatTimestamp(value, true) 
      : value;
    
    // Add to the appropriate category
    result[fieldDef.category].push({
      key,
      label: fieldDef.label,
      value: formattedValue
    });
  });
  
  return result;
}