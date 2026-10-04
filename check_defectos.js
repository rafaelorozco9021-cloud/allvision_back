const { Client } = require("pg");
const CS =
  "postgresql://neondb_owner:npg_uyxzVNPkh2i8@ep-curly-wave-b52rcel6-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";

const META = /here'?s? (a )?thinking|let'?s? break|we need to|the user wants|i (will|need to|'ll) |as an ai|my task|rephrase (the|this)|thinking process|step \d+:|constraints?:|own words|reformul|reescrib|aqu[ií] (est[aá]|tiene) el titular|^\*\*|the provided (text|headline)|faithful to the (fact|headline)/i;
const MD = /```|^\s*[\[\*#]/;
const ACC = /([áéíóúÁÉÍÓÚ])\1/;
const TRI = /([a-záéíóúñ])\1{2,}/;
const DUPW = /\b(\w{2,})\s+\1\b/i;

function defecto(t) {
  if (META.test(t)) return "meta";
  if (MD.test(t)) return "markdown";
  if (ACC.test(t)) return "vocal-dup";
  if (TRI.test(t)) return "triple";
  if (DUPW.test(t)) return "palabra-dup";
  return null;
}

const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .trim();

(async () => {
  const c = new Client({ connectionString: CS, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // Titulares escritos por IA en la ultima hora (los del run que dio 19/20)
  const r = await c.query(
    `select title, "originalTitle" o, source from news
     where "titleAi" = true and "titleAiTries" > 0
     order by "createdAt" desc limit 120`,
  );

  let conDefecto = 0;
  let identicos = 0;
  let reescritos = 0;
  for (const x of r.rows) {
    const d = defecto(x.title);
    if (d) {
      conDefecto++;
      console.log(`  DEFECTO [${d}] ${x.title.slice(0, 90)}`);
    } else if (x.o && norm(x.title) === norm(x.o)) {
      identicos++;
    } else {
      reescritos++;
    }
  }

  console.log(`\n=== ultimas ${r.rows.length} notas procesadas por IA ===`);
  console.log(`  reescritas y limpias : ${reescritos}`);
  console.log(`  con defecto          : ${conDefecto}`);
  console.log(`  iguales al original  : ${identicos}  (fallback a titular limpio)`);

  await c.end();
  console.log(conDefecto === 0 ? "\nOK: ningun titular con defecto del modelo" : "\nHAY DEFECTOS");
})();
