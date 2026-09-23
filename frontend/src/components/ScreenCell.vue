<template>
  <div class="screen-cell" :class="{ failed: loadError || viewError }">
    <template v-if="cell.studyId">
      <div class="cell-head">
        <el-select
          :model-value="cell.studyId" size="small" class="study-select"
          :loading="screen.studiesLoading"
          @change="(id: string) => screen.mountStudy(id, index)"
        >
          <el-option
            v-for="s in screen.studies" :key="s.id"
            :value="s.id" :label="`${s.id} · ${s.bodyPart} · ${s.patient}`"
          />
        </el-select>
        <div class="view-tabs">
          <button
            v-for="v in viewTypes" :key="v"
            class="vtab" :class="{ active: cell.view === v }"
            @click="screen.setCellView(index, v)"
          >{{ VIEW_LABELS[v] }}</button>
        </div>
        <button class="close-cell" title="卸载该格" @click="screen.clearCell(index)">×</button>
      </div>

      <div class="cell-body">
        <div v-if="!study" class="cell-state">
          <span v-if="screen.studiesLoading">检查信息加载中…</span>
          <template v-else>
            <span class="err-text">检查信息缺失，可能已被移除</span>
            <el-button size="small" @click="screen.loadStudies()">刷新检查列表</el-button>
          </template>
        </div>

        <div v-else-if="loading" class="cell-state"><span>影像数据加载中…</span></div>

        <div v-else-if="loadError" class="cell-state">
          <div class="err-title">该格数据加载失败</div>
          <div class="err-text">{{ loadError }}</div>
          <el-button size="small" type="primary" @click="retry">重试此格</el-button>
        </div>

        <div v-else-if="viewError" class="cell-state">
          <div class="err-title">该格渲染失败</div>
          <div class="err-text">{{ viewError }}</div>
          <el-button size="small" type="primary" @click="retry">重试此格</el-button>
        </div>

        <template v-else-if="volume">
          <ScreenVolumeView
            v-if="cell.view === 'volume'"
            :key="'v' + renderKey" :volume="volume" @error="onViewError"
          />
          <ScreenSliceView
            v-else
            :key="'s' + cell.view + renderKey" :volume="volume" :view="cell.view"
          />
        </template>
      </div>
    </template>

    <button v-else class="empty-cell" @click="emit('mount-request', index)">
      <span class="plus">＋</span>
      <span>挂载检查到此格</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onErrorCaptured } from 'vue'
import { useScreenStore } from '../store/screen'
import { fetchStudyVolume, evictStudyVolume } from '../services/volumeCache'
import { VIEW_LABELS } from '../types'
import type { VolumeData, ViewType } from '../types'
import ScreenVolumeView from './ScreenVolumeView.vue'
import ScreenSliceView from './ScreenSliceView.vue'

const props = defineProps<{ index: number }>()
const emit = defineEmits<{ (e: 'mount-request', index: number): void }>()
const screen = useScreenStore()

const viewTypes: ViewType[] = ['volume', 'axial', 'coronal', 'sagittal']
const cell = computed(() => screen.cells[props.index])
const study = computed(() => screen.studyById(cell.value.studyId))

const volume = ref<VolumeData | null>(null)
const loading = ref(false)
const loadError = ref('')
const viewError = ref('')
const renderKey = ref(0)

async function load() {
  volume.value = null
  viewError.value = ''
  loadError.value = ''
  const s = study.value
  if (!s) return // 等检查列表就绪
  loading.value = true
  try {
    volume.value = await fetchStudyVolume(s.preset)
  } catch (e: any) {
    loadError.value = e?.response?.data?.detail || e?.message || '网络异常，影像加载失败'
  } finally {
    loading.value = false
  }
}

function retry() {
  const s = study.value
  if (s) evictStudyVolume(s.preset)
  renderKey.value++
  load()
}

function onViewError(msg: string) { viewError.value = msg }

// 挂载的检查变化（含重试、切换检查）时独立加载，失败仅影响本格
watch(study, load, { immediate: true })

// 子视图渲染阶段抛出的异常只标记该格，不影响其它宫格
onErrorCaptured((err) => {
  viewError.value = (err as Error)?.message || '渲染失败'
  return false
})
</script>

<style scoped>
.screen-cell { background: #161b22; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.screen-cell.failed { border-color: #f85149; }
.cell-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: #0d1117; border-bottom: 1px solid #30363d; flex: none; }
.study-select { width: 210px; max-width: 46%; flex: 1 1 auto; }
.view-tabs { display: flex; gap: 2px; flex: 1 1 auto; justify-content: center; }
.vtab { border: 1px solid #30363d; background: #161b22; color: #8b949e; border-radius: 3px; font-size: 11px; padding: 2px 8px; cursor: pointer; }
.vtab:hover { color: #58a6ff; border-color: #58a6ff; }
.vtab.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
.close-cell { border: none; background: none; color: #8b949e; font-size: 16px; cursor: pointer; line-height: 1; padding: 0 4px; flex: none; }
.close-cell:hover { color: #f85149; }
.cell-body { flex: 1; min-height: 0; position: relative; }
.cell-state { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #8b949e; font-size: 12px; padding: 12px; text-align: center; }
.err-title { color: #f85149; font-size: 13px; font-weight: 600; }
.err-text { color: #8b949e; font-size: 11px; max-width: 90%; word-break: break-all; }
.empty-cell { flex: 1; min-height: 120px; border: 1px dashed #30363d; border-radius: 6px; background: transparent; color: #484f58; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; font-size: 12px; }
.empty-cell:hover { border-color: #58a6ff; color: #58a6ff; }
.plus { font-size: 22px; line-height: 1; }
</style>
