import {mkdir,rm} from 'node:fs/promises';
import {generatedWorkspace} from './lib/generated-workspace.mjs';

const workspace=generatedWorkspace();
await rm(workspace.root,{recursive:true,force:true});
await Promise.all([workspace.content,workspace.semantic,workspace.projections,workspace.public,workspace.assets].map(dir=>mkdir(dir,{recursive:true})));
console.log(JSON.stringify({stage:'GENERATED_WORKSPACE_RESET',workspace:'.generated',integrity:'PASS'}));
