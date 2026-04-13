import type { VisitorLocation } from "@/actions/analytics";

export interface MapFocus {
  ip: string;
  key: number; // 같은 IP라도 다시 포커스하기 위한 고유 키
}

export interface MapRendererProps {
  locations: VisitorLocation[];
  focus?: MapFocus | null;
  onMapInteraction?: () => void;
}
