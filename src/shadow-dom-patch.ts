// Patch to handle React trying to manipulate nodes that are in shadow DOM
// This prevents "Failed to execute 'removeChild' on 'Node'" and "insertBefore" errors
// React 19 has stricter DOM manipulation rules that conflict with Web Components Shadow DOM
if (typeof window !== "undefined") {
  // Helper to check if we're in a Storybook iframe or external context
  const isStorybookContext = () => {
    try {
      // Check if we're in an iframe (Storybook embeds)
      if (window.self !== window.top) {
        return true;
      }
      // Check if this is a Storybook iframe by checking the URL or parent
      if (
        window.location.href.includes("iframe") ||
        window.location.href.includes("storybook")
      ) {
        return true;
      }
      return false;
    } catch (e) {
      // If we can't access top, we're likely in an iframe
      return true;
    }
  };

  // Patch appendChild to handle Storybook script injection errors with variable collisions
  const originalAppendChild = Node.prototype.appendChild;

  Node.prototype.appendChild = function <T extends Node>(child: T): T {
    // In Storybook contexts, wrap script content in IIFE to prevent variable collisions
    if (
      isStorybookContext() &&
      (child.nodeName === "SCRIPT" || child.nodeName === "script")
    ) {
      const scriptElement = child as HTMLScriptElement;
      if (scriptElement.textContent && scriptElement.textContent.trim()) {
        const scriptContent = scriptElement.textContent;
        // Check for variable declarations that might collide
        const hasVariableDecl = /(const|let|var)\s+\w+\s*=/.test(scriptContent);

        if (hasVariableDecl && !scriptContent.trim().startsWith("(function")) {
          // Wrap in IIFE to isolate scope and prevent collisions
          try {
            scriptElement.textContent = `(function() { ${scriptContent} })();`;
          } catch (e) {
            // If wrapping fails, proceed with original
          }
        }
      }
    }

    try {
      return originalAppendChild.call(this, child);
    } catch (error: any) {
      // If error is about variable collision, try to isolate the script
      if (
        error &&
        error.message &&
        error.message.includes("already been declared")
      ) {
        if (child.nodeName === "SCRIPT" || child.nodeName === "script") {
          const scriptElement = child as HTMLScriptElement;
          if (scriptElement.textContent) {
            try {
              const wrappedContent = `(function() { ${scriptElement.textContent} })();`;
              scriptElement.textContent = wrappedContent;
              return originalAppendChild.call(this, child);
            } catch (e) {
              // If wrapping fails, return child without appending to prevent crash
              return child;
            }
          }
        }
      }
      // For other errors, try original appendChild
      try {
        return originalAppendChild.call(this, child);
      } catch (e) {
        return child;
      }
    }
  };

  // Patch removeChild - only apply to non-Storybook contexts
  const originalRemoveChild = Node.prototype.removeChild;

  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    // Don't patch in Storybook iframes to avoid interfering with script injection
    if (isStorybookContext()) {
      return originalRemoveChild.call(this, child);
    }

    try {
      // Check if the child is actually a child of this node
      if (this.contains(child)) {
        return originalRemoveChild.call(this, child);
      }
      // If not a child, it might be in shadow DOM - just return the child without removing
      // This prevents React errors when Web Components move nodes to shadow DOM
      return child;
    } catch (error) {
      // If removeChild fails (e.g., node is in shadow DOM), just return the child
      // This prevents React from crashing when cleaning up slotted content
      return child;
    }
  };

  // Patch insertBefore - React 19 compatibility fix for Web Components
  // Only apply to non-Storybook contexts and avoid patching script tags
  const originalInsertBefore = Node.prototype.insertBefore;

  Node.prototype.insertBefore = function <T extends Node>(
    newNode: T,
    referenceNode: Node | null,
  ): T {
    // Don't patch in Storybook iframes to avoid interfering with script injection
    if (isStorybookContext()) {
      return originalInsertBefore.call(this, newNode, referenceNode);
    }

    // Don't patch script tags - let them be inserted normally to avoid duplicate declarations
    if (newNode.nodeName === "SCRIPT" || newNode.nodeName === "script") {
      try {
        return originalInsertBefore.call(this, newNode, referenceNode);
      } catch (e) {
        // If it fails, try appendChild as fallback
        if (this.appendChild) {
          return this.appendChild(newNode) as T;
        }
        return newNode;
      }
    }

    try {
      // If referenceNode is null, use appendChild
      if (referenceNode === null) {
        if (this.appendChild) {
          return this.appendChild(newNode) as T;
        }
        return newNode;
      }

      // Check if the reference node is actually a child of this node
      // Also check if newNode is already a child (React 19 can try to re-insert)
      const isReferenceChild = this.contains(referenceNode);
      const isNewNodeChild = this.contains(newNode);

      // If newNode is already a child and we're trying to insert it before itself, just return it
      if (isNewNodeChild && newNode === referenceNode) {
        return newNode;
      }

      // If newNode is already a child, remove it first before re-inserting
      if (isNewNodeChild && newNode.parentNode) {
        try {
          newNode.parentNode.removeChild(newNode);
        } catch (e) {
          // Ignore removal errors
        }
      }

      // If reference node is a child, proceed with normal insertBefore
      if (isReferenceChild) {
        return originalInsertBefore.call(this, newNode, referenceNode);
      }

      // If reference node is not a child (might be in shadow DOM), append instead
      // This prevents React 19 errors when Web Components manage nodes in shadow DOM
      if (this.appendChild) {
        return this.appendChild(newNode) as T;
      }
      return newNode;
    } catch (error) {
      // If insertBefore fails (e.g., nodes are in shadow DOM), try appendChild
      try {
        if (this.appendChild) {
          return this.appendChild(newNode) as T;
        }
      } catch (appendError) {
        // If both fail, just return the newNode
        // This prevents React from crashing when manipulating slotted content
      }
      return newNode;
    }
  };
}
