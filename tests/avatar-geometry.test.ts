import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createParametricAvatar } from '../src/components/AvatarGenerator';
import type { BodyPhotoProfile, CalculatedBodyDimensions, ClothingOptions, DimensionMetric } from '../src/types/body';

const baseValues = {
  height:178, headHeight:23.5, headWidth:15.5, neckLength:9.5,
  neckWidth:12, neckDepth:11, neckCircumference:36.15,
  shoulderWidth:46.5, shoulderSlopeDeg:12, torsoLength:63.5, inseam:81.5,
  chestWidth:34, chestDepth:24.4, chestCircumference:92.5,
  waistWidth:28, waistDepth:21.5, waistCircumference:78,
  hipWidth:33, hipDepth:25, hipCircumference:91.5, bellyProtrusion:0.5,
  upperArmLength:31, forearmLength:26, upperArmWidth:10, upperArmDepth:10,
  forearmWidth:8, forearmDepth:7.5, thighWidth:17.5, thighDepth:18,
  calfWidth:12, calfDepth:12.3, thighLength:42, calfLength:39.5,
  armLength:57, upperArmGirth:31.4, forearmGirth:24.4,
  thighCircumference:55.8, calfCircumference:38.2,
};
function dimensions(change: Partial<typeof baseValues> = {}): CalculatedBodyDimensions {
  const values = { ...baseValues, ...change };
  const metrics = Object.fromEntries(Object.entries(values).map(([key,value]) => [key,{
    key, name:key, nameKo:key, value, source:'manual', confidence:0,
  } satisfies DimensionMetric]));
  return { ...metrics, torsoToLegRatio:63.5/81.5, headRatio:178/23.5,
    bodyType:'직사각형(Rectangle)', calculationSteps:[],
  } as unknown as CalculatedBodyDimensions;
}
const clothing: ClothingOptions = {
  topType:'none', bottomType:'none', fit:'regular',
  topColor:'#2563eb', bottomColor:'#1e293b',
  alterations:{enabled:false,waistAdjustment:0,hemShorten:0,sleeveShorten:0,shoulderSlim:0},
};
function close(actual:number,expected:number,tolerance=0.2) {
  assert.ok(Math.abs(actual-expected)<=tolerance, actual+' differs from '+expected);
}
function allBodyVertices(group:THREE.Group) {
  const vertices:THREE.Vector3[]=[];
  group.updateMatrixWorld(true);
  group.getObjectByName('AnatomicalBody')!.traverse(o=>{
    if (o instanceof THREE.Mesh) {
      const p=o.geometry.getAttribute('position');
      for (let i=0;i<p.count;i++) vertices.push(
        new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));
    }
  });
  return vertices;
}
test('body crown, head, neck and crotch use the same measured metre scale',()=>{
  const a=createParametricAvatar(dimensions(),clothing,false);
  close(a.measurements.measuredHeight,178,0.1);
  close(a.measurements.measuredHeadHeight,23.5,0.1);
  close(a.measurements.measuredNeckLength,9.5,0.1);
  close(a.measurements.measuredTorsoLength,63.5,0.1);
  close(a.measurements.measuredInseam,81.5,0.1);
  close(a.measurements.measuredShoulderWidth,46.5,0.1);
  const vertices=allBodyVertices(a.group);
  close(Math.max(...vertices.map(v=>v.y))*100,178,0.1);
  close(Math.min(...vertices.map(v=>v.y))*100,0,0.1);
});
test('body surfaces have finite positions and normals without giant deltoid spheres',()=>{
  const a=createParametricAvatar(dimensions(),clothing,false);
  a.group.traverse(o=>{
    if (!(o instanceof THREE.Mesh)) return;
    for (const key of ['position','normal']) {
      const p=o.geometry.getAttribute(key);
      for (let i=0;i<p.count;i++)
        assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)),o.name+' '+key);
    }
  });
  const S=(178-23.5-9.5)/100;
  const nearShoulder=allBodyVertices(a.group).filter(v=>v.y>S-0.04&&v.y<S+0.02);
  const width=Math.max(...nearShoulder.map(v=>v.x))-Math.min(...nearShoulder.map(v=>v.x));
  assert.ok(width<0.465+0.10,'shoulder bulge must not add a full upper-arm diameter on each side');
});
test('neck length and circumference deform their surface while height stays fixed',()=>{
  const a=createParametricAvatar(dimensions(),clothing,false);
  const before={...a.measurements};
  const changed=a.updateBiometrics(dimensions({neckLength:12,neckWidth:14,neckDepth:13}),clothing,false);
  close(changed.measuredHeight,178,0.1);
  close(changed.measuredNeckLength,12,0.1);
  assert.ok(changed.measuredNeckGirth>before.measuredNeckGirth+5);
  assert.ok(changed.measuredTorsoLength<before.measuredTorsoLength-2);
});
test('unrelated limb girths are changed independently and measured from geometry',()=>{
  const a=createParametricAvatar(dimensions(),clothing,false);
  const before={...a.measurements};
  // Circumference metrics deliberately stay unchanged: copying them is not enough.
  const changed=a.updateBiometrics(dimensions({
    upperArmWidth:14,upperArmDepth:13,thighWidth:20,calfWidth:14,
  }),clothing,false);
  assert.ok(changed.measuredUpperArmGirth>before.measuredUpperArmGirth+8);
  assert.ok(changed.measuredThighGirth>before.measuredThighGirth+3);
  assert.ok(changed.measuredCalfGirth>before.measuredCalfGirth+2);
  close(changed.measuredForearmGirth,before.measuredForearmGirth,0.1);
  close(changed.measuredHeight,before.measuredHeight,0.1);
  close(changed.measuredWaistCircumference,before.measuredWaistCircumference,0.1);
});
test('geometry validation exposes inconsistent requested dimensions instead of echoing them',()=>{
  const a=createParametricAvatar(dimensions({torsoLength:100,armLength:100}),clothing,false);
  close(a.measurements.measuredTorsoLength,63.5,0.1);
  close(a.measurements.measuredArmLength,57,0.1);
  assert.notEqual(a.measurements.measuredTorsoLength,100);
  assert.notEqual(a.measurements.measuredArmLength,100);
});
test('changing sleeve, hem, fit and colours does not alter body measurements',()=>{
  const a=createParametricAvatar(dimensions(),clothing,false);
  const before={...a.measurements};
  const after=a.updateBiometrics(dimensions(),{
    ...clothing,topType:'oxford_shirt',bottomType:'wide_chinos',fit:'oversized',
    topColor:'#aa3344',bottomColor:'#223344',
    alterations:{enabled:true,waistAdjustment:4,hemShorten:-12,sleeveShorten:-7,shoulderSlim:0},
  },true);
  assert.deepEqual(after,before);
  assert.ok(a.clothesGroup.children.length>=6);
  assert.ok(a.tapeRingsGroup.children.length>=3);
});
test('same dimension data reconstructs the same vertices and measured sections',()=>{
  const a=createParametricAvatar(dimensions(),clothing,false);
  const b=createParametricAvatar(dimensions(),clothing,false);
  assert.deepEqual(a.measurements,b.measurements);
  assert.deepEqual(allBodyVertices(a.group).map(v=>v.toArray()),allBodyVertices(b.group).map(v=>v.toArray()));
});
test('observed thigh and calf lengths retain the photographed knee and ankle heights',()=>{
  const a=createParametricAvatar(dimensions({thighLength:42,calfLength:34}),clothing,false);
  const anchors=a.group.userData.anatomicalReferences;
  assert.equal(anchors.hasFootObservation,true);
  close(anchors.ankleY*100,81.5-42-34,0.01);
  close((anchors.kneeY-anchors.ankleY)*100,34,0.01);
  close((anchors.crotchY-anchors.kneeY)*100,42,0.01);
  for (const side of ['Left', 'Right']) {
    const foot = a.group.getObjectByName(`${side}Foot`) as THREE.Mesh;
    const leg = a.group.getObjectByName(`${side}LegSurface`) as THREE.Mesh;
    const footBounds = new THREE.Box3().setFromObject(foot);
    const legBounds = new THREE.Box3().setFromObject(leg);
    close(footBounds.min.y, 0, 0.0001);
    assert.ok(footBounds.max.y > legBounds.min.y, 'foot must overlap the ankle');
  }
  const torso=a.group.getObjectByName('TorsoNeckSurface') as THREE.Mesh;
  const p=torso.geometry.getAttribute('position'),n=torso.geometry.getAttribute('normal');
  let frontNormals=0;
  for(let i=0;i<p.count;i++) if(Math.abs(p.getX(i))<0.001&&p.getZ(i)>0.08&&p.getY(i)>1.15&&p.getY(i)<1.35){
    assert.ok(n.getZ(i)>0.5,'torso front faces must point outward');frontNormals++;
  }
  assert.ok(frontNormals>5);
});
test('torso section heights use the same shoulder-to-crotch levels as photo observations',()=>{
  const a=createParametricAvatar(dimensions(),clothing,false);
  const refs=a.group.userData.anatomicalReferences;
  const fromPhotoY=(fraction:number)=>refs.shoulderY-(refs.shoulderY-refs.crotchY)*fraction;
  close(refs.chestY*100,fromPhotoY(0.25)*100,0.001);
  close(refs.waistY*100,fromPhotoY(0.62)*100,0.001);
  close(refs.hipY*100,fromPhotoY(0.83)*100,0.001);
  close(refs.bellyY*100,fromPhotoY(0.52)*100,0.001);
  assert.ok(refs.hipY<refs.waistY&&refs.waistY<refs.bellyY&&refs.bellyY<refs.chestY);
  close(a.measurements.measuredWaistCircumference,78,0.2);
});
test('turntable world translation, rotation and scale do not change avatar-local measurements',()=>{
  const a=createParametricAvatar(dimensions(),clothing,false);
  const before={...a.measurements};
  const turntable=new THREE.Group();turntable.add(a.group);
  turntable.position.set(0.12,0.042,-0.18);
  turntable.rotation.set(0.03,0.6,0.01);
  turntable.scale.set(1.1,0.9,1.05);
  turntable.updateMatrixWorld(true);
  const after=a.updateBiometrics(dimensions(),clothing,false);
  assert.deepEqual(after,before);
  close(after.measuredInseam,81.5,0.1);
});

test('distinct photo cross sections change projected geometry while manual anchors stay fixed', () => {
  const profile = (wider: boolean): BodyPhotoProfile => ({
    torso: [0.55, 0.60, 0.65].map(t => ({
      t, widthCm: wider ? 35 : 27, depthCm: wider ? 27 : 19,
      centerXCm: wider ? 2 : 0, centerZCm: wider ? 2 : 0,
    })),
    head: [{t: 0.50, widthCm: wider ? 17 : 14, depthCm: 19, centerXCm: 0}],
    neck: [{t: 0.60, widthCm: wider ? 13 : 10, depthCm: 11, centerXCm: 0}],
    arms: [[{t: 0.22, widthCm: wider ? 9 : 6, centerXCm: -24}], []],
    legs: [[{t: 0.30, widthCm: wider ? 13 : 10, centerXCm: wider ? -11 : -9}], []],
  });
  const fitted = dimensions({bellyProtrusion: 0});
  const a = createParametricAvatar({...fitted, photoShape: profile(false)}, clothing, false);
  const b = createParametricAvatar({...fitted, photoShape: profile(true)}, clothing, false);
  const slice = (group: THREE.Group, meshName: string, y: number) => {
    const mesh = group.getObjectByName(meshName) as THREE.Mesh;
    const points = mesh.geometry.getAttribute('position');
    const box = new THREE.Box3();
    for (let i = 0; i < points.count; i++) {
      if (Math.abs(points.getY(i) - y) < 1e-5) {
        box.expandByPoint(new THREE.Vector3().fromBufferAttribute(points, i));
      }
    }
    assert.ok(!box.isEmpty(), meshName);
    return box;
  };
  const {crotchY, shoulderY, chinY, ankleY} = a.group.userData.anatomicalReferences;
  const y = THREE.MathUtils.lerp(crotchY, shoulderY, 0.60);
  const narrow = slice(a.group, 'TorsoNeckSurface', y);
  const wide = slice(b.group, 'TorsoNeckSurface', y);
  close(wide.getSize(new THREE.Vector3()).x * 100, 35, 0.1);
  close(narrow.getSize(new THREE.Vector3()).z * 100, 19, 0.1);
  close(wide.getCenter(new THREE.Vector3()).x * 100, 2, 0.1);
  assert.ok(wide.max.z - narrow.max.z > 0.05);
  for (const [meshName, level] of [
    ['NeutralHead', (chinY + 1.78) / 2],
    ['TorsoNeckSurface', THREE.MathUtils.lerp(shoulderY, chinY, 0.60)],
    ['LeftLegSurface', THREE.MathUtils.lerp(ankleY, crotchY, 0.30)],
  ] as const) {
    assert.ok(slice(b.group, meshName, level).getSize(new THREE.Vector3()).x >
      slice(a.group, meshName, level).getSize(new THREE.Vector3()).x + 0.02, meshName);
  }
  for (const key of [
    'measuredHeight', 'measuredChestCircumference', 'measuredWaistCircumference',
    'measuredHipCircumference', 'measuredUpperArmGirth', 'measuredThighGirth', 'measuredArmLength',
  ] as const) {
    close(a.measurements[key], b.measurements[key], 0.15);
  }
});
