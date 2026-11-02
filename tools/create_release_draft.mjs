// The only release mutation entry point. Never publishes or replaces assets.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkProject } from './release-project.mjs';
import { amsterdamDate } from './release-version.mjs';
import { assembleReleaseAssets, draftUploadPlan, existingReleaseForTag } from './release-assets.mjs';

const root=process.cwd();
const {GITHUB_EVENT_NAME:event,GITHUB_REF:ref,GITHUB_SHA:sha,GITHUB_REPOSITORY:repo,RUNNER_TEMP:temp,GITHUB_RUN_ID:runId}=process.env;
if(event!=='push' || !ref?.startsWith('refs/tags/') || !/^[a-f0-9]{40}$/.test(sha??'') || !repo || !temp || !runId)
  throw new Error('Draft creation requires a release-tag workflow with an exact source commit.');
function gh(args) {
  const result=spawnSync('gh',args,{encoding:'utf8',windowsHide:true});
  if(result.status!==0) {
    throw new Error('GitHub operation failed: '+result.stderr);
  }
  return result.stdout;
}
const tag=ref.slice('refs/tags/'.length);
const info=checkProject(root,{requireRelease:true,tag,publicationDate:amsterdamDate(new Date())});
let target=JSON.parse(gh(['api',`repos/${repo}/git/ref/tags/${tag}`])).object;
for(let level=0;target.type==='tag' && level<4;level++)target=JSON.parse(gh(['api',`repos/${repo}/git/tags/${target.sha}`])).object;
if(target.type!=='commit' || target.sha!==sha)throw new Error('Release tag no longer points at the verified build commit.');
const output=join(temp,'release-assets');
const assets=assembleReleaseAssets(join(temp,'release-input'),output,info.version,
  {sha,runUrl:`https://github.com/${repo}/actions/runs/${runId}`});
const notes=readFileSync(join(root,'RELEASE_NOTES.md'),'utf8');
const heading='## '+info.version+'\n';
const normalized=notes.replaceAll('\r\n','\n');
const start=normalized.indexOf(heading);
if(start<0)throw new Error('Prepared release notes missing for '+info.version);
const end=normalized.indexOf('\n## ',start+heading.length);
const body=normalized.slice(start+heading.length,end<0?undefined:end).trim()+'\n\nBuild source: `'+sha+'`.\n';
const notesPath=join(temp,'prepared-release-notes.md');writeFileSync(notesPath,body);
// GitHub's tag endpoint omits unpublished drafts. The authenticated release
// list includes them, so retries must search every page before any mutation.
const pages=JSON.parse(gh(['api','--paginate','--slurp',`repos/${repo}/releases?per_page=100`]));
let release=existingReleaseForTag(pages,tag);
if(release) {
  draftUploadPlan(release,tag,assets);
} else {
  gh(['release','create',tag,'--draft','--prerelease','--verify-tag','--title',info.title,'--notes-file',notesPath]);
  release={tagName:tag,isDraft:true,isPrerelease:true,assets:[]};
}
for(const asset of draftUploadPlan(release,tag,assets))gh(['release','upload',tag,join(output,asset.name)]);
const final=JSON.parse(gh(['release','view',tag,'--json','tagName,isDraft,isPrerelease,assets,url']));
if(draftUploadPlan(final,tag,assets).length)throw new Error('Draft upload is incomplete.');
console.log('Verified draft (unpublished): '+final.url);
