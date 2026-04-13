"use client";

import { useEffect, useState } from "react";
import {
  Container as MapDiv,
  NaverMap,
  NavermapsProvider,
  useNavermaps,
  Marker,
  useListener,
} from "react-naver-maps";
import type { MapRendererProps } from "./MapRenderer";

const NCP_CLIENT_ID = "9ujc5qa4l3";

function MapContent({ locations, focus, onMapInteraction }: MapRendererProps) {
  const navermaps = useNavermaps();
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const [infoWindow] = useState(
    () => new navermaps.InfoWindow({ content: "", borderWidth: 0, backgroundColor: "transparent", disableAnchor: true })
  );

  const maxVisits = Math.max(...locations.map((l) => l.visitCount), 1);
  const focusedIp = focus?.ip ?? null;

  // 사용자가 지도를 직접 조작하면 포커스 해제
  useListener(map, "dragstart", () => onMapInteraction?.());
  useListener(map, "zoom_changed", () => onMapInteraction?.());

  useEffect(() => {
    if (!map || !focus) return;
    const loc = locations.find((l) => l.ipAddress === focus.ip);
    if (loc) {
      map.panTo(new navermaps.LatLng(loc.latitude, loc.longitude));
      map.setZoom(12, true);
    }
  }, [focus, locations, navermaps, map]);

  function getMarkerIcon(visitCount: number, isSelected: boolean) {
    const ratio = visitCount / maxVisits;
    const opacity = isSelected ? 1 : 0.4 + ratio * 0.6;
    const size = isSelected ? 14 : 8 + Math.round(ratio * 6);
    const color = isSelected ? "#ef4444" : "#3b82f6";
    const borderColor = isSelected ? "#dc2626" : "#2563eb";

    return {
      content: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:${opacity};border:2px solid ${borderColor};"></div>`,
      anchor: new navermaps.Point(size / 2 + 1, size / 2 + 1),
    };
  }

  function handleMarkerMouseOver(loc: MapRendererProps["locations"][number], e: { coord: naver.maps.Coord }) {
    if (!map) return;
    const locationText = [loc.city, loc.country].filter(Boolean).join(", ");
    infoWindow.setContent(`
      <div style="padding:8px 12px;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-size:12px;line-height:1.5">
        <div style="font-weight:600">${locationText}</div>
        <div>${loc.ipAddress}</div>
        <div>${loc.visitCount}회 방문</div>
      </div>
    `);
    infoWindow.open(map, e.coord);
  }

  function handleMarkerMouseOut() {
    infoWindow.close();
  }

  return (
    <NaverMap
      defaultCenter={{ lat: 36.5, lng: 127.5 }}
      defaultZoom={7}
      ref={setMap}
    >
      {locations.map((loc) => {
        const isSelected = loc.ipAddress === focusedIp;

        return (
          <Marker
            key={loc.ipAddress}
            position={{ lat: loc.latitude, lng: loc.longitude }}
            icon={getMarkerIcon(loc.visitCount, isSelected)}
            clickable={true}
            onMouseover={(e) => handleMarkerMouseOver(loc, e)}
            onMouseout={handleMarkerMouseOut}
          />
        );
      })}
    </NaverMap>
  );
}

export function VisitorMapNaver({ locations, focus, onMapInteraction }: MapRendererProps) {
  return (
    <NavermapsProvider ncpKeyId={NCP_CLIENT_ID}>
      <MapDiv style={{ width: "100%", height: "100%" }}>
        <MapContent locations={locations} focus={focus} onMapInteraction={onMapInteraction} />
      </MapDiv>
    </NavermapsProvider>
  );
}
