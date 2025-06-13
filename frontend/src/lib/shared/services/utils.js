export function formatTimestamp(timestamp, withDate = false) {
    if (!timestamp) return 'N/A';
    
    try {
        const date = new Date(timestamp);
        
        // Use Intl.DateTimeFormat to format in UTC with the same appearance
        const formatOptions = {
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit', 
            fractionalSecondDigits: 3,
            hour12: false,
            timeZone: 'UTC' 
        };
        
        if (withDate) {
            // Add date components when needed
            formatOptions.year = 'numeric';
            formatOptions.month = 'numeric';
            formatOptions.day = 'numeric';
        }
        
        return new Intl.DateTimeFormat('en-GB', formatOptions).format(date);
    } catch (e) {
        return timestamp;
    }
}

export function getDisplayType(factType) {
    if (!factType) return "Unknown";
    
    const typeMap = {
        'readFile': 'File Read',
        'wroteFile': 'File Write',
        'deletedFile': 'File Delete',
        'readRegistry': 'Registry Read',
        'wroteRegistry': 'Registry Write',
        'connectedTo': 'Network Connection',
        'createdProcess': 'Process Creation'
    };

    return typeMap[factType] || factType;
}