import { useEffect, useRef } from "react";
import type { Annotation } from "@shared/schema";

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
}

export default function MapPanel({
  annotations,
  selectedAnnotationId,
  onAnnotationSelect,
  onMarkerMove,
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
            ${annotation.frameIndex !== undefined && annotation.frameIndex !== null ? `Frame: ${annotation.frameIndex}<br>` : ''}
            ${annotation.frameTimestampMs !== undefined && annotation.frameTimestampMs !== null ? 
              `Time: ${Math.floor(annotation.frameTimestampMs / 1000 / 60)}:${Math.floor((annotation.frameTimestampMs / 1000) % 60).toString().padStart(2, '0')}<br>` : 
              ''}
          </div>
        `);
        
        marker.on('click', () => {
          onAnnotationSelect(annotation.id);
        });
        
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onMarkerMove(annotation.id, {
            gpsLat: pos.lat,
            gpsLon: pos.lng
          });
        });
        
        marker.addTo(map);
        markers.set(annotation.id, marker);
      } else {
        // Update existing marker position
        marker.setLatLng([annotation.gpsLat, annotation.gpsLon]);
      }
      
      // Update marker style based on selection
      const isSelected = annotation.id === selectedAnnotationId;
      const icon = window.L.divIcon({
        className: `custom-marker ${isSelected ? 'selected' : ''}`,
        html: `<div style="
          width: 20px; 
          height: 20px; 
          border-radius: 50%; 
          background-color: ${isSelected ? '#60A5FA' : '#3B82F6'}; 
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      marker.setIcon(icon);
    });

    // Set initial view only when map is first loaded and there are annotations
    // Don't automatically fit bounds on subsequent updates to prevent zoom jumps
    if (annotations.length > 0 && !map.hasInitialViewSet) {
      const group = new window.L.featureGroup(Array.from(markers.values()));
      map.fitBounds(group.getBounds().pad(0.1));
      map.hasInitialViewSet = true;
    }
  }, [annotations, selectedAnnotationId, onAnnotationSelect, onMarkerMove]);

  // Focus on selected annotation
  useEffect(() => {
    if (!mapRef.current || typeof window.L === 'undefined') return;

    const map = mapRef.current;
    
    if (selectedAnnotationId) {
      const annotation = annotations.find(ann => ann.id === selectedAnnotationId);
      const marker = markersRef.current.get(selectedAnnotationId);
      
      if (annotation && marker) {
        // Zoom in and center on the selected marker
        map.setView([annotation.gpsLat, annotation.gpsLon], 17);
        marker.openPopup();
      }
    } else {
      // When no annotation is selected, show all markers with a reasonable zoom level
      if (annotations.length > 0) {
        const markers = markersRef.current;
        const group = new window.L.featureGroup(Array.from(markers.values()));
        map.fitBounds(group.getBounds().pad(0.1));
      }
    }
  }, [selectedAnnotationId, annotations]);

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
