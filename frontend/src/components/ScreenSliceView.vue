<template>
  <div ref="wrap" class="slice-view">
    <canvas
      ref="cvs"
      class="slice-canvas"
      :class="{ panning }"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    ></canvas>
    <div class="zoom-tools">
      <button class="zbtn" title="放大" @click="zoomBy(1.25)">＋</button>
      <button class="zbtn" title="缩小" @click="zoomBy(0.8)">－</button>
      <button class="zbtn" title="复位" @click="resetView">⟲</button>
    </div>
    <input type="range" class="slice-slider" :min="0" :max="maxSlice" v-model.number="slice" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useImagingStore } from '../store/imaging'
import type { VolumeData, ViewType } from '../types'

const props = defineProps<{ volume: VolumeData; view: ViewType }>()
const imaging = useImagingStore()

const wrap = ref<HTMLDivElement>()
const cvs = ref<HTMLCanvasElement>()

// 每格独立的缩放与定位状态
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const panning = ref(false)
const slice = ref(0)

let ro: ResizeObserver | null = null
let dragLast: { x: number; y: number } | null = null

const dims = computed(() => props.volume.dimensions) // [d, h, w]
const maxSlice = computed(() => {
  const [d, h, w] = dims.value
  return props.view === 'axial' ? d - 1 : props.view === 'coronal' ? h - 1 : w - 1
})

/** 从完整体数据中抽取当前切面 */
function sliceData(): number[][] {
  const vol = props.volume.volume
  const [d, h, w] = dims.value
  const s = Math.max(0, Math.min(maxSlice.value, slice.value))
  if (props.view === 'axial') return vol[s]
  const out: number[][] = []
  if (props.view === 'coronal') {
    for (let z = 0; z < d; z++) { const row: number[] = []; for (let x = 0; x < w; x++) row.push(vol[z][s][x]); out.push(row) }
  } else {
    for (let z = 0; z < d; z++) { const row: number[] = []; for (let y = 0; y < h; y++) row.push(vol[z][y][s]); out.push(row) }
  }
  return out
}

/** 按窗宽窗位把切面栅格化到离屏画布 */
function buildImage(data: number[][]): HTMLCanvasElement {
  const rows = data.length, cols = data[0].length
  const off = document.createElement('canvas')
  off.width = cols; off.height = rows
  const octx = off.getContext('2d')!
  const img = octx.createImageData(cols, rows)
  const wl = imaging.windowVal, ww = imaging.levelVal
  const lower = wl - ww / 2, upper = wl + ww / 2
  const span = upper - lower || 1
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let t = (data[y][x] - lower) / span
      t = Math.max(0, Math.min(1, t))
      const g = Math.round(t * 255)
      const i = (y * cols + x) * 4
      img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g; img.data[i + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  return off
}

function draw() {
  const c = cvs.value, w = wrap.value
  if (!c || !w) return
  const W = w.clientWidth, H = w.clientHeight
  if (!W || !H) return
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, W, H)

  const data = sliceData()
  if (!data.length || !data[0].length) return
  const rows = data.length, cols = data[0].length
  const off = buildImage(data)

  const fit = Math.min(W / cols, H / rows)
  const scale = fit * zoom.value
  const dw = cols * scale, dh = rows * scale
  const dx = (W - dw) / 2 + panX.value, dy = (H - dh) / 2 + panY.value
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, dx, dy, dw, dh)
}

function clampZoom(z: number) { return Math.max(0.5, Math.min(8, z)) }

function zoomBy(factor: number, cx?: number, cy?: number) {
  const c = cvs.value
  if (!c) return
  const old = zoom.value
  const next = clampZoom(old * factor)
  if (next === old) return
  if (cx !== undefined && cy !== undefined) {
    // 以光标为锚点缩放，保持光标下的影像位置不动
    const k = next / old
    panX.value = cx - c.width / 2 - (cx - c.width / 2 - panX.value) * k
    panY.value = cy - c.height / 2 - (cy - c.height / 2 - panY.value) * k
  }
  zoom.value = next
  draw()
}

function onWheel(e: WheelEvent) {
  const rect = cvs.value!.getBoundingClientRect()
  zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top)
}

function onPointerDown(e: PointerEvent) {
  panning.value = true
  dragLast = { x: e.clientX, y: e.clientY }
  cvs.value?.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!panning.value || !dragLast) return
  panX.value += e.clientX - dragLast.x
  panY.value += e.clientY - dragLast.y
  dragLast = { x: e.clientX, y: e.clientY }
  draw()
}

function onPointerUp() { panning.value = false; dragLast = null }

function resetView() { zoom.value = 1; panX.value = 0; panY.value = 0; draw() }

function resetAll() {
  slice.value = Math.floor(maxSlice.value / 2)
  zoom.value = 1; panX.value = 0; panY.value = 0
  draw()
}

watch(() => [props.volume, props.view], resetAll, { deep: true })
watch(slice, draw)
watch(() => [imaging.windowVal, imaging.levelVal], draw)

onMounted(() => {
  resetAll()
  ro = new ResizeObserver(draw)
  if (wrap.value) ro.observe(wrap.value)
})
onUnmounted(() => { ro?.disconnect(); ro = null })
</script>

<style scoped>
.slice-view { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0d1117; display: flex; flex-direction: column; }
.slice-canvas { flex: 1; width: 100%; min-height: 0; cursor: grab; touch-action: none; }
.slice-canvas.panning { cursor: grabbing; }
.zoom-tools { position: absolute; top: 6px; right: 6px; display: flex; flex-direction: column; gap: 4px; }
.zbtn { width: 24px; height: 24px; border: 1px solid #30363d; border-radius: 4px; background: rgba(22,27,34,.85); color: #c9d1d9; font-size: 13px; line-height: 1; cursor: pointer; }
.zbtn:hover { border-color: #58a6ff; color: #58a6ff; }
.slice-slider { width: 100%; margin: 2px 0; accent-color: #58a6ff; height: 4px; flex: none; }
</style>
