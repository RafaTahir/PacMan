import * as THREE from 'three';
import type { ArcadeSimulation, ArcadeView, ThreeStage } from '../../shared/contracts';
import type { OrbitState } from './model';
export function createView(stage: ThreeStage, simulation: ArcadeSimulation): ArcadeView {
 const s=simulation.state as OrbitState,root=new THREE.Group();root.name='ORBIT SALVAGE';stage.scene.add(root);
 const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();
 const geo=<T extends THREE.BufferGeometry>(g:T)=>{gs.add(g);return g;};
 const mat=(color:number,emissive=0,intensity=0)=>{const m=new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness:.42,metalness:.55});ms.add(m);return m;};
 const steel=mat(0x9aadc3),rockMat=mat(0x56546c),gold=mat(0xffd46d,0xe79326,.7),cyan=mat(0x5bffff,0x00a4c7,1),violet=mat(0x765af3,0x432ad6,.8),dark=mat(0x111a33),red=mat(0xff546d,0xff173a,.8);
 function mesh(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Object3D=root){const o=new THREE.Mesh(g,m);parent.add(o);return o;}
 const plane=mesh(geo(new THREE.BoxGeometry(29,.3,23)),dark);plane.position.y=-.5;
 const boundary=geo(new THREE.BoxGeometry(28.5,.035,.045));for(const z of [-11.3,11.3])mesh(boundary,cyan).position.set(0,-.29,z);
 const side=geo(new THREE.BoxGeometry(.045,.035,22.6));for(const x of [-14.25,14.25])mesh(side,cyan).position.set(x,-.29,0);
 const stars=new THREE.BufferGeometry(),starPositions=[];for(let i=0;i<160;i++)starPositions.push(Math.sin(i*127.3)*14,-.3,Math.cos(i*41.9)*11);stars.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));gs.add(stars);const sm=new THREE.PointsMaterial({color:0x9aace0,size:.045});ms.add(sm);root.add(new THREE.Points(stars,sm));
 const refinery=new THREE.Group();root.add(refinery);const ring=mesh(geo(new THREE.TorusGeometry(1.5,.09,8,40)),gold,refinery);ring.rotation.x=Math.PI/2;ring.position.y=-.08;
 const hub=mesh(geo(new THREE.CylinderGeometry(.65,.9,.3,6)),steel,refinery);hub.position.y=-.2;
 for(let i=0;i<4;i++){const arm=mesh(geo(new THREE.BoxGeometry(.25,.12,.65)),violet,refinery);arm.position.set(Math.sin(i*Math.PI/2)*1.1,-.05,Math.cos(i*Math.PI/2)*1.1);arm.rotation.y=i*Math.PI/2;}
 const ship=new THREE.Group();root.add(ship);
 const hull=mesh(geo(new THREE.ConeGeometry(.36,1,4)),steel,ship);hull.rotation.x=-Math.PI/2;hull.position.y=.22;
 const wing=mesh(geo(new THREE.BoxGeometry(.92,.12,.35)),cyan,ship);wing.position.set(0,.12,.2);
 const cockpit=mesh(geo(new THREE.SphereGeometry(.18,10,8)),violet,ship);cockpit.scale.set(1,.7,1.5);cockpit.position.set(0,.35,-.05);
 const flame=mesh(geo(new THREE.ConeGeometry(.15,.6,8)),gold,ship);flame.rotation.x=Math.PI/2;flame.position.set(0,.16,.7);
 const shieldMat=new THREE.MeshBasicMaterial({color:0x72faff,transparent:true,opacity:.2,wireframe:true});ms.add(shieldMat);const shield=mesh(geo(new THREE.IcosahedronGeometry(.76,1)),shieldMat,ship);shield.position.y=.2;
 const rockGeo=geo(new THREE.IcosahedronGeometry(1,1));const rocks=Array.from({length:38},()=>mesh(rockGeo,rockMat));
 const shotGeo=geo(new THREE.CapsuleGeometry(.055,.35,2,4)),shots=Array.from({length:34},()=>mesh(shotGeo,cyan));
 const oreGeo=geo(new THREE.OctahedronGeometry(.19)),ore=Array.from({length:48},()=>mesh(oreGeo,gold));
 const hit=mesh(geo(new THREE.TorusGeometry(.5,.05,6,20)),red);hit.rotation.x=Math.PI/2;let previousSerial=s.hitSerial,hitUntil=0;
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
 stage.camera.position.set(0,27,12);stage.camera.up.set(0,1,0);stage.camera.lookAt(0,0,0);
 function resize(w:number,h:number){const aspect=Math.max(1,w)/Math.max(1,h),height=Math.max(24,30/aspect);stage.camera.left=-height*aspect/2;stage.camera.right=height*aspect/2;stage.camera.top=height/2;stage.camera.bottom=-height/2;stage.camera.updateProjectionMatrix();}
 resize(stage.width,stage.height);
 return { resize,aimAt(x,y){pointer.set(x,-y);ray.setFromCamera(pointer,stage.camera);if(ray.ray.intersectPlane(ground,point)){const dx=point.x-s.player.x,dy=point.z-s.player.y,length=Math.hypot(dx,dy)||1;return{aimX:dx/length*127,aimY:dy/length*127};};return{aimX:0,aimY:-127};},update(_alpha,options){
  const p=s.player;ship.position.set(p.x,0,p.y);ship.rotation.y=-p.angle;ship.visible=p.invincible===0||Math.floor(s.tick/5)%2===0;shield.visible=p.shieldActive;flame.visible=!options.reducedMotion&&Math.hypot(p.vx,p.vy)>1;flame.scale.y=.7+Math.sin(s.tick)*.2;
  rocks.forEach((o,i)=>{const r=s.rocks[i];o.visible=!!r;if(r){o.position.set(r.x,.2,r.y);o.scale.setScalar(r.radius);o.rotation.set(r.spin,r.spin*.7,r.spin*.4);}});
  shots.forEach((o,i)=>{const b=s.shots[i];o.visible=!!b;if(b){o.position.set(b.x,.2,b.y);o.rotation.set(Math.PI/2,0,-Math.atan2(b.vx,b.vy));}});
  ore.forEach((o,i)=>{const b=s.ore[i];o.visible=!!b;if(b){o.position.set(b.x,.3,b.y);o.rotation.y=options.reducedMotion?0:s.tick*.03;}});
  if(previousSerial!==s.hitSerial){hitUntil=s.tick+15;previousSerial=s.hitSerial;}hit.visible=!options.reducedMotion&&s.tick<hitUntil;hit.position.set(s.lastHit.x,.15,s.lastHit.y);hit.scale.setScalar(1+(15-(hitUntil-s.tick))*.1);
  refinery.rotation.y=options.reducedMotion?0:s.tick*.002;rockMat.color.setHex(options.highContrast?0xadb1c7:0x56546c);
 },dispose(){stage.scene.remove(root);gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());root.clear();}};
}
