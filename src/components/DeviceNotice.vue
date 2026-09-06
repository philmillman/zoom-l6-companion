<script setup lang="ts">
export type DeviceNoticeVariant = 'success' | 'error' | 'warn' | 'info';

interface Props {
  variant?: DeviceNoticeVariant;
  text?: string;
  /** Render as an inline hint (no filled box) instead of a banner. */
  subtle?: boolean;
}

withDefaults(defineProps<Props>(), {
  variant: 'info',
  text: '',
  subtle: false,
});
</script>

<template>
  <div
    class="device-notice"
    :class="[`device-notice--${variant}`, { 'device-notice--subtle': subtle }]"
    role="status"
  >
    <slot>{{ text }}</slot>
  </div>
</template>

<style scoped>
.device-notice {
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 12px 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  color: #ccc;
}

.device-notice--success {
  background: rgba(76, 175, 80, 0.15);
  border-color: rgba(76, 175, 80, 0.35);
  color: #a5d6a7;
}

.device-notice--error {
  background: rgba(244, 67, 54, 0.12);
  border-color: rgba(244, 67, 54, 0.35);
  color: #ffcdd2;
}

.device-notice--warn {
  background: rgba(255, 152, 0, 0.12);
  border-color: rgba(255, 152, 0, 0.35);
  color: #ffcc80;
}

.device-notice--info {
  background: rgba(74, 144, 226, 0.12);
  border-color: rgba(74, 144, 226, 0.35);
  color: #b3d1f5;
}

/* Inline hint variant: the plain-text style the mass-storage hints used. */
.device-notice--subtle {
  background: none;
  border-color: transparent;
  padding: 0;
  color: #888;
}

.device-notice--subtle.device-notice--warn {
  color: #ffb74d;
}

.device-notice--subtle.device-notice--error {
  color: #ef9a9a;
}

.device-notice--subtle.device-notice--success {
  color: #a5d6a7;
}

.device-notice--subtle.device-notice--info {
  color: #8ab4e8;
}
</style>
