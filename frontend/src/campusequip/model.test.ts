import { describe, it, expect } from 'vitest';
import expected from './expected.json';
import { analyze, amount, batches, cents, columns, commit, daily, emptyDB, ranking, snapshot, totals, units, validDate, type Batch, type Row } from './model';

const row:Row={contract_id:'2001',client_id:'1',site_id:'1',start_date:'2026-11-02',status:'paid',line_no:'1',equipment_id:'1',quantity:'2',unit:'hour',duration:'3',unit_rate:'25.00'};
const fixture=(rows:Row[],id='test'):Batch=>({...batches['propre-1'],id,fingerprint:id,rows,columns:[...columns]});

describe('Contrat pédagogique du PDF actuel',()=>{
 it('retrouve les résultats calculés indépendamment avec Decimal sur les six lots étudiants',()=>{
  for(const [name,goal] of Object.entries(expected)){
   const r=analyze(batches[name]);
   for(const key of ['received','duplicates','accepted','rejected','contracts','anomalies'] as const)expect(r[key],name+' '+key).toBe(goal[key]);
   expect(totals(commit(emptyDB(),batches[name]).db).cents,name+' montant').toBe(goal.cents);
  }
 });
 it('calcule les 150 + 400 = 550 MAD du sujet, sans convertir ni répartir les unités',()=>{
  const b=fixture([row,{...row,line_no:'2',equipment_id:'2',quantity:'1',unit:'day',duration:'2',unit_rate:'200.00'}]);
  const {db}=commit(emptyDB(),b);expect(amount(row)).toBe(15000);expect(totals(db).cents).toBe(55000);
  expect(daily(db,1)).toHaveLength(21);expect(daily(db,1)[0].cents).toBe(0);expect(daily(db,1)[1].cents).toBe(55000);expect(daily(db,1)[2].cents).toBe(0);expect(daily(db,1)[20].cumulative).toBe(55000);
  expect(units(db,1)).toEqual([{unit:'hour',lines:1,cents:15000},{unit:'day',lines:1,cents:40000}]);
 });
 it('conserve draft et cancelled sans les compter dans les montants',()=>{
  for(const status of ['draft','cancelled']){const r=commit(emptyDB(),fixture([{...row,status}]));expect(r.added).toBe(1);expect(totals(r.db).cents).toBe(0);}
 });
 it('normalise avant de dédoublonner et calcule le bon dénominateur',()=>{
  const r=analyze(fixture([row,{...row,status:' PAID ',unit:' HOUR ',unit_rate:' 25.00 '},{...row,contract_id:'2002',quantity:'-1'}]));
  expect(r.duplicates).toBe(1);expect(r.rejected).toBe(1);expect(r.accepted).toBe(1);expect(r.rate).toBe(50);expect(r.alert).toBe(true);
  expect(analyze(fixture([])).rate).toBe(0);
 });
 it('met tout le contrat en quarantaine sans perdre les positions ni les valeurs brutes',()=>{
  const bad={...row,line_no:'2',quantity:'-1'},r=analyze(fixture([row,bad,{...row,contract_id:'2002'}]));
  expect(r.rejected).toBe(2);expect(r.accepted).toBe(1);expect(r.lines[0].reasons.join(' ')).toContain('autre ligne');expect(r.lines[1].sourceRow).toBe(3);expect(r.lines[1].raw.quantity).toBe('-1');
 });
 it('distingue conflit de clé, conflit de contrat et simple anomalie',()=>{
  expect(analyze(fixture([row,{...row,duration:'4'}])).rejected).toBe(2);
  expect(analyze(fixture([row,{...row,line_no:'2',client_id:'2'}])).rejected).toBe(2);
  const r=analyze(fixture([{...row,quantity:'25'}]));expect(r.accepted).toBe(1);expect(r.anomalies).toBe(1);
 });
 it('refuse les dates impossibles, montants ambigus et durées hors limites',()=>{
  expect(validDate('2026-02-29')).toBe(false);expect(validDate('2024-02-29')).toBe(true);expect(validDate('2026-11-1')).toBe(false);
  for(const rate of ['-1','1,25','1e2','1.001',''])expect(cents(rate)).toBeNull();expect(cents('0.29')).toBe(29);
  for(const patch of [{duration:'721',unit:'hour'},{duration:'366',unit:'day'},{equipment_id:'999999'},{quantity:'101'},{unit_rate:'12.001'}])expect(analyze(fixture([{...row,...patch}])).rejected).toBe(1);
  expect(analyze(fixture([{...row,duration:'720'}])).accepted).toBe(1);expect(analyze(fixture([{...row,unit:'day',duration:'365'}])).accepted).toBe(1);
 });
 it('déclenche l’alerte strictement au-dessus de 20 %',()=>{
  const rows=Array.from({length:5},(_,i)=>({...row,contract_id:String(i+1),quantity:i===0?'-1':'2'}));
  const r=analyze(fixture(rows));expect(r.rate).toBe(20);expect(r.alert).toBe(false);
 });
 it('refuse un lot mal structuré sans écrire une signature',()=>{
  const r=commit(emptyDB(),batches.structure);expect(r.status).toBe('REJETE_STRUCTURE');expect(r.db).toEqual(emptyDB());expect(snapshot('structure',2).status).toBe('REJETE_STRUCTURE');
 });
 it('ne double aucun montant au rejeu ni après une panne post-commit',()=>{
  const first=commit(emptyDB(),batches['propre-1']),replay=commit(first.db,batches['propre-1']);expect(replay.status).toBe('DEJA_CHARGE');expect(replay.added).toBe(0);expect(replay.db).toBe(first.db);
  const failure=snapshot('panne',7),retry=snapshot('panne',8);expect(failure.status).toBe('ECHEC_APRES_COMMIT');expect(retry.status).toBe('DEJA_CHARGE');expect(retry.added).toBe(0);expect(retry.db).toEqual(failure.db);expect(retry.lines).toBe(41);
 });
 it('annule le nouveau lot entier en cas de contrat déjà chargé',()=>{
  const prior=commit(emptyDB(),batches['propre-1']).db,result=commit(prior,batches.conflit);expect(analyze(batches.conflit).accepted).toBe(39);expect(result.status).toBe('CONFLIT');expect(result.added).toBe(0);expect(result.db).toBe(prior);expect(totals(result.db).contracts).toBe(20);
 });
 it('enchaîne trois lots avec des identités distinctes et retrouve les sommes de contrôle',()=>{
  for(const profile of ['propre','mixte']){
   let db=emptyDB();for(let n=1;n<=3;n++){const r=commit(db,batches[`${profile}-${n}`]);expect(r.status).toBe('CHARGE');db=r.db;}
   expect(totals(db)).toEqual(profile==='propre'?{contracts:60,lines:115,cents:5858200,batches:3}:{contracts:48,lines:92,cents:6301700,batches:3});
  }
 });
 it('donne le même rang aux équipements ex æquo, avec un saut après l’égalité',()=>{
  const rows=[row,{...row,line_no:'2',equipment_id:'2'},{...row,line_no:'3',equipment_id:'3',unit_rate:'10.00'}];
  expect(ranking(commit(emptyDB(),fixture(rows)).db,1).map(r=>r.rank)).toEqual([1,1,3]);
 });
});
