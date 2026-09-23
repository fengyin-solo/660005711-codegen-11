<template>
  <div ref="container" class="vol-view">
    <div class="zoom-tools">
      <button class="zbtn" title="放大" @click="dolly(0.8)">＋</button>
      <button class="zbtn" title="缩小" @click="dolly(1.25)">－</button>
      <button class="zbtn" title="复位视角" @click="resetPose">⟲</button>
    </div>
    <div class="hint">左键拖拽平移 · 滚轮缩放 · 右键旋转</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useImagingStore } from '../store/imaging'
import type { VolumeData } from '../types'

const props = defineProps<{ volume: VolumeData }>()
const emit = defineEmits<{ (e: 'error', msg: string): void }>()
const imaging = useImagingStore()

const container = ref<HTMLDivElement>()
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer
let controls: OrbitControls, animId = 0, ro: ResizeObserver | null = null
let volGroup = new THREE.Group()
let dead = false

const DEFAULT_POS = new THREE.Vector3(3, 2, 4)

function initScene() {
  const c = container.value!
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0d1117)
  camera = new THREE.PerspectiveCamera(45, c.clientWidth / Math.max(1, c.clientHeight), 0.1, 50)
  camera.position.copy(DEFAULT_POS)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(c.clientWidth, c.clientHeight)
  renderer.domElement.style.display = 'block'
  c.appendChild(renderer.domElement)
  // 每格独立缩放与定位：左键平移、滚轮缩放、右键旋转
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 0, 0)
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  scene.add(volGroup)
  renderer.domElement.addEventListener('webglcontextlost', onContextLost)
}

function onContextLost(e: Event) {
  e.preventDefault()
  if (!dead) { dead = true; emit('error', 'WebGL 上下文丢失') }
}

function disposeGroup(g: THREE.Group) {
  g.traverse(obj => {
    const anyObj = obj as any
    anyObj.geometry?.dispose?.()
    if (Array.isArray(anyObj.material)) anyObj.material.forEach((m: any) => m?.dispose?.())
    else anyObj.material?.dispose?.()
  })
  g.clear()
}

function renderVolume() {
  if (dead) return
  disposeGroup(volGroup)
  const vd = props.volume
  const vol = vd.volume
  const [d, h, w] = vd.dimensions
  const step = 2
  const wl = imaging.windowVal, ww = imaging.levelVal
  const lower = wl - ww / 2, upper = wl + ww / 2
  const span = upper - lower || 1

  const positions: number[] = [], colors: number[] = []
  const scaleX = 3 / w, scaleY = 3 / h, scaleZ = 3 / d
  for (let z = 0; z < d; z += step) {
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const t = Math.max(0, Math.min(1, (vol[z][y][x] - lower) / span))
        if (t > 0.05) {
          positions.push((x - w / 2) * scaleX, (y - h / 2) * scaleY, (z - d / 2) * scaleZ)
          colors.push(0.8 + t * 0.2, 0.7 + t * 0.2, 0.6 + t * 0.3)
        }
      }
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({ size: 0.04, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: true, transparent: true, opacity: 0.8 })
  volGroup.add(new THREE.Points(geom, mat))

  const axGeom = new THREE.BufferGeometry()
  axGeom.setAttribute('position', new THREE.Float32BufferAttribute([-2, 0, 0, 2, 0, 0, 0, -2, 0, 0, 2, 0, 0, 0, -2, 0, 0, 2], 3))
  volGroup.add(new THREE.Line(axGeom, new THREE.LineBasicMaterial({ color: 0x30363d })))
}

function dolly(factor: number) {
  if (!camera || !controls) return
  const dir = camera.position.clone().sub(controls.target).multiplyScalar(factor)
  const len = dir.length()
  if (len < 0.5 || len > 30) return
  camera.position.copy(controls.target).add(dir)
  controls.update()
}

function resetPose() {
  if (!camera || !controls) return
  camera.position.copy(DEFAULT_POS)
  controls.target.set(0, 0, 0)
  controls.update()
}

function onResize() {
  const c = container.value
  if (!c || !renderer || !camera) return
  const W = c.clientWidth, H = c.clientHeight
  if (!W || !H) return
  camera.aspect = W / H
  camera.updateProjectionMatrix()
  renderer.setSize(W, H)
}

function animate() {
  if (dead) return
  animId = requestAnimationFrame(animate)
  controls?.update()
  renderer?.render(scene, camera)
}

onMounted(() => {
  try {
    initScene()
    renderVolume()
    animate()
    ro = new ResizeObserver(onResize)
    if (container.value) ro.observe(container.value)
  } catch (e: any) {
    dead = true
    emit('error', e?.message || '3D 渲染初始化失败')
  }
})

watch(() => [props.volume, imaging.windowVal, imaging.levelVal], () => {
  try { renderVolume() } catch (e: any) { if (!dead) { dead = true; emit('error', e?.message || '渲染失败') } }
}, { deep: true })

onUnmounted(() => {
  dead = true
  cancelAnimationFrame(animId)
  ro?.disconnect()
  renderer?.domElement?.removeEventListener('webglcontextlost', onContextLost)
  controls?.dispose()
  disposeGroup(volGroup)
  renderer?.dispose()
  renderer?.domElement?.remove()
})
</script>

<style scoped>
.vol-view { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0d1117; }
.zoom-tools { position: absolute; top: 6px; right: 6px; display: flex; flex-direction: column; gap: 4px; z-index: 2; }
.zbtn { width: 24px; height: 24px; border: 1px solid #30363d; border-radius: 4px; background: rgba(22,27,34,.85); color: #c9d1d9; font-size: 13px; line-height: 1; cursor: pointer; }
.zbtn:hover { border-color: #58a6ff; color: #58a6ff; }
.hint { position: absolute; bottom: 4px; left: 6px; font-size: 10px; color: #484f58; z-index: 2; pointer-events: none; }
</style>
