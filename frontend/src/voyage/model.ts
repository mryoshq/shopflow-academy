export type Scenario = 'normal' | 'after-commit' | 'replay' | 'redis';
export type Task = 'wait_source' | 'preflight' | 'load_orders' | 'load_events' | 'refresh_cache' | 'rebuild_queue' | 'verify_result';
export type TaskStatus = 'waiting' | 'running' | 'success' | 'error' | 'retry';
export const TASKS: Task[] = ['wait_source','preflight','load_orders','load_events','refresh_cache','rebuild_queue','verify_result'];
export const EDGES: [Task,Task][] = [['wait_source','preflight'],['preflight','load_orders'],['load_orders','load_events'],['load_orders','refresh_cache'],['load_events','rebuild_queue'],['rebuild_queue','verify_result'],['refresh_cache','verify_result']];
export const BASE = { orders:10, lines:13, revenue:3400, customers:5, categories:5, products:6 };
export const BATCH = { source:18, accepted:7, rejected:10, duplicates:1, orderIds:[1001,1002,1003,1004,1005,1012], revenue:2025, events:{source:14,inserted:9,duplicates:1,rejected:4}, queue:[1005,1002], cache:[{date:'7 octobre 2026', amount:1200},{date:'8 octobre 2026',amount:825}], ttl:60 };
export const money = (v:number) => new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v).replace(/[\u00a0\u202f]/g,' ');
export const rawLine='1001,1,2026-10-07, PAID ,"10,00",1,101,2,"100,00"';
export const columns=['order_id','customer_id','order_date','status','shipping_fee','line_no','product_id','quantity','unit_price'];
export const files = [
 {name:'lot_octobre.csv', type:'CSV',count:'18 lignes sources',description:'Un tableau : une ligne par ligne de commande. Neuf colonnes, séparées par des virgules.',content:columns.join(', ')+'\n'+rawLine+'\n\nSeule cette ligne exacte a été fournie. Le fichier complet du kit est indisponible.'},
 {name:'evenements_transporteurs.jsonl',type:'JSONL',count:'14 entrées',description:'Un objet JSON indépendant par ligne. Plusieurs événements peuvent concerner une même livraison.',content:'Documents exacts indisponibles. Résultat attendu : 9 insertions, 1 doublon, 4 rejets. Aucun champ ou horodatage inventé.'},
 {name:'catalogues.json',type:'JSON',count:'5 clients · 6 produits',description:'Un document structuré qui contient les références métier autorisées.',content:'5 clients et 6 produits autorisés. Le contenu exact des catalogues n’est pas accessible.'},
 {name:'quantites_reference.csv',type:'CSV',count:'100 quantités',description:'Un échantillon pour une comparaison descriptive ; ce n’est pas une liste de commandes à charger.',content:'100 quantités de référence. Valeurs exactes indisponibles.'},
 {name:'manifest.json',type:'SHA-256',count:'4 empreintes',description:'Le manifeste permet de comparer le contenu des quatre fichiers de données à leur empreinte attendue.',content:'Empreintes SHA-256 des quatre fichiers de données. Empreintes exactes non fournies. Fichier intact ne signifie pas données métier valides.'},
 {name:'READY',type:'TÉMOIN',count:'Disponibilité du lot',description:'Sa présence signale que le lot est disponible pour être contrôlé.',content:'wait_source attend ce témoin avant de lancer preflight.'}
];
export const scenes=[
 {title:'Avant le nouveau lot',short:'Le point de départ',description:'Une entreprise, des commandes, plusieurs grains de données.'},
 {title:'Les sources arrivent',short:'Les fichiers sources',description:'Un lot prêt à entrer dans le pipeline.'},
 {title:'Attendre et vérifier',short:'Les préconditions',description:'Être prêt à lire, puis vérifier l’intégrité.'},
 {title:'Contrôler et charger',short:'La qualité des commandes',description:'Des lignes brutes aux écritures validées.'},
 {title:'Suivre les livraisons',short:'Les événements',description:'Chaque événement enrichit l’histoire d’une livraison.'},
 {title:'Deux usages de Redis',short:'Le cache et la file',description:'Accélérer les lectures et organiser les exceptions.'},
 {title:'Vérifier et observer',short:'La confiance, mesurée',description:'Rapprocher les résultats et garder une trace des tentatives.'}
];
export interface Frame { id:string; scene:number; title:string; detail:string; task?:Task; status?:TaskStatus; effect?:'commit'|'events'|'cache'|'queue'; gate?:boolean }
export function makeFrames(scenario:Scenario,cacheFirst=false):Frame[]{
 const frames:Frame[]=[
 {id:'initial',scene:0,title:'Tout commence par une donnée.',detail:'5 clients, 5 catégories et 6 produits. Une commande contient une ou plusieurs lignes ; une livraison peut produire plusieurs événements.'},
 {id:'sources',scene:1,title:'Six fichiers. Un nouveau lot.',detail:'18 lignes de commande et 14 entrées de livraison attendent leur traitement. Ouvrez une carte pour explorer le format.'},
 {id:'wait',scene:2,title:'Le pipeline attend le signal.',detail:'wait_source attend le témoin READY. Aucune donnée métier n’est encore écrite.',task:'wait_source',status:'running'},
 {id:'ready',scene:2,title:'Le lot est disponible.',detail:'READY est présent. La dépendance de preflight est satisfaite.',task:'wait_source',status:'success'},
 {id:'preflight',scene:2,title:'Intact ne veut pas dire valide.',detail:'Les préconditions et les quatre empreintes SHA-256 sont vérifiées dans cette simulation. Les erreurs métier seront contrôlées ensuite.',task:'preflight',status:'success'},
 {id:'read',scene:3,title:'18 lignes, neuf colonnes.',detail:'Lecture de lot_octobre.csv. Ces opérations sont internes à load_orders : elles ne créent aucune nouvelle tâche Airflow.',task:'load_orders',status:'running'},
 {id:'normalize',scene:3,title:'Une même donnée, une forme commune.',detail:'Les espaces sont retirés, le statut est mis en minuscules et les montants avec virgule sont interprétés. La valeur brute reste consultable.',task:'load_orders',status:'running'},
 {id:'validate',scene:3,title:'Chaque ligne passe les contrôles.',detail:'Vérification des références client et produit, des dates, des quantités et de la cohérence entre les lignes d’une même commande.',task:'load_orders',status:'running'},
 {id:'split',scene:3,title:'18 = 7 + 10 + 1',detail:'7 lignes acceptées, 10 rejets métier et 1 doublon source. HIGH_REJECT_RATE reste visible même si le pipeline réussit.',task:'load_orders',status:'running'},
 {id:'commit',scene:3,title:scenario==='replay'?'Le registre reconnaît ce lot.':'Les écritures sont validées.',detail:scenario==='replay'?'SKIPPED_ALREADY_LOADED : les commandes, lignes et montants déjà enregistrés ne sont pas ajoutés une seconde fois.':'Les 7 lignes acceptées représentent 6 commandes. Le commit valide le chargement et son inscription au registre du lot.',task:'load_orders',status:scenario==='after-commit'?'running':'success',effect:'commit'}
 ];
 if(scenario==='after-commit')frames.push(
 {id:'after-fail',scene:3,title:'La tâche a échoué après la validation des données.',detail:'AFTER_COMMIT_DEMO · fail_after_orders_once=true. Les écritures restent en base : aucun rollback ne suit ce commit.',task:'load_orders',status:'error'},
 {id:'retry',scene:3,title:'Airflow prépare une nouvelle tentative.',detail:'Le retry relance la tâche. Le registre permet de reconnaître que le lot a déjà été chargé.',task:'load_orders',status:'retry'},
 {id:'idempotent',scene:3,title:'Reprendre sans compter deux fois.',detail:'SKIPPED_ALREADY_LOADED : la reprise conserve 16 commandes, 20 lignes et 5 425,00 MAD. Le pipeline peut continuer.',task:'load_orders',status:'success'});
 const events:Frame={id:'events',scene:4,title:'Des événements à un état de livraison.',detail:scenario==='replay'?'Rejeu MongoDB : 0 insertion, 10 doublons et 4 rejets. Les 9 événements enregistrés restent présents.':'14 entrées JSONL : 9 événements insérés, 1 doublon et 4 rejets. L’état de livraison se déduit des événements.',task:'load_events',status:'success',effect:'events'};
 const cache:Frame={id:'cache',scene:5,title:'Un raccourci temporaire vers les agrégats.',detail:'refresh_cache lit les agrégats PostgreSQL : 1 200,00 MAD le 7 octobre et 825,00 MAD le 8 octobre. TTL : 60 secondes.',task:'refresh_cache',status:'success',effect:'cache'};
 if(scenario==='redis'){
 frames.push(events,{...cache,id:'cache-fail',title:'Redis est indisponible.',detail:'refresh_cache échoue. Les commandes PostgreSQL et les événements MongoDB restent chargés.',status:'error',effect:undefined},
 {id:'queue-fail',scene:5,title:'La file ne peut pas être reconstruite.',detail:'rebuild_queue échoue à son tour. verify_result attend la réussite des deux branches.',task:'rebuild_queue',status:'error'},
 {id:'redis-block',scene:5,title:'Le contrôle final attend Redis.',detail:'Rétablissez Redis pour rejouer les tâches concernées. Aucun succès final n’est annoncé.',gate:true},
 {...cache,id:'cache-retry',title:'Redis rétabli : le cache est rafraîchi.'});
 }else frames.push(...(cacheFirst?[cache,events]:[events,cache]));
 frames.push({id:'queue',scene:5,title:'Les exceptions ont leur propre file.',detail:'rebuild_queue dérive les états de livraison pertinents et reconstruit [1005, 1002], dans cet ordre. Cette file n’exécute pas Airflow.',task:'rebuild_queue',status:'success',effect:'queue'},
 {id:'verify',scene:6,title:'Des résultats rapprochés. Un parcours traçable.',detail:'16 commandes, 20 lignes, 5 425,00 MAD, 9 événements MongoDB et la file [1005, 1002] : les résultats attendus sont vérifiés.',task:'verify_result',status:'success'},
 {id:'observe',scene:6,title:'Chaque tentative laisse une trace.',detail:'monitoring.task_attempts conserve les durées, réussites et erreurs. TimescaleDB permet les séries temporelles et les agrégations avec time_bucket.'});
 return frames;
}
export function snapshot(frames:Frame[],index:number,scenario:Scenario){
 let committed=scenario==='replay',events=scenario==='replay',cache=false,queue=false;
 const tasks=Object.fromEntries(TASKS.map(t=>[t,'waiting'])) as Record<Task,TaskStatus>;
 const logs: {task:string;status:TaskStatus;message:string;attempt:number;duration:number}[]=[];
 for(const [i,f] of frames.slice(0,index+1).entries()){
  if(f.task&&f.status){tasks[f.task]=f.status;if(['success','error'].includes(f.status)) logs.push({task:f.task,status:f.status,message:f.detail,attempt:logs.filter(x=>x.task===f.task).length+1,duration:(i%4+1)*.4});}
  if(f.effect==='commit')committed=true;
  if(f.effect==='events')events=true;
  if(f.effect==='cache')cache=true;
  if(f.effect==='queue')queue=true;
 }
 return {committed,events,cache,queue,tasks,logs,orders:BASE.orders+(committed?6:0),lines:BASE.lines+(committed?BATCH.accepted:0),revenue:BASE.revenue+(committed?BATCH.revenue:0),eventCount:events?BATCH.events.inserted:0,verified:tasks.verify_result==='success'};
}
export const glossary:Record<string,string>={
 'Pipeline':'Une chaîne de traitements qui transforme des sources en résultats exploitables. ShopFlow va du lot de fichiers aux stockages vérifiés.',
 'Lot':'Un ensemble de fichiers traité comme une unité. Ici : les quatre fichiers de données, leur manifeste et READY.',
 'Grain':'Ce que représente une ligne ou un document. Une ligne de commande et un événement de livraison ont des grains différents.',
 'Clé métier':'Identifiant issu du métier. order_id identifie la commande ; order_id et line_no identifient ensemble sa ligne.',
 'Normalisation':'Mettre les valeurs dans une forme commune : « PAID » entouré d’espaces devient « paid ».',
 'Validation':'Vérifier les règles métier avant d’accepter : client connu, produit connu, date valide, quantité autorisée et commande cohérente.',
 'Doublon':'Une donnée reconnue comme déjà présente. 1 doublon source est écarté des 18 lignes ; au rejeu MongoDB, 10 entrées sont des doublons.',
 'Rejet':'Une donnée qui ne satisfait pas les contrôles. Les 10 lignes rejetées ne sont pas chargées ; leurs motifs doivent être conservés.',
 'Transaction':'Un ensemble d’écritures validé ensemble ou annulé avant validation. Dans ShopFlow, chargement et registre du lot sont associés.',
 'Commit':'La validation définitive d’une transaction. Une panne de tâche après commit n’efface pas les données.',
 'Rollback':'L’annulation d’une transaction non validée. Il n’annule pas un commit déjà effectué.',
 'Idempotence':'Répéter un traitement sans dupliquer son effet métier. Le registre du lot évite de recharger les commandes.',
 'DAG':'Graphe orienté sans cycle. shopflow_pipeline exprime les tâches et leurs dépendances.',
 'Dépendance':'Une condition d’exécution. verify_result attend la réussite de refresh_cache et de rebuild_queue.',
 'Retry':'Une nouvelle tentative après un échec. Elle doit reconnaître les écritures déjà validées.',
 'Document':'Un objet structuré stocké dans MongoDB. Chaque événement de livraison est un document distinct.',
 'Cache':'Une copie temporaire destinée à accélérer les lectures. Les agrégats PostgreSQL demeurent la source persistante.',
 'TTL':'Durée de vie d’une clé de cache : 60 secondes. À expiration, la clé disparaît de Redis.',
 'File':'Une séquence ordonnée. La file des exceptions ShopFlow vaut [1005, 1002]. Ce n’est pas le moteur d’Airflow.',
 'Série temporelle':'Des mesures associées aux heures d’exécution : durée et résultat de chaque tentative.',
 'Hypertable':'Une table PostgreSQL organisée par TimescaleDB en partitions temporelles pour gérer les mesures dans le temps.',
 'time_bucket':'Une fonction qui regroupe les mesures par fenêtres temporelles, par exemple la durée moyenne des tentatives par minute.',
 'Empreinte':'Une signature calculée du contenu. SHA-256 vérifie qu’un fichier correspond au contenu attendu, sans garantir sa validité métier.'
};
export const contexts:Record<Task,{objective:string;input:string;transformation:string;output:string;control:string;concept:string}>={
 wait_source:{objective:'Attendre un lot complet avant de commencer.',input:'Présence ou absence du témoin READY.',transformation:'Vérifier la disponibilité du témoin.',output:'Le feu vert vers preflight.',control:'Le témoin READY doit être présent.',concept:'Dépendance'},
 preflight:{objective:'Vérifier les préconditions et l’intégrité des sources.',input:'manifest.json et les quatre fichiers de données.',transformation:'Comparer les empreintes SHA-256 aux empreintes attendues.',output:'Un lot dont le contenu est intact.',control:'Les préconditions et les empreintes correspondent.',concept:'Empreinte'},
 load_orders:{objective:'Transformer les lignes brutes en commandes fiables.',input:'18 lignes de lot_octobre.csv et les catalogues autorisés.',transformation:'Lire, normaliser, valider, trier, puis charger dans une transaction.',output:'7 lignes acceptées, 6 nouvelles commandes ; 10 rejets et 1 doublon écartés.',control:'Le commit et le registre du lot permettent une reprise idempotente.',concept:'Transaction'},
 load_events:{objective:'Conserver l’histoire des livraisons.',input:'14 entrées de evenements_transporteurs.jsonl.',transformation:'Valider les événements et détecter les doublons.',output:'9 documents MongoDB insérés ; 1 doublon et 4 rejets. Au rejeu : 0 insertion, 10 doublons et 4 rejets.',control:'load_orders doit avoir réussi.',concept:'Document'},
 refresh_cache:{objective:'Accélérer la lecture des agrégats quotidiens.',input:'Les vues analytiques PostgreSQL.',transformation:'Copier les montants quotidiens dans Redis avec un TTL.',output:'7 octobre : 1 200,00 MAD ; 8 octobre : 825,00 MAD ; TTL 60 s.',control:'load_orders doit avoir réussi et Redis doit être disponible.',concept:'Cache'},
 rebuild_queue:{objective:'Rendre les exceptions de livraison exploitables.',input:'Les états dérivés des événements MongoDB.',transformation:'Reconstruire la séquence des commandes en exception.',output:'La file Redis [1005, 1002], dans cet ordre.',control:'load_events doit avoir réussi et Redis doit être disponible.',concept:'File'},
 verify_result:{objective:'S’assurer que les destinations racontent la même histoire.',input:'Commandes, lignes, CA, événements et file d’exceptions.',transformation:'Rapprocher les résultats avec les valeurs attendues.',output:'16 commandes, 20 lignes, 5 425,00 MAD, 9 événements, [1005, 1002].',control:'refresh_cache ET rebuild_queue doivent avoir réussi.',concept:'Série temporelle'}
};
export const services=[
 {name:'Airflow',label:'ORCHESTRATION',icon:'workflow',role:'Organise les dépendances, tentatives et suivi de shopflow_pipeline.'},
 {name:'PostgreSQL',label:'MÉTIER + TIMESCALEDB',icon:'database',role:'Commandes, lignes, vues analytiques, registre des chargements et métriques. TimescaleDB est une extension de ce service.'},
 {name:'PostgreSQL',label:'MÉTADONNÉES AIRFLOW',icon:'database',role:'État des exécutions et des tâches Airflow. Les commandes métier ne passent pas par cette base.'},
 {name:'MongoDB',label:'ÉVÉNEMENTS',icon:'layers',role:'Documents des événements de livraison ; plusieurs événements peuvent appartenir à une commande.'},
 {name:'Redis',label:'CACHE + FILE',icon:'stack',role:'Deux espaces : le cache temporaire des agrégats et la file ordonnée des exceptions de livraison.'}
];
