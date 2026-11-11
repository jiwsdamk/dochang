/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CalculatedBodyDimensions, ClothingOptions, ModelMeshMeasurements } from '../types/body';
import { createParametricAvatar, AvatarBuildResult } from './AvatarGenerator';
import {
  RotateCcw,
  Ruler,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';

interface ThreeFittingRoomProps {
  dimensions: CalculatedBodyDimensions;
  photoSource?: 'sample' | 'upload';
  clothingOptions: ClothingOptions;
  showTapeMeasures: boolean;
  onToggleTapeMeasures: () => void;
  onModelMeasurementsUpdated?: (measurements: ModelMeshMeasurements) => void;
}

const cameraViews = [
  { id: 'front', label: '정면' },
  { id: 'left', label: '좌측면' },
  { id: 'right', label: '우측면' },
  { id: 'back', label: '후면' },
  { id: 'quarter', label: '입체' },
  { id: 'close', label: '상체 확대' },
] as const;
type CameraView = (typeof cameraViews)[number]['id'];
const avatarGround = 0.042;

function frameAvatar(camera: THREE.PerspectiveCamera, controls: OrbitControls, height: number, view: CameraView) {
  const distance = height * Math.max(1.85, 0.65 / camera.aspect);
  const center = avatarGround + height / 2;
  const positions: Record<CameraView, [number, number, number]> = {
    front: [0, center, distance],
    left: [-distance, center, 0],
    right: [distance, center, 0],
    back: [0, center, -distance],
    quarter: [distance * 0.68, center + height * 0.12, distance * 0.74],
    close: [0, avatarGround + height * 0.8, height * 0.78],
  };
  // Clear any remaining drag inertia before positioning a preset view.
  controls.enableDamping = false;
  controls.update();
  camera.position.set(...positions[view]);
  controls.target.set(0, view === 'close' ? avatarGround + height * 0.8 : center, 0);
  controls.update();
  controls.enableDamping = true;
}

export const ThreeFittingRoom: React.FC<ThreeFittingRoomProps> = ({
  dimensions,
  photoSource,
  clothingOptions,
  showTapeMeasures,
  onToggleTapeMeasures,
  onModelMeasurementsUpdated,
}) => {
  const onModelMeasurementsUpdatedRef = useRef(onModelMeasurementsUpdated);
  useEffect(() => {
    onModelMeasurementsUpdatedRef.current = onModelMeasurementsUpdated;
  });
  const lastMeasurementsRef = useRef<string>('');

  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const avatarResultRef = useRef<AvatarBuildResult | null>(null);
  const turntableGroupRef = useRef<THREE.Group | null>(null);

  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const autoRotateRef = useRef(false);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  const [renderError, setRenderError] = useState('');
  const [currentCameraView, setCurrentCameraView] = useState<CameraView>('front');

  // Detect Software WebGL
  const isSoftwareGl = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 360;
    const height = mount.clientHeight || 480;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.07);

    // 2. Camera: Facing FRONT (+Z looking towards avatar at origin)
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    const frameHeight = dimensions.height.value / 100;
    camera.position.set(0, frameHeight * 0.55, frameHeight * 1.85);
    cameraRef.current = camera;

    // 3. Renderer
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    }); } catch {
      setRenderError('이 브라우저에서 3D 그래픽을 초기화하지 못했어요. 브라우저의 하드웨어 가속 설정을 확인해 주세요.');
      return;
    }
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.domElement.className = 'block w-full h-full';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.0;
    controls.maxDistance = 6.0;
    controls.maxPolarAngle = Math.PI / 2 + 0.02; // Stop at floor
    controlsRef.current = controls;
    frameAvatar(camera, controls, frameHeight, 'front');

    // 5. Environment Map
    try {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    } catch (e) {
      console.warn('RoomEnvironment fallback', e);
    }

    // 6. Studio Lighting Rig
    // Front Key Light (Warm, focused on face & chest from front right)
    const frontKeyLight = new THREE.DirectionalLight(0xfff7ed, 2.5);
    frontKeyLight.position.set(1.8, 3.2, 3.0);
    frontKeyLight.castShadow = !isSoftwareGl;
    if (frontKeyLight.castShadow) {
      frontKeyLight.shadow.mapSize.width = 1024;
      frontKeyLight.shadow.mapSize.height = 1024;
      frontKeyLight.shadow.camera.near = 0.5;
      frontKeyLight.shadow.camera.far = 10;
      frontKeyLight.shadow.camera.left = -1.5;
      frontKeyLight.shadow.camera.right = 1.5;
      frontKeyLight.shadow.camera.top = 2.5;
      frontKeyLight.shadow.camera.bottom = -0.5;
      frontKeyLight.shadow.bias = -0.0005;
    }
    scene.add(frontKeyLight);

    // Front Fill Light (Cool sky fill from front left)
    const frontFillLight = new THREE.DirectionalLight(0xe0f2fe, 1.4);
    frontFillLight.position.set(-2.0, 2.5, 2.8);
    scene.add(frontFillLight);

    // Ambient Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.0);
    hemiLight.position.set(0, 4, 0);
    scene.add(hemiLight);

    // Rim Silhouette Light (Cool blue from behind for 3D depth separation)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    rimLight.position.set(0, 2.8, -3.2);
    scene.add(rimLight);

    // Soft Overhead Spot
    const overheadSpot = new THREE.SpotLight(0xffffff, 1.2, 8, Math.PI / 4, 0.4);
    overheadSpot.position.set(0, 4.0, 0.4);
    overheadSpot.target.position.set(0, 0.95, 0);
    scene.add(overheadSpot);
    scene.add(overheadSpot.target);

    // 7. ROBLOX-STYLE 3D FITTING ROOM ARCHITECTURE
    // Stage Floor (Dark Luxury Polished Tiles with Grid Accents)
    const floorGeo = new THREE.PlaneGeometry(18, 18);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.32,
      metalness: 0.12,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    // Floor Grid Matrix
    const gridHelper = new THREE.GridHelper(16, 32, 0x1e293b, 0x0f172a);
    gridHelper.position.set(0, 0.002, 0);
    scene.add(gridHelper);

    // Backstage Studio Wall (-Z)
    const wallGeo = new THREE.PlaneGeometry(18, 7);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x090e17,
      roughness: 0.9,
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 3.5, -4.6);
    scene.add(backWall);

    // One-sided trim keeps the backdrop from blocking the rear view.
    const mirrorFrameGeo = new THREE.PlaneGeometry(1.65, 2.55);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Brass Gold
      metalness: 0.85,
      roughness: 0.25,
    });
    const mirrorFrame = new THREE.Mesh(mirrorFrameGeo, frameMat);
    mirrorFrame.position.set(0, 1.28, -2.5);
    scene.add(mirrorFrame);

    const mirrorGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.52, 2.42),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.04,
        metalness: 0.95,
      })
    );
    mirrorGlass.position.set(0, 1.28, -2.47);
    scene.add(mirrorGlass);

    // 8. TURNTABLE STAGE & ORIENTATION DIAL
    const turntableGroup = new THREE.Group();
    turntableGroupRef.current = turntableGroup;
    scene.add(turntableGroup);

    // Circular Pedestal
    const pedestalGeo = new THREE.CylinderGeometry(0.88, 0.95, 0.04, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.5,
      roughness: 0.35,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.set(0, 0.02, 0);
    pedestal.receiveShadow = !isSoftwareGl;
    turntableGroup.add(pedestal);

    // Glowing Neon Ring around turntable
    const neonRingGeo = new THREE.RingGeometry(0.85, 0.88, 48);
    const neonRingMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4, // Cyan glow
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const neonRing = new THREE.Mesh(neonRingGeo, neonRingMat);
    neonRing.rotation.x = -Math.PI / 2;
    neonRing.position.set(0, 0.041, 0);
    turntableGroup.add(neonRing);

    // DIRECTION ARROW ON FLOOR (Pointing directly toward FRONT +Z)
    // Front Cyan Arrow Marker
    const frontArrowGeo = new THREE.ConeGeometry(0.06, 0.12, 16);
    frontArrowGeo.rotateX(-Math.PI / 2);
    const frontArrowMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const frontArrow = new THREE.Mesh(frontArrowGeo, frontArrowMat);
    frontArrow.position.set(0, 0.042, 0.72);
    turntableGroup.add(frontArrow);

    // Floor Text Label "FRONT (정면)" texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▲ FRONT 정면', 128, 42);
    }
    const labelTex = new THREE.CanvasTexture(canvas);
    const labelGeo = new THREE.PlaneGeometry(0.48, 0.12);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
    const frontLabel = new THREE.Mesh(labelGeo, labelMat);
    frontLabel.rotation.x = -Math.PI / 2;
    frontLabel.position.set(0, 0.042, 0.58);
    turntableGroup.add(frontLabel);

    // Back Label "BACK (후면)" texture at -Z
    const backCanvas = document.createElement('canvas');
    backCanvas.width = 256;
    backCanvas.height = 64;
    const bCtx = backCanvas.getContext('2d');
    if (bCtx) {
      bCtx.fillStyle = '#64748b';
      bCtx.font = 'bold 24px sans-serif';
      bCtx.textAlign = 'center';
      bCtx.fillText('▼ BACK 후면', 128, 42);
    }
    const backLabelTex = new THREE.CanvasTexture(backCanvas);
    const backLabel = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: backLabelTex, transparent: true }));
    backLabel.rotation.x = -Math.PI / 2;
    backLabel.rotation.z = Math.PI;
    backLabel.position.set(0, 0.042, -0.62);
    turntableGroup.add(backLabel);

    // Soft Radial Contact Shadow under feet
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(0,0,0,0.7)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.043, 0);
    turntableGroup.add(contactShadow);

    // 9. BUILD PARAMETRIC AVATAR (Faces +Z towards Camera)
    const avatar = createParametricAvatar(dimensions, clothingOptions, showTapeMeasures);
    avatarResultRef.current = avatar;
    avatar.group.position.set(0, avatarGround, 0);
    turntableGroup.add(avatar.group);

    const initialSerialized = JSON.stringify(avatar.measurements);
    lastMeasurementsRef.current = initialSerialized;
    onModelMeasurementsUpdatedRef.current?.(avatar.measurements);

    let animationFrameId: number;
    let previousFrame = performance.now();

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min((time - previousFrame) / 1000, 0.1);
      previousFrame = time;

      // Continuous turntable rotation if enabled
      if (autoRotateRef.current && turntableGroupRef.current) {
        turntableGroupRef.current.rotation.y += delta * 0.5;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      const newWidth = mount.clientWidth;
      const newHeight = mount.clientHeight;
      if (!newWidth || !newHeight) return;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight, false);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        const list = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        list.forEach(material => {
          materials.add(material);
          Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
        });
      });
      if (scene.environment) textures.add(scene.environment);
      geometries.forEach(value => value.dispose());
      materials.forEach(value => value.dispose());
      textures.forEach(value => value.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      cameraRef.current = null;
      controlsRef.current = null;
      avatarResultRef.current = null;
      turntableGroupRef.current = null;
    };
  }, []);

  // Update Avatar Biometrics & Clothing dynamically
  useEffect(() => {
    if (avatarResultRef.current) {
      const newMeasurements = avatarResultRef.current.updateBiometrics(
        dimensions,
        clothingOptions,
        showTapeMeasures
      );
      const serialized = JSON.stringify(newMeasurements);
      if (serialized !== lastMeasurementsRef.current) {
        lastMeasurementsRef.current = serialized;
        onModelMeasurementsUpdatedRef.current?.(newMeasurements);
      }
    }
  }, [dimensions, clothingOptions, showTapeMeasures]);

  const setCameraPreset = (view: CameraView) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    setCurrentCameraView(view);
    setAutoRotate(false);
    autoRotateRef.current = false;
    if (turntableGroupRef.current) turntableGroupRef.current.rotation.y = 0;
    frameAvatar(camera, controls, dimensions.height.value / 100, view);
  };

  // Manual Zoom helpers
  const handleZoom = (inOut: 'in' | 'out') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const factor = inOut === 'in' ? 0.82 : 1.22;
    camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
    controls.update();
  };

  // Manual Quick Orbit helpers
  const handleQuickOrbit = (deg: number) => {
    if (turntableGroupRef.current) {
      turntableGroupRef.current.rotation.y += (deg * Math.PI) / 180;
    }
  };

  return (
    <section aria-label="3D 아바타 피팅룸" className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">3D 아바타 피팅룸</h2>
          <p className="mt-0.5 text-[11px] text-slate-300">
            키 {dimensions.height.value}cm · 어깨 {dimensions.shoulderWidth.value}cm · 허리 {dimensions.waistCircumference.value}cm
          </p>
          {photoSource && (
            <p className="mt-1 text-[11px] text-cyan-200">
              {photoSource === 'sample' ? '내장 예시 사진' : '업로드한 사진'} · {dimensions.photoShape ? '윤곽 기반 체형' : '치수 기반 체형'}
            </p>
          )}
        </div>
        <div role="group" aria-label="3D 조작" className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center divide-x divide-slate-700 rounded-lg border border-slate-700 bg-slate-950">
            <button
              onClick={() => handleZoom('in')}
              aria-label="확대"
              className="p-2.5 text-slate-300 transition-colors hover:text-white"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => handleZoom('out')}
              aria-label="축소"
              className="p-2.5 text-slate-300 transition-colors hover:text-white"
            >
              <ZoomOut size={16} />
            </button>
          </div>
          <button
            onClick={onToggleTapeMeasures}
            aria-pressed={showTapeMeasures}
            className={'flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ' +
              (showTapeMeasures ? 'border-cyan-600 bg-cyan-950 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white')}
          >
            <Ruler size={15} />치수 표시
          </button>
          <button
            onClick={() => setAutoRotate(value => !value)}
            aria-pressed={autoRotate}
            className={'flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ' +
              (autoRotate ? 'border-amber-600 bg-amber-950 text-amber-200' : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white')}
          >
            <RotateCcw size={15} />자동 회전
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col rounded-lg border border-slate-700 bg-slate-900/90">
          <button
            onClick={() => handleQuickOrbit(-45)}
            aria-label="왼쪽으로 45도 회전"
            className="p-2.5 text-slate-300 transition-colors hover:text-white"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={() => handleQuickOrbit(45)}
            aria-label="오른쪽으로 45도 회전"
            className="p-2.5 text-slate-300 transition-colors hover:text-white"
          >
            <RotateCw size={16} />
          </button>
        </div>
        {renderError && (
          <div role="alert" className="absolute inset-0 flex items-center justify-center bg-slate-950 p-6 text-center text-sm text-amber-200">
            {renderError}
          </div>
        )}
      </div>

      <div role="group" aria-label="아바타 시점" className="flex shrink-0 flex-wrap gap-1 border-t border-slate-800 bg-slate-900 p-2">
        {cameraViews.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setCameraPreset(id)}
            aria-pressed={currentCameraView === id}
            className={'min-h-9 flex-1 whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold transition-colors ' +
              (currentCameraView === id ? 'bg-cyan-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
};
