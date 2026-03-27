import { useEffect, useRef, useState } from "react";
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
  shouldZoomToSelection?: boolean;
  useSatelliteView?: boolean;
  carPosition?: { lat: number; lon: number } | null;
}

export default function MapPanel({
  annotations,
  selectedAnnotationId,
  onAnnotationSelect,
  onMarkerMove,
  shouldZoomToSelection = true,
  useSatelliteView = false,
  carPosition = null,
}: MapPanelProps) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const carMarkerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const hasCenteredOnCarRef = useRef<boolean>(false);
  const prevSelectedIdRef = useRef<string | null>(selectedAnnotationId);
  const [isMapReady, setIsMapReady] = useState(false);

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
      
      if (useSatelliteView) {
        window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          maxZoom: 19
        }).addTo(map);
      } else {
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);
      }
      
      mapRef.current = map;
      setIsMapReady(true);
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
            <strong>${annotation.signType}</strong><br>
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

  // Center map on car when BOTH map and carPosition are ready
  useEffect(() => {
    if (!isMapReady || !carPosition || hasCenteredOnCarRef.current) return;

    const map = mapRef.current;
    
    // Center the map on car position
    map.setView([carPosition.lat, carPosition.lon], 16);
    
    // Lock to prevent other effects from stealing the camera
    hasCenteredOnCarRef.current = true;
    map.hasInitialViewSet = true;

  }, [carPosition, isMapReady]);

  // Update car position marker
  useEffect(() => {
    if (!mapRef.current || typeof window.L === 'undefined') return;
    if (!carPosition) return;

    const map = mapRef.current;

    // Create or update car marker
    if (!carMarkerRef.current) {
      // Create car marker with car icon
      carMarkerRef.current = window.L.marker([carPosition.lat, carPosition.lon], {
        zIndexOffset: 1000
      });

      const carIcon = window.L.divIcon({
        className: 'car-marker',
        html: `<div style="
          display: flex;
          flex-direction: column;
          align-items: center;
        ">
          <div style="
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: #3b82f6;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          ">🚗</div>
          <div style="
            width: 6px;
            height: 60px;
            background-color: #3b82f6;
            border: 1px solid white;
            margin-top: -2px;
          "></div>
        </div>`,
        iconSize: [24, 34],
        iconAnchor: [12, 12]
      });

      carMarkerRef.current.setIcon(carIcon);
      carMarkerRef.current.bindPopup(`<div><strong>Current Position</strong><br/>GPS: ${carPosition.lat.toFixed(6)}, ${carPosition.lon.toFixed(6)}</div>`);
      carMarkerRef.current.addTo(map);
    } else {
      carMarkerRef.current.setLatLng([carPosition.lat, carPosition.lon]);
    }
  }, [carPosition]);

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
        if (shouldZoomToSelection) {
          map.setView([annotation.gpsLat, annotation.gpsLon], 16);
          marker.openPopup();
        }
      }
      // Remember that we selected something
      prevSelectedIdRef.current = selectedAnnotationId; 

    } else {
      // When no annotation is selected, close all popups
      map.closePopup();
      
      // Only center on group if we just deselected an annotation (not on initial load)
      if (prevSelectedIdRef.current && annotations.length > 0 && shouldZoomToSelection) {
        const markers = markersRef.current;
        if (markers.size > 0) {
          const group = new window.L.featureGroup(Array.from(markers.values()));
          const bounds = group.getBounds();
          const center = bounds.getCenter();
          map.setView([center.lat, center.lng], 16);
        }
      }
      
      // Reset the memo
      prevSelectedIdRef.current = null;
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
