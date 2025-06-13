import { GLOBAL_COLORS } from '$lib/shared/constants/visualizationConstants.js';

export const HELP_CONTENT = {
    tree: {
        title: "Process Tree Visualization",
        intro: "This view shows all processes in a hierarchical tree structure.",
        sections: [
            {
                title: "Navigation",
                items: [
                    "<strong>Click</strong> on a node to select it and view details",
                    "<strong>Double-click</strong> to expand or collapse a node",
                    "<strong>Right-click</strong> to expand or collapse the children of a process node",
                    "<strong>Click and Drag</strong> in the timeline bar graph at the bottom to filter for events in this time interval",
                    "The <strong>details tab</strong> contains buttons to view the selected event in the other views (timeline, node graph) where relevant",
                    "The <strong>tags tab</strong> in the right sidebar allows you to bookmark processes and tag them with colors for easy identification",
                    "Use the search and search filters in the left sidebar to highlight specific events",
                    "Click a <strong>Search Result card</strong> to select the corresponding event in the visualization and view more details", 
                    "Hide or show the timeline overview with the <strong>Hide</strong> button on the lower right side", 
                ]
            }, 
            {
                title: "Node Interactions",
                items: [
                    "Nodes with a <strong>yellow outline</strong>, as seen in the color legend, have interactions with other parts of the system",
                    "Expanding a node shows its child processes",
                    "The number next to a collapsed node shows how many direct children it has"
                ]
            }
        ],
        legend: [
            { color: GLOBAL_COLORS.root, label: "Root (system)" },
            { color: GLOBAL_COLORS.Windows, label: "Common Windows name" }, 
            { color: GLOBAL_COLORS.common, label: "Common process name" },
            { color: GLOBAL_COLORS.suspicious, label: "Suspicious process" },
            { color: GLOBAL_COLORS.treeNode, label: "Other processes" },
            { color: GLOBAL_COLORS.hasInteraction, label: "Has system interaction(s)", type: "hasInteractions" }
        ]
    },
  timeline: {
    title: "Timeline Visualization",
    intro: "This view shows a timeline of all system events registered in the sandbox.",
    sections: [
      {
        title: "Navigation",
        items: [
          "<strong>Click</strong> on a node to select it and view details",
          "The details panel contains buttons to view the selected event in the other views (tree, node graph) where relevant",
          "<strong>Click and Drag</strong> in the timeline bar graph at the bottom to zoom in on this time interval",
          "Use the search and search filters in the left sidebar to highlight specific events",
          "Click a <strong>Search Result card</strong> to select the corresponding event in the visualization and view more details",
          "Click and drag the <strong>Zoom slider</strong> to the right of the timeline, or use the mouse wheel, to zoom in the timeline",
          "Click the <strong>Reset View button</strong> in the top left of the visualization to reset the timeline to the original view"
        ]
      }
    ],
    legend: [
      { color: GLOBAL_COLORS.readFile, label: "File read" },
      { color: GLOBAL_COLORS.wroteFile, label: "File write" },
      { color: GLOBAL_COLORS.readRegistry, label: "Registry read" },
      { color: GLOBAL_COLORS.wroteRegistry, label: "Registry write" },
      { color: GLOBAL_COLORS.connectedTo, label: "Network connection" }
    ]
  },                
  graph: {
    title: "Event Graph Visualization",
    intro: "This view shows all system events a given process is involved in.",
    sections: [
      {
        title: "Navigation",
        items: [
          "<strong>Click</strong> on a node to select it and view details",
          "The details panel contains buttons to view the selected event in the other views (tree, timeline) where relevant",
          "Use the search and search filters in the left sidebar to highlight specific events",
          "Click a <strong>Search Result card</strong> to select the corresponding event in the visualization and view more details",
          "Click the <strong>Back to Tree View button</strong> in the top left of the visualization, or another view in the Nav bar to the far left, to go to a different view"
        ]
      },
      {
        title: "Node Interactions",
        items: [
          "Nodes with a <strong>bolder line</strong> show a higher number of interactions from the process to this node",
          "If a non-process event (file, registry, or network) is contacted by another process, this process will be added to the visualization when selecting the event",
          "If a child process of the selected main process contacts the same event as the main process, a link to this node will be added to the visualization when selecting the event"
        ]
      }
    ],
    legend: [
      { color: GLOBAL_COLORS.readFile, label: "File read" },
      { color: GLOBAL_COLORS.wroteFile, label: "File write" },
      { color: GLOBAL_COLORS.readRegistry, label: "Registry read" },
      { color: GLOBAL_COLORS.wroteRegistry, label: "Registry write" },
      { color: GLOBAL_COLORS.connectedTo, label: "Network connection" }
    ]
  }, 
    bookmarks: {
    title: "Bookmarks overview",
    intro: "This view shows all bookmarked processes from the process tree view.",
    sections: [
      {
        title: "Navigation",
        items: [
          "<strong>Click</strong> on a bookmarked process to select it and view details",
          "The details panel contains buttons to view the selected event in the other views (tree, timeline, graph)",
          "Click the <strong>X</strong> to remove a bookmark",
        ]
      },
    ],
  },
};