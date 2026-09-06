<template>
  <div v-if="shouldRender" class="effect-params" :class="{ compact }">
    <ParamKnob v-for="id in visibleIds" :key="id" :paramId="id" :compact="compact" />
    <DeviceNotice v-if="firstError" variant="error" subtle :text="firstError ?? ''" />
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import ParamKnob from './ParamKnob.vue';
import DeviceNotice from './DeviceNotice.vue';
import { useDeviceSettings } from '../composables/useDeviceSettings';
import { EFFECT_PARAM_IDS, type EffectType, type ParamId } from '../midi/sysex/zoomL6/params';

interface EfxOption {
  label: string;
  value: number;
}

interface Props {
  /** Current CC value of the selected internal effect (`GlobalControls.values.efxType`). */
  efxType: number;
  efxOptions: EfxOption[];
  mixerType: 'l6' | 'l6max';
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
});

const deviceSettings = useDeviceSettings();

/** Maps an `efxType` radio option label to the internal-effect registry key. "AI NR" has no params. */
const LABEL_TO_EFFECT_TYPE: Readonly<Record<string, EffectType>> = {
  Hall: 'hall',
  Room: 'room',
  Spring: 'spring',
  Delay: 'delay',
  Echo: 'echo',
};

// Hardware may send any CC value for the selected effect, not just the option's own value, so we
// map by "largest option.value <= efxType" rather than requiring an exact match.
const effectType = computed<EffectType | null>(() => {
  const options = props.efxOptions;
  if (options.length === 0) return null;
  const atOrBelow = options.filter((o) => o.value <= props.efxType);
  const match =
    atOrBelow.length > 0
      ? atOrBelow.reduce((best, o) => (o.value > best.value ? o : best))
      : options.reduce((lowest, o) => (o.value < lowest.value ? o : lowest));
  return LABEL_TO_EFFECT_TYPE[match.label] ?? null;
});

const ids = computed<readonly [ParamId, ParamId] | null>(() =>
  effectType.value ? EFFECT_PARAM_IDS[effectType.value] : null,
);

const visibleIds = computed<ParamId[]>(() => (ids.value ?? []).filter((id) => deviceSettings.isAvailable(id)));

const shouldRender = computed(() => visibleIds.value.length > 0);

const firstError = computed<string | null>(() => {
  for (const id of visibleIds.value) {
    const message = deviceSettings.errors[id];
    if (message) return message;
  }
  return null;
});

// Only hold the editor link open while there is actually something to show — mounting this
// component should not force the session open when the registry is unverified and hidden.
let releaseLink: (() => void) | null = null;
watch(
  shouldRender,
  (should) => {
    if (should && !releaseLink) {
      releaseLink = deviceSettings.acquire();
    } else if (!should && releaseLink) {
      releaseLink();
      releaseLink = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  releaseLink?.();
  releaseLink = null;
});

// Re-read the visible params whenever the effect type changes (or newly becomes visible) and the
// link is open, and also once the link transitions to "open" while params are already visible.
watch(visibleIds, (idsNow) => {
  if (idsNow.length > 0 && deviceSettings.link.value === 'open') {
    void deviceSettings.refresh(idsNow);
  }
});

watch(
  () => deviceSettings.link.value,
  (link) => {
    if (link === 'open' && visibleIds.value.length > 0) {
      void deviceSettings.refresh(visibleIds.value);
    }
  },
);
</script>

<style scoped>
.effect-params {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.effect-params.compact {
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
}

@media (max-width: 480px) {
  .effect-params {
    flex-direction: column;
    align-items: center;
  }
}
</style>
