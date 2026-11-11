import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const root = import.meta.dirname;
  const env = loadEnv(mode, root);
  const requiredFiles = [
    'src/main.tsx',
    'src/App.tsx',
    'src/components/AvatarGenerator.ts',
    'src/utils/photoObservation.ts',
  ];
  if (!env.VITE_POSE_MODEL_URL) requiredFiles.push('public/models/pose_landmarker_full.task');
  if (!env.VITE_FACE_MODEL_URL) requiredFiles.push('public/models/face_landmarker.task');
  if (!env.VITE_MEDIAPIPE_WASM_URL) {
    requiredFiles.push(
      'public/mediapipe/wasm/vision_wasm_internal.js',
      'public/mediapipe/wasm/vision_wasm_internal.wasm',
      'public/mediapipe/wasm/vision_wasm_module_internal.js',
      'public/mediapipe/wasm/vision_wasm_module_internal.wasm',
    );
  }
  const missing = requiredFiles.filter(file => !existsSync(path.join(root, file)));
  if (missing.length) {
    throw new Error([
      'FitDimension 프로젝트의 필수 파일이 빠졌습니다.',
      '압축을 푼 프로젝트에서 src와 public 폴더를 원래 경로 그대로 올려 주세요.',
      ...missing.map(file => `- ${file}`),
    ].join('\n'));
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': root,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
