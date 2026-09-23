<template>
  <div v-if="screen.visible" class="screen-overlay">
    <header class="screen-bar">
      <div class="bar-left">
        <span class="bar-title">📺 多视图阅片大屏</span>
        <el-radio-group v-model="layoutId" size="small">
          <el-radio-button v-for="l in GRID_LAYOUTS" :key="l.id" :value="l.id">{{ l.label }}</el-radio-button>
        </el-radio-group>
      </div>
      <div class="bar-right">
        <span class="mount-label">已挂载：</span>
        <template v-if="screen.mountedStudies.length">
          <el-tag
            v-for="id in screen.mountedStudies" :key="id" closable size="small"
            class="study-chip" @close="screen.unmountStudy(id)"
          >
            {{ chipText(id) }}
          </el-tag>
        </template>
        <span v-else class="mount-none">无</span>
        <el-button size="small" type="primary" @click="openMountDialog()">＋ 挂载检查</el-button>
        <el-button size="small" @click="screen.close()">关闭大屏</el-button>
      </div>
    </header>

    <main class="screen-main">
      <!-- 空态：没有任何检查可展示 -->
      <div v-if="screen.mountedStudies.length === 0" class="empty-state">
        <div class="empty-icon">🗂️</div>
        <div class="empty-title">暂无挂载的检查</div>
        <div class="empty-desc">
          点击「挂载检查」选择一份或多份检查，即可在宫格中同时查看其立体画面与轴位、冠状、矢状切面并对照阅片。
        </div>
        <template v-if="screen.studiesError">
          <div class="empty-err">检查列表加载失败：{{ screen.studiesError }}</div>
          <el-button size="small" type="warning" :loading="screen.studiesLoading" @click="screen.loadStudies()">重新加载检查列表</el-button>
        </template>
        <el-button v-else size="small" type="primary" :loading="screen.studiesLoading" @click="openMountDialog()">挂载检查</el-button>
      </div>

      <!-- 宫格视口 -->
      <div v-else class="cell-grid" :style="gridStyle">
        <ScreenCell
          v-for="(_, i) in cellSlots" :key="i" :index="i"
          @mount-request="openMountDialog"
        />
      </div>
    </main>

    <!-- 挂载检查对话框 -->
    <el-dialog v-model="dialogVisible" title="挂载检查" width="680px" append-to-body>
      <div v-if="screen.studiesLoading" class="dialog-tip">检查列表加载中…</div>
      <div v-else-if="screen.studiesError" class="dialog-tip">
        <span class="err">{{ screen.studiesError }}</span>
        <el-button size="small" type="warning" @click="screen.loadStudies()">重试</el-button>
      </div>
      <table v-else class="study-table">
        <thead>
          <tr><th>检查号</th><th>患者</th><th>部位</th><th>日期</th><th>描述</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="s in screen.studies" :key="s.id">
            <td class="mono">{{ s.id }}</td>
            <td>{{ s.patient }}</td>
            <td>{{ s.bodyPart }}</td>
            <td class="mono">{{ s.date }}</td>
            <td>{{ s.description }}</td>
            <td>
              <el-button size="small" type="primary" @click="mount(s.id)">挂载</el-button>
            </td>
          </tr>
        </tbody>
      </table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useScreenStore } from '../store/screen'
import { GRID_LAYOUTS } from '../types'
import ScreenCell from './ScreenCell.vue'

const screen = useScreenStore()

const layoutId = computed({
  get: () => screen.layoutId,
  set: (id: string) => screen.setLayout(id),
})

const cellSlots = computed(() => Array.from({ length: screen.layout.rows * screen.layout.cols }))
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${screen.layout.cols}, 1fr)`,
  gridTemplateRows: `repeat(${screen.layout.rows}, 1fr)`,
}))

const dialogVisible = ref(false)
/** 从某格发起挂载时记录目标格；undefined 表示挂到第一个空格 */
const targetCell = ref<number | undefined>(undefined)

function openMountDialog(cellIndex?: number) {
  targetCell.value = cellIndex
  dialogVisible.value = true
  if (!screen.studies.length && !screen.studiesLoading) screen.loadStudies()
}

function mount(studyId: string) {
  const ok = screen.mountStudy(studyId, targetCell.value)
  if (ok) {
    if (targetCell.value !== undefined) dialogVisible.value = false
    ElMessage.success('已挂载到大屏宫格')
  } else {
    ElMessage.warning('宫格已满：请切换更大的宫格布局，或在某格的下拉列表中直接更换检查')
  }
}

function chipText(id: string) {
  const s = screen.studyById(id)
  return s ? `${s.id} · ${s.bodyPart} · ${s.patient}` : id
}
</script>

<style scoped>
.screen-overlay { position: fixed; inset: 0; z-index: 2000; background: #0d1117; display: flex; flex-direction: column; }
.screen-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 16px; background: #161b22; border-bottom: 1px solid #30363d; flex: none; }
.bar-left { display: flex; align-items: center; gap: 14px; }
.bar-title { color: #58a6ff; font-size: 14px; font-weight: 600; }
.bar-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mount-label { font-size: 11px; color: #8b949e; }
.mount-none { font-size: 11px; color: #484f58; }
.study-chip { margin-right: 2px; }
.screen-main { flex: 1; min-height: 0; padding: 12px; }
.cell-grid { display: grid; gap: 8px; width: 100%; height: 100%; }
.empty-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 24px; }
.empty-icon { font-size: 56px; }
.empty-title { color: #e6edf3; font-size: 18px; font-weight: 600; }
.empty-desc { color: #8b949e; font-size: 13px; max-width: 520px; line-height: 1.7; }
.empty-err { color: #f85149; font-size: 12px; }
.dialog-tip { padding: 30px 0; text-align: center; color: #8b949e; font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.dialog-tip .err { color: #f85149; }
.study-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.study-table th, .study-table td { border-bottom: 1px solid #30363d; padding: 8px 6px; text-align: left; }
.study-table th { color: #8b949e; font-weight: 500; }
.study-table td { color: #c9d1d9; }
.mono { font-family: monospace; font-size: 11px; }
</style>
