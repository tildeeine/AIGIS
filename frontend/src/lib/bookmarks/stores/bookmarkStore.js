import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// get from localStorage if available
const storedBookmarks = browser && localStorage.getItem('bookmarks') 
    ? JSON.parse(localStorage.getItem('bookmarks')) 
    : [];

const bookmarkStore = writable(storedBookmarks);


function addBookmark(node) {
    if (!node) return;
    
    bookmarkStore.update(bookmarks => {
        // Check if bookmark exists
        const exists = bookmarks.some(b => b.uid === node.data.uid);
        if (exists) return bookmarks;
        
        // Create a new bookmark object with all necessary data
        const newBookmark = {
            uid: node.data.uid,
            name: node.data.name,
            timestamp: node.data.metadata?.timestamp || new Date().toISOString(),
            type: node.data.objType || 'process',
            metadata: node.data.metadata || {},
            bookmarkedAt: new Date().toISOString()
        };
        
        // sort by timestamp (newest first)
        const updatedBookmarks = [...bookmarks, newBookmark]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
        // save to localStorage
        if (browser) {
            localStorage.setItem('bookmarks', JSON.stringify(updatedBookmarks));
        }
        
        return updatedBookmarks;
    });
}

function removeBookmark(uid) {
    bookmarkStore.update(bookmarks => {
        const filtered = bookmarks.filter(b => b.uid !== uid);
        
        // Save to localStorage
        if (browser) {
            localStorage.setItem('bookmarks', JSON.stringify(filtered));
        }
        
        return filtered;
    });
}

function isBookmarked(uid) {
    const bookmarks = get(bookmarkStore);
    return bookmarks.some(b => b.uid === uid);
}

export { 
    bookmarkStore,
    addBookmark,
    removeBookmark,
    isBookmarked
};