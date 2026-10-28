import * as THREE from 'three';
import type { ArcadeView, ThreeStage, VisualOptions } from '../../shared/contracts';
import { clamp, lerp } from '../../shared/math';
import { LANES, type CanopyState } from './model';

/** Procedural rainforest boardwalk; a bounded mesh pool, no downloaded models. */
export function createView(stage: ThreeStage, state: CanopyState): ArcadeView {
 const root = new THREE.Group(); root.name = 'CANOPY SPRINT · Malaysian moonwalk'; stage.scene.add(root);
 const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], instances: THREE.InstancedMesh[] = [];
 const geo = <T extends THREE.BufferGeometry>(g:T) => { geometries.push(g); return g; };
 const mat = (color:number, emissive=0, intensity=0) => { const m=new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness:0.7,metalness:0.08}); materials.push(m); return m; };
 const wood=mat(0x805c39), planks=mat(0x98734b), bamboo=mat(0x94ab69), dark=mat(0x102f29), leaves=mat(0x25845e), mint=mat(0x8effc1,0x3ebf8c,0.4), pink=mat(0xffa3d8,0xb93a97,0.5), gold=mat(0xffdd83,0x80541a,0.3), orange=mat(0xf5a346);
 const shapeBox=geo(new THREE.BoxGeometry(1,1,1)), shapeSphere=geo(new THREE.SphereGeometry(1,10,7)), shapeCylinder=geo(new THREE.CylinderGeometry(1,1,1,12)), shapeCone=geo(new THREE.ConeGeometry(1,1,7));
 const addMesh=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,parent:THREE.Object3D=root) => {const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;};
 const light=new THREE.HemisphereLight(0xc8fff3,0x193626,2.4);root.add(light);
 const key=new THREE.DirectionalLight(0xffe6b1,2.9); key.position.set(-8,20,8);root.add(key);
 const rim=new THREE.DirectionalLight(0x53c5ff,1.3);rim.position.set(7,8,-16);root.add(rim);
 const bed=addMesh(shapeBox,dark,0,-0.7,-12,9,1.1,47);
 addMesh(shapeBox,wood,0,-0.12,-12,7.8,0.28,47);
 for(const side of [-1,1]) {
  addMesh(shapeBox,bamboo,side*3.8,0.85,-12,0.07,0.07,47);
  addMesh(shapeBox,wood,side*3.8,0.35,-12,0.08,0.08,47);
 }
 const movingDecor=new THREE.Group();root.add(movingDecor);
 for(let i=0;i<25;i++) {
  const z=-38+i*2;
  addMesh(shapeBox,planks,0,-0.01,z,7.7,0.08,1.83,movingDecor);
  for(const side of [-1,1]) {
   addMesh(shapeCylinder,bamboo,side*3.8,0.47,z,0.065,1.15,0.065,movingDecor);
   addMesh(shapeSphere,gold,side*3.8,1.1,z,0.095,0.11,0.095,movingDecor);
  }
 }
 // Every palm reuses geometry/material; leaf clusters stay outside the playable lanes.
 const forest=new THREE.Group();root.add(forest);
 for(let i=0;i<12;i++) for(const side of [-1,1]) {
  const x=side*(5.0+(i%3)*0.36),z=-36+i*4.1,height=3.7+(i%4)*0.5;
  addMesh(shapeCylinder,wood,x,height/2-1,z,0.19,height,0.19,forest);
  for(let f=0;f<5;f++) {
   const a=f*Math.PI*2/5+i, leaf=addMesh(shapeSphere,leaves,x+Math.cos(a)*0.65,height-0.95,z+Math.sin(a)*0.65,1.25,0.13,0.39,forest);leaf.rotation.y=-a;leaf.rotation.z=side*0.2;
  }
  addMesh(shapeCone,dark,side*6.9,0.3,z-1.5,1.5,4,1.8,forest);
 }
 const fireflies=geo(new THREE.SphereGeometry(0.035,4,3));
 for(let i=0;i<28;i++) addMesh(fireflies,mint,((i*17)%19-9)*0.72,0.5+(i%6)*0.45,-35+(i*7)%44);
 const dummy=new THREE.Object3D();
 const pool=(g:THREE.BufferGeometry,m:THREE.Material,count=64)=>{const o=new THREE.InstancedMesh(g,m,count);o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);o.frustumCulled=false;root.add(o);instances.push(o);return o;};
 const logs=pool(shapeCylinder,wood),logEnds=pool(shapeCylinder,gold),crates=pool(shapeBox,orange),crateBands=pool(shapeBox,wood),gates=pool(shapeBox,bamboo),gateMarks=pool(shapeBox,mint),gaps=pool(shapeBox,mat(0x010a08)),gapEdges=pool(shapeBox,gold),orchids=pool(geo(new THREE.OctahedronGeometry(0.27)),pink),orchidRings=pool(geo(new THREE.TorusGeometry(0.32,0.035,4,12)),gold);
 const counts=new Map<THREE.InstancedMesh,number>();
 const place=(o:THREE.InstancedMesh,x:number,y:number,z:number,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{const i=counts.get(o)??0;if(i>=o.instanceMatrix.count)return;dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(rx,ry,rz);dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);counts.set(o,i+1);};
 const player=new THREE.Group();root.add(player);
 const outfit=mat(0x7be3c8),skin=mat(0xe9b887),boots=mat(0x263f44),pack=mat(0xf2b65b),visor=mat(0x133c46,0x2b929b,0.35);
 addMesh(shapeCylinder,outfit,0,0.83,0,0.26,0.63,0.19,player);
 addMesh(shapeSphere,skin,0,1.34,0,0.22,0.24,0.22,player);
 addMesh(shapeSphere,gold,0,1.5,0,0.27,0.14,0.25,player);
 addMesh(shapeBox,visor,0,1.36,-0.19,0.3,0.1,0.09,player);
 addMesh(shapeBox,pack,0,0.91,0.21,0.37,0.5,0.19,player);
 const legs=[addMesh(shapeCylinder,boots,-0.14,0.3,0,0.085,0.52,0.09,player),addMesh(shapeCylinder,boots,0.14,0.3,0,0.085,0.52,0.09,player)];
 const arms=[addMesh(shapeCylinder,outfit,-0.33,0.87,0,0.075,0.51,0.075,player),addMesh(shapeCylinder,outfit,0.33,0.87,0,0.075,0.51,0.075,player)];
 const shadowMat=new THREE.MeshBasicMaterial({color:0x02150e,transparent:true,opacity:0.6,depthWrite:false});materials.push(shadowMat);
 const shadow=addMesh(geo(new THREE.CircleGeometry(0.5,16)),shadowMat,0,0.04,5,1,0.65,1);shadow.rotation.x=-Math.PI/2;
 const contrastMarker=addMesh(geo(new THREE.TorusGeometry(0.55,0.045,5,20)),mint,0,0.06,5);contrastMarker.rotation.x=-Math.PI/2;
 const camera=stage.camera;
 camera.position.set(0,36,31);camera.up.set(0,1,0);camera.lookAt(0,0,-10);camera.near=0.1;camera.far=130;
 function resize(width:number,height:number) { const aspect=Math.max(0.2,width/Math.max(1,height)),half=Math.max(18.7,6.8/aspect);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();camera.updateMatrixWorld(); }
 resize(stage.width,stage.height);
 return {resize,update(alpha:number,options:VisualOptions) {
  const t=clamp(alpha,0,1),x=lerp(state.previousX,state.x,t),h=lerp(state.previousHeight,state.height,t);
  const stride=options.reducedMotion?0:Math.sin(state.tick*0.35)*0.55;
  player.position.set(x,h+(state.slideTicks>0?-0.05:0),5);player.scale.y=state.slideTicks>0?0.43:1;
  legs[0].rotation.x=stride;legs[1].rotation.x=-stride;arms[0].rotation.x=-stride;arms[1].rotation.x=stride;
  player.rotation.z=options.reducedMotion?0:clamp((LANES[state.lane]-state.x)*-0.12,-0.2,0.2);
  player.visible=state.invincible===0||options.reducedMotion||state.tick%12<8;
  shadow.position.x=contrastMarker.position.x=x;shadow.scale.set(1+h*0.1,0.65+h*0.1,1);
  contrastMarker.visible=options.highContrast;
  movingDecor.position.z=state.distance%2;
  bed.material=options.highContrast?dark:leaves;
  counts.clear();
  for(const object of state.objects) {
   if(object.resolved&&object.kind==='orchid')continue;
   const z=5-lerp(object.previousDistance,object.distance,t),ox=LANES[object.lane];
   if(object.kind==='log') {place(logs,ox,0.35,z,0.3,1.65,0.3,0,0,Math.PI/2);place(logEnds,ox-0.85,0.35,z,0.285,0.03,0.285,0,0,Math.PI/2);place(logEnds,ox+0.85,0.35,z,0.285,0.03,0.285,0,0,Math.PI/2);}
   else if(object.kind==='crate') {place(crates,ox,0.68,z,1.5,1.32,1.15);place(crateBands,ox,0.7,z,0.13,1.42,1.21);place(crateBands,ox,0.7,z,1.56,0.13,1.21);}
   else if(object.kind==='gate') {place(gates,ox-0.84,0.95,z,0.14,1.9,0.16);place(gates,ox+0.84,0.95,z,0.14,1.9,0.16);place(gates,ox,1.16,z,1.8,0.34,0.3);place(gateMarks,ox,1.18,z+0.17,0.7,0.08,0.05);}
   else if(object.kind==='gap') {place(gaps,ox,0.035,z,1.9,0.04,1.8);place(gapEdges,ox,0.07,z-0.95,1.9,0.05,0.08);place(gapEdges,ox,0.07,z+0.95,1.9,0.05,0.08);}
   else {place(orchids,ox,0.9,z,1,1,1,0,options.reducedMotion?0:state.tick*0.04,Math.PI/4);place(orchidRings,ox,0.9,z,1,1,1,0,options.reducedMotion?0:state.tick*0.04);}
  }
  for(const instance of instances) {instance.count=counts.get(instance)??0;instance.instanceMatrix.needsUpdate=true;}
 },dispose() {stage.scene.remove(root);instances.forEach(o=>o.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();}};
}
