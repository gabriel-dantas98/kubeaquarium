export interface LabelTarget { uid:string; name:string; namespace:string; status:string; statusClass:'ok'|'warn'|'err'|'info'; screen:{x:number;y:number;depth:number;offsetY:number}; matched:boolean; focused:boolean }
export interface NamespaceLabelTarget { namespace:string; total:number; unhealthy:number; x:number; y:number; depth:number }
export interface LabelContext { mode:'overview'|'dive'; filterActive:boolean; modalOpen:boolean; blockedRects:readonly DOMRectReadOnly[] }
interface Entry { element:HTMLDivElement; content:string; width:number; height:number }
interface Rect { left:number;right:number;top:number;bottom:number }
const GAP=4;

export class LabelLayer {
  private root=document.getElementById('labels') as HTMLDivElement;
  private pods=new Map<string,Entry>(); private namespaces=new Map<string,Entry>(); private viewport='';
  render(targets:readonly LabelTarget[],context:LabelContext):void {
    if(context.modalOpen){this.hideAll();return}
    const cap=context.filterActive?16:context.mode==='overview'?4:8;
    const sorted=[...targets].sort(comparePods).slice(0,cap); const active=new Set(sorted.map(t=>t.uid)); this.hideInactive(this.pods,active);
    const placed=context.blockedRects.map(fromDomRect); const viewportChanged=this.viewport!==`${innerWidth}x${innerHeight}`; this.viewport=`${innerWidth}x${innerHeight}`;
    for(const target of sorted){const entry=this.entry(this.pods,target.uid,'pod-label'); const content=target.focused?`${target.name} · ${target.status}`:`${shorten(target.namespace)} · ${target.status}`; if(entry.content!==content){entry.element.textContent=content;entry.element.title=`${target.namespace}/${target.name}`;entry.content=content;entry.width=0} entry.element.className=`pod-label ${target.statusClass}${target.focused?' focused':''}${target.matched?' match':''}`; if(!entry.width||viewportChanged){entry.width=entry.element.offsetWidth;entry.height=entry.element.offsetHeight}}
    for(const target of sorted){const entry=this.pods.get(target.uid)!; const positions=target.focused?focusPositions(target,entry):[above(target.screen.x,target.screen.y-target.screen.offsetY,entry)]; const rect=positions.find(r=>onScreen(r)&&!placed.some(p=>intersects(p,r))); if(!rect){entry.element.classList.remove('visible');continue} entry.element.style.transform=`translate3d(${rect.left}px, ${rect.top}px, 0)`;entry.element.classList.add('visible');placed.push(expand(rect,GAP))}
  }
  renderNamespaces(targets:readonly NamespaceLabelTarget[],context:LabelContext):void {
    if(context.modalOpen){this.hideMap(this.namespaces);return} const cap=context.mode==='overview'?12:4; const sorted=[...targets].sort((a,b)=>a.depth-b.depth||a.namespace.localeCompare(b.namespace)).slice(0,cap); const active=new Set(sorted.map(t=>t.namespace));this.hideInactive(this.namespaces,active);const placed=context.blockedRects.map(fromDomRect);for(const e of this.pods.values())if(e.element.classList.contains('visible'))placed.push(fromElement(e.element));
    for(const target of sorted){const entry=this.entry(this.namespaces,target.namespace,'namespace-label');const content=`${target.namespace} · ${target.total} pods · ${target.unhealthy} unhealthy`;if(entry.content!==content){entry.element.textContent=content;entry.content=content;entry.width=0}if(!entry.width){entry.width=entry.element.offsetWidth;entry.height=entry.element.offsetHeight}const rect=above(target.x,target.y,entry);if(!onScreen(rect)||placed.some(p=>intersects(p,expand(rect,GAP)))){entry.element.classList.remove('visible');continue}entry.element.style.transform=`translate3d(${rect.left}px, ${rect.top}px, 0)`;entry.element.classList.add('visible');placed.push(expand(rect,GAP))}
  }
  hideAll():void{this.hideMap(this.pods);this.hideMap(this.namespaces)}
  private hideMap(map:Map<string,Entry>){for(const e of map.values())e.element.classList.remove('visible')}
  private hideInactive(map:Map<string,Entry>,active:Set<string>){for(const [key,e] of map)if(!active.has(key))e.element.classList.remove('visible')}
  private entry(map:Map<string,Entry>,key:string,className:string):Entry{let e=map.get(key);if(!e){const element=document.createElement('div');element.className=className;this.root.appendChild(element);e={element,content:'',width:0,height:0};map.set(key,e)}return e}
}
function comparePods(a:LabelTarget,b:LabelTarget){return Number(b.focused)-Number(a.focused)||Number(b.matched)-Number(a.matched)||a.screen.depth-b.screen.depth||a.uid.localeCompare(b.uid)}
function shorten(v:string){return v.length>18?`${v.slice(0,15)}…`:v} function above(x:number,y:number,e:Entry):Rect{return{left:x-e.width/2,right:x+e.width/2,top:y-e.height,bottom:y}}
function focusPositions(t:LabelTarget,e:Entry):Rect[]{const{x,y,offsetY}=t.screen;return[above(x,y-offsetY,e),{left:x-e.width/2,right:x+e.width/2,top:y+offsetY,bottom:y+offsetY+e.height},{left:x-offsetY-e.width,right:x-offsetY,top:y-e.height/2,bottom:y+e.height/2},{left:x+offsetY,right:x+offsetY+e.width,top:y-e.height/2,bottom:y+e.height/2}]}
function onScreen(r:Rect){return r.left>=8&&r.right<=innerWidth-8&&r.top>=8&&r.bottom<=innerHeight-8} function intersects(a:Rect,b:Rect){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top} function expand(r:Rect,n:number):Rect{return{left:r.left-n,right:r.right+n,top:r.top-n,bottom:r.bottom+n}} function fromDomRect(r:DOMRectReadOnly):Rect{return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}} function fromElement(e:HTMLElement):Rect{return fromDomRect(e.getBoundingClientRect())}
