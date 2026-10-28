import * as THREE from 'three';
import type { ArcadeSimulation, ArcadeView, ThreeStage } from '../../shared/contracts';
import { DOCKS, ISLANDS, REEFS, type TidalState } from './model';
export function createView(stage:ThreeStage,simulation:ArcadeSimulation):ArcadeView{
 const s=simulation.state as TidalState,root=new THREE.Group();root.name='TIDAL COURIER';stage.scene.add(root);
 const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 const geo=<T extends THREE.BufferGeometry>(g:T)=>{gs.add(g);return g;};
 const mat=(color:number,emissive=0,intensity=0)=>{const m=new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness:.5,metalness:.15});ms.add(m);return m;};
 const water=mat(0x074960,0x031c2c,.2),sand=mat(0xd3c088),grass=mat(0x386b49),leaf=mat(0x53b777),wood=mat(0x805836),coral=mat(0xf0807e),white=mat(0xfff4d5),navy=mat(0x122a4d),gold=mat(0xffd96d,0xe7a322,.9),cyan=mat(0x6dffff,0x0ad4c8,1);
 function mesh(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Object3D=root){const o=new THREE.Mesh(g,m);parent.add(o);return o;}
 function box(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,parent:THREE.Object3D=root){const o=mesh(geo(new THREE.BoxGeometry(w,h,d)),m,parent);o.position.set(x,y,z);return o;}
 box(0,-.4,0,27,.6,21,navy);box(0,-.04,0,26,.1,20,water);
 const waveGeo=geo(new THREE.BoxGeometry(.65,.012,.045)),waveMat=mat(0x3b9eae);const waves=Array.from({length:60},(_,i)=>{const o=mesh(waveGeo,waveMat);o.position.set(Math.sin(i*31.7)*12,-.015,Math.cos(i*21.9)*9);return o;});
 const trunkGeo=geo(new THREE.CylinderGeometry(.075,.12,1.1,7)),frondGeo=geo(new THREE.SphereGeometry(.23,8,6));
 for(const [i,island]of ISLANDS.entries()){
  const beach=mesh(geo(new THREE.CylinderGeometry(island.radius,island.radius+.12,.2,24)),sand);beach.position.set(island.x,.05,island.y);
  const turf=mesh(geo(new THREE.CylinderGeometry(island.radius*.83,island.radius*.95,.3,20)),grass);turf.position.set(island.x,.22,island.y);
  for(let n=0;n<2;n++){const x=island.x+(n?-.4:.3),z=island.y+(n?.3:-.2);const trunk=mesh(trunkGeo,wood);trunk.position.set(x,.85,z);trunk.rotation.z=n?.18:-.13;
   for(let k=0;k<5;k++){const angle=k*Math.PI*2/5;const frond=mesh(frondGeo,leaf);frond.scale.set(2.6,.3,.65);frond.rotation.y=-angle;frond.rotation.z=.15;frond.position.set(x+Math.cos(angle)*.26,1.45,z+Math.sin(angle)*.26);}}
  box(island.x+.35,.46,island.y+.35,.55,.35,.5,i%2?coral:wood);const roof=mesh(geo(new THREE.ConeGeometry(.55,.35,4)),gold);roof.rotation.y=Math.PI/4;roof.position.set(island.x+.35,.8,island.y+.35);
 }
 const reefs=REEFS.map(r=>{const o=mesh(geo(new THREE.IcosahedronGeometry(r.radius,0)),coral);o.position.set(r.x,.09,r.y);o.scale.y=.6;return o;});
 const dockRings:THREE.Mesh[]=[],cargoCrates:THREE.Mesh[]=[],dockMats:THREE.MeshStandardMaterial[]=[];
 for(const [i,d]of DOCKS.entries()){
  const m=mat(0x556d76,0x102b35,.4);dockMats.push(m);const ring=mesh(geo(new THREE.TorusGeometry(1.05,.055,8,36)),m);ring.rotation.x=Math.PI/2;ring.position.set(d.x,.04,d.y);dockRings.push(ring);
  box(d.x,.14,d.y+.8,1.6,.15,.38,wood);for(const x of [-.65,.65])box(d.x+x,.22,d.y+.8,.1,.6,.1,white);
  const crate=box(d.x,.4,d.y+.8,.35,.35,.3,gold);cargoCrates.push(crate);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='#eefaff';ctx.font='bold 46px monospace';ctx.textAlign='center';ctx.fillText(d.name,256,60);const texture=new THREE.CanvasTexture(canvas);textures.add(texture);const labelMat=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});ms.add(labelMat);const label=mesh(geo(new THREE.PlaneGeometry(2.7,.5)),labelMat);label.rotation.x=-Math.PI/2;label.position.set(d.x,.05,d.y-1.25);}
 }
 function boat(main:THREE.Material,scale=1){const group=new THREE.Group();root.add(group);const hull=mesh(geo(new THREE.CapsuleGeometry(.24,.65,3,8)),main,group);hull.rotation.x=Math.PI/2;hull.scale.set(1,.75,1);hull.position.y=.22;box(0,.43,.12,.35,.28,.35,white,group);box(0,.38,-.18,.32,.08,.26,navy,group);group.scale.setScalar(scale);return group;}
 const player=boat(coral),ferries=s.ferries.map(()=>boat(wood,1.35));const cargo=box(0,.58,.32,.25,.2,.22,gold,player);
 const wakeMat=new THREE.MeshBasicMaterial({color:0xaffff4,transparent:true,opacity:.4});ms.add(wakeMat);const wake=mesh(geo(new THREE.ConeGeometry(.32,1.2,3)),wakeMat,player);wake.rotation.x=Math.PI/2;wake.position.set(0,.035,1.1);
 const destinationBeam=mesh(geo(new THREE.ConeGeometry(.28,.6,4)),cyan);destinationBeam.rotation.x=Math.PI;const ringPointer=mesh(geo(new THREE.TorusGeometry(.54,.04,6,28)),gold);ringPointer.rotation.x=Math.PI/2;
 const camera=stage.camera;camera.position.set(0,27,14);camera.up.set(0,1,0);camera.lookAt(0,0,0);
 function resize(w:number,h:number){const aspect=Math.max(1,w)/Math.max(1,h),height=Math.max(24,29/aspect);camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();}resize(stage.width,stage.height);
 return{resize,update(_alpha,options){const p=s.player;player.position.set(p.x,0,p.y);player.rotation.y=-p.angle;player.visible=p.invincible===0||Math.floor(s.tick/5)%2===0;cargo.visible=s.cargo;wake.visible=!options.reducedMotion&&Math.hypot(p.vx,p.vy)>1;wake.scale.y=Math.min(1.8,Math.hypot(p.vx,p.vy)/4);
  ferries.forEach((f,i)=>{const b=s.ferries[i];f.position.set(b.x,0,b.y);f.rotation.y=-Math.atan2(b.vy,b.vx)-Math.PI/2;});
  dockMats.forEach((m,i)=>{const selected=i===(s.cargo?s.destination:s.pickup);m.color.setHex(selected?s.cargo?0x6dffff:0xffd96d:0x556d76);m.emissive.setHex(selected?s.cargo?0x0ad4c8:0xe7a322:0x102b35);m.emissiveIntensity=selected?1.3:.2;cargoCrates[i].visible=!s.cargo&&i===s.pickup;dockRings[i].scale.setScalar(selected&&!options.reducedMotion?1+Math.sin(s.tick*.06)*.04:1);});
  const d=DOCKS[s.cargo?s.destination:s.pickup];destinationBeam.position.set(d.x,1.3+(options.reducedMotion?0:Math.sin(s.tick*.05)*.12),d.y);destinationBeam.material=s.cargo?cyan:gold;ringPointer.position.set(p.x,.03,p.y);ringPointer.visible=options.highContrast;water.color.setHex(options.highContrast?0x03232e:0x074960);reefs.forEach(o=>o.scale.y=options.highContrast?1:.6);
  waves.forEach((o,i)=>{o.position.y=-.005+(options.reducedMotion?0:Math.sin(s.tick*.03+i)*.009);});
 },dispose(){stage.scene.remove(root);gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.clear();}};
}
