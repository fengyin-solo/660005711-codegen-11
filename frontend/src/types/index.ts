export interface WindowPreset { window: number; level: number; desc: string }
export interface VolumeData {
  volume: number[][][]
  dimensions: [number, number, number]
  mpr: { axial: number[][]; coronal: number[][]; sagittal: number[][] }
  preset: string
  windowPresets: Record<string, WindowPreset>
}

export interface ROIResult {
  label: string; center: number[]; radius: number
  mean: number; std: number; min: number; max: number; voxelCount: number
  histogram: number[]
}

// ---- 多视图阅片大屏 ----
export interface StudyInfo {
  id: string
  patient: string
  modality: string
  bodyPart: string
  preset: string
  date: string
  description: string
}

export type ViewType = 'volume' | 'axial' | 'coronal' | 'sagittal'

export const VIEW_LABELS: Record<ViewType, string> = {
  volume: '立体', axial: '轴位', coronal: '冠状面', sagittal: '矢状面'
}

export interface GridLayout { id: string; label: string; rows: number; cols: number }

export const GRID_LAYOUTS: GridLayout[] = [
  { id: '1x1', label: '1×1', rows: 1, cols: 1 },
  { id: '1x2', label: '1×2', rows: 1, cols: 2 },
  { id: '2x2', label: '2×2', rows: 2, cols: 2 },
  { id: '2x3', label: '2×3', rows: 2, cols: 3 },
  { id: '3x3', label: '3×3', rows: 3, cols: 3 },
]

/** 一个宫格视口：挂载的检查 + 展示的视图 */
export interface ScreenCellState {
  studyId: string | null
  view: ViewType
}