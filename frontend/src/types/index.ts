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

// ===== 多视图阅片大屏 =====
export type ViewKind = 'volume' | 'axial' | 'coronal' | 'sagittal'
export type StudyStatus = 'loading' | 'ready' | 'error'

export interface MountedStudy {
  id: string
  name: string
  preset: string
  status: StudyStatus
  error?: string
  data: VolumeData | null
  window: number
  level: number
}

export interface CellBinding {
  studyId: string
  view: ViewKind
}

export interface CellViewState {
  zoom: number
  panX: number
  panY: number
  slice: number
}

export interface GridLayout { rows: number; cols: number }

export interface PersistedMount { id: string; name: string; preset: string }