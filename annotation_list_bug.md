# Annotation List Height Bug

## Problem Description

In the map-only view, the annotation list component has a height constraint (`max-h-56`) that prevents it from taking up the full available space in its container. However, simply modifying this value causes another issue:

- When the `max-h-56` class is changed (even to a smaller value), the scrolling behavior breaks
- Instead of properly scrolling within the container, the content overflows and the hidden portion disappears
- This suggests that the `max-h-56` class is not just a simple height constraint, but is tied to the scrolling mechanism

## Current Structure

The annotation list in `annotation-list.tsx` has this container:
```jsx
<div className="space-y-2 overflow-y-auto max-h-56">
  {/* annotation items */}
</div>
```

## Expected Behavior

- The annotation list should fill the full height of its parent container in the map-only view
- Scrolling should work properly when there are more annotations than can fit in the view
- The solution should not break the existing scrolling behavior

## Root Cause Analysis

The issue occurs because the annotation list component has a fixed `max-h-56` class that constrains its height to 14rem, preventing it from filling the available space in the map-only view. When this value is changed, the scrolling behavior breaks because:

1. The `overflow-y-auto` class only works when there's a defined height constraint
2. Simply removing the height constraint causes the scrolling to stop working entirely
3. The component wasn't designed to dynamically adapt to its container's available space

## Proposed Solutions

### Solution 1: Use `h-full` with a flex container approach
Modify the annotation list container to use `h-full` instead of `max-h-56` and ensure its parent containers have proper flex properties:

```jsx
<div className="flex flex-col h-full">
  <div className="space-y-2 overflow-y-auto flex-grow">
    {/* annotations */}
  </div>
</div>
```

### Solution 2: Calculate height dynamically with CSS
Use CSS `calc()` function to determine the available height based on the parent container:

```jsx
<div className="space-y-2 overflow-y-auto" style={{ height: 'calc(100vh - offset)' }}>
  {/* annotations */}
</div>
```

### Solution 3: Use CSS grid or flexbox for the parent container
Modify the map-only view to use CSS grid or flexbox to properly distribute space:

```jsx
// In map-only-view.tsx
<div className="grid grid-cols-[1fr_auto] h-full">
  <div className="overflow-hidden">
    {/* Map content */}
  </div>
  <div className="w-80 bg-card border-l border-border flex flex-col h-full">
    <div className="p-4 border-b border-border flex-shrink-0">
      {/* Header */}
    </div>
    <div className="flex-1 overflow-hidden">
      <AnnotationList ... />
    </div>
  </div>
</div>
```

And in the annotation list component:
```jsx
// In annotation-list.tsx
<div className="space-y-2 overflow-y-auto h-full">
  {/* annotations */}
</div>
```

### Solution 4: Use viewport units with proper offset calculation
Calculate the available height based on known header/footer heights:

```jsx
<div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
  {/* annotations */}
</div>
```

## Recommended Approach

The best solution would be **Solution 3** as it:
1. Uses modern CSS layout techniques (flexbox/grid)
2. Properly distributes space between the map and annotation panel
3. Allows the annotation list to fill its container while maintaining scrolling
4. Is more maintainable and responsive

This would require changes to both the map-only view component and the annotation list component to properly coordinate their height management.