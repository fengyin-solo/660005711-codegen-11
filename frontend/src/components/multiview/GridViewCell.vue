<template>
  <div class="gv-cell">
    <div class="gv-cell-head">
      <select v-model="studyId" class="mini-select" title="选择检查">
        <option value="" disabled>选择检查</option>
        <option v-for="s in store.studies" :key="s.id" :value="s.id">
          {{ s.name }}{{ s.status !== 'ready' ? `（${statusText(s.status)}）` : '' }}
        </option>
      </select>
      <select v-model="view" class="mini-select mini-view" title="选择视图">
        <option v-for="v in VIEW_OPTIONS" :key="v.value" :value="v.value">{{ v.label }}</option>
      </select>
      <div class="cell-tools">
        <button class="mini-btn" title="放大" @click="zoom(1.25)">+</button>
        <button class="mini-btn" title="缩小" @click="zoom(1 / 1.25)">−</button>
        <button class="mini-btn" title="复位定位" @click="resetView">⟲</button>
        <button v-if="binding" class="mini-btn danger" title="移出此格" @click="unbind">×</button>
      </div>
    </div>

    <div class="gv-cell-body">
      <template v-if="!binding">
        <div class="cell-hint">空槽位：请在上方选择检查与视图</div>
      </template>
      <template v-else-if="!study">
        <div class="cell-hint">检查已卸载，请重新选择</div>
      </template>
      <template v-else-if="study.status === 'loading'">
        <div class="cell-state"><el-icon class="is-loading"><Loading /></el-icon>
          <span>正在加载 {{ study.name }}…</span></div>
      </template>
      <template v-else-if="study.status === 'error'">
        <div class="cell-state cell-error">
          <div class="err-text">⚠ 数据加载失败{{ study.error ? `：${study.error}` : '' }}</div>
          <el-button size="small" type="primary" @click="retryStudy">重试</el-button>
        </div>
      </template>
      <template v-else-if="renderError">
        <div class="cell-state cell-error">
          <div class="err-text">⚠ {{ renderError }}</div>
          <el-button size="small" type="primary" @click="retryRender">重试该格</el-button>
        </div>
      </template>
      <template v-else>
        <VolumeCell3D v-if="view === 'volume'" :key="`3d-${retryKey}`"
                      ref="childRef" :study="study" @render-error="onRenderError" />
        <SliceCell2D v-else :key="`2d-${retryKey}`"
                     ref="childRef" :study="study" :plane="view" :cell-index="index"
                     @render-error="onRenderError" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onErrorCaptured, shallowRef } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useMultiViewStore, VIEW_OPTIONS } from '@/store/multiview'
import type { StudyStatus, ViewKind } from '@/types'
import VolumeCell3D from './VolumeCell3D.vue'
import SliceCell2D from './SliceCell2D.vue'

const props = defineProps<{ index: number }>()
const store = useMultiViewStore()

interface CellChild { zoomBy(f: number): void; resetView(): void }
const childRef = shallowRef<CellChild | null>(null)
const renderError = ref('')
const retryKey = ref(0)

const binding = computed(() => store.bindings[props.index] || null)
const studyId = computed<string>({
  get: () => binding.value?.studyId || '',
  set: (id: string) => {
    if (!id) return
    store.bindCell(props.index, id, binding.value?.view || 'volume')
    renderError.value = ''
  },
})
const view = computed<ViewKind>({
  get: () => binding.value?.view || 'volume',
  set: (v: ViewKind) => {
    if (binding.value) store.bindCell(props.index, binding.value.studyId, v)
    renderError.value = ''
  },
})
const study = computed(() =>
  binding.value ? store.getStudy(binding.value.studyId) : undefined)

function statusText(s: StudyStatus) {
  return s === 'loading' ? '加载中' : s === 'error' ? '失败' : ''
}

function unbind() { store.unbindCell(props.index) }

function zoom(f: number) {
  // 仅对当前格生效；未就绪时无操作
  childRef.value?.zoomBy(f)
  // 2D 组件 zoomBy 内部直接改 store；3D 组件仅改相机
}
function resetView() { childRef.value?.resetView() }

function onRenderError(msg: string) { renderError.value = msg }
function retryRender() {
  renderError.value = ''
  retryKey.value++ // 强制只重建这一格的渲染组件，其它格不受影响
}
function retryStudy() {
  if (binding.value) store.loadStudy(binding.value.studyId)
}

// 捕获子渲染组件内部抛出的同步/生命周期错误，避免单个格拖垮整个大屏
onErrorCaptured((err) => {
  renderError.value = (err as Error)?.message || '该格渲染失败'
  return false
})
</script>

<style scoped>
.gv-cell { display: flex; flex-direction: column; min-width: 0; min-height: 0;
  background: #0d1117; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; }
.gv-cell-head { display: flex; align-items: center; gap: 4px; padding: 4px 6px;
  background: #161b22; border-bottom: 1px solid #30363d; flex: none; }
.mini-select { background: #0d1117; color: #c9d1d9; border: 1px solid #30363d;
  border-radius: 3px; font-size: 11px; padding: 2px 3px; max-width: 46%; outline: none; }
.mini-view { max-width: 84px; }
.cell-tools { margin-left: auto; display: flex; gap: 2px; }
.mini-btn { width: 20px; height: 20px; line-height: 1; padding: 0; font-size: 12px;
  background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 3px; cursor: pointer; }
.mini-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.mini-btn.danger:hover { color: #f85149; border-color: #f85149; }
.gv-cell-body { flex: 1; position: relative; min-height: 0; }
.cell-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #484f58; font-size: 12px; padding: 12px; text-align: center; }
.cell-state { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 8px;
  align-items: center; justify-content: center; color: #8b949e; font-size: 12px; padding: 12px; text-align: center; }
.cell-error .err-text { color: #f0883e; font-size: 12px; line-height: 1.5; }
</style>
