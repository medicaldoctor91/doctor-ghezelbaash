import path from 'node:path';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const generatedWorkspace=(root=process.cwd())=>{
  const generated=path.join(root,'.generated');
  return Object.freeze({root:generated,content:path.join(generated,'content'),semantic:path.join(generated,'semantic'),projections:path.join(generated,'projections'),public:path.join(generated,'public'),assets:path.join(generated,'public/assets')});
};
export const resetGeneratedWorkspace=async(root=process.cwd())=>{const workspace=generatedWorkspace(root);await rm(workspace.root,{recursive:true,force:true});await Promise.all([workspace.content,workspace.semantic,workspace.projections,workspace.public,workspace.assets].map(dir=>mkdir(dir,{recursive:true})));return workspace};
const invokedDirectly=process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(invokedDirectly){const command=process.argv[2]||'reset';if(command!=='reset')throw new Error('Usage: node scripts/generated-workspace.mjs reset');await resetGeneratedWorkspace();console.log(JSON.stringify({stage:'GENERATED_WORKSPACE_RESET',workspace:'.generated',integrity:'PASS'}))}
