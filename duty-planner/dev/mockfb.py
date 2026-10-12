# محاكاة Firebase SDK في الذاكرة (localStorage) لاختبارات المتصفح — لا تتصل بأي خادم.
APP = "export const initializeApp = (cfg) => ({cfg});"
AUTH = """
const KEY='mockuser'; const listeners=[];
const cur=()=>JSON.parse(localStorage.getItem(KEY)||'null');
const auth={get currentUser(){return cur();}};
export const getAuth=()=>auth;
export function onAuthStateChanged(a,cb){listeners.push(cb); setTimeout(()=>cb(cur()),30); return ()=>{}}
export async function signInWithEmailAndPassword(a,e,p){
  if(e==='me@test.com'&&p==='secret12'){const u={uid:'u1',email:e};localStorage.setItem(KEY,JSON.stringify(u));listeners.forEach(l=>l(u));return {user:u};}
  throw {code:'auth/invalid-credential'};}
export async function signOut(){localStorage.removeItem(KEY);listeners.forEach(l=>l(null));}
"""
FS = """
const KEY='mockstore';
const load=()=>JSON.parse(localStorage.getItem(KEY)||'{}');
const save=(s)=>localStorage.setItem(KEY,JSON.stringify(s));
const clone=o=>JSON.parse(JSON.stringify(o));
const guard=()=>{ if(!localStorage.getItem('mockuser')) throw {code:'permission-denied'}; };
export const serverTimestamp=()=>"__TS__";
export const getFirestore=(app)=>({app});
export const doc=(db,col,id)=>({path:col+'/'+id,col,id});
export const collection=(db,col)=>({col});
export const query=(c,...cs)=>({col:c.col,cs});
export const where=(f,op,v)=>({t:'where',f,op,v});
export const orderBy=(f)=>({t:'order',f});
const mk=(path,data)=>({id:path.split('/').pop(),exists:()=>data!==undefined,data:()=>clone(data)});
export async function getDoc(ref){guard();return mk(ref.path,load()[ref.path]);}
export async function getDocs(q){guard();const s=load();
  let items=Object.entries(s).filter(([p])=>p.startsWith(q.col+'/')&&p.split('/').length===2).map(([p,d])=>({p,d}));
  for(const c of q.cs||[]){ if(c.t==='where'){items=items.filter(({d})=>c.op==='>='?d[c.f]>=c.v:c.op==='<='?d[c.f]<=c.v:d[c.f]===c.v);} }
  return {docs:items.map(({p,d})=>mk(p,d)),size:items.length};}
export async function setDoc(ref,data,opts){guard();const s=load();s[ref.path]=opts&&opts.merge?{...(s[ref.path]||{}),...data}:data;save(s);}
export async function addDoc(c,data){const id='auto'+Math.random().toString(36).slice(2,8);await setDoc(doc(null,c.col,id),data);return {id};}
export async function updateDoc(ref,data){guard();const s=load();if(!s[ref.path])throw {code:'not-found'};s[ref.path]={...s[ref.path],...data};save(s);}
export async function deleteDoc(ref){guard();const s=load();delete s[ref.path];save(s);}
export async function runTransaction(db,fn){guard();const s=load();const w=[];
  const tx={get:async r=>mk(r.path,s[r.path]),set:(r,d)=>{w.push([r.path,d])}};
  const res=await fn(tx);const s2=load();w.forEach(([p,d])=>s2[p]=d);save(s2);return res;}
export const writeBatch=()=>({});
"""
