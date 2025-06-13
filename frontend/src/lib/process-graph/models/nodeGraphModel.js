const LABEL_LENGTH_LIMIT = 30;
const MAIN_NODE_SIZE = 20;
const SECONDARY_NODE_SIZE = 10;
const EXTENDED_NODE_SIZE = 15;

import { GLOBAL_COLORS } from  '$lib/shared/constants/visualizationConstants.js';
import { searchFacts } from '$lib/shared/services/apiService';
import { getNodeDisplayColor } from '$lib/shared/services/colorService.js';

let nodesMap = null; 
let oldMap = null; 

/**
 * Processes raw facts data into a format suitable for D3 force-directed graph
 * @param {Object} processNode - The central process node
 * @param {Object} facts - Dict object containing arrays for all related facts for processNode
 * @returns {Object} Object with nodes and links arrays for D3 visualization
 */
export function buildNodeGraph(processNode, facts, isExpandedNode, switchedNode) {
    const links = [];
    if (!isExpandedNode) {
        nodesMap = new Map();
        oldMap = new Map();
    } else {
        oldMap = new Map(nodesMap); 
        nodesMap = new Map();
    }

    if (!isExpandedNode && !switchedNode) {
        // if a node with processNode.uid is already in the nodesMap, we need to use that node as the central node
        const centralNode = createMainNode(processNode, isExpandedNode);
        nodesMap.set(centralNode.uid, centralNode);
    }
    if (switchedNode) {
        processNode.size = MAIN_NODE_SIZE;
    }

    if (facts.fileReads) {
        facts.fileReads.forEach(fileRead => {
            createNodeAndLink(fileRead, processNode, "readFile", nodesMap, links, isExpandedNode);
        });
    }
    if (facts.fileWrites) {
        facts.fileWrites.forEach(fileWrite => {
            createNodeAndLink(fileWrite, processNode, "wroteFile", nodesMap, links, isExpandedNode);
        });
    }
    if (facts.fileDeletes) {
        facts.fileDeletes.forEach(fileDelete => {
            createNodeAndLink(fileDelete, processNode, "deletedFile", nodesMap, links, isExpandedNode);
        });
    }
    if (facts.registryReads) {
        facts.registryReads.forEach(registryRead => {
            createNodeAndLink(registryRead, processNode, "readRegistry", nodesMap, links, isExpandedNode);
        });
    }
    if (facts.registryWrites) {
        facts.registryWrites.forEach(registryWrite => {
            createNodeAndLink(registryWrite, processNode, "wroteRegistry", nodesMap, links, isExpandedNode);
        });
    }
    if (facts.networkConnections) {
        facts.networkConnections.forEach(networkConnection => {
            createNodeAndLink(networkConnection, processNode, "connectedTo", nodesMap, links, isExpandedNode);
        });
    }
    if (facts.processCreations) {
        facts.processCreations.forEach(processCreation => {
            if (processCreation.destinationObjectUid === processNode.data.uid) return;
            createNodeAndLink(processCreation, processNode, "createdProcess", nodesMap, links, isExpandedNode);
        });
    }
    
    const nodes = Array.from(nodesMap.values());

    if (isExpandedNode) {
        // reset nodesMap back to oldMap
        nodesMap = new Map(oldMap);
        oldMap = new Map();
    }

    return { nodes, links };
}

function createNodeAndLink(fact, processNode, factType, nodesMap, links, isExpandedNode) {
    let newNode = null;
    if (isExpandedNode) {
        // if expanding a node, the target node (process also accessing event) migth already be in the oldMap. Process is always sourceObject
        newNode = oldMap.get(fact.sourceObjectUid) || null;
    }
    if (!newNode) {
        newNode = createNodeFromFact(fact, processNode, isExpandedNode);
    }

    let sourceNode = processNode;
    if (isExpandedNode) {
        // expanding the node, so the parent node is the target node of the process creation fact, get it from the nodesMap
        sourceNode = oldMap.get(fact.destinationObjectUid) || nodesMap.get(fact.destinationObjectUid);
    }
    const newLink = createLink(sourceNode, newNode, factType, isExpandedNode);

    // Only add node to nodemap if it doesn't exist
    if (!(nodesMap.has(newNode.uid) | oldMap.has(newNode.uid))) {
        nodesMap.set(newNode.uid, newNode);
    } 
    
    // If link exists, increment value, otherwise add new link
    if (links.some(link => link.uid === newLink.uid)) {
        const existingLink = links.find(link => link.uid === newLink.uid);
        existingLink.value += 1;
    } else {
        links.push(newLink);
    }
}

function createNodeFromFact(fact, processNode, isExpandedNode) {
    let fullName = "";
    let nodeData  ="";
    if (fact.destinationObjectType === "process") {
        fullName = fact.meta.processName;
    } else if (isExpandedNode) {
        fullName = fact.sourceObjectValue;
    }
    else {
        fullName = fact.destinationObjectValue;
    }

    const displayName = fullName.length > LABEL_LENGTH_LIMIT 
    ? fullName.substring(0, LABEL_LENGTH_LIMIT) + "..." 
    : fullName;

    const node = {
        uid: isExpandedNode ? fact.sourceObjectUid : fact.destinationObjectUid, 
        label: displayName,
        name: fullName,
        factType: fact.type || "connectedTo",
        objType: isExpandedNode ? "process" : fact.destinationObjectType, 
        size: isExpandedNode ? EXTENDED_NODE_SIZE : SECONDARY_NODE_SIZE, 
        // color: GLOBAL_COLORS.extendedNode, 
        data: fact.meta, 
    }

    node.color = getNodeColor(node, isExpandedNode);

    return node;
}

function createMainNode(processNode, isExpandedNode) {
    if (!isExpandedNode) {
        processNode = processNode.data;
    }
    const node = {
        uid: processNode.uid,
        label: processNode.name,
        name: processNode.name,
        objType: "process",
        factType: "createdProcess",
        size: MAIN_NODE_SIZE,
        // color: GLOBAL_COLORS.DEFAULT,
        data: processNode,
    }

    node.color = getNodeColor(node, isExpandedNode);

    return node;

}

function createLink(sourceNode, targetNode, factType, isExpandedNode) {
    // Sourcenode is always the process node
    const link = {
        uid: `${sourceNode.data.uid || sourceNode.uid}-${targetNode.uid}`,
        source: sourceNode.data.uid || sourceNode.uid,
        target: targetNode.uid,
        factType: factType,
        color: getNodeColor(targetNode, isExpandedNode),
        value: 1,
    }

    return link;
}

function getNodeColor(node, isExpandedNode) {
    return getNodeDisplayColor(node, {
        viewType: 'graph',
        isExtendedNode: isExpandedNode
    });
}