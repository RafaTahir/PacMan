import * as THREE from 'three';
import type { ArcadeView, ThreeStage, VisualOptions } from '../../shared/contracts';
import { rotatedMask, type CircuitState } from './model';
export function createView(stage:ThreeStage,state:CircuitState):ArcadeView {
  const root=new THREE.Group();root.name='PRISM CIRCUIT';stage.scene.add(root);
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
  const geo=<T extends THREE.BufferGeometry>(g:T)=>{geometries.push(g);return g;};
  const mat=(color:number,emissive=0,intensity=0)=>{const m=new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,metalness:0.5,roughness:0.3});materials.push(m);return m;};
  const bed=mat(0x12152d),tileMat=mat(0x252d51),off=mat(0x607496,0x13284b,0.4),on=mat(0x8bfff0,0x36e4df,1.7),gold=mat(0xffdb75,0xffb844,0.6);
  const box=geo(new THREE.BoxGeometry(0.88,0.88,0.19)),pipe=geo(new THREE.CylinderGeometry(0.065,0.065,0.48,10)),hub=geo(new THREE.SphereGeometry(0.115,12,8));
  const slab=new THREE.Mesh(geo(new THREE.BoxGeometry(6.6,6.6,0.3)),bed);slab.position.z=-0.24;root.add(slab);
  root.add(new THREE.AmbientLight(0xb9cfff,1.4));const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(-5,8,12);root.add(light);
  const tiles=Array.from({length:25},()=>{
    const group=new THREE.Group();root.add(group);const base=new THREE.Mesh(box,tileMat);group.add(base);
    const center=new THREE.Mesh(hub,off);center.position.z=0.18;group.add(center);
    const arms=Array.from({length:4},(_,d)=>{const m=new THREE.Mesh(pipe,off);m.rotation.z=-d*Math.PI/2;
      m.position.set([0,0.24,0,-0.24][d],[0.24,0,-0.24,0][d],0.16);group.add(m);return m;});
    return{group,center,arms};
  });
  const selection=new THREE.Group();root.add(selection);const edgeH=geo(new THREE.BoxGeometry(0.99,0.035,0.08)),edgeV=geo(new THREE.BoxGeometry(0.035,0.99,0.08));
  for(const side of [-1,1]){const h=new THREE.Mesh(edgeH,gold);h.position.set(0,side*0.49,0.15);selection.add(h);const v=new THREE.Mesh(edgeV,gold);v.position.set(side*0.49,0,0.15);selection.add(v);}
  const source=new THREE.Mesh(geo(new THREE.ConeGeometry(0.17,0.35,12)),on),sink=new THREE.Mesh(geo(new THREE.TorusGeometry(0.2,0.065,8,18)),gold);source.rotation.z=-Math.PI/2;root.add(source,sink);
  function resize(w:number,h:number){const aspect=w/Math.max(1,h),span=Math.max(7.6,7.6/aspect);stage.camera.position.set(0,-2.3,16);stage.camera.up.set(0,1,0);stage.camera.lookAt(0,0,0);stage.camera.left=-span*aspect/2;stage.camera.right=span*aspect/2;stage.camera.top=span/2;stage.camera.bottom=-span/2;stage.camera.near=0.1;stage.camera.far=80;stage.camera.updateProjectionMatrix();}
  resize(stage.width,stage.height);
  return{resize,update(_alpha:number,options:VisualOptions){
    const n=state.size,offset=(n-1)/2;
    tiles.forEach((tile,i)=>{tile.group.visible=i<n*n;if(i>=n*n)return;tile.group.position.set(i%n-offset,offset-Math.floor(i/n),0);
      const powered=state.powered.includes(i),m=powered?on:off;tile.center.material=m;const mask=rotatedMask(state.tiles[i]);tile.arms.forEach((arm,d)=>{arm.visible=!!(mask&(1<<d));arm.material=m;});});
    selection.position.set(state.selected%n-offset,offset-Math.floor(state.selected/n),0);
    selection.scale.setScalar(options.reducedMotion?1:1+Math.sin(state.tick*0.06)*0.025);
    source.position.set(-offset-0.72,offset,0.17);sink.position.set(offset+0.72,-offset,0.17);
    tileMat.color.setHex(options.highContrast?0x101523:0x252d51);off.color.setHex(options.highContrast?0xd1d9ee:0x607496);
    sink.material=state.connected?on:gold;
  },dispose(){stage.scene.remove(root);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();}};
}
