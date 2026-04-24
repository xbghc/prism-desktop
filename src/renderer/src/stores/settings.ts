import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_SETTINGS, type Settings } from '../../../shared/types'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const loaded = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  async function load(): Promise<void> {
    lastError.value = null
    try {
      settings.value = await window.prism.settings.get()
      loaded.value = true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
    }
  }

  async function update(patch: Partial<Settings>): Promise<Settings | null> {
    saving.value = true
    lastError.value = null
    try {
      const next = await window.prism.settings.update(patch)
      settings.value = next
      return next
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return null
    } finally {
      saving.value = false
    }
  }

  return {
    settings,
    loaded,
    saving,
    lastError,
    load,
    update
  }
})
