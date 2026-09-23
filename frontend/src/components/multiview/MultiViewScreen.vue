<template>
  <teleport to="body">
    <div class="mvs-overlay">
      <!-- 顶部工具栏 -->
      <div class="mvs-toolbar">
        <div class="tb-title">🖥️ 多视图阅片大屏</div>

        <div class="tb-group">
          <span class="tb-label">挂载检查：</span>
          <el-select v-model="newPreset" size="small" style="width:110px">
            <el-option value="brain" label="头部CT" />
            <el-option value="chest" label="胸部CT" />
            <el-option value="abdomen" label="腹部CT" />
          </el-select>
          <el-input v-model="newName" size="small" placeholder="检查名称(可选)"
                    style="width:130px" @keyup.enter="doMount" />
          <el-button size="small" type="primary" @click="doMount">＋ 挂载</el-button>
        </div>

        <div class="tb-group">
          <span class="tb-label">宫格：</span>
          <el-radio-group v-model="layoutChoice" size="small">
            <el-radio-button v-for="o in LAYOUT_OPTIONS" :key="o.label" :value="o.label">
              {{ o.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div class="tb-spacer"></div>
        <el-button size="small" @click="close">退出大屏 ✕</el-button>
      </div>

      <!-- 已挂载检查清单 -->
      <div v-if="store.studies.length" class="mvs-mounts">
        <span class="tb-label">已挂载：</span>
        <el-tag v-for="s in store.studies" :key="s.id" size="small"
                :type="s.status === 'ready' ? 'success' : s.status === 'error' ? 'danger' : 'info'"
                closable @close="store.unmountStudy(s.id)" class="mount-tag">
          {{ s.name }}
          <el-button v-if="s.status === 'error'" link size="small" type="danger"
                     @click.stop="store.loadStudy(s.id)">重试</el-button>
        </el-tag>
      </div>

      <!-- 内容区 -->
      <div class="mvs-content">
        <!-- 空态：没有任何检查可展示 -->
        <div v-if="!store.studies.length" class="mvs-empty">
          <div class="empty-icon">🩻</div>
          <div class="empty-title">暂无检查可展示</div>
          <div class="empty-desc">
            多视图大屏用于把同一份影像的<strong>立体画面</strong>与<strong>横断面 / 冠状面 / 矢状面</strong>
            按自选宫格概览排列，也可同时挂载多个检查对照阅片。
          </div>
          <div class="empty-actions">
            <el-select v-model="newPreset" size="default" style="width:120px">
              <el-option value="brain" label="头部CT" />
              <el-option value="chest" label="胸部CT" />
              <el-option value="abdomen" label="腹部CT" />
            </el-select>
            <el-button type="primary" @click="doMount">挂载首个检查</el-button>
          </div>
        </div>

        <!-- 宫格 -->
        <div v-else class="mvs-grid"
             :style="{ gridTemplateColumns: `repeat(${store.layout.cols}, 1fr)`,
                       gridTemplateRows: `repeat(${store.layout.rows}, 1fr)` }">
          <GridViewCell v-for="i in store.capacity" :key="i - 1" :index="i - 1" />
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMultiViewStore, LAYOUT_OPTIONS } from '@/store/multiview'
import GridViewCell from './GridViewCell.vue'

const store = useMultiViewStore()
const newPreset = ref('brain')
const newName = ref('')

const layoutChoice = computed({
  get: () => `${store.layout.rows}×${store.layout.cols}`,
  set: (label: string) => {
    const o = LAYOUT_OPTIONS.find(x => x.label === label)
    if (o) store.setLayout(o.rows, o.cols)
  },
})

async function doMount() {
  await store.mountStudy(newPreset.value, newName.value.trim() || undefined)
  newName.value = ''
}

function close() { store.closeScreen() }
</script>

<style scoped>
.mvs-overlay { position: fixed; inset: 0; z-index: 2000; background: #010409;
  display: flex; flex-direction: column; }
.mvs-toolbar { display: flex; align-items: center; gap: 16px; padding: 8px 16px;
  background: #161b22; border-bottom: 1px solid #30363d; flex: none; flex-wrap: wrap; }
.tb-title { color: #58a6ff; font-size: 14px; font-weight: 600; }
.tb-group { display: flex; align-items: center; gap: 6px; }
.tb-label { color: #8b949e; font-size: 12px; white-space: nowrap; }
.tb-spacer { flex: 1; }
.mvs-mounts { display: flex; align-items: center; gap: 6px; padding: 6px 16px;
  background: #0d1117; border-bottom: 1px solid #30363d; flex: none; flex-wrap: wrap; }
.mount-tag { display: inline-flex; align-items: center; gap: 4px; }
.mvs-content { flex: 1; min-height: 0; padding: 10px; }
.mvs-grid { display: grid; gap: 8px; width: 100%; height: 100%; }

.mvs-empty { height: 100%; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px; text-align: center; }
.empty-icon { font-size: 56px; opacity: 0.5; }
.empty-title { color: #c9d1d9; font-size: 18px; font-weight: 600; }
.empty-desc { color: #8b949e; font-size: 13px; line-height: 1.8; max-width: 560px; }
.empty-desc strong { color: #c9d1d9; font-weight: 600; }
.empty-actions { display: flex; gap: 10px; margin-top: 8px; }
</style>
