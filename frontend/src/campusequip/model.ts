import dataset from './dataset.json';
export const columns=['contract_id','client_id','site_id','start_date','status','line_no','equipment_id','quantity','unit','duration','unit_rate'] as const;
export type Column=typeof columns[number];
export type Row=Record<Column,string>;
export type Batch={id:string;number:number;profile:string;rows:Row[];columns:string[];hash:string;refsHash:string;fingerprint:string;source:string};
export const batches=dataset.batches as Record<string,Batch>;
export const refs=dataset.refs;
export const source=dataset.source;
export type Decision='accepted'|'rejected'|'duplicate';
export type Line={raw:Row;row:Row;sourceRow:number;decision:Decision;reasons:string[];anomaly:boolean;cents:number};
export type Report={lines:Line[];received:number;duplicates:number;accepted:number;rejected:number;contracts:number;anomalies:number;rate:number;alert:boolean;structure:boolean};
const validIds={client_id:new Set(refs.clients.map(r=>r.client_id)),site_id:new Set(refs.sites.map(r=>r.site_id)),equipment_id:new Set(refs.equipment.map(r=>r.equipment_id))};
export function cents(value:string):number|null {if(!/^\d+(?:\.\d{1,2})?$/.test(value))return null;const [a,b='']=value.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));return Number.isSafeInteger(n)?n:null}
export function integer(value:string,min:number,max=Number.MAX_SAFE_INTEGER){return /^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max}
export function validDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===s}
export const money=(n:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'MAD',maximumFractionDigits:2}).format(n/100);
export const number=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(n);
export function normalize(raw:Row):Row{return Object.fromEntries(columns.map(k=>[k,k==='status'||k==='unit'?raw[k].trim().toLowerCase():raw[k].trim()])) as Row}
export function amount(row:Row){return Number(row.quantity)*Number(row.duration)*(cents(row.unit_rate)??0)}
export function included(row:Row){return ['paid','closed'].includes(row.status)}
export function analyze(batch:Batch):Report {
 const structure=batch.columns.join('|')!==columns.join('|');
 if(structure)return {lines:[],received:batch.rows.length,duplicates:0,accepted:0,rejected:0,contracts:0,anomalies:0,rate:0,alert:false,structure:true};
 const seen=new Set<string>();
 const lines:Line[]=batch.rows.map((raw,i)=>{const row=normalize(raw),key=JSON.stringify(columns.map(k=>row[k]));const duplicate=seen.has(key);seen.add(key);return {raw,row,sourceRow:i+2,decision:duplicate?'duplicate':'accepted',reasons:duplicate?['Répétition exacte après normalisation.']:[],anomaly:false,cents:amount(row)}});
 const groups=new Map<string,Line[]>();
 lines.filter(l=>l.decision!=='duplicate').forEach(l=>{const id=integer(l.row.contract_id,1)?String(Number(l.row.contract_id)):l.row.contract_id;groups.set(id,[...(groups.get(id)??[]),l])});
 for(const group of groups.values()){
  const keys=new Set<string>();let conflict=false;
  for(const l of group){const r=l.row;
   for(const k of ['contract_id','line_no'] as const)if(!integer(r[k],1))l.reasons.push(`${k} doit être un entier strictement positif.`);
   for(const k of ['client_id','site_id','equipment_id'] as const)if(!integer(r[k],1)||!validIds[k].has(Number(r[k])))l.reasons.push(`${k} absent du référentiel.`);
   if(!validDate(r.start_date))l.reasons.push('Date de début invalide.');
   if(!['paid','closed','draft','cancelled'].includes(r.status))l.reasons.push('Statut commercial invalide.');
   if(!integer(r.quantity,1,100))l.reasons.push('La quantité doit être comprise entre 1 et 100.');
   if(!['hour','day'].includes(r.unit))l.reasons.push('L’unité doit être hour ou day.');
   if(!integer(r.duration,1,r.unit==='hour'?720:365))l.reasons.push('Durée hors des bornes de son unité.');
   if(cents(r.unit_rate)===null)l.reasons.push('Tarif invalide : montant positif ou nul, au plus deux décimales.');
   const key=String(Number(r.line_no));if(keys.has(key))conflict=true;keys.add(key);
  }
  const headerConflict=new Set(group.map(l=>JSON.stringify(['client_id','site_id','start_date','status'].map(k=>l.row[k as Column])))).size>1;
  if(conflict)group.forEach(l=>l.reasons.push('Même clé de ligne, contenus différents.'));
  if(headerConflict)group.forEach(l=>l.reasons.push('Attributs communs du contrat contradictoires.'));
  const reject=group.some(l=>l.reasons.length>0);
  for(const l of group){if(reject){l.decision='rejected';if(!l.reasons.length)l.reasons.push('Quarantaine : une autre ligne de ce contrat est invalide.')}else l.anomaly=Number(l.row.quantity)>20}
 }
 const accepted=lines.filter(l=>l.decision==='accepted'),rejected=lines.filter(l=>l.decision==='rejected').length,duplicates=lines.filter(l=>l.decision==='duplicate').length;
 const rate=lines.length-duplicates?rejected/(lines.length-duplicates)*100:0;
 return {lines,received:lines.length,duplicates,accepted:accepted.length,rejected,contracts:new Set(accepted.map(l=>l.row.contract_id)).size,anomalies:accepted.filter(l=>l.anomaly).length,rate,alert:rate>20,structure:false};
}
export type DB={rows:Row[];ledger:string[]};
export const emptyDB=():DB=>({rows:[],ledger:[]});
export function commit(db:DB,batch:Batch):{db:DB;status:'CHARGE'|'DEJA_CHARGE'|'CONFLIT'|'REJETE_STRUCTURE';added:number}{
 const report=analyze(batch);if(report.structure)return {db,status:'REJETE_STRUCTURE',added:0};
 if(db.ledger.includes(batch.fingerprint))return {db,status:'DEJA_CHARGE',added:0};
 const rows=report.lines.filter(l=>l.decision==='accepted').map(l=>l.row),ids=new Set(db.rows.map(r=>r.contract_id));
 if(rows.some(r=>ids.has(r.contract_id)))return {db,status:'CONFLIT',added:0};
 return {db:{rows:[...db.rows,...rows],ledger:[...db.ledger,batch.fingerprint]},status:'CHARGE',added:rows.length};
}
export function campusOf(site:string){return refs.sites.find(s=>s.site_id===Number(site))?.campus_id??0}
export function totals(db:DB){return {contracts:new Set(db.rows.map(r=>r.contract_id)).size,lines:db.rows.length,cents:db.rows.filter(included).reduce((s,r)=>s+amount(r),0),batches:db.ledger.length}}
export function daily(db:DB,campus=0){let sum=0;return Array.from({length:21},(_,i)=>{const date=`2026-11-${String(i+1).padStart(2,'0')}`;const value=db.rows.filter(r=>included(r)&&r.start_date===date&&(!campus||campusOf(r.site_id)===campus)).reduce((s,r)=>s+amount(r),0);sum+=value;return {date,day:i+1,cents:value,cumulative:sum}})}
export function units(db:DB,campus=0){return ['hour','day'].map(unit=>{const rows=db.rows.filter(r=>included(r)&&r.unit===unit&&(!campus||campusOf(r.site_id)===campus));return {unit,lines:rows.length,cents:rows.reduce((s,r)=>s+amount(r),0)}})}
export function ranking(db:DB,campus:number){const amounts=new Map<string,number>();db.rows.filter(r=>included(r)&&campusOf(r.site_id)===campus).forEach(r=>amounts.set(r.equipment_id,(amounts.get(r.equipment_id)??0)+amount(r)));let rank=0,previous=-1;return [...amounts].sort((a,b)=>b[1]-a[1]||Number(a[0])-Number(b[0])).map(([id,value],i)=>{if(value!==previous)rank=i+1;previous=value;return {id,cents:value,rank}})}
export const scenarios=[
 {id:'normal',label:'Sans erreur',hint:'Un premier chargement',batch:'propre-1'},
 {id:'qualite',label:'Défauts de qualité',hint:'Le contrat protège ses lignes',batch:'mixte-1'},
 {id:'rejeu',label:'Rejouer le lot',hint:'Zéro nouvel ajout',batch:'propre-1'},
 {id:'conflit',label:'Conflit entre lots',hint:'Tout ou rien',batch:'conflit'},
 {id:'panne',label:'Panne après commit',hint:'Conservé, puis reconnu',batch:'propre-1'},
 {id:'structure',label:'Colonne manquante',hint:'Arrêt avant les écritures',batch:'structure'}
] as const;
export type Scenario=typeof scenarios[number]['id'];
export type Frame={scene:number;title:string;text:string;node:number;action?:string};
export function frames(s:Scenario):Frame[]{
 const common:Frame[]=[
  {scene:0,title:'Au départ, un besoin sur le campus.',text:'Une association loue plusieurs exemplaires d’un équipement. Le guichet produit des lignes de contrat.',node:0},
  {scene:1,title:'Quatre fichiers, un lot complet.',text:'Le générateur publie les sources avec leurs empreintes et le marqueur READY. Le surveilleur peut alors lire le lot.',node:1},
  {scene:2,title:'Lire sans inventer de valeur.',text:'Les espaces périphériques sont retirés. Les statuts et les unités passent en minuscules. Les sources brutes sont conservées.',node:2},
  {scene:2,title:'Une répétition ne devient pas une vente.',text:'Après normalisation, une copie exacte compte une seule fois. La clé d’une ligne est (contract_id, line_no).',node:2},
  {scene:2,title:'Le contrat est l’unité de cohérence.',text:'Une seule ligne invalide suffit à isoler tout son contrat. Une quantité de 25 reste valide, avec un signalement.',node:3},
  {scene:3,title:'Préparer les écritures, ensemble.',text:'Les contrats valides et la signature du lot doivent être inscrits dans la même transaction. Rien n’est encore ajouté.',node:4},
  {scene:3,title:'Valider les données et le journal.',text:'Le commit conserve les données métier et la preuve du traitement. Les deux évoluent ensemble.',node:4},
  {scene:4,title:'Des lignes fiables deviennent des réponses.',text:'SQL calcule les montants retenus. Les contrats paid et closed contribuent ; draft et cancelled restent stockés sans contribuer.',node:5}
 ];
 if(s==='structure')return [...common.slice(0,2),{scene:2,title:'Le lot est refusé avant toute écriture.',text:'La colonne unit est absente. REJETE_STRUCTURE : les contrôles métier et le chargement ne démarrent pas.',node:2}];
 if(s==='rejeu'){common[5]={...common[5],title:'La signature figure déjà dans le journal.',text:'Les empreintes des deux sources et la version des règles identifient le traitement. Le nom du dossier ne suffit pas.'};common[6]={...common[6],title:'DEJA_CHARGE : zéro nouvel ajout.',text:'Les données ont été validées auparavant. Le rejeu ne double ni les lignes ni les montants.'};}
 if(s==='conflit'){common[6]={...common[6],title:'Le nouveau lot rencontre un contrat existant.',text:'Le contrat 1 est déjà chargé. Toute la transaction de ce nouveau lot est annulée : les autres contrats ne sont pas ajoutés.'};common[7]={...common[7],title:'Les données précédentes restent intactes.',text:'Le conflit n’est pas un rejeu et n’autorise aucune mise à jour implicite. Les compteurs du lot précédent ne changent pas.'};}
 if(s==='panne')return [...common.slice(0,7),{scene:3,title:'Une panne survient après le commit.',text:'Le programme échoue, mais les écritures sont déjà conservées. Le journal permet une reprise sans doublons.',node:4,action:'Reprendre le traitement'},{scene:3,title:'La reprise reconnaît le lot.',text:'DEJA_CHARGE : zéro ajout pendant cette nouvelle tentative. Les contrats et les montants restent identiques.',node:4},common[7]];
 return common;
}
export function snapshot(s:Scenario,index:number){
 const batch=batches[scenarios.find(x=>x.id===s)!.batch];const report=analyze(batch);
 const prior=s==='rejeu'||s==='conflit'?commit(emptyDB(),batches['propre-1']).db:emptyDB();
 const result=index>=6||(s==='structure'&&index>=2)?commit(prior,batch):{db:prior,status:'ATTENTE',added:0};
 return {batch,report,db:result.db,status:s==='panne'&&index>=8?'DEJA_CHARGE':s==='panne'&&index===7?'ECHEC_APRES_COMMIT':result.status,added:s==='panne'&&index>=8?0:result.added,...totals(result.db)};
}
export const columnInfo:Record<Column,string>={contract_id:'Identité du contrat, entier strictement positif.',client_id:'Association présente dans le référentiel.',site_id:'Guichet connu, rattaché à un campus.',start_date:'Date ISO. Le montant entier lui est rattaché.',status:'paid = payé ; closed = clôturé ; draft = brouillon ; cancelled = annulé.',line_no:'Numéro de ligne dans le contrat. Avec contract_id, il forme la clé.',equipment_id:'Type de matériel, pas un objet physique suivi individuellement.',quantity:'Nombre d’exemplaires : de 1 à 100. Plus de 20 : anomalie.',unit:'hour ou day : l’unité de la durée et du tarif.',duration:'De 1 à 720 heures, ou de 1 à 365 jours.',unit_rate:'Tarif historique en MAD, positif ou nul, au plus deux décimales.'};
export const glossary:Record<string,string>={
 'Lot':'Un ensemble de fichiers publié complet. Chaque contrat nouveau est complet dans un seul lot.',
 'Campagne':'Une série de lots du même générateur et du même dossier. Une autre campagne exige une base de démonstration distincte.',
 'Grain':'Ce que représente une ligne : ici, un type d’équipement loué dans un contrat.',
 'Quarantaine':'Isoler toutes les lignes d’un contrat invalide, avec valeurs brutes, positions source et motifs.',
 'Anomalie':'Une valeur inhabituelle à signaler, sans rejet si les règles de validité passent. Exemple : quantity = 25.',
 'Transaction':'Un ensemble d’écritures validées ensemble par commit ou annulées ensemble par rollback.',
 'Idempotence':'Pouvoir rejouer le même contenu avec les mêmes règles sans ajouter de doublons métier.',
 'Empreinte':'Une valeur SHA-256 permettant de vérifier le contenu d’un fichier. Elle ne prouve pas sa qualité métier.',
 'Signature du lot':'Identité de traitement construite avec les empreintes des deux sources et la version des règles.',
 'Référentiel':'Liste des campus, sites, clients, catégories et équipements autorisés.',
 'Montant retenu':'Quantité × durée × tarif. Seuls paid et closed contribuent. L’intégralité est rattachée à start_date.',
 'Traitement continu':'Des lots successifs pris en charge automatiquement. Ici, une arrivée régulière de petits lots, pas un système distribué en production.'
};
