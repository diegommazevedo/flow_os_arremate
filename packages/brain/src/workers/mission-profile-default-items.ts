/**
 * Itens padrão da vistoria — P-02 (JSON em MissionProfile.items).
 */

export interface MissionItemConfig {
  id: string;
  label: string;
  required: boolean;
  enabled: boolean;
  baseValue: number;
  bonusValue: number;
  skipAllowed: boolean;
  order: number;
}

export const DEFAULT_MISSION_ITEMS: MissionItemConfig[] = [
  { id: "audio", label: "Áudio descrição", required: true, enabled: true, baseValue: 0, bonusValue: 0, skipAllowed: false, order: 0 },
  { id: "text", label: "Texto livre", required: true, enabled: true, baseValue: 0, bonusValue: 0, skipAllowed: false, order: 1 },
  { id: "fach", label: "Foto fachada", required: false, enabled: true, baseValue: 800, bonusValue: 0, skipAllowed: false, order: 2 },
  { id: "viz", label: "Foto vizinhança", required: false, enabled: true, baseValue: 800, bonusValue: 0, skipAllowed: false, order: 3 },
  { id: "acc", label: "Foto acesso", required: false, enabled: true, baseValue: 800, bonusValue: 0, skipAllowed: false, order: 4 },
  { id: "vext", label: "Vídeo exterior", required: false, enabled: true, baseValue: 800, bonusValue: 0, skipAllowed: false, order: 5 },
  { id: "vint", label: "Vídeo interno", required: false, enabled: true, baseValue: 800, bonusValue: 2000, skipAllowed: false, order: 6 },
];
