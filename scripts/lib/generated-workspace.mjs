import path from 'node:path';

export const generatedWorkspace=(root=process.cwd())=>{
  const generated=path.join(root,'.generated');
  return Object.freeze({
    root:generated,
    content:path.join(generated,'content'),
    semantic:path.join(generated,'semantic'),
    projections:path.join(generated,'projections'),
    public:path.join(generated,'public'),
    assets:path.join(generated,'public/assets'),
  });
};
