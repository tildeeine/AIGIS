import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// Predefined color options
export const COLOR_OPTIONS = [
    { name: 'Red', value: '#FF5252' },
    { name: 'Orange', value: '#FF9800' },
    { name: 'Yellow', value: '#FFD600' },
    { name: 'Green', value: '#4CAF50' },
    { name: 'Teal', value: '#009688' },
    { name: 'Blue', value: '#2196F3' },
    { name: 'Purple', value: '#9C27B0' },
    { name: 'Pink', value: '#E91E63' },
    { name: 'Gray', value: '#9E9E9E' }
];

// Initialize from localStorage if available
const storedColorTags = browser && localStorage.getItem('nodeTags') 
    ? JSON.parse(localStorage.getItem('nodeTags')) 
    : {};

// Create the store
const colorTagStore = writable(storedColorTags);

// Helper functions for tag management
function setNodeColor(nodeId, colorValue) {
    if (!nodeId) return;
    
    colorTagStore.update(tags => {
        const updatedTags = { ...tags };
        
        // If color is null, remove the tag
        if (colorValue === null) {
            delete updatedTags[nodeId];
        } else {
            updatedTags[nodeId] = colorValue;
        }
        
        // Save to localStorage
        if (browser) {
            localStorage.setItem('nodeTags', JSON.stringify(updatedTags));
        }
        
        return updatedTags;
    });
}

function getCustomNodeColor(nodeId) {
    const tags = get(colorTagStore);
    return tags[nodeId] || null;
}

function removeNodeColor(nodeId) {
    setNodeColor(nodeId, null);
}

function clearAllTags() {
    colorTagStore.set({});
    if (browser) {
        localStorage.removeItem('nodeTags');
    }
}

export { 
    colorTagStore,
    setNodeColor,
    getCustomNodeColor,
    removeNodeColor,
    clearAllTags
};