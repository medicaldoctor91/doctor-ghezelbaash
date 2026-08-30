import { readFile } from "node:fs/promises";
import path from "node:path";

const icon = path.join(
  process.cwd(),
  "public/media/brand/doctor-ghezelbaash-symbol-192.3bc4c7b08442.png",
);

export async function GET() {
  return new Response(await readFile(icon), {
    headers: { "Content-Type": "image/png" },
  });
}
