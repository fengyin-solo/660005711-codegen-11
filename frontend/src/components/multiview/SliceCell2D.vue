<template>
  <div class="cell-2d">
    <div ref="wrap" class="canvas-wrap"
         @wheel.prevent="onWheel" @pointerdown.prevent="onDown">
      <canvas ref="cvs"></canvas>
    </div>
    <div class="slice-bar">
      <span class="slice-label">层</span>
      <input type="range" :min="0" :max="maxSlice" v-model.number="sliceIdx" @input="onSliceInput"/>
      <span class="slice-num">{{ sliceIdx }}/{{ maxSlice }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { MountedStudy, ViewKind } from '@/types'
import { useMultiViewStore } from '@/store/multiview'

const props = defineProps<{ study: MountedStudy; plane: Exclude<ViewKind, 'volume'>; cellIndex: number }>()
const emit = defineEmits<{ (e: 'render-error', msg: string): void }>()

const store = useMultiViewStore()
const wrap = ref<HTMLDivElement>()
const cvs = ref<HTMLCanvasElement>()
let resizeObs: ResizeObserver | null = null
let dragging = false
let lastX = 0
let lastY = 0

const dims = computed<[number, number, number]>(() =>
  props.study.data?.dimensions || [64, 64, 64])

const planeAxis = computed(() =>
  props.plane === 'axial' ? 0 : props.plane === 'coronal' ? 1 : 2)

const maxSlice = computed(() => dims.value[planeAxis.value] - 1)

const state = computed(() => store.getViewState(props.cellIndex))
const sliceIdx = computed<number>({
  get() {
    const s = state.value.slice
    if (s < 0) return Math.floor(maxSlice.value / 2)
    return Math.max(0, Math.min(maxSlice.value, s))
  },
  set(v: number) { store.patchViewState(props.cellIndex, { slice: v }) },
})

/** 从体数据中取出当前切面（每格独立计算，互不影响） */
function extractSlice(): number[][] {
  const vd = props.study.data
  if (!vd) return []
  const vol = vd.volume
  const [d, h, w] = dims.value
  const si = sliceIdx.value
  if (props.plane === 'axial') return vol[si] as unknown as number[][]
  if (props.plane === 'coronal') {
    const out: number[][] = []
    for (let z = 0; z < d; z++) {
      const row: number[] = []
      for (let x = 0; x < w; x++) row.push(vol[z][si][x])
      out.push(row)
    }
    return out
  }
  const out: number[][] = []
  for (let z = 0; z < d; z++) {
    const row: number[] = []
    for (let y = 0; y < h; y++) row.push(vol[z][y][si])
    out.push(row)
  }
  return out
}

function draw() {
  const c = cvs.value, holder = wrap.value
  if (!c || !holder) return
  const W = holder.clientWidth, H = holder.clientHeight
  if (W === 0 || H === 0) return
  try {
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0d1117'
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillRect(0, 0, W, H)

    const vd = props.study.data
    if (!vd) return
    const sliceData = extractSlice()
    if (!sliceData.length) return
    const rows = sliceData.length, cols = sliceData[0].length
    const wl = props.study.level, ww = props.study.window
    const lower = wl - ww / 2, span = ww || 1

    // 离屏绘制原始灰度切面
    const off = document.createElement('canvas')
    off.width = cols; off.height = rows
    const octx = off.getContext('2d')!
    const img = octx.createImageData(cols, rows)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let t = (sliceData[y][x] - lower) / span
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const g = Math.round(t * 255)
        const p = (y * cols + x) * 4
        img.data[p] = g; img.data[p + 1] = g; img.data[p + 2] = g; img.data[p + 3] = 255
      }
    }
    octx.putImageData(img, 0, 0)

    // 应用本格独立的缩放与平移
    const st = state.value
    const scale = Math.min(W / cols, H / rows)
    const drawW = cols * scale, drawH = rows * scale
    const ox = (W - drawW) / 2, oy = (H - drawH) / 2
    const a = scale * st.zoom
    ctx.imageSmoothingEnabled = true
    ctx.setTransform(a, 0, 0, a, ox + st.panX, oy + st.panY)
    ctx.drawImage(off, 0, 0, cols, rows)
  } catch (e: any) {
    emit('render-error', `切面绘制失败：${e?.message || '未知错误'}`)
  }
}

function zoomAt(mx: number, my: number, factor: number) {
  const c = cvs.value
  if (!c) return
  const W = c.width, H = c.height
  const sliceData = extractSlice()
  if (!sliceData.length) return
  const rows = sliceData.length, cols = sliceData[0].length
  const scale = Math.min(W / cols, H / rows)
  const st = state.value
  const drawW = cols * scale, drawH = rows * scale
  const ox = (W - drawW) / 2, oy = (H - drawH) / 2
  const a = scale * st.zoom
  // 锚点对应的图像坐标在缩放前后保持不动
  const px = (mx - ox - st.panX) / a
  const py = (my - oy - st.panY) / a
  const newZoom = Math.min(16, Math.max(0.5, st.zoom * factor))
  const na = scale * newZoom
  store.patchViewState(props.cellIndex, {
    zoom: newZoom,
    panX: mx - ox - px * na,
    panY: my - oy - py * na,
  })
}

function onWheel(e: WheelEvent) {
  zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15)
}

function onDown(e: PointerEvent) {
  dragging = true
  lastX = e.clientX; lastY = e.clientY
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
function onMove(e: PointerEvent) {
  if (!dragging) return
  const st = state.value
  store.patchViewState(props.cellIndex, {
    panX: st.panX + (e.clientX - lastX),
    panY: st.panY + (e.clientY - lastY),
  })
  lastX = e.clientX; lastY = e.clientY
}
function onUp() {
  dragging = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}

function onSliceInput() { /* v-model 已更新，watch 触发重绘 */ }

function zoomBy(f: number) {
  const c = cvs.value
  if (c) zoomAt(c.width / 2, c.height / 2, f)
}
function resetView() { store.resetViewState(props.cellIndex) }
defineExpose({ zoomBy, resetView })

watch(() => [props.study.data, props.study.window, props.study.level], draw, { deep: true })
watch(() => [state.value.zoom, state.value.panX, state.value.panY, state.value.slice], draw)
onMounted(() => {
  draw()
  if (wrap.value) {
    resizeObs = new ResizeObserver(draw)
    resizeObs.observe(wrap.value)
  }
})
onUnmounted(() => {
  resizeObs?.disconnect()
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
</script>

<style scoped>
.cell-2d { display: flex; flex-direction: column; width: 100%; height: 100%; }
.canvas-wrap { flex: 1; position: relative; overflow: hidden; cursor: grab; }
.canvas-wrap:active { cursor: grabbing; }
.canvas-wrap canvas { display: block; width: 100%; height: 100%; }
.slice-bar { display: flex; align-items: center; gap: 6px; padding: 3px 8px;
  background: #0d1117; border-top: 1px solid #30363d; }
.slice-bar input[type=range] { flex: 1; accent-color: #58a6ff; height: 4px; }
.slice-label, .slice-num { font-size: 10px; color: #8b949e; font-family: monospace; min-width: 30px; }
.slice-num { text-align: right; }
</style>
