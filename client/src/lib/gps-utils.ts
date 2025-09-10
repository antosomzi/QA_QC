import type { GPSPoint } from "@shared/schema";

/**
 * Utility functions for GPS data processing and interpolation
 */

export function parseGPSData(fileContent: string, fileName: string): GPSPoint[] {
  try {
    if (fileName.endsWith('.json')) {
      const data = JSON.parse(fileContent);
      // Ensure data is in the expected format
      if (Array.isArray(data)) {
        return data.map(point => ({
          timestamp: point.timestamp || point.time || 0,
          lat: point.lat || point.latitude || 0,
          lon: point.lon || point.longitude || point.lng || 0,
        }));
      }
      return [];
    } else if (fileName.endsWith('.csv')) {
      const lines = fileContent.split('\n');
      const dataLines = lines.slice(1); // Skip header
      
      return dataLines
        .filter(line => line.trim())
        .map(line => {
          const [timestamp, lat, lon] = line.split(',').map(val => val.trim());
          return {
            timestamp: parseFloat(timestamp),
            lat: parseFloat(lat),
            lon: parseFloat(lon),
          };
        })
        .filter(point => !isNaN(point.timestamp) && !isNaN(point.lat) && !isNaN(point.lon));
    }
    
    return [];
  } catch (error) {
    console.error('Failed to parse GPS data:', error);
    return [];
  }
}

export function interpolateGPS(
  gpsPoints: GPSPoint[],
  targetTimestamp: number
): GPSPoint | null {
  if (gpsPoints.length === 0) return null;
  
  // Sort GPS points by timestamp
  const sortedPoints = [...gpsPoints].sort((a, b) => a.timestamp - b.timestamp);
  
  // Find exact match
  const exactMatch = sortedPoints.find(point => Math.abs(point.timestamp - targetTimestamp) < 0.1);
  if (exactMatch) return exactMatch;
  
  // Find interpolation points
  let beforePoint: GPSPoint | null = null;
  let afterPoint: GPSPoint | null = null;
  
  for (let i = 0; i < sortedPoints.length; i++) {
    const point = sortedPoints[i];
    
    if (point.timestamp <= targetTimestamp) {
      beforePoint = point;
    }
    
    if (point.timestamp > targetTimestamp && !afterPoint) {
      afterPoint = point;
      break;
    }
  }
  
  // If we only have before or after, return the closest
  if (!beforePoint && afterPoint) return afterPoint;
  if (beforePoint && !afterPoint) return beforePoint;
  if (!beforePoint && !afterPoint) return null;
  
  // Interpolate between the two points
  const timeDiff = afterPoint!.timestamp - beforePoint!.timestamp;
  const ratio = (targetTimestamp - beforePoint!.timestamp) / timeDiff;
  
  return {
    timestamp: targetTimestamp,
    lat: beforePoint!.lat + (afterPoint!.lat - beforePoint!.lat) * ratio,
    lon: beforePoint!.lon + (afterPoint!.lon - beforePoint!.lon) * ratio,
  };
}

export function getGPSForFrame(
  gpsPoints: GPSPoint[],
  frameIndex: number,
  fps: number
): GPSPoint | null {
  if (gpsPoints.length === 0) return null;
  
  // Trier les points GPS par timestamp
  const sortedPoints = [...gpsPoints].sort((a, b) => a.timestamp - b.timestamp);
  
  // Calculer le timestamp de la frame
  const timestamp = frameIndex / fps;
  
  // Obtenir le premier timestamp GPS
  const firstGpsTimestamp = sortedPoints[0].timestamp;
  
  // Ajuster le timestamp cible en ajoutant le premier timestamp GPS
  const adjustedTimestamp = timestamp + firstGpsTimestamp;
  
  return interpolateGPS(gpsPoints, adjustedTimestamp);
}

export function calculateDistance(point1: GPSPoint, point2: GPSPoint): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(point2.lat - point1.lat);
  const dLon = toRadians(point2.lon - point1.lon);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(point1.lat)) * Math.cos(toRadians(point2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance * 1000; // Convert to meters
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function formatCoordinate(coord: number, isLatitude: boolean): string {
  const abs = Math.abs(coord);
  const direction = isLatitude ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
  return `${abs.toFixed(5)}°${direction}`;
}

export function validateGPSPoint(point: any): point is GPSPoint {
  return (
    typeof point === 'object' &&
    point !== null &&
    typeof point.timestamp === 'number' &&
    typeof point.lat === 'number' &&
    typeof point.lon === 'number' &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}
