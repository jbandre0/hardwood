const e=require(process.argv[2]);const T=e.teams;
const rows=e.games.rows.filter(r=>r[7]!=null);
// champions: winner of the last CT game of each ctx (conference)
const byCtx={};for(const r of rows.filter(r=>r[2]==="CT")){(byCtx[r[3]]=byCtx[r[3]]||[]).push(r)}
const champs={};for(const [c,gs] of Object.entries(byCtx)){gs.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);const f=gs[gs.length-1];champs[c]=f[7]>f[8]?f[4]:f[5]}
require("fs").writeFileSync(__dirname+"/champs.json",JSON.stringify(champs));
console.log("conferences with a champion:",Object.keys(champs).length);
const champIds=new Set(Object.values(champs));
const fmt=t=>`id${String(t.id).padStart(3)} ${t.conf.padEnd(13)} ${String(t.W).padStart(2)}-${String(t.L).padEnd(2)} c${t.confW}-${t.confL} rk${String(t.rank).padStart(3)} rt${t.rating.toFixed(1).padStart(5)} sc${t.boardScore.toFixed(1).padStart(5)} sos${t.sos.toFixed(1).padStart(5)} q1:${t.q1w} q2:${t.q2w} bl:${t.badLosses} l10:${t.last10}`;
const champRows=T.filter(t=>champIds.has(t.id)).sort((a,b)=>b.boardScore-a.boardScore);
console.log("\nAUTO BIDS (conference tournament champions), by Board score:");champRows.forEach(t=>console.log(fmt(t)));
const open=T.filter(t=>!champIds.has(t.id)).sort((a,b)=>b.boardScore-a.boardScore).slice(0,62);
console.log("\nAT-LARGE POOL, by Board score (top 62):");open.forEach((t,i)=>console.log(String(i+1).padStart(2),fmt(t)));
