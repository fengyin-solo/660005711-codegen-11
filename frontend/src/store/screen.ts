import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import axios from 'axios'
import type { StudyInfo, ViewType, ScreenCellState } from '@/types'
import { GRID_LAYOUTS } from '@/types'
import { useImagingStore } from './imaging'

const STORAGE_KEY = 'miv-screen-state-v1'
const DEFAULT_VIEWS: ViewType[] = ['volume', 'axial', 'coronal', 'sagittal']
const VIEW_TYPES: ViewType[] = ['volume', 'axial', 'coronal', 'sagittal']

function emptyCell(index: number): ScreenCellState {
  return { studyId: null, view: DEFAULT_VIEWS[index % DEFAULT_VIEWS.length] }
}

function layoutById(id: string) {
  return GRID_LAYOUTS.find(l => l.id === id) || GRID_LAYOUTS[2] // 默认 2x2
}

interface PersistedState { layoutId: string; cells: ScreenCellState[] }

function restore(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const layout = layoutById(parsed?.layoutId)
    const count = layout.rows * layout.cols
    if (!Array.isArray(parsed?.cells)) return null
    const cells: ScreenCellState[] = []
    for (let i = 0; i < count; i++) {
      const c = parsed.cells[i]
      if (c && (typeof c.studyId === 'string' || c.studyId === null) && VIEW_TYPES.includes(c.view)) {
        cells.push({ studyId: c.studyId, view: c.view })
      } else {
        cells.push(emptyCell(i))
      }
    }
    return { layoutId: layout.id, cells }
  } catch {
    return null
  }
}

export const useScreenStore = defineStore('screen', () => {
  const persisted = restore()

  const visible = ref(false)
  const layoutId = ref(persisted?.layoutId || '2x2')
  const cells = ref<ScreenCellState[]>(
    persisted?.cells || Array.from({ length: 4 }, (_, i) => emptyCell(i))
  )
  /** 上次会话是否有可恢复状态（决定是否用当前单份影像做初始挂载） */
  const hadPersisted = persisted !== null
  /** 每次会话最多自动播种一次，用户手动清空后重开不再重新挂载 */
  const seeded = ref(false)

  const studies = ref<StudyInfo[]>([])
  const studiesLoading = ref(false)
  const studiesError = ref('')

  const layout = computed(() => layoutById(layoutId.value))
  /** 挂载清单：当前各宫格实际挂载的检查（去重，保持挂载顺序） */
  const mountedStudies = computed(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const c of cells.value) {
      if (c.studyId && !seen.has(c.studyId)) { seen.add(c.studyId); list.push(c.studyId) }
    }
    return list
  })

  function studyById(id: string | null): StudyInfo | undefined {
    return studies.value.find(s => s.id === id)
  }

  async function loadStudies() {
    studiesLoading.value = true
    studiesError.value = ''
    try {
      const { data } = await axios.get('/api/studies')
      studies.value = data.studies || []
      // 清理已不存在的检查挂载
      const valid = new Set(studies.value.map((s: StudyInfo) => s.id))
      cells.value.forEach(c => { if (c.studyId && !valid.has(c.studyId)) c.studyId = null })
    } catch (e: any) {
      studiesError.value = e?.message || '检查列表加载失败'
    } finally {
      studiesLoading.value = false
    }
  }

  function open() {
    visible.value = true
    if (!studies.value.length && !studiesLoading.value) {
      loadStudies().then(() => seedIfEmpty())
    } else {
      seedIfEmpty()
    }
  }

  function close() { visible.value = false }

  /** 首次打开且无任何挂载时，把当前单份阅片的检查按 立体+三切面 挂入 2x2 宫格 */
  function seedIfEmpty() {
    if (seeded.value) return
    if (hadPersisted || mountedStudies.value.length) { seeded.value = true; return }
    const imaging = useImagingStore()
    const preset = imaging.volumeData?.preset
    if (!preset) { seeded.value = true; return } // 无当前影像，保持空态
    const study = studies.value.find(s => s.preset === preset)
    if (!study) return // 检查列表未就绪，下次打开时再尝试
    cells.value.forEach((c, i) => {
      if (i < DEFAULT_VIEWS.length) { c.studyId = study.id; c.view = DEFAULT_VIEWS[i] }
    })
    seeded.value = true
  }

  function setLayout(id: string) {
    const l = layoutById(id)
    layoutId.value = l.id
    const count = l.rows * l.cols
    const next = cells.value.slice(0, count)
    while (next.length < count) next.push(emptyCell(next.length))
    cells.value = next
  }

  /** 挂载检查到指定格；缺省挂到第一个空格。返回是否成功 */
  function mountStudy(studyId: string, cellIndex?: number): boolean {
    let idx = cellIndex ?? cells.value.findIndex(c => !c.studyId)
    if (idx < 0 || idx >= cells.value.length) return false
    cells.value[idx].studyId = studyId
    return true
  }

  function setCellView(index: number, view: ViewType) {
    if (cells.value[index]) cells.value[index].view = view
  }

  function clearCell(index: number) {
    if (cells.value[index]) cells.value[index].studyId = null
  }

  /** 从挂载清单整体卸载某个检查 */
  function unmountStudy(studyId: string) {
    cells.value.forEach(c => { if (c.studyId === studyId) c.studyId = null })
  }

  // 关闭再打开（含刷新页面）时保留宫格布局与挂载清单
  watch([layoutId, cells], () => {
    try {
      const state: PersistedState = { layoutId: layoutId.value, cells: cells.value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch { /* 存储不可用时静默降级 */ }
  }, { deep: true })

  return {
    visible, layoutId, layout, cells, studies, studiesLoading, studiesError,
    mountedStudies, studyById,
    open, close, loadStudies, setLayout, mountStudy, setCellView, clearCell, unmountStudy,
  }
})
