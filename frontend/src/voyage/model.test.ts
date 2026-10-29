import { describe, expect, it } from 'vitest';
import { BATCH,EDGES,makeFrames,money,snapshot,type Scenario } from './model';
describe('ShopFlow : invariants métier et orchestration',()=>{
 it('conserve exactement les dépendances du DAG demandé',()=>{
  expect(EDGES).toEqual([['wait_source','preflight'],['preflight','load_orders'],['load_orders','load_events'],['load_orders','refresh_cache'],['load_events','rebuild_queue'],['rebuild_queue','verify_result'],['refresh_cache','verify_result']]);
 });
 it('formate les montants en français sans modifier la valeur',()=>{expect(money(5425)).toBe('5 425,00');expect(money(2025)).toBe('2 025,00')});
 it('réconcilie les grains et les montants',()=>{
  expect(BATCH.source).toBe(BATCH.accepted+BATCH.rejected+BATCH.duplicates);
  expect(BATCH.orderIds).toHaveLength(6);
  expect(BATCH.events.source).toBe(BATCH.events.inserted+BATCH.events.duplicates+BATCH.events.rejected);
  expect(BATCH.cache.reduce((sum,r)=>sum+r.amount,0)).toBe(BATCH.revenue);
 });
 for(const scenario of ['normal','after-commit','replay','redis'] as Scenario[])for(const first of [false,true]){
  it(`${scenario}, cache premier=${first} : ne vérifie qu’après les deux branches`,()=>{
   const frames=makeFrames(scenario,first);
   for(let i=0;i<frames.length;i++){
    const s=snapshot(frames,i,scenario);
    if(s.verified){expect(s.tasks.refresh_cache).toBe('success');expect(s.tasks.rebuild_queue).toBe('success');}
    if(s.tasks.rebuild_queue==='success')expect(s.tasks.load_events).toBe('success');
    if(s.tasks.load_events!=='waiting')expect(s.tasks.load_orders).toBe('success');
   }
   const final=snapshot(frames,frames.length-1,scenario);
   expect([final.orders,final.lines,final.revenue,final.eventCount]).toEqual([16,20,5425,9]);
   expect(final.queue).toBe(true);expect(final.verified).toBe(true);
  });
 }
 it('une panne après commit conserve les écritures et reprend sans double chargement',()=>{
  const frames=makeFrames('after-commit');
  const failed=snapshot(frames,frames.findIndex(f=>f.id==='after-fail'),'after-commit');
  expect(failed.tasks.load_orders).toBe('error');expect(failed.committed).toBe(true);
  expect([failed.orders,failed.lines,failed.revenue]).toEqual([16,20,5425]);
  const retry=snapshot(frames,frames.findIndex(f=>f.id==='idempotent'),'after-commit');
  expect([retry.orders,retry.lines,retry.revenue]).toEqual([16,20,5425]);
  expect(retry.logs.filter(l=>l.task==='load_orders').map(l=>l.status)).toEqual(['error','success']);
 });
 it('le rejeu commence avec les données persistantes déjà chargées',()=>{
  const s=snapshot(makeFrames('replay'),0,'replay');
  expect([s.orders,s.lines,s.revenue,s.eventCount]).toEqual([16,20,5425,9]);
  expect(s.verified).toBe(false);
 });
 it('Redis échoue sans effacer PostgreSQL ni MongoDB et bloque le contrôle',()=>{
  const frames=makeFrames('redis');const n=frames.findIndex(f=>f.gate);
  expect(n).toBeGreaterThan(0);const s=snapshot(frames,n,'redis');
  expect([s.orders,s.lines,s.revenue,s.eventCount]).toEqual([16,20,5425,9]);
  expect(s.tasks.refresh_cache).toBe('error');expect(s.tasks.rebuild_queue).toBe('error');
  expect(s.verified).toBe(false);expect(s.cache).toBe(false);expect(s.queue).toBe(false);
 });
});
