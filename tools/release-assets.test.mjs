import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizePackages, assembleReleaseAssets, draftUploadPlan, existingReleaseForTag } from './release-assets.mjs';
const version='2026.45.0';
const prefix='Open.Pile.Plan.Studio_'+version;
test('finds an unpublished draft through all release-list pages', ()=>{
  const draft={tag_name:'v'+version,draft:true,prerelease:true,assets:[{name:'signed.exe'}]};
  assert.deepEqual(existingReleaseForTag([[{tag_name:'older'}],[draft]],'v'+version),
    {tagName:'v'+version,isDraft:true,isPrerelease:true,assets:draft.assets});
  assert.equal(existingReleaseForTag([[draft]],'v2026.45.2'),null);
});
test('published releases remain visible to the mutation refusal guard', ()=>{
  const release=existingReleaseForTag([[{tag_name:'v'+version,draft:false,prerelease:true,assets:[]}]],'v'+version);
  assert.throws(()=>draftUploadPlan(release,'v'+version,[]),/published/);
});
test('ambiguous releases and malformed list responses fail before creating a draft', ()=>{
  const draft={tag_name:'v'+version,draft:true,prerelease:true,assets:[]};
  assert.throws(()=>existingReleaseForTag([[draft],[draft]],'v'+version),/Multiple/);
  assert.throws(()=>existingReleaseForTag([{message:'request failed'}],'v'+version),/release list/);
});
function fixture(t) {
  const path=mkdtempSync(join(tmpdir(),'pile-release-'));
  t.after(()=>{assert(resolve(path).startsWith(resolve(tmpdir())+sep));rmSync(path,{recursive:true,force:true});});
  for(const folder of ['windows','linux','macos'])mkdirSync(join(path,folder));
  const files={windows:[prefix+'_x64-setup.exe'],linux:[prefix+'_amd64.deb',prefix+'_amd64.AppImage'],macos:[prefix+'_universal.dmg']};
  for(const [folder,names] of Object.entries(files))for(const name of names)writeFileSync(join(path,folder,name),'verified-by-native-job:'+name);
  const hashes=files.linux.map(name=>createHash('sha256').update(readFileSync(join(path,'linux',name))).digest('hex')+'  '+name+'\n').join('');
  writeFileSync(join(path,'linux','SHA256SUMS'),hashes);
  for(const name of [...files.linux,'SHA256SUMS'])writeFileSync(join(path,'linux',name+'.asc'),'detached signature fixture');
  writeFileSync(join(path,'linux','linux-signing-public-key.asc'),'public key fixture');
  writeFileSync(join(path,'linux','linux-signing-fingerprint.txt'),'13F6D414ADEE4ED4CD09AC60601D86C93C504D29\n');
  return path;
}
test('public filename normalization happens before signed manifests are produced', t=>{
  const path=fixture(t),folder=join(path,'fresh');mkdirSync(folder);
  const original='Open Pile Plan Studio_'+version+'_amd64.deb';
  writeFileSync(join(folder,original),'payload');normalizePackages(folder);
  assert.equal(readFileSync(join(folder,prefix+'_amd64.deb'),'utf8'),'payload');
  assert(!existsSync(join(folder,original)));
  writeFileSync(join(folder,original),'collision');
  assert.throws(()=>normalizePackages(folder),/collision/i);
  assert(existsSync(join(folder,original)));
});
test('assembly preserves Linux signed bytes and produces checksums for exactly four installers', t=>{
  const path=fixture(t),out=join(path,'out');
  const assets=assembleReleaseAssets(path,out,version);
  assert.equal(assets.length,12);
  assert.equal(readFileSync(join(out,'SHA256SUMS-linux'),'utf8'),readFileSync(join(path,'linux','SHA256SUMS'),'utf8'));
  assert.equal(readFileSync(join(out,'SHA256SUMS-linux.asc'),'utf8'),'detached signature fixture');
  assert.equal(readFileSync(join(out,'SHA256SUMS'),'utf8').trim().split('\n').length,4);
  assert(assets.every(a=>a.name&&!a.name.includes(' ')&&a.digest.startsWith('sha256:')));
});
test('missing signatures, changed payloads, unexpected installers and version drift fail assembly', t=>{
  for(const change of ['signature','payload','extra','version']) {
    const path=fixture(t);
    if(change==='signature')rmSync(join(path,'linux',prefix+'_amd64.deb.asc'));
    if(change==='payload')writeFileSync(join(path,'linux',prefix+'_amd64.deb'),'tampered');
    if(change==='extra')writeFileSync(join(path,'macos','other.dmg'),'unexpected');
    assert.throws(()=>assembleReleaseAssets(path,join(path,'out'),change==='version'?'2026.45.1':version));
  }
});
test('a draft retry only uploads missing identical assets and refuses published or changed releases', ()=>{
  const asset={name:'installer.exe',size:3,digest:'sha256:'+('a'.repeat(64))};
  const release={tagName:'v'+version,isDraft:true,isPrerelease:true,assets:[]};
  assert.deepEqual(draftUploadPlan(release,'v'+version,[asset]),[asset]);
  assert.deepEqual(draftUploadPlan({...release,assets:[asset]},'v'+version,[asset]),[]);
  for(const change of [{isDraft:false},{isPrerelease:false},{tagName:'vother'},{assets:[{...asset,digest:'sha256:'+('b'.repeat(64))}]},
    {assets:[{...asset,name:'unowned.txt'}]},{assets:[{...asset,digest:null}]}]) {
    assert.throws(()=>draftUploadPlan({...release,...change},'v'+version,[asset]));
  }
});
