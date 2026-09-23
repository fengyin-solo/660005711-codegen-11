import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import type {
  MountedStudy, CellBinding, CellViewState, GridLayout,
  ViewKind, PersistedMount,
} from '@/types'

/** 各预设默认窗宽窗位（后端返回的 windowPresets 结构为 window/level） */
const DEFAULT_WL: Record<string, { window: number; level: number }> = {
  brain: { window: 80, level: 40 },
  chest: { window: 1500, level: -600 },
  abdomen: { window: 400, level: 40 },
}

const STORAGE_KEY = 'mvs:state:v1'
export const LAYOUT_OPTIONS: { label: string; rows: number; cols: number }[] = [
  { label: '1×1', rows: 1, cols: 1 },
  { label: '1×2', rows: 1, cols: 2 },
  { label: '2×2', rows: 2, cols: 2 },
  { label: '2×3', rows: 2, cols: 3 },
  { label: '3×3', rows: 3, cols: 3 },
]
export const VIEW_OPTIONS: { value: ViewKind; label: string }[] = [
  { value: 'volume', label: '立体画面' },
  { value: 'axial', label: '横断面' },
  { value: 'coronal', label: '冠状面' },
  { value: 'sagittal', label: '矢状面' },
]
/** 自动填充时同一检查依次分配的视图顺序 */
const AUTO_VIEWS: ViewKind[] = ['volume', 'axial', 'coronal', 'sagittal']

function defaultViewState(): CellViewState {
  return { zoom: 1, panX: 0, panY: 0, slice: -1 }
}

interface PersistedState {
  layout: GridLayout
  mounts: PersistedMount[]
  bindings: (CellBinding | null)[]
  viewStates: CellViewState[]
}

export const useMultiViewStore = defineStore('multiView', () => {
  const screenOpen = ref(false)
  const studies = ref<MountedStudy[]>([])
  const layout = ref<GridLayout>({ rows: 2, cols: 2 })
  /** 与宫格展平后的下标一一对应；缩小宫格后多余的绑定仍保留，放大可恢复 */
  const bindings = ref<(CellBinding | null)[]>([])
  const viewStates = ref<CellViewState[]>([])

  const capacity = computed(() => layout.value.rows * layout.value.cols)
  const hasStudies = computed(() => studies.value.length > 0)
  const readyStudies = computed(() => studies.value.filter(s => s.status === 'ready'))

  // ---------- 持久化（仅布局 + 挂载清单 + 宫格绑定/视图状态；体数据不存） ----------
  function persist() {
    const payload: PersistedState = {
      layout: { ...layout.value },
      mounts: studies.value.map(s => ({ id: s.id, name: s.name, preset: s.preset })),
      bindings: bindings.value,
      viewStates: viewStates.value,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch { /* 存储不可用时静默降级为仅本次会话保留 */ }
  }

  function restore() {
    let saved: PersistedState | null = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) saved = JSON.parse(raw) as PersistedState
    } catch { saved = null }

    if (saved && LAYOUT_OPTIONS.some(o => o.rows === saved.layout?.rows && o.cols === saved.layout?.cols)) {
      layout.value = { ...saved.layout }
      bindings.value = Array.isArray(saved.bindings) ? saved.bindings : []
      viewStates.value = Array.isArray(saved.viewStates) ? saved.viewStates : []
      const mounts = Array.isArray(saved.mounts) ? saved.mounts : []
      studies.value = mounts.map(m => ({
        id: m.id, name: m.name, preset: m.preset,
        status: 'loading', data: null,
        ...(DEFAULT_WL[m.preset] || DEFAULT_WL.brain),
      }))
    } else {
      layout.value = { rows: 2, cols: 2 }
      bindings.value = []
      viewStates.value = []
      studies.value = []
    }
    ensureCellStates()
  }

  function ensureCellStates() {
    while (viewStates.value.length < capacity.value) viewStates.value.push(defaultViewState())
    while (bindings.value.length < capacity.value) bindings.value.push(null)
  }

  function getStudy(id: string) {
    return studies.value.find(s => s.id === id)
  }

  function getViewState(index: number): CellViewState {
    ensureCellStates()
    if (!viewStates.value[index]) viewStates.value[index] = defaultViewState()
    return viewStates.value[index]
  }

  function patchViewState(index: number, patch: Partial<CellViewState>) {
    const st = getViewState(index)
    Object.assign(st, patch)
    persist()
  }

  function resetViewState(index: number) {
    viewStates.value[index] = defaultViewState()
    persist()
  }

  // ---------- 大屏开关 ----------
  function openScreen() {
    restore()
    screenOpen.value = true
    // 挂载清单恢复后重新拉取每份检查的数据
    studies.value.forEach(s => { if (s.status !== 'ready') loadStudy(s.id) })
  }

  function closeScreen() {
    // 关屏前保存布局与挂载清单，下次打开恢复
    persist()
    screenOpen.value = false
    // 释放大体数据，保留挂载清单描述（在下次 restore 后才需要，这里同时清内存）
    studies.value.forEach(s => { s.data = null; s.status = 'loading' })
  }

  // ---------- 检查挂载 ----------
  async function mountStudy(preset: string, name?: string): Promise<string> {
    const id = `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const seq = studies.value.filter(s => s.preset === preset).length
    const presetLabel: Record<string, string> = { brain: '头部CT', chest: '胸部CT', abdomen: '腹部CT' }
    const study: MountedStudy = {
      id,
      name: name || `${presetLabel[preset] || preset}-${seq + 1}`,
      preset,
      status: 'loading',
      data: null,
      ...(DEFAULT_WL[preset] || DEFAULT_WL.brain),
    }
    studies.value.push(study)
    autoPlace(id)
    persist()
    await loadStudy(id)
    return id
  }

  function unmountStudy(id: string) {
    studies.value = studies.value.filter(s => s.id !== id)
    bindings.value = bindings.value.map(b => (b && b.studyId === id ? null : b))
    persist()
  }

  async function loadStudy(id: string) {
    const study = getStudy(id)
    if (!study) return
    study.status = 'loading'
    study.error = undefined
    try {
      const { data } = await axios.post('/api/volume', {
        preset: study.preset, width: 64, height: 64, depth: 64,
      })
      study.data = data
      study.status = 'ready'
    } catch (e: any) {
      study.status = 'error'
      study.error = e?.message || '影像数据加载失败'
    }
  }

  /** 新检查自动占位：把该检查按 立体/横断/冠状/矢状 顺序填到空格 */
  function autoPlace(studyId: string) {
    ensureCellStates()
    let viewCursor = 0
    for (let i = 0; i < capacity.value; i++) {
      if (!bindings.value[i]) {
        bindings.value[i] = { studyId, view: AUTO_VIEWS[Math.min(viewCursor, AUTO_VIEWS.length - 1)] }
        viewCursor++
        if (viewCursor >= AUTO_VIEWS.length) break
      }
    }
  }

  // ---------- 宫格与绑定 ----------
  function setLayout(rows: number, cols: number) {
    layout.value = { rows, cols }
    ensureCellStates()
    persist()
  }

  function bindCell(index: number, studyId: string, view: ViewKind) {
    bindings.value[index] = { studyId, view }
    persist()
  }

  function unbindCell(index: number) {
    bindings.value[index] = null
    viewStates.value[index] = defaultViewState()
    persist()
  }

  return {
    screenOpen, studies, layout, bindings, viewStates,
    capacity, hasStudies, readyStudies,
    openScreen, closeScreen, mountStudy, unmountStudy, loadStudy,
    setLayout, bindCell, unbindCell,
    getStudy, getViewState, patchViewState, resetViewState,
  }
})
