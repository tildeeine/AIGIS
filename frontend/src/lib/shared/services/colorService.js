import { getCustomNodeColor } from '$lib/shared/stores/colorTagStore.js';
import { GLOBAL_COLORS } from '$lib/shared/constants/visualizationConstants.js';

// Define process classification constants (moved from ProcessTree.svelte)
    let WindowsNames = [
        "applicationframehost.exe", // For hosting UWP apps
        "audiodg.exe",              // Windows Audio Device Graph Isolation
        "backgroundtaskhost.exe",   // Background Task Host
        "compattelrunner.exe",      // Windows Compatibility Telemetry
        "csrss.exe",                // Client/Server Runtime Subsystem
        "ctfmon.exe",               // CTF Loader (Text input)
        "dwm.exe",                  // Desktop Window Manager
        "explorer.exe",             // Windows Explorer
        "fontdrvhost.exe",          // Font Driver Host
        "lsass.exe",                // Local Security Authority Subsystem
        "lsm.exe",                  // Local Session Manager
        "msmpeng.exe",              // Windows Defender
        "RuntimeBroker.exe",        // UWP permission management
        "SearchIndexer.exe",        // Windows Search Indexer
        "searchapp.exe",            // Windows Search App
        "securityhealthservice.exe",   // Windows Security Health
        "securityhealthsystray.exe",  // Defender icon in system tray
        "services.exe",             // Windows Services Manager
        "sihost.exe",               // Shell Infrastructure Host
        "smss.exe",                 // Session Manager Subsystem
        "spoolsv.exe",              // Print Spooler Service
        "sppsvc.exe",               // Software Protection Service
        "startmenuexperiencehost.exe", // Start Menu
        "svchost.exe",              // Service Host
        "System",                   // Kernel process
        "System Idle Process",      // Shows unused system resources
        "taskhost.exe",             // Task Host
        "taskhostw.exe",            // Task Host for Windows
        "textinputhost.exe",        // Windows touch/pen input
        "userinit.exe",             // User Initialization
        "wininit.exe",              // Windows Initialization
        "winlogon.exe",             // Windows Logon Application
        "wlanext.exe",              // WLAN AutoConfig Service
        "wudfhost.exe",             // Windows Driver Foundation Host
        "YourPhone.exe"             // Windows Phone Link
    ];

    let suspiciousNames = ["powershell.exe", "cmd.exe", "rundll32.exe", "wscript.exe", "mshta.exe", 
        "regsvr32.exe", "schtasks.exe", "taskkill.exe", "tasklist.exe", "netstat.exe"
    ];

    let suspiciousPaths = ["C:\\Windows\\system32\\", "C:\\Users\\Admin\\AppData\\Local\\Temp\\", "C:\\Windows\\temp\\", 
                            "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp", "C:\\Users\\Admin\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup" 
    ];

    let commonNames = ["sppsvc.exe", "fontdrvhost.exe", "taskhostw.exe", "shellexperiencehost.exe", "dllhost.exe", "runtimebroker.exe", 
        "searchui.exe", "officeclicktorun.exe", "sihost.exe", "spoolsv.exe", "dwm.exe", "sppextcomobj.exe", "conhost.exe", "wmiprvse.exe"
    ]

    let root = ["root"]

/**
 * Check if a node represents a Windows system process
 */
function isWindowsProcess(node) {
    const nodeData = getNodeData(node);
    if (!nodeData) return false;
    
    const name = nodeData.processName.toLowerCase() || '';
    return WindowsNames.some(n => name.includes(n.toLowerCase()));
}

/**
 * Check if a node represents a suspicious process
 */
function isSuspiciousProcess(node) {
    const nodeData = getNodeData(node);
    if (!nodeData) return false;
    
    const name = nodeData.processName.toLowerCase() || '';
    const path = nodeData.processPath.toLowerCase() || '';
    
    // Check suspicious names
    if (suspiciousNames.some(n => name.includes(n.toLowerCase()))) {
        return true;
    }
    
    // Check if path is suspicious and not a Windows or common process
    if (suspiciousPaths.some(p => path.includes(p.toLowerCase())) && 
        !isWindowsProcess(node) && !isCommonProcess(node)) {
        return true;
    }
    
    return false;
}

/**
 * Check if a node represents a common process
 */
function isCommonProcess(node) {
    const nodeData = getNodeData(node);
    if (!nodeData) return false;
    
    const name = nodeData.processName.toLowerCase() || '';
    return commonNames.some(n => name.includes(n.toLowerCase()));
}

/**
 * Check if a node is the root node
 */
function isRootNode(node) {
    const nodeData = getNodeData(node);
    if (!nodeData) return false;
    
    const name = nodeData.processName.toLowerCase() || '';
    return name.includes('root');
}

/**
 * Helper function to get the appropriate node data regardless of view
 */
function getNodeData(node) {
    if (!node) return null;
    
    // Handle different node structures in different views
    if (node.data?.metadata) {
        return node.data.metadata;
    } else if (node.data){
        return node.data;
    } else if (node.meta) {
        return node.meta;
    } else if (node.objType || node.factType) {
        return node;
    }
    
    return node;
}

/**
 * Gets the appropriate color for a node across all visualizations
 * @param {Object} node - The node object
 * @param {Object} options - Additional options for color determination
 * @returns {String} The hex color code to use
 */
export function getNodeDisplayColor(node, options = {}) {
    if (!node) return GLOBAL_COLORS.DEFAULT;
    
    // get the node data and node ID (differs between views)
    const nodeData = getNodeData(node);
    const nodeId = nodeData?.uid || node.uid || node.data.uid;
    
    if (!nodeId) return GLOBAL_COLORS.DEFAULT;
    
    // Check for custom color tag first (highest priority)
    const customColor = getCustomNodeColor(nodeId);
    if (customColor) return customColor;
    
    if ((node.objType === 'process' || options.viewType === 'tree') && !options.isExtendedNode) {
        // Process type-based coloring
        if (isRootNode(node)) {
            return GLOBAL_COLORS.root;
        }
        
        if (isSuspiciousProcess(node)) {
            return GLOBAL_COLORS.suspicious;
        }
        
        if (isWindowsProcess(node)) {
            return GLOBAL_COLORS.Windows;
        }
        
        if (isCommonProcess(node)) {
            return GLOBAL_COLORS.common;
        }

        return GLOBAL_COLORS.treeNode;
    }
    
    // View-specific coloring
    if (options.viewType === 'graph') {
        // For graph view
        const factType = node.factType || 'default';
        
        if (options.isExtendedNode) {
            return GLOBAL_COLORS.extendedNode;
        }
        
        return GLOBAL_COLORS[factType] || GLOBAL_COLORS.DEFAULT;
    } 
    else if (options.viewType === 'timeline') {
        // For timeline view
        const eventType = node?.type;
        return GLOBAL_COLORS[eventType] || GLOBAL_COLORS.DEFAULT;
    }
    
    // Default tree view fallback
    return GLOBAL_COLORS.treeNode;
}

// Export process classification functions too for reuse
export {
    isWindowsProcess,
    isSuspiciousProcess,
    isCommonProcess,
    isRootNode
};