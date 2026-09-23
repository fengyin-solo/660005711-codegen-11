import axios from 'axios'
import type { VolumeData } from '@/types'

/**
 * 按 preset 缓存体数据请求，大屏多个宫格挂载同一检查时共享一次加载。
 * 失败的请求不缓存，保证某一格重试时能真正重新发起加载。
 */
const cache = new Map<string, Promise<VolumeData>>()

export function fetchStudyVolume(preset: string): Promise<VolumeData> {
  let p = cache.get(preset)
  if (!p) {
    p = axios.post('/api/volume', { preset, width: 64, height: 64, depth: 64 })
      .then(res => res.data as VolumeData)
      .catch(err => { cache.delete(preset); throw err })
    cache.set(preset, p)
  }
  return p
}

/** 重试前调用，强制下次重新拉取 */
export function evictStudyVolume(preset: string) {
  cache.delete(preset)
}
