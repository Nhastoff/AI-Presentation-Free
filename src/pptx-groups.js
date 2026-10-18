import JSZip from 'jszip';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const multiply = (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point = (m,x,y) => [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const first = (node,name) => node?.getElementsByTagNameNS('*',name)[0];
const num = (node,key,fallback=0) => Number(node?.getAttribute(key)) || fallback;
export function flattenPptxTree(tree, sx, sy) {
  const output = [];
  function walk(container, matrix, groupId='', depth=0) {
    if (depth > 32) throw new Error('Слишком глубокая вложенность групп PPTX');
    for (const shape of [...(container?.children || [])]) {
      if (shape.localName !== 'grpSp') { if (['sp','pic'].includes(shape.localName)) output.push({ shape, matrix, groupId }); continue; }
      const props = [...shape.children].find(e => e.localName === 'grpSpPr'), transform = first(props,'xfrm');
      const off=first(transform,'off'), ext=first(transform,'ext'), chOff=first(transform,'chOff'), chExt=first(transform,'chExt');
      const x=num(off,'x'), y=num(off,'y'), w=num(ext,'cx',1), h=num(ext,'cy',1);
      const scaleX=w/num(chExt,'cx',w), scaleY=h/num(chExt,'cy',h);
      const angle=num(transform,'rot')/60000*Math.PI/180, cx=x+w/2,cy=y+h/2;
      const flipX=transform?.getAttribute('flipH')==='1'?-1:1,flipY=transform?.getAttribute('flipV')==='1'?-1:1;
      const a=Math.cos(angle)*flipX,b=Math.sin(angle)*flipX,c=-Math.sin(angle)*flipY,d=Math.cos(angle)*flipY;
      const rotation=[a,b,c,d,cx-a*cx-c*cy,cy-b*cx-d*cy];
      const scale=[scaleX,0,0,scaleY,x-num(chOff,'x')*scaleX,y-num(chOff,'y')*scaleY];
      walk(shape,multiply(matrix,multiply(rotation,scale)),groupId || crypto.randomUUID(),depth+1);
    }
  }
  walk(tree,[sx,0,0,sy,0,0]);
  return output;
}
export function pptxPosition(transform, matrix, groupId='') {
  const off=first(transform,'off'),ext=first(transform,'ext');
  const width=num(ext,'cx',3000000),height=num(ext,'cy',1000000);
  const [cx,cy]=point(matrix,num(off,'x')+width/2,num(off,'y')+height/2);
  const angle=num(transform,'rot')/60000*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const ux=matrix[0]*cos+matrix[2]*sin,uy=matrix[1]*cos+matrix[3]*sin;
  const vx=-matrix[0]*sin+matrix[2]*cos,vy=-matrix[1]*sin+matrix[3]*cos;
  const w=width*Math.hypot(ux,uy),h=height*Math.hypot(vx,vy);
  const mirrored=matrix[0]*matrix[3]-matrix[1]*matrix[2]<0;
  const rotation=((Math.atan2(uy,ux)*180/Math.PI+180)%360+360)%360-180;
  const approximated=Math.abs(ux*vx+uy*vy)>1e-8*Math.max(1,Math.hypot(ux,uy)*Math.hypot(vx,vy));
  return { x:cx-w/2,y:cy-h/2,w,h,groupId,rotation,flipH:transform?.getAttribute('flipH')==='1',flipV:(transform?.getAttribute('flipV')==='1')!==mirrored,_approximateGroupTransform:approximated };
}
// Write real DrawingML groups; child coordinates remain in the original space.
export async function addPptxGroups(blob, deck) {
  if (!deck.slides.some(s => s.elements.some(e => e.groupId))) return blob;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  for (let index = 0; index < deck.slides.length; index++) {
    const path = `ppt/slides/slide${index + 1}.xml`, file = zip.file(path);
    if (!file) continue;
    const xml = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
    const tree = xml.getElementsByTagNameNS(P, 'spTree')[0];
    const drawings = [...tree.children].filter(node => ['sp','pic'].includes(node.localName));
    const elements = deck.slides[index].elements.filter(e => e.type !== 'image' || e.src);
    if (drawings.length !== elements.length) throw new Error('Не совпадает количество объектов при записи групп');
    const groups = new Map();
    elements.forEach((e, i) => { if (e.groupId) { if (!groups.has(e.groupId)) groups.set(e.groupId, []); groups.get(e.groupId).push({ e, node: drawings[i] }); } });
    let nextId = Math.max(1, ...[...xml.getElementsByTagNameNS(P, 'cNvPr')].map(e => +e.getAttribute('id') || 0)) + 1;
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const x = Math.min(...members.map(({e}) => e.x)), y = Math.min(...members.map(({e}) => e.y));
      const w = Math.max(...members.map(({e}) => e.x + e.w)) - x, h = Math.max(...members.map(({e}) => e.y + e.h)) - y;
      const node = xml.createElementNS(P, 'p:grpSp');
      const fragment = new DOMParser().parseFromString(`<p:grpSp xmlns:p="${P}" xmlns:a="${A}"><p:nvGrpSpPr><p:cNvPr id="${nextId++}" name="AI Presentation Free group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${Math.round(x * 9525)}" y="${Math.round(y * 9525)}"/><a:ext cx="${Math.max(1,Math.round(w * 9525))}" cy="${Math.max(1,Math.round(h * 9525))}"/><a:chOff x="${Math.round(x * 9525)}" y="${Math.round(y * 9525)}"/><a:chExt cx="${Math.max(1,Math.round(w * 9525))}" cy="${Math.max(1,Math.round(h * 9525))}"/></a:xfrm></p:grpSpPr></p:grpSp>`, 'application/xml');
      for (const child of fragment.documentElement.children) node.appendChild(xml.importNode(child, true));
      tree.insertBefore(node, members[0].node);
      for (const { node: child } of members) node.appendChild(child);
    }
    zip.file(path, new XMLSerializer().serializeToString(xml));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' });
}
