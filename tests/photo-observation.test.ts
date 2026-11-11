import test from 'node:test';
import assert from 'node:assert/strict';
import { observePhotoMask, type Landmark, type PhotoPairObservation } from '../src/utils/photoObservation';
import { calculateBodyDimensions as calculate } from '../src/utils/photoAnalyzer';
import type { BodyInputData } from '../src/types/body';

const input: BodyInputData = {
  calibrationPart:'height',calibrationValue:178,height:178,shoulderWidth:46.5,
  waistCircumference:79,chestCircumference:null,hipCircumference:null,inseam:null,
  armLength:null,headHeight:null,neckLength:null,upperArmGirth:null,thighCircumference:null,
  bellyProtrusion:0,weight:null,gender:'unisex',frontImage:'fixture-front',sideImage:'fixture-side',isSamplePhoto:false,
};

function fixture(side = false, armRadius = 14, legRadius = 18, shoulderY = 145, displayScale = 1) {
  const width = 320, height = 640;
  const mask = new Float32Array(width * height);
  const rect = (x0:number,y0:number,x1:number,y1:number) => {
    for(let y=Math.round(y0);y<=y1;y++)for(let x=Math.round(x0);x<=x1;x++){
      if(x>=0&&x<width&&y>=0&&y<height)mask[y*width+x]=1;
    }
  };
  const ellipse = (cx:number,cy:number,rx:number,ry:number) => {
    for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++){
      if(x>=0&&x<width&&y>=0&&y<height&&((x-cx)/rx)**2+((y-cy)/ry)**2<=1)mask[y*width+x]=1;
    }
  };
  ellipse(160,68,side?33:29,40);
  rect(146,99,174,shoulderY+8);
  for(let y=shoulderY;y<=377;y++){
    const t=(y-shoulderY)/(377-shoulderY);
    const half=side?(35-8*Math.sin(Math.PI*t)):(48-12*Math.sin(Math.PI*t));
    rect(160-half,y,160+half,y);
  }
  if(side){
    rect(151-armRadius,shoulderY+4,151+armRadius,250);
    rect(151-armRadius*.75,250,151+armRadius*.75,332);
    rect(153-legRadius,369,153+legRadius,482);
    rect(153-legRadius*.72,482,153+legRadius*.72,594);
    rect(127,590,175,622);
  }else{
    for(const x of [106,214]){
      rect(x-armRadius,shoulderY-1,x+armRadius,250);
      rect(x-armRadius*.72,250,x+armRadius*.72,330);
    }
    for(const x of [137,183]){
      rect(x-legRadius,369,x+legRadius,482);
      rect(x-legRadius*.72,482,x+legRadius*.72,594);
      rect(x-22,590,x+17,622);
    }
  }
  const pts:Landmark[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
  const set=(i:number,x:number,y:number)=>{pts[i]={x:x/width,y:y/height,visibility:1,presence:1};};
  set(0,side?130:160,65);set(7,side?160:142,66);set(8,side?160:178,66);
  set(2,side?135:172,62);set(5,side?135:148,62);
  set(9,side?133:152,91);set(10,side?135:168,91);
  set(11,side?157:112,shoulderY);set(12,side?162:208,shoulderY);
  set(13,side?151:106,250);set(14,side?154:214,250);
  set(15,side?151:106,326);set(16,side?154:214,326);
  set(23,side?157:137,340);set(24,side?162:183,340);
  set(25,side?153:137,482);set(26,side?157:183,482);
  set(27,side?153:137,590);set(28,side?157:183,590);
  return observePhotoMask(mask,width,height,pts,width*displayScale,height*displayScale,'synthetic-mask');
}
function pair(armRadius=14,legRadius=18,shoulderY=145,scale=1):PhotoPairObservation{
  return {front:fixture(false,armRadius,legRadius,shoulderY,scale),side:fixture(true,armRadius,legRadius,shoulderY,scale)};
}

test('actual foreground mask supplies nonempty observed contours and region spans',()=>{
  const observation=pair();
  assert.ok(observation.front.contour.length>100);
  assert.ok(observation.front.headTop.y < observation.front.chin.y);
  assert.ok(observation.front.chin.y < observation.front.shoulder.y);
  assert.ok(observation.front.shoulder.y < observation.front.crotch.y);
  const {dimensions,analysis}=calculate(input,observation);
  assert.equal(analysis.method,'mediapipe_pose_silhouette');
  assert.equal(analysis.frontImageWidth,320);
  assert.ok(dimensions.headHeight.value>10);
  assert.equal(dimensions.height.value,178);
});

test('same manual anchors with different masks changes unmeasured neck, arm, leg and torso proportions',()=>{
  const a=calculate(input,pair(12,16,140)).dimensions;
  const b=calculate(input,pair(18,21,160)).dimensions;
  assert.equal(a.shoulderWidth.value,b.shoulderWidth.value);
  assert.equal(a.waistCircumference.value,b.waistCircumference.value);
  assert.notEqual(a.neckLength.value,b.neckLength.value);
  assert.notEqual(a.upperArmWidth.value,b.upperArmWidth.value);
  assert.notEqual(a.thighWidth.value,b.thighWidth.value);
  assert.notEqual(a.torsoLength.value,b.torsoLength.value);
  assert.ok(Math.abs(a.height.value-a.headHeight.value-a.neckLength.value-a.torsoLength.value-a.inseam.value)<.25);
});

test('uniform image resize changes pixel observations but not calibrated centimetres',()=>{
  const a=calculate(input,pair(14,18,145,1));
  const b=calculate(input,pair(14,18,145,2));
  assert.equal(b.analysis.frontPixelHeight,a.analysis.frontPixelHeight*2);
  for(const key of ['headHeight','neckLength','torsoLength','upperArmWidth','forearmWidth','thighWidth','calfWidth','inseam'] as const){
    assert.ok(Math.abs(a.dimensions[key].value-b.dimensions[key].value)<.2,key);
  }
});

test('manual circumference constrains both cross-section axes, without changing photograph observations',()=>{
  const observation=pair();
  const a=calculate({...input,waistCircumference:74},observation).dimensions;
  const b=calculate({...input,waistCircumference:86},observation).dimensions;
  assert.equal(a.waistCircumference.value,74);
  assert.equal(b.waistCircumference.value,86);
  assert.ok(b.waistWidth.value>a.waistWidth.value);
  assert.ok(b.waistDepth.value>a.waistDepth.value);
  assert.equal(a.waistWidth.source,'anatomical_derived');
  assert.equal(b.waistCircumference.source,'manual');
  assert.equal(a.waistWidth.confidence,0);
});

test('empty person mask fails explicitly instead of producing a preset person',()=>{
  const blank=new Float32Array(320*640);
  const pts=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
  assert.throws(()=>observePhotoMask(blank,320,640,pts,320,640),/전신 윤곽/);
  assert.throws(()=>calculate({...input,height:0},pair()),/실제 키/);
});

test('front/profile swaps cannot masquerade as valid width/depth observations',()=>{
  const a=pair();
  assert.throws(()=>calculate(input,{front:a.side,side:a.front}),/정면 사진/);
  assert.throws(()=>calculate(input,{front:a.front,side:a.front}),/측면 사진/);
});

