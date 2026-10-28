import * as THREE from 'three';
import type { ArcadeView, ThreeStage, VisualOptions } from '../../shared/contracts';
import { cells, HEIGHT, SHAPES, WIDTH, type StackState } from './model';
const COLORS=[0x6ef0ee,0xffb768,0x8ca6ff,0xdf94ff,0x84e1a3,0xff829f];
export function createView(stage:ThreeStage,state:StackState):ArcadeView{
 const root=new THREE.Group();root.name='SKYBOUND STACK';stage.scene.add(root);
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 const geo=<T extends THREE.BufferGeometry>(g:T)=>{geometries.push(g);return g;};
 const material=(color:number,emissive=0,intensity=0)=>{const m=new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness:0.34,metalness:0.35});materials.push(m);return m;};
 const palette=COLORS.map(c=>material(c,c,0.23)),bed=material(0x0b1831),rail=material(0x53649a,0x4b66d0,0.3),gridMat=material(0x263755);
 const cube=geo(new THREE.BoxGeometry(0.86,0.86,0.48)),stud=geo(new THREE.BoxGeometry(0.57,0.57,0.05));
 const base=new THREE.Mesh(geo(new THREE.BoxGeometry(8.25,14.25,0.22)),bed);base.position.set(0,0,-0.31);root.add(base);
 for(const side of[-1,1]){const bar=new THREE.Mesh(geo(new THREE.BoxGeometry(0.16,14.45,0.4)),rail);bar.position.set(side*4.2,0,-0.07);root.add(bar);}
 const floor=new THREE.Mesh(geo(new THREE.BoxGeometry(8.55,0.16,0.4)),rail);floor.position.set(0,-7.18,-0.07);root.add(floor);
 const gridGeo=geo(new THREE.PlaneGeometry(0.92,0.92));
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){const cell=new THREE.Mesh(gridGeo,gridMat);cell.position.set(x-(WIDTH-1)/2,(HEIGHT-1)/2-y,-0.18);root.add(cell);}
 const tiles=Array.from({length:WIDTH*HEIGHT+10},()=>{const group=new THREE.Group();root.add(group);const block=new THREE.Mesh(cube,palette[0]);group.add(block);const top=new THREE.Mesh(stud,palette[0]);top.position.z=0.27;group.add(top);return{group,block,top};});
 const ghostMaterial=new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:0.65});materials.push(ghostMaterial);
 const ghosts=Array.from({length:5},()=>{const g=new THREE.Mesh(cube,ghostMaterial);root.add(g);return g;});
 const preview=Array.from({length:5},()=>{const g=new THREE.Mesh(cube,palette[0]);root.add(g);return g;});
 const podium=new THREE.Mesh(geo(new THREE.BoxGeometry(2.8,3.5,0.2)),bed);podium.position.set(5.9,3.0,-0.25);root.add(podium);
 const ambient=new THREE.AmbientLight(0xc6d1ff,1.4),key=new THREE.DirectionalLight(0xfff3dc,2.7);key.position.set(-4,5,15);root.add(ambient,key);
 const towers:number[]=[2,3.8,2.7,4.4,1.9];
 towers.forEach((height,i)=>{const m=new THREE.Mesh(geo(new THREE.BoxGeometry(0.55,height,0.3)),material(0x12213b,0x3457ad,0.2));m.position.set(4.9+i*0.49,-4.9+height/2,-0.2);root.add(m);});
 function place(mesh:THREE.Object3D,x:number,y:number){mesh.position.set(x-(WIDTH-1)/2,(HEIGHT-1)/2-y,0.05);mesh.visible=y>=0;}
 function resize(w:number,h:number){const aspect=w/Math.max(1,h),height=Math.max(15.8,12.5/aspect);stage.camera.position.set(1.7,-2.6,22);stage.camera.up.set(0,1,0);stage.camera.lookAt(1.25,0,0);stage.camera.left=-height*aspect/2;stage.camera.right=height*aspect/2;stage.camera.top=height/2;stage.camera.bottom=-height/2;stage.camera.near=0.1;stage.camera.far=80;stage.camera.updateProjectionMatrix();}
 resize(stage.width,stage.height);
 return{resize,update(_alpha:number,options:VisualOptions){
  let used=0;
  state.board.forEach((value,i)=>{if(!value)return;const tile=tiles[used++];tile.block.material=tile.top.material=palette[value-1];place(tile.group,i%WIDTH,Math.floor(i/WIDTH));});
  const active=cells(state.piece),ghost=cells({...state.piece,y:state.ghostY});
  active.forEach(([x,y])=>{const tile=tiles[used++];tile.block.material=tile.top.material=palette[state.piece.kind];place(tile.group,x,y);tile.group.visible=tile.group.visible&&state.status==='playing';});
  for(let i=used;i<tiles.length;i++)tiles[i].group.visible=false;
  ghosts.forEach((mesh,i)=>{mesh.visible=i<ghost.length&&state.status==='playing';if(i<ghost.length){place(mesh,ghost[i][0],ghost[i][1]);mesh.visible=mesh.visible&&ghost[i][1]!==active[i][1];}});
  preview.forEach((mesh,i)=>{const shape=SHAPES[state.next];mesh.visible=i<shape.length;if(i<shape.length){mesh.material=palette[state.next];mesh.position.set(5.0+shape[i][0]*0.65,3.8-shape[i][1]*0.65,0.07);mesh.scale.setScalar(0.65);}});
  ghostMaterial.opacity=options.highContrast?1:0.65;
  rail.emissiveIntensity=state.clearFlash>0&&!options.reducedMotion?1.2:0.3;
  bed.color.setHex(options.highContrast?0x01040c:0x0b1831);
 },dispose(){stage.scene.remove(root);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();}};
}
