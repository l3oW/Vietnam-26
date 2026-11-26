import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FRUIT_CATALOG,fruitSelection,matchingFruit,tripMonths} from '../lib/fruits.mjs';
test('Easter excludes summer-only crops but keeps year-round Vietnamese fruit',()=>{
 const {fruits}=fruitSelection('2027-03-20');const ids=fruits.map(f=>f.id);
 for(const id of ['papaya','drachenfrucht','mango','guave','durian','rambutan','sapodilla','sternapfel'])assert.ok(ids.includes(id),id);
 for(const id of ['mangostan','litschi','zimtapfel'])assert.equal(ids.includes(id),false,id);
 assert.equal(fruits.find(f=>f.id==='durian').availability,'Regional erhältlich');
});
test('Pentecost adds summer fruit and hidden fruit checks do not inflate the count',()=>{
 const s=fruitSelection('2027-05-15',[],['fruit-mangostan','fruit-papaya','fruit-sternapfel']);
 assert.ok(s.fruits.some(f=>f.id==='mangostan'&&f.tasted));assert.ok(s.fruits.some(f=>f.id==='litschi'));assert.equal(s.fruitSummary.tasted,2);
 assert.equal(fruitSelection('2027-03-20',[],['fruit-sternapfel']).fruitSummary.tasted,1);
});
test('Month boundaries and year boundaries include both travel months',()=>{
 assert.deepEqual(tripMonths('2027-04-25'),[4,5]);assert.deepEqual(tripMonths('2027-12-25'),[12,1]);assert.deepEqual(tripMonths('invalid'),[]);
 assert.ok(fruitSelection('2027-04-25').fruits.some(f=>f.id==='mangostan'));
});
test('Own discoveries count once and deletion permission is author-specific',()=>{
 const c=[{id:'custom-one',name:'Unser Fund',local_name:'Name vor Ort',notes:'Süß',author_id:'leo'}];
 const first=fruitSelection('2027-03-20',c,['fruit-custom-one'],'leo');assert.equal(first.fruitSummary.custom,1);assert.equal(first.fruitSummary.tasted,1);
 assert.equal(first.fruits.at(-1).canDelete,true);assert.equal(fruitSelection('2027-05-15',c,[],'mama').fruits.at(-1).canDelete,false);
});
test('Catalogue IDs and normalized name aliases avoid duplicates',()=>{
 assert.equal(new Set(FRUIT_CATALOG.map(f=>f.id)).size,FRUIT_CATALOG.length);
 assert.equal(matchingFruit(' MÁNGO ').id,'mango');assert.equal(matchingFruit('Pitaya').id,'drachenfrucht');assert.equal(matchingFruit('Măng cụt').id,'mangostan');
});
