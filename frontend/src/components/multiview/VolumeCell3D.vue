<template>
  <div ref="container" class="cell-3d"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { MountedStudy } from '@/types'

const props = defineProps<{ study: MountedStudy }>()
const emit = defineEmits<{ (e: 'render-error', msg: string): void }>()

const container = ref<HTMLDivElement>()
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls
let volGroup: THREE.Group
let animId = 0
let disposed = false
let resizeObs: ResizeObserver | null = null

const HOME_POS = new THREE.Vector3(3, 2, 4)

function initScene() {
  const c = container.value
  if (!c) return
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0d1117)
  camera = new THREE.PerspectiveCamera(45, Math.max(c.clientWidth, 1) / Math.max(c.clientHeight, 1), 0.1, 50)
  camera.position.copy(HOME_POS)
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true })
  } catch (e: any) {
    emit('render-error', `WebGL 初始化失败：${e?.message || '无法创建渲染器'}`)
    return
  }
  renderer.setSize(c.clientWidth, c.clientHeight)
  c.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 0, 0)
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  volGroup = new THREE.Group()
  scene.add(volGroup)

  resizeObs = new ResizeObserver(() => resize())
  resizeObs.observe(c)
  animate()
}

function resize() {
  const c = container.value
  if (!c || !renderer) return
  const w = c.clientWidth, h = c.clientHeight
  if (w === 0 || h === 0) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

function renderVolume() {
  if (!renderer || !volGroup) return
  const vd = props.study.data
  if (!vd) return
  try {
    volGroup.clear()
    const vol = vd.volume
    const [d, h, w] = vd.dimensions
    const step = 2
    const wl = props.study.level, ww = props.study.window
    const lower = wl - ww / 2, upper = wl + ww / 2

    const positions: number[] = [], colors: number[] = []
    const scaleX = 3 / w, scaleY = 3 / h, scaleZ = 3 / d
    for (let z = 0; z < d; z += step) {
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const val = vol[z][y][x]
          let t = (val - lower) / (upper - lower)
          t = Math.max(0, Math.min(1, t))
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
    const mat = new THREE.PointsMaterial({
      size: 0.04, vertexColors: true, blending: THREE.AdditiveBlending,
      depthWrite: true, transparent: true, opacity: 0.8,
    })
    volGroup.add(new THREE.Points(geom, mat))
    const axGeom = new THREE.BufferGeometry()
    axGeom.setAttribute('position', new THREE.Float32BufferAttribute(
      [-2, 0, 0, 2, 0, 0, 0, -2, 0, 0, 2, 0, 0, 0, -2, 0, 0, 2], 3))
    volGroup.add(new THREE.Line(axGeom, new THREE.LineBasicMaterial({ color: 0x30363d })))
  } catch (e: any) {
    emit('render-error', `立体画面渲染失败：${e?.message || '未知错误'}`)
  }
}

function animate() {
  if (disposed || !renderer) return
  animId = requestAnimationFrame(animate)
  controls?.update()
  renderer.render(scene, camera)
}

/** 本格独立缩放（不影响其它格） */
function zoomBy(f: number) {
  if (!camera) return
  camera.zoom = Math.min(8, Math.max(0.5, camera.zoom * f))
  camera.updateProjectionMatrix()
}

/** 恢复本格视角与定位 */
function resetView() {
  if (!camera || !controls) return
  camera.position.copy(HOME_POS)
  camera.zoom = 1
  camera.updateProjectionMatrix()
  controls.target.set(0, 0, 0)
  controls.update()
}

defineExpose({ zoomBy, resetView })

onMounted(() => { initScene(); renderVolume() })
watch(() => props.study.data, renderVolume, { deep: true })
watch(() => [props.study.window, props.study.level], renderVolume)
onUnmounted(() => {
  disposed = true
  cancelAnimationFrame(animId)
  resizeObs?.disconnect()
  controls?.dispose()
  const dom = renderer?.domElement
  renderer?.dispose()
  renderer = null
  if (dom && container.value?.contains(dom)) container.value.removeChild(dom)
})
</script>

<style scoped>
.cell-3d { width: 100%; height: 100%; }
</style>
