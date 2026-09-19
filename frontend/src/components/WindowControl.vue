<template>
  <div class="panel">
    <h4>🎚️ 窗宽窗位调节</h4>
    <div class="preset-row">
      <el-button v-for="(p, k) in presets" :key="k" size="small" @click="apply(k)" :type="active===k?'primary':''">{{ k }}</el-button>
    </div>
    <div class="slider-row">
      <span>窗宽: {{ store.windowVal }}</span>
      <input type="range" :min="10" :max="3000" v-model.number="store.windowVal" @input="onChange"/>
    </div>
    <div class="slider-row">
      <span>窗位: {{ store.levelVal }}</span>
      <input type="range" :min="-1000" :max="1000" v-model.number="store.levelVal" @input="onChange"/>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useImagingStore } from '../store/imaging'
const store = useImagingStore()
const active = ref('')

const defaultPresets: Record<string, any> = {
  lung: { window: 1500, level: -600 },
  mediastinum: { window: 350, level: 50 },
  bone: { window: 2000, level: 300 },
  brain: { window: 80, level: 40 },
  abdomen: { window: 400, level: 40 },
}

const presets = computed(() => store.volumeData?.windowPresets || defaultPresets)

function apply(k: string) {
  active.value = k
  const p = presets.value[k]
  if (p) { store.windowVal = p.window; store.levelVal = p.level }
}
function onChange() { active.value = '' }
</script>

<style scoped>
.panel { background:#161b22; border-radius:6px; padding:10px; border:1px solid #30363d }
.panel h4 { color:#58a6ff; font-size:12px; margin-bottom:8px }
.preset-row { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px }
.slider-row { display:flex; align-items:center; gap:8px; margin:6px 0; font-size:11px; color:#8b949e }
.slider-row input { flex:1; accent-color:#58a6ff }
</style>