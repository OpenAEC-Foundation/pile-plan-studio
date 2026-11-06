import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseReleaseVersion } from './release-version.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function normalizePackages(directory) {
  const changes=readdirSync(directory).filter(n=>/\.(exe|deb|AppImage|dmg)$/.test(n))
    .map(name=>({name,target:name.replaceAll(' ','.')})).filter(x=>x.name!==x.target);
  if(changes.some(x=>existsSync(join(directory,x.target))))throw new Error('Public asset filename collision.');
  for(const {name,target} of changes)renameSync(join(directory,name),join(directory,target));
}
export function assembleReleaseAssets(input, output, version, context={}) {
  parseReleaseVersion(version);
  const prefix='Open.Pile.Plan.Studio_'+version;
  const groups={windows:[prefix+'_x64-setup.exe'],linux:[prefix+'_amd64.deb',prefix+'_amd64.AppImage'],macos:[prefix+'_universal.dmg']};
  const packages=[];
  for(const [group,expected] of Object.entries(groups)) {
    const actual=readdirSync(join(input,group)).filter(n=>/\.(exe|deb|AppImage|dmg)$/.test(n)).sort();
    if(JSON.stringify(actual)!==JSON.stringify([...expected].sort()))throw new Error('Missing, unexpected or wrong-version '+group+' package.');
    for(const name of expected)packages.push({group,name,bytes:readFileSync(join(input,group,name))});
  }
  const signedSums=readFileSync(join(input,'linux','SHA256SUMS'),'utf8');
  const lines=signedSums.trim().split(/\r?\n/);
  const expectedSums=packages.filter(p=>p.group==='linux').map(p=>hash(p.bytes)+'  '+p.name).sort();
  if(JSON.stringify(lines.sort())!==JSON.stringify(expectedSums))throw new Error('Linux signed checksum manifest does not match delivered packages.');
  const copies=packages.map(p=>({from:join(input,p.group,p.name),name:p.name}));
  for(const name of [...groups.linux.map(n=>n+'.asc'),'linux-signing-public-key.asc','linux-signing-fingerprint.txt']) {
    const from=join(input,'linux',name);
    if(!readFileSync(from).length)throw new Error('Empty Linux verification material: '+name);
    copies.push({from,name});
  }
  for(const suffix of ['', '.asc']) {
    const from=join(input,'linux','SHA256SUMS'+suffix);
    if(!readFileSync(from).length)throw new Error('Empty signed Linux manifest.');
    copies.push({from,name:'SHA256SUMS-linux'+suffix});
  }
  // Validate all inputs before creating a partial output directory.
  if(existsSync(output))throw new Error('Release asset output already exists.');
  mkdirSync(output,{recursive:true});
  for(const {from,name} of copies)copyFileSync(from,join(output,name));
  writeFileSync(join(output,'SHA256SUMS'),packages.map(p=>hash(p.bytes)+'  '+p.name+'\n').join(''));
  writeFileSync(join(output,'release-manifest.json'),JSON.stringify({version,tag:'v'+version,
    source_sha:context.sha??null,build_run:context.runUrl??null,
    packages:packages.map(p=>({name:p.name,sha256:hash(p.bytes),size:p.bytes.length}))},null,2)+'\n');
  return readdirSync(output).sort().map(name=>{
    const bytes=readFileSync(join(output,name));return {name,size:bytes.length,digest:'sha256:'+hash(bytes)};
  });
}
export function draftUploadPlan(release, tag, assets) {
  if(release.tagName!==tag || release.isDraft!==true || release.isPrerelease!==true)
    throw new Error('Refusing to change a published, non-alpha or unrelated release.');
  const planned=new Map(assets.map(a=>[a.name,a]));
  for(const existing of release.assets??[]) {
    const expected=planned.get(existing.name);
    if(!expected || !existing.digest || existing.digest!==expected.digest || existing.size!==expected.size)
      throw new Error('Draft asset differs from this build; refusing to replace '+existing.name);
    planned.delete(existing.name);
  }
  return [...planned.values()];
}
export function existingReleaseForTag(pages, tag) {
  if(!Array.isArray(pages) || !pages.every(Array.isArray))throw new Error('Invalid release list response.');
  const matches=pages.flat().filter(release=>release.tag_name===tag);
  if(matches.length>1)throw new Error('Multiple releases use this tag; refusing an ambiguous draft.');
  if(!matches.length)return null;
  const release=matches[0];
  return {tagName:release.tag_name,isDraft:release.draft,isPrerelease:release.prerelease,assets:release.assets};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]!=='normalize' || !process.argv[3])throw new Error('Usage: release-assets.mjs normalize DIRECTORY');
  normalizePackages(process.argv[3]);
}
