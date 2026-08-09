export function staticResponse(body:string,contentType:string){return new Response(body,{headers:{'Content-Type':contentType}});}
