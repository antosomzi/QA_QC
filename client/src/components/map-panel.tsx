import { useEffect, useRef } from "react";
import type { Annotation } from "@shared/schema";
import { getAnnotationColor } from "./helpers/video-player-helpers";

// Declare Leaflet types
declare global {
  interface Window {
    L: any;
  }
}

interface MapPanelProps {
  annotations: Annotation[];
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
  onMarkerMove: (id: string, updates: { gpsLat: number; gpsLon: number }) => void;
  shouldZoomToSelection?: boolean; // New prop to control zoom behavior
}

export default function MapPanel({
  annotations,
  selectedAnnotationId,
  onAnnotationSelect,
  onMarkerMove,
  shouldZoomToSelection = true,
}: MapPanelProps) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Wait for Leaflet to be available
    const initMap = () => {
      if (typeof window.L === 'undefined') {
        setTimeout(initMap, 100);
        return;
      }

      const map = window.L.map(mapContainerRef.current).setView([34.8628, -85.5027], 10);
      
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
      
      mapRef.current = map;
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when annotations change
  useEffect(() => {
    if (!mapRef.current || typeof window.L === 'undefined') return;

    const map = mapRef.current;
    const markers = markersRef.current;

    // Remove markers that no longer exist
    markers.forEach((marker, id) => {
      if (!annotations.find(ann => ann.id === id)) {
        map.removeLayer(marker);
        markers.delete(id);
      }
    });

    // Add or update markers
    annotations.forEach(annotation => {
      let marker = markers.get(annotation.id);
      
      if (!marker) {
        // Create new marker
        marker = window.L.marker([annotation.gpsLat, annotation.gpsLon], {
          draggable: true
        });
        
        marker.bindPopup(`
          <div>
            <strong>${annotation.label}</strong><br>
            GPS: ${annotation.gpsLat.toFixed(6)}, ${annotation.gpsLon.toFixed(6)}
          </div>
        `);
        
        marker.on('click', () => {
          // Select annotation from marker click
          onAnnotationSelect(annotation.id);
        });
        
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          // Select the annotation when drag ends and update position
          onAnnotationSelect(annotation.id);
          onMarkerMove(annotation.id, {
            gpsLat: pos.lat,
            gpsLon: pos.lng
          });
        });
        
        marker.addTo(map);
        markers.set(annotation.id, marker);
      } else {
        // Update existing marker position if it has changed
        const currentLatLng = marker.getLatLng();
        if (Math.abs(currentLatLng.lat - annotation.gpsLat) > 0.000001 || 
            Math.abs(currentLatLng.lng - annotation.gpsLon) > 0.000001) {
          marker.setLatLng([annotation.gpsLat, annotation.gpsLon]);
        }
      }
    });

    // Set initial view only when map is first loaded and there are annotations
    // Don't automatically fit bounds on subsequent updates to prevent zoom jumps
    if (annotations.length > 0 && !map.hasInitialViewSet) {
      const group = new window.L.featureGroup(Array.from(markers.values()));
      map.fitBounds(group.getBounds().pad(0.1));
      map.hasInitialViewSet = true;
    }
  }, [annotations, onAnnotationSelect, onMarkerMove]);

  // Update marker styles when selection changes (separate effect to avoid unnecessary recreations)
  useEffect(() => {
    if (!mapRef.current || typeof window.L === 'undefined') return;

    const markers = markersRef.current;
    
    // Update marker style based on selection
    annotations.forEach(annotation => {
      const marker = markers.get(annotation.id);
      if (marker) {
        const isSelected = annotation.id === selectedAnnotationId;
        const markerColor = getAnnotationColor(annotations, annotation.id);
        const icon = window.L.divIcon({
          className: `custom-marker ${isSelected ? 'selected' : ''}`,
          html: `<div style="
            width: 20px; 
            height: 20px; 
            border-radius: 50%; 
            background-color: ${markerColor}; 
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        marker.setIcon(icon);
      }
    });
  }, [annotations, selectedAnnotationId]);

  // Focus on selected annotation
  useEffect(() => {
    if (!mapRef.current || typeof window.L === 'undefined') return;

    const map = mapRef.current;
    
    if (selectedAnnotationId) {
      const annotation = annotations.find(ann => ann.id === selectedAnnotationId);
      const marker = markersRef.current.get(selectedAnnotationId);
      
      if (annotation && marker) {
        // Only zoom if shouldZoomToSelection is true (from external selection)
        if (shouldZoomToSelection) {
          // Zoom IN to level 18 and center on the selected marker (more zoomed)
          map.setView([annotation.gpsLat, annotation.gpsLon], 16);
          // Open popup when selection comes from annotation list
          marker.openPopup();
        }
        
        // Don't open popup for marker clicks/drags (shouldZoomToSelection = false)
      }
    } else {
      // When no annotation is selected, close all popups and zoom out
      map.closePopup();
      
      if (annotations.length > 0 && shouldZoomToSelection) {
        // Fit bounds to show all markers (only if zoom is enabled)
        const markers = markersRef.current;
        if (markers.size > 0) {
          // Get all markers and fit bounds
          const group = new window.L.featureGroup(Array.from(markers.values()));
          const bounds = group.getBounds();
          const center = bounds.getCenter();
          map.setView([center.lat, center.lng], 16); // Less zoom out when deselected
        }
      }
    }
  }, [selectedAnnotationId, annotations, shouldZoomToSelection]);

  return (
    <div className="w-full h-full relative">
      <div 
        ref={mapContainerRef}
        className="w-full h-full"
        data-testid="map-container"
      />
      
      {/* Load Leaflet CSS and JS */}
      <link 
        rel="stylesheet" 
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" 
      />
      
      {typeof window !== 'undefined' && !window.L && (
        <script 
          src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          async
        />
      )}
    </div>
  );
}
